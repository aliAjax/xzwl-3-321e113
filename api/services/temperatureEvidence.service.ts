import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { temperatureEvidenceRepository } from '../repositories/temperature-evidence.repository';
import { nodeRepository } from '../repositories/node.repository';
import { taskRepository } from '../repositories/task.repository';
import { orderRepository } from '../repositories/order.repository';
import {
  compareTemperatureEvidenceForTimeline,
  toTemperatureEvidenceView,
  TEMPERATURE_EVIDENCE_SOURCES,
} from '../../shared/types';
import type {
  TemperatureEvidence,
  TemperatureEvidenceAppendRequest,
  TemperatureEvidenceAppendStatus,
  TemperatureEvidenceConflictResponse,
  TemperatureEvidenceSource,
  TemperatureEvidenceTimeline,
  TemperatureEvidenceTimelineItem,
  TemperatureEvidenceView,
} from '../../shared/types';

/** 旧数据（CSV 导入、历史回填）缺少时区时按 +08:00 解析 */
const LEGACY_DEFAULT_TIMEZONE_OFFSET = '+08:00';
/** 显式时区标记：Z 或 ±HH:mm / ±HHmm */
const EXPLICIT_TIMEZONE_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/i;

export class TemperatureEvidenceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly conflict?: Omit<TemperatureEvidenceConflictResponse, 'success' | 'message'>
  ) {
    super(message);
    this.name = 'TemperatureEvidenceError';
  }
}

// ---------- 明确的类型收窄（禁止使用 any） ----------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function narrowString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TemperatureEvidenceError(`字段 ${field} 必须为非空字符串`, 400);
  }
  return value.trim();
}

function narrowOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return narrowString(value, field);
}

/** CSV 字段以字符串形式到达，此处通过显式收窄转换为有限数值 */
function narrowTemperature(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new TemperatureEvidenceError(`字段 ${field} 必须为有效温度数值`, 400);
}

function narrowSource(value: unknown): TemperatureEvidenceSource {
  const raw = narrowString(value, 'source');
  if ((TEMPERATURE_EVIDENCE_SOURCES as readonly string[]).includes(raw)) {
    return raw as TemperatureEvidenceSource;
  }
  throw new TemperatureEvidenceError(
    `字段 source 必须为 ${TEMPERATURE_EVIDENCE_SOURCES.join(' / ')}`,
    400
  );
}

// ---------- 时间解析（最终统一保存为 UTC） ----------

function parseObservedAtToUtc(raw: string, source: TemperatureEvidenceSource): string {
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new TemperatureEvidenceError('字段 observedAt 不能为空', 400);
  }

  const hasExplicitTimezone = EXPLICIT_TIMEZONE_PATTERN.test(trimmed);

  if (!hasExplicitTimezone && source === 'driver_offline') {
    throw new TemperatureEvidenceError(
      '司机离线上报数据缺少时区，observedAt 必须携带时区标记（Z 或 ±HH:mm）',
      400
    );
  }

  let candidate = trimmed;
  if (!hasExplicitTimezone) {
    // 旧CSV/历史回填缺少时区：按 +08:00 解析
    candidate = `${trimmed.replace(' ', 'T')}${LEGACY_DEFAULT_TIMEZONE_OFFSET}`;
  }

  const parsed = new Date(candidate);
  if (isNaN(parsed.getTime())) {
    throw new TemperatureEvidenceError(`字段 observedAt 时间格式无效: ${raw}`, 400);
  }
  return parsed.toISOString();
}

// ---------- 标准化与内容指纹（Node.js 内置 crypto） ----------

function toCelsiusX100(temperatureCelsius: number): number {
  return Math.round(temperatureCelsius * 100);
}

/**
 * 标准化载荷用于幂等判定与内容指纹。
 * 键序固定，保证相同内容生成相同 sha256 指纹。
 */
function computePayloadHash(normalized: {
  nodeId: string;
  source: TemperatureEvidenceSource;
  temperatureCelsiusX100: number;
  observedAt: string;
}): string {
  const canonical = JSON.stringify({
    nodeId: normalized.nodeId,
    observedAt: normalized.observedAt,
    source: normalized.source,
    temperatureCelsiusX100: normalized.temperatureCelsiusX100,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

// ---------- 请求解析 ----------

function narrowAppendRequest(body: unknown): TemperatureEvidenceAppendRequest {
  if (!isRecord(body)) {
    throw new TemperatureEvidenceError('请求体必须为 JSON 对象', 400);
  }

  const rawPayloadValue = body.rawPayload;
  if (rawPayloadValue !== undefined && !isRecord(rawPayloadValue)) {
    throw new TemperatureEvidenceError('字段 rawPayload 必须为 JSON 对象', 400);
  }

  return {
    source: narrowSource(body.source),
    readingKey: narrowString(body.readingKey, 'readingKey'),
    nodeId: narrowString(body.nodeId, 'nodeId'),
    batchId: narrowOptionalString(body.batchId, 'batchId'),
    temperature: narrowTemperature(body.temperature, 'temperature'),
    observedAt: narrowString(body.observedAt, 'observedAt'),
    rawPayload: rawPayloadValue,
  };
}

// ---------- 业务逻辑 ----------

export interface TemperatureEvidenceAppendResult {
  status: TemperatureEvidenceAppendStatus;
  evidence: TemperatureEvidence;
}

function appendEvidence(body: unknown): TemperatureEvidenceAppendResult {
  const request = narrowAppendRequest(body);
  return appendNormalizedEvidence(request);
}

function appendNormalizedEvidence(request: TemperatureEvidenceAppendRequest): TemperatureEvidenceAppendResult {
  const node = nodeRepository.findById(request.nodeId);
  if (!node) {
    throw new TemperatureEvidenceError(`关联节点不存在: ${request.nodeId}`, 404);
  }

  const observedAtUtc = parseObservedAtToUtc(request.observedAt, request.source);
  const receivedAtUtc = new Date().toISOString();
  const temperatureCelsiusX100 = toCelsiusX100(request.temperature);
  const payloadHash = computePayloadHash({
    nodeId: request.nodeId,
    source: request.source,
    temperatureCelsiusX100,
    observedAt: observedAtUtc,
  });

  const rawPayload = JSON.stringify(
    request.rawPayload ?? {
      nodeId: request.nodeId,
      observedAt: request.observedAt,
      source: request.source,
      temperature: request.temperature,
    }
  );

  const existing = temperatureEvidenceRepository.findByReadingKey(request.readingKey);
  if (existing) {
    if (existing.payloadHash === payloadHash) {
      // 相同 readingKey + 相同标准化载荷：幂等成功
      return { status: 'duplicate', evidence: existing };
    }
    // 相同 readingKey 但载荷不同：409，禁止强制覆盖
    throw new TemperatureEvidenceError(
      `readingKey ${request.readingKey} 已存在且载荷不一致，禁止覆盖`,
      409,
      {
        readingKey: request.readingKey,
        existingEvidenceId: existing.id,
        existingPayloadHash: existing.payloadHash,
        submittedPayloadHash: payloadHash,
      }
    );
  }

  const appendData = {
    batchId: request.batchId ?? `batch-${uuidv4()}`,
    source: request.source,
    readingKey: request.readingKey,
    nodeId: request.nodeId,
    rawPayload,
    payloadHash,
    temperatureCelsiusX100,
    observedAt: observedAtUtc,
    receivedAt: receivedAtUtc,
  };

  try {
    const evidence = temperatureEvidenceRepository.append(appendData);
    return { status: 'appended', evidence };
  } catch (error) {
    // 并发重试场景：reading_key 唯一索引兜底，仍按幂等/冲突规则处理
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      const raced = temperatureEvidenceRepository.findByReadingKey(request.readingKey);
      if (raced && raced.payloadHash === payloadHash) {
        return { status: 'duplicate', evidence: raced };
      }
      if (raced) {
        throw new TemperatureEvidenceError(
          `readingKey ${request.readingKey} 已存在且载荷不一致，禁止覆盖`,
          409,
          {
            readingKey: request.readingKey,
            existingEvidenceId: raced.id,
            existingPayloadHash: raced.payloadHash,
            submittedPayloadHash: payloadHash,
          }
        );
      }
    }
    throw error;
  }
}

function getNodeTimeline(nodeId: string): TemperatureEvidenceTimeline {
  const node = nodeRepository.findById(nodeId);
  if (!node) {
    throw new TemperatureEvidenceError(`节点不存在: ${nodeId}`, 404);
  }

  const task = taskRepository.findById(node.taskId);
  const order = task ? orderRepository.findById(task.orderId) : undefined;
  const minTemp = order ? order.minTemp : Number.NEGATIVE_INFINITY;
  const maxTemp = order ? order.maxTemp : Number.POSITIVE_INFINITY;

  const evidences = temperatureEvidenceRepository
    .findByNodeId(nodeId)
    .sort(compareTemperatureEvidenceForTimeline);

  const items: TemperatureEvidenceTimelineItem[] = evidences.map(evidence => {
    const temperature = evidence.temperatureCelsiusX100 / 100;
    return {
      evidence: toTemperatureEvidenceView(evidence),
      minTemp,
      maxTemp,
      isAbnormal: temperature < minTemp || temperature > maxTemp,
    };
  });

  // 每条异常证据都参与判定：较新的正常温度不能掩盖旧异常，也不自动关闭工单
  const abnormalEvidenceIds = items.filter(item => item.isAbnormal).map(item => item.evidence.id);

  return {
    nodeId,
    taskId: node.taskId,
    items,
    abnormalEvidenceIds,
    hasAbnormalEvidence: abnormalEvidenceIds.length > 0,
  };
}

function getBatchEvidence(batchId: string): TemperatureEvidenceView[] {
  return temperatureEvidenceRepository
    .findByBatchId(batchId)
    .sort(compareTemperatureEvidenceForTimeline)
    .map(toTemperatureEvidenceView);
}

/**
 * 严格写入：供现有 CSV 导入 / 司机节点更新入口在事务中调用。
 * 落账失败（缺少时区、readingKey 冲突、节点不存在等）直接抛错，
 * 调用方必须将其视为业务失败并回滚，不得静默吞错。
 */
function appendEvidenceStrict(
  request: TemperatureEvidenceAppendRequest
): TemperatureEvidenceAppendResult {
  return appendNormalizedEvidence(request);
}

export const temperatureEvidenceService = {
  appendEvidence,
  appendEvidenceStrict,
  getNodeTimeline,
  getBatchEvidence,
};
