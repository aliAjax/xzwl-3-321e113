import { createHash, randomUUID } from 'node:crypto';
import { orderRepository } from '../repositories/order.repository';
import { taskRepository } from '../repositories/task.repository';
import { nodeRepository } from '../repositories/node.repository';
import { temperatureEvidenceRepository } from '../repositories/temperatureEvidence.repository';
import { exceptionHandlingRepository } from '../repositories/exception.repository';
import { temperatureImportService } from './temperatureImport.service';
import {
  celsiusToCenti,
  centiToCelsius,
  TEMPERATURE_EVIDENCE_ASSUME_CST,
  TEMPERATURE_EVIDENCE_SOURCE_PRIORITY,
} from '../../shared/types';
import type {
  Order,
  DeliveryNode,
  NodeType,
  TemperatureEvidence,
  TemperatureEvidenceSource,
  TemperatureEvidenceRawPayload,
  TemperatureEvidenceIngestItem,
  TemperatureEvidenceIngestRequest,
  TemperatureEvidenceIngestResult,
  TemperatureEvidenceIngestOutcome,
  TemperatureEvidenceCsvIngestRequest,
  TemperatureEvidenceTimeline,
  TemperatureEvidenceTimelineEntry,
  TemperatureRecordColumnMapping,
} from '../../shared/types';

const CST_OFFSET = '+08:00';

// 判断时间字符串是否携带显式时区（Z 或 ±HH:MM / ±HHMM）。
const TZ_PATTERN = /(?:Z|[+-]\d{2}:?\d{2})$/;

function hasExplicitTimezone(value: string): boolean {
  return TZ_PATTERN.test(value.trim());
}

interface NormalizedTime {
  utc: string;
}

/**
 * 将 observedAt 归一化为 UTC ISO 字符串。
 * - 已带时区：按原时区解析。
 * - 缺少时区：CSV 导入 / 历史回填按 +08:00 解析；司机离线数据拒绝。
 * 解析失败返回 null（由调用方拒绝）。
 */
function normalizeObservedAt(raw: string, source: TemperatureEvidenceSource): NormalizedTime | null {
  const value = (raw || '').trim();
  if (!value) return null;

  let candidate = value;
  if (!hasExplicitTimezone(value)) {
    if (!TEMPERATURE_EVIDENCE_ASSUME_CST[source]) {
      // 司机离线数据缺少时区则拒绝。
      return null;
    }
    // 旧 CSV / 历史回填缺少时区时按 +08:00 解析。
    const isoLocal = value.includes('T') ? value : value.replace(' ', 'T');
    candidate = `${isoLocal}${CST_OFFSET}`;
  }

  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return { utc: parsed.toISOString() };
}

/**
 * 计算标准化载荷的内容指纹（Node 内置 crypto）。
 * 指纹覆盖全部最终保存的标准化关键值：来源、温度整数、observedAt(归一化 UTC)、
 * 以及关联的 orderId / taskId / nodeId / nodeType。
 * 不包含保留原始文本的 rawPayload，避免同一采集时刻因原始时区写法不同（如
 * 2026-08-02T10:00:00+08:00 与 2026-08-02T02:00:00Z）被误判为冲突。
 */
function computeContentHash(input: {
  source: TemperatureEvidenceSource;
  temperatureCenti: number;
  observedAtUtc: string;
  orderId?: string;
  taskId?: string;
  nodeId?: string;
  nodeType?: NodeType;
}): string {
  const canonical = JSON.stringify({
    source: input.source,
    temperatureCenti: input.temperatureCenti,
    observedAtUtc: input.observedAtUtc,
    orderId: input.orderId ?? null,
    taskId: input.taskId ?? null,
    nodeId: input.nodeId ?? null,
    nodeType: input.nodeType ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

interface ResolvedContext {
  order?: Order;
  node?: DeliveryNode;
  taskId?: string;
  nodeType?: NodeType;
}

// 根据入参解析关联的订单与节点，用于异常判定与时间线归属。
function resolveContext(item: TemperatureEvidenceIngestItem): ResolvedContext {
  let order: Order | undefined;
  if (item.orderId) {
    order = orderRepository.findById(item.orderId);
  } else if (item.orderNo) {
    order = orderRepository.findByOrderNo(item.orderNo);
  }

  let node: DeliveryNode | undefined;
  if (item.nodeId) {
    node = nodeRepository.findById(item.nodeId);
  } else if (order) {
    const task = taskRepository.findByOrderId(order.id);
    if (task && item.nodeType) {
      node = nodeRepository.findByTaskIdAndNodeType(task.id, item.nodeType);
    }
  }

  const taskId = node?.taskId ?? item.taskId ?? (order ? taskRepository.findByOrderId(order.id)?.id : undefined);
  const nodeType = node?.nodeType ?? item.nodeType;

  return { order, node, taskId, nodeType };
}

function evaluateAbnormal(
  temperatureCenti: number,
  order?: Order
): { isAbnormal: boolean; minTempCenti?: number; maxTempCenti?: number } {
  if (!order) {
    return { isAbnormal: false };
  }
  const minTempCenti = celsiusToCenti(order.minTemp);
  const maxTempCenti = celsiusToCenti(order.maxTemp);
  const isAbnormal = temperatureCenti < minTempCenti || temperatureCenti > maxTempCenti;
  return { isAbnormal, minTempCenti, maxTempCenti };
}

function buildRawPayload(
  item: TemperatureEvidenceIngestItem,
  source: TemperatureEvidenceSource
): TemperatureEvidenceRawPayload {
  const payload: TemperatureEvidenceRawPayload = {
    source,
    readingKey: item.readingKey,
    observedAt: item.observedAt,
    temperature: item.temperature,
  };
  if (item.orderNo !== undefined) payload.orderNo = item.orderNo;
  if (item.orderId !== undefined) payload.orderId = item.orderId;
  if (item.taskId !== undefined) payload.taskId = item.taskId;
  if (item.nodeId !== undefined) payload.nodeId = item.nodeId;
  if (item.nodeType !== undefined) payload.nodeType = item.nodeType;
  if (item.locationText !== undefined) payload.locationText = item.locationText;
  if (item.operatorName !== undefined) payload.operatorName = item.operatorName;
  if (item.rawPayload) {
    for (const [key, value] of Object.entries(item.rawPayload)) {
      payload[key] = value;
    }
  }
  return payload;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 让异常证据进入工单判定。
 * - 该节点尚无工单时创建一条 pending 工单（异常证据触发）。
 * - 已存在工单时只追加处理记录，不修改/关闭已有工单，
 *   保证较新的正常温度或后续异常都不会掩盖或自动关闭旧异常。
 */
function ensureExceptionWorkorder(
  evidence: TemperatureEvidence,
  node: DeliveryNode,
  order: Order
): void {
  const task = taskRepository.findById(node.taskId);
  if (!task) return;

  const description = `温度证据异常：${centiToCelsius(evidence.temperatureCenti)}°C 超出要求 ${order.minTemp}~${order.maxTemp}°C（来源：${evidence.source}，readingKey：${evidence.readingKey}）`;

  const existing = exceptionHandlingRepository.findByNodeId(node.id);
  if (existing) {
    // 只追加：记录该异常证据，不覆盖既有工单状态。
    exceptionHandlingRepository.addProcessingNote(
      existing.id,
      description,
      'add_note',
      undefined,
      '系统（温度证据账本）'
    );
    return;
  }

  const handling = exceptionHandlingRepository.createHandling({
    id: generateId(),
    nodeId: node.id,
    taskId: node.taskId,
    orderId: order.id,
    driverId: task.driverId,
    temperatureZone: order.temperatureZone,
    exceptionDescription: description,
    exceptionTime: evidence.observedAt,
    handlingStatus: 'pending',
  });

  exceptionHandlingRepository.addProcessingNote(
    handling.id,
    description,
    'create',
    undefined,
    '系统（温度证据账本）'
  );
}

/**
 * 承接一批温度证据（司机离线 / CSV 导入 / 历史回填共用）。
 * 只追加不覆盖；幂等成功、冲突返回 409 语义，禁止强制覆盖。
 *
 * manageWorkorder：
 * - true（默认，账本自有入口 /ingest、/driver-offline）：证据与异常工单在同一事务内
 *   创建/关联，保证一致性。
 * - false（现有页面入口经 recordNodeEvidence 复用）：仅登记证据并返回冲突信息，
 *   工单仍由既有链路自行创建，避免与其重复建单。
 */
function ingest(
  request: TemperatureEvidenceIngestRequest,
  options: { manageWorkorder?: boolean } = {}
): TemperatureEvidenceIngestResult {
  const manageWorkorder = options.manageWorkorder ?? true;
  const source = request.source;
  const batchId = request.batchId || `${source}-${randomUUID()}`;
  const receivedAt = new Date().toISOString();

  const outcomes: TemperatureEvidenceIngestOutcome[] = [];
  let createdCount = 0;
  let duplicateCount = 0;
  let conflictCount = 0;
  let rejectedCount = 0;

  for (const item of request.items) {
    const readingKey = (item.readingKey || '').trim();
    if (!readingKey) {
      rejectedCount++;
      outcomes.push({ readingKey, status: 'rejected', message: 'readingKey 不能为空' });
      continue;
    }

    if (!Number.isFinite(item.temperature)) {
      rejectedCount++;
      outcomes.push({ readingKey, status: 'rejected', message: '温度值无效' });
      continue;
    }

    const normalized = normalizeObservedAt(item.observedAt, source);
    if (!normalized) {
      rejectedCount++;
      outcomes.push({
        readingKey,
        status: 'rejected',
        message: source === 'driver_offline'
          ? 'observedAt 缺少时区，司机离线数据必须携带时区'
          : 'observedAt 时间格式无效',
      });
      continue;
    }

    const temperatureCenti = celsiusToCenti(item.temperature);
    const context = resolveContext(item);
    const rawPayload = buildRawPayload(item, source);
    const contentHash = computeContentHash({
      source,
      temperatureCenti,
      observedAtUtc: normalized.utc,
      orderId: context.order?.id,
      taskId: context.taskId,
      nodeId: context.node?.id,
      nodeType: context.nodeType,
    });

    const existing = temperatureEvidenceRepository.findByReadingKey(readingKey);
    if (existing) {
      if (existing.contentHash === contentHash) {
        // 相同 readingKey 且相同标准化载荷视为幂等成功。
        // 幂等补偿：若该异常证据此前因故障没有成功建单，则在此补建，
        // 避免异常证据永久缺少对应工单。
        if (manageWorkorder && existing.isAbnormal && context.node && context.order) {
          temperatureEvidenceRepository.runInTransaction(() => {
            ensureExceptionWorkorder(existing, context.node!, context.order!);
          });
        }
        duplicateCount++;
        outcomes.push({
          readingKey,
          status: 'duplicate',
          evidenceId: existing.id,
          isAbnormal: existing.isAbnormal,
          message: '重复上报，幂等成功',
        });
      } else {
        // 相同 readingKey 但载荷不同，返回冲突且禁止强制覆盖。
        conflictCount++;
        outcomes.push({
          readingKey,
          status: 'conflict',
          evidenceId: existing.id,
          message: '相同 readingKey 存在不同载荷，拒绝覆盖（409）',
        });
      }
      continue;
    }

    const { isAbnormal, minTempCenti, maxTempCenti } = evaluateAbnormal(temperatureCenti, context.order);

    // 一致性：证据写入与工单创建/关联在同一事务内完成。
    // 任一失败都整体回滚，不会留下“证据存在但工单缺失”的状态。
    const evidence = temperatureEvidenceRepository.runInTransaction(() => {
      const appended = temperatureEvidenceRepository.append({
        id: randomUUID(),
        batchId,
        source,
        readingKey,
        contentHash,
        rawPayload,
        temperatureCenti,
        observedAt: normalized.utc,
        receivedAt,
        orderId: context.order?.id,
        taskId: context.taskId,
        nodeId: context.node?.id,
        nodeType: context.nodeType,
        minTempCenti,
        maxTempCenti,
        isAbnormal,
      });

      // 每条异常证据都参与工单判定：为异常证据创建/关联异常工单。
      // 只追加不覆盖——较新的正常温度不会关闭已存在的工单。
      if (manageWorkorder && isAbnormal && context.node && context.order) {
        ensureExceptionWorkorder(appended, context.node, context.order);
      }

      return appended;
    });

    createdCount++;
    outcomes.push({
      readingKey,
      status: 'created',
      evidenceId: evidence.id,
      isAbnormal,
      message: isAbnormal ? '已记录（温度异常）' : '已记录',
    });
  }

  return {
    batchId,
    source,
    totalCount: request.items.length,
    createdCount,
    duplicateCount,
    conflictCount,
    rejectedCount,
    hasConflict: conflictCount > 0,
    outcomes,
  };
}

/**
 * 供现有入口（司机节点上报 / CSV 导入执行）复用的单条证据登记。
 * 现有页面调用链在更新 delivery_nodes 的同时，同步向账本追加一条证据，
 * 使真实请求也能落入 temperature_evidence 并进入工单判定。
 * 返回 ingest 结果，调用方据此感知冲突（不能吞掉 409）。
 */
function recordNodeEvidence(params: {
  source: TemperatureEvidenceSource;
  orderId: string;
  taskId: string;
  nodeId: string;
  nodeType: NodeType;
  temperature: number;
  observedAt: string;
  batchId?: string;
  locationText?: string;
  operatorName?: string;
}): TemperatureEvidenceIngestResult {
  return ingest(
    {
      batchId: params.batchId,
      source: params.source,
      items: [
        {
          // readingKey 以节点+采集时刻构造，保证同一节点重复同步幂等。
          readingKey: `${params.source}:node:${params.nodeId}:${params.observedAt}`,
          observedAt: params.observedAt,
          temperature: params.temperature,
          orderId: params.orderId,
          taskId: params.taskId,
          nodeId: params.nodeId,
          nodeType: params.nodeType,
          locationText: params.locationText,
          operatorName: params.operatorName,
        },
      ],
    },
    // 现有链路自行建单，账本仅登记证据并回传冲突。
    { manageWorkorder: false }
  );
}

const nodeTypeMap: Record<string, NodeType> = {
  '入库': 'warehouse_in', 'warehouse_in': 'warehouse_in',
  '装车': 'loading', 'loading': 'loading',
  '出发': 'departure', 'departure': 'departure',
  '到达': 'arrival', 'arrival': 'arrival',
  '配送': 'delivery', 'delivery': 'delivery',
  '签收': 'signature', 'signature': 'signature',
};

// 通过明确的类型收窄将 CSV 行转换为 ingest item。
function csvRowToIngestItem(
  row: { orderNo: string; nodeType: string; recordedAt: string; temperature: string; locationText?: string; operatorName?: string },
  lineNumber: number
): TemperatureEvidenceIngestItem | null {
  const orderNo = row.orderNo.trim();
  const observedAt = row.recordedAt.trim();
  const tempStr = row.temperature.trim();

  if (!orderNo || !observedAt || !tempStr) {
    return null;
  }

  const temperature = Number.parseFloat(tempStr);
  if (Number.isNaN(temperature)) {
    return null;
  }

  const nodeTypeKey = row.nodeType.trim().toLowerCase();
  const nodeType: NodeType | undefined = nodeTypeMap[nodeTypeKey] ?? nodeTypeMap[row.nodeType.trim()];

  const rawPayload: TemperatureEvidenceRawPayload = {
    lineNumber,
    orderNo,
    nodeType: row.nodeType,
    recordedAt: observedAt,
    temperature: tempStr,
  };
  if (row.locationText) rawPayload.locationText = row.locationText;
  if (row.operatorName) rawPayload.operatorName = row.operatorName;

  return {
    // readingKey 需稳定且可复现，作为幂等键。
    readingKey: `csv:${orderNo}:${nodeType ?? 'unknown'}:${observedAt}`,
    observedAt,
    temperature,
    orderNo,
    nodeType,
    locationText: row.locationText,
    operatorName: row.operatorName,
    rawPayload,
  };
}

// CSV 导入入口：复用既有列解析，转换为证据后追加账本。
function ingestCsv(request: TemperatureEvidenceCsvIngestRequest): TemperatureEvidenceIngestResult {
  const mapping: TemperatureRecordColumnMapping | undefined = request.mapping;
  const rows = temperatureImportService.parseCsvText(request.csvText, mapping);

  const items: TemperatureEvidenceIngestItem[] = [];
  const skippedOutcomes: TemperatureEvidenceIngestOutcome[] = [];

  rows.forEach((row, index) => {
    const item = csvRowToIngestItem(row, index + 2);
    if (item) {
      items.push(item);
    } else {
      skippedOutcomes.push({
        readingKey: `csv-line-${index + 2}`,
        status: 'rejected',
        message: `第 ${index + 2} 行字段无效，已跳过`,
      });
    }
  });

  const result = ingest({
    batchId: request.batchId,
    source: 'csv_import',
    items,
  });

  return {
    ...result,
    totalCount: result.totalCount + skippedOutcomes.length,
    rejectedCount: result.rejectedCount + skippedOutcomes.length,
    outcomes: [...result.outcomes, ...skippedOutcomes],
  };
}

/**
 * 构建订单的温度证据时间线。
 * 排序：先按 observedAt，同一时刻按来源优先级（司机离线→CSV→历史回填），再按 receivedAt。
 * 每条异常证据均参与判定；较新的正常温度不掩盖旧异常，也不自动关闭工单。
 */
function getTimeline(orderId: string): TemperatureEvidenceTimeline | undefined {
  const order = orderRepository.findById(orderId);
  if (!order) return undefined;

  const evidences = temperatureEvidenceRepository.findByOrderId(orderId);

  const sorted = [...evidences].sort((a, b) => {
    const observedDiff = a.observedAt.localeCompare(b.observedAt);
    if (observedDiff !== 0) return observedDiff;
    const priorityDiff = TEMPERATURE_EVIDENCE_SOURCE_PRIORITY[a.source] - TEMPERATURE_EVIDENCE_SOURCE_PRIORITY[b.source];
    if (priorityDiff !== 0) return priorityDiff;
    return a.receivedAt.localeCompare(b.receivedAt);
  });

  const entries: TemperatureEvidenceTimelineEntry[] = sorted.map((e) => ({
    id: e.id,
    source: e.source,
    readingKey: e.readingKey,
    temperature: centiToCelsius(e.temperatureCenti),
    observedAt: e.observedAt,
    receivedAt: e.receivedAt,
    nodeId: e.nodeId,
    nodeType: e.nodeType,
    isAbnormal: e.isAbnormal,
    locationText: readPayloadString(e, 'locationText'),
    operatorName: readPayloadString(e, 'operatorName'),
  }));

  const abnormalCount = entries.filter((e) => e.isAbnormal).length;

  return {
    orderId,
    orderNo: order.orderNo,
    entries,
    totalCount: entries.length,
    abnormalCount,
    hasUnresolvedAbnormal: abnormalCount > 0,
  };
}

function readPayloadString(evidence: TemperatureEvidence, key: string): string | undefined {
  const value = evidence.rawPayload[key];
  return typeof value === 'string' ? value : undefined;
}

export const temperatureEvidenceService = {
  ingest,
  ingestCsv,
  recordNodeEvidence,
  getTimeline,
  normalizeObservedAt,
  computeContentHash,
};
