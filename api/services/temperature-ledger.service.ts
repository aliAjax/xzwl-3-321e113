import { randomUUID } from 'node:crypto';
import db from '../db';
import {
  temperatureEvidenceRepository,
  type CreateEvidenceRecord,
} from '../repositories/temperature-evidence.repository';
import { orderRepository } from '../repositories/order.repository';
import { taskRepository } from '../repositories/task.repository';
import { nodeRepository } from '../repositories/node.repository';
import { exceptionHandlingRepository } from '../repositories/exception.repository';
import {
  computeStandardizedPayloadHash,
} from '../utils/fingerprint';
import {
  celsiusToCenti,
  centiToCelsius,
  parseObservedAt,
  asString,
  asNumber,
  asOptionalString,
  isNonEmptyString,
} from '../utils/temperature-normalization';
import {
  LedgerConflictError,
  LedgerValidationError,
  EVIDENCE_SOURCE_PRIORITY,
} from '../../shared/temperature-ledger.types';
import type {
  TemperatureEvidence,
  TemperatureEvidenceInput,
  NodeEvidenceInput,
  NodeEvidenceOutcome,
  EvidenceBatchCreateResult,
  EvidenceBatchItemResult,
  EvidenceTimeline,
  EvidenceTimelineEntry,
  EvidenceSource,
  DriverOfflineReading,
  HistoricalBackfillReading,
} from '../../shared/temperature-ledger.types';
import type { NodeType, Order } from '../../shared/types';

const NODE_TYPE_VALUES: ReadonlySet<string> = new Set([
  'warehouse_in',
  'loading',
  'departure',
  'arrival',
  'delivery',
  'signature',
]);

function isNodeType(value: unknown): value is NodeType {
  return typeof value === 'string' && NODE_TYPE_VALUES.has(value);
}

function asNodeType(value: unknown, field: string): NodeType {
  if (!isNodeType(value)) {
    throw new LedgerValidationError(field, `${field} 必须是有效节点类型`);
  }
  return value;
}

const CSV_NODE_TYPE_MAP: Readonly<Record<string, NodeType>> = {
  '入库': 'warehouse_in',
  'warehouse_in': 'warehouse_in',
  '装车': 'loading',
  'loading': 'loading',
  '出发': 'departure',
  'departure': 'departure',
  '到达': 'arrival',
  'arrival': 'arrival',
  '配送': 'delivery',
  'delivery': 'delivery',
  '签收': 'signature',
  'signature': 'signature',
};

const SOURCE_LABELS: Record<EvidenceSource, string> = {
  csv_import: 'CSV导入',
  driver_offline: '司机离线',
  historical_backfill: '历史回填',
};

interface CsvHeaderMap {
  orderNo: number;
  nodeType: number;
  recordedAt: number;
  temperature: number;
  locationText?: number;
  operatorName?: number;
}

function detectSeparator(headerLine: string): string {
  if (headerLine.includes('\t')) return '\t';
  if (headerLine.includes(',')) return ',';
  return ',';
}

function splitCsvLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === separator) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result.map(cell => cell.trim());
}

function buildHeaderMap(headers: string[]): CsvHeaderMap {
  const normalized = headers.map(h => h.trim().toLowerCase());

  const findIndex = (patterns: ReadonlyArray<string>): number | undefined => {
    for (let i = 0; i < normalized.length; i++) {
      const header = normalized[i];
      if (patterns.some(p => header.includes(p))) {
        return i;
      }
    }
    return undefined;
  };

  const orderNo = findIndex(['订单号', 'orderno', 'order no', 'order_id', 'orderid', '订单编号']);
  const nodeType = findIndex(['节点类型', 'nodetype', 'node type', '节点', '操作类型', '环节']);
  const recordedAt = findIndex(['记录时间', 'recordedat', 'recorded at', '时间', '日期', 'datetime', 'date', '发生时间']);
  const temperature = findIndex(['温度', '温度值', 'temperature', 'temp', '测温值']);
  const locationText = findIndex(['位置', 'locationtext', 'location', '地点', '地址', '存放位置']);
  const operatorName = findIndex(['操作人', 'operatorname', 'operator', '操作员', '经办人', '负责人']);

  if (orderNo === undefined) throw new LedgerValidationError('csv', 'CSV缺少订单号列');
  if (nodeType === undefined) throw new LedgerValidationError('csv', 'CSV缺少节点类型列');
  if (recordedAt === undefined) throw new LedgerValidationError('csv', 'CSV缺少记录时间列');
  if (temperature === undefined) throw new LedgerValidationError('csv', 'CSV缺少温度列');

  return { orderNo, nodeType, recordedAt, temperature, locationText, operatorName };
}

interface ParsedCsvEvidence {
  lineNumber: number;
  readingKey: string;
  orderNo: string;
  nodeType: NodeType;
  temperatureCelsius: number;
  observedAt: string;
  locationText?: string;
  operatorName?: string;
  rawPayload: Record<string, unknown>;
}

function parseCsvToEvidenceInputs(csvText: string): ParsedCsvEvidence[] {
  const text = csvText.replace(/^\uFEFF/, '').trim();
  if (text === '') {
    throw new LedgerValidationError('csv', 'CSV内容为空');
  }

  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) {
    throw new LedgerValidationError('csv', 'CSV至少需要表头和一行数据');
  }

  const separator = detectSeparator(lines[0]);
  const headers = splitCsvLine(lines[0], separator);
  const headerMap = buildHeaderMap(headers);

  const result: ParsedCsvEvidence[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i], separator);
    const lineNumber = i + 1;

    const orderNo = asString(values[headerMap.orderNo], 'orderNo');
    const nodeTypeRaw = (values[headerMap.nodeType] ?? '').trim().toLowerCase();
    const nodeType = CSV_NODE_TYPE_MAP[nodeTypeRaw];
    if (!nodeType) {
      throw new LedgerValidationError('nodeType', `第${lineNumber}行节点类型无效: ${values[headerMap.nodeType] ?? ''}`);
    }
    const recordedAtRaw = asString(values[headerMap.recordedAt], 'recordedAt');
    const temperatureCelsius = asNumber(values[headerMap.temperature], 'temperature');
    const locationText = headerMap.locationText !== undefined
      ? asOptionalString(values[headerMap.locationText])
      : undefined;
    const operatorName = headerMap.operatorName !== undefined
      ? asOptionalString(values[headerMap.operatorName])
      : undefined;

    const observedAt = parseObservedAt(recordedAtRaw, 'csv_import');
    const readingKey = `csv:${orderNo}:${nodeType}:${observedAt}`;

    const rawPayload: Record<string, unknown> = {
      orderNo,
      nodeType,
      recordedAt: recordedAtRaw,
      temperature: temperatureCelsius,
      locationText: locationText ?? null,
      operatorName: operatorName ?? null,
      lineNumber,
    };

    result.push({
      lineNumber,
      readingKey,
      orderNo,
      nodeType,
      temperatureCelsius,
      observedAt,
      locationText,
      operatorName,
      rawPayload,
    });
  }

  return result;
}

function judgeTemperature(
  temperatureCelsius: number,
  order: Order
): { judgment: 'normal' | 'abnormal'; reasons: string[]; minTemp: number; maxTemp: number } {
  const reasons: string[] = [];
  if (temperatureCelsius < order.minTemp) {
    reasons.push(`温度 ${temperatureCelsius}°C 低于最低要求 ${order.minTemp}°C`);
  }
  if (temperatureCelsius > order.maxTemp) {
    reasons.push(`温度 ${temperatureCelsius}°C 高于最高要求 ${order.maxTemp}°C`);
  }
  return {
    judgment: reasons.length > 0 ? 'abnormal' : 'normal',
    reasons,
    minTemp: order.minTemp,
    maxTemp: order.maxTemp,
  };
}

interface ResolvedNodeContext {
  nodeId: string;
  taskId: string;
  orderId: string;
  order: Order;
}

function resolveNodeById(nodeId: string): ResolvedNodeContext | undefined {
  const node = nodeRepository.findById(nodeId);
  if (!node) return undefined;
  const task = taskRepository.findById(node.taskId);
  if (!task) return undefined;
  const order = orderRepository.findById(task.orderId);
  if (!order) return undefined;
  return { nodeId: node.id, taskId: task.id, orderId: order.id, order };
}

function resolveNodeByOrderAndType(orderNo: string, nodeType: NodeType): ResolvedNodeContext | undefined {
  const order = orderRepository.findByOrderNo(orderNo);
  if (!order) return undefined;
  const task = taskRepository.findByOrderId(order.id);
  if (!task) return undefined;
  const node = nodeRepository.findByTaskIdAndNodeType(task.id, nodeType);
  if (!node) return undefined;
  return { nodeId: node.id, taskId: task.id, orderId: order.id, order };
}

function buildTimelineEntry(evidence: TemperatureEvidence): EvidenceTimelineEntry {
  return {
    evidence,
    temperatureCelsius: centiToCelsius(evidence.temperatureCenti),
    sourceLabel: SOURCE_LABELS[evidence.source],
    isAbnormal: evidence.judgment === 'abnormal',
  };
}

function sortTimeline(entries: EvidenceTimelineEntry[]): EvidenceTimelineEntry[] {
  return [...entries].sort((a, b) => {
    const observedDiff = new Date(a.evidence.observedAt).getTime() - new Date(b.evidence.observedAt).getTime();
    if (observedDiff !== 0) return observedDiff;
    const sourceDiff = EVIDENCE_SOURCE_PRIORITY[a.evidence.source] - EVIDENCE_SOURCE_PRIORITY[b.evidence.source];
    if (sourceDiff !== 0) return sourceDiff;
    return new Date(a.evidence.receivedAt).getTime() - new Date(b.evidence.receivedAt).getTime();
  });
}

interface AppendCoreResult {
  evidence: TemperatureEvidence;
  idempotent: boolean;
  judgment: 'normal' | 'abnormal';
  abnormalReasons: string[];
  resolved?: ResolvedNodeContext;
}

interface PreparedEvidence {
  readingKey: string;
  standardizedHash: string;
  record: CreateEvidenceRecord;
  judgment: 'normal' | 'abnormal';
  abnormalReasons: string[];
  resolved?: ResolvedNodeContext;
  temperatureCelsius: number;
  observedAt: string;
}

function prepareEvidence(
  input: TemperatureEvidenceInput,
  batchId: string
):
  | { kind: 'prepared'; prepared: PreparedEvidence }
  | { kind: 'idempotent'; evidence: TemperatureEvidence; judgment: 'normal' | 'abnormal'; abnormalReasons: string[]; resolved?: ResolvedNodeContext }
  | { kind: 'conflict'; existing: TemperatureEvidence; submittedHash: string } {
  const readingKey = asString(input.readingKey, 'readingKey');
  const rawPayload = input.rawPayload;
  if (typeof rawPayload !== 'object' || rawPayload === null || Array.isArray(rawPayload)) {
    throw new LedgerValidationError('rawPayload', 'rawPayload 必须是对象');
  }

  const temperatureCelsius = asNumber(input.temperatureCelsius, 'temperatureCelsius');
  const observedAt = parseObservedAt(input.observedAt, input.source);
  const receivedAt = new Date().toISOString();

  const temperatureCenti = celsiusToCenti(temperatureCelsius);

  let nodeId = input.nodeId;
  let taskId = input.taskId;
  let orderId = input.orderId;
  let order: Order | undefined;
  const nodeType = input.nodeType;

  if (nodeId) {
    const resolved = resolveNodeById(nodeId);
    if (resolved) {
      nodeId = resolved.nodeId;
      taskId = resolved.taskId;
      orderId = resolved.orderId;
      order = resolved.order;
    }
  } else if (input.orderNo && nodeType) {
    const resolved = resolveNodeByOrderAndType(input.orderNo, nodeType);
    if (resolved) {
      nodeId = resolved.nodeId;
      taskId = resolved.taskId;
      orderId = resolved.orderId;
      order = resolved.order;
    }
  }

  const standardizedHash = computeStandardizedPayloadHash({
    source: input.source,
    readingKey,
    temperatureCenti,
    observedAt,
    nodeId: nodeId ?? null,
    taskId: taskId ?? null,
    orderId: orderId ?? null,
    nodeType: nodeType ?? null,
    orderNo: input.orderNo ?? null,
  });

  const existing = temperatureEvidenceRepository.findByReadingKey(readingKey);
  if (existing) {
    if (existing.payloadHash === standardizedHash) {
      return {
        kind: 'idempotent',
        evidence: existing,
        judgment: existing.judgment,
        abnormalReasons: existing.abnormalReasons,
        resolved: order ? { nodeId: nodeId!, taskId: taskId!, orderId: orderId!, order } : undefined,
      };
    }
    return { kind: 'conflict', existing, submittedHash: standardizedHash };
  }

  const rawPayloadString = JSON.stringify(rawPayload);

  const judgment = order
    ? judgeTemperature(temperatureCelsius, order)
    : { judgment: 'normal' as const, reasons: [] as string[], minTemp: undefined, maxTemp: undefined };

  const record: CreateEvidenceRecord = {
    batchId,
    source: input.source,
    readingKey,
    payloadHash: standardizedHash,
    rawPayload: rawPayloadString,
    temperatureCenti,
    observedAt,
    receivedAt,
    nodeId,
    taskId,
    orderId,
    nodeType,
    orderNo: input.orderNo,
    locationText: input.locationText,
    operatorName: input.operatorName,
    judgment: judgment.judgment,
    abnormalReasons: judgment.reasons,
    minTemp: judgment.minTemp,
    maxTemp: judgment.maxTemp,
    temperatureZone: order?.temperatureZone,
  };

  return {
    kind: 'prepared',
    prepared: {
      readingKey,
      standardizedHash,
      record,
      judgment: judgment.judgment,
      abnormalReasons: judgment.reasons,
      resolved: order ? { nodeId: nodeId!, taskId: taskId!, orderId: orderId!, order } : undefined,
      temperatureCelsius,
      observedAt,
    },
  };
}

function insertEvidence(prepared: PreparedEvidence): TemperatureEvidence {
  return temperatureEvidenceRepository.append(prepared.record);
}

function appendCore(
  input: TemperatureEvidenceInput,
  batchId: string
): AppendCoreResult {
  const result = prepareEvidence(input, batchId);
  if (result.kind === 'conflict') {
    throw new LedgerConflictError(result.existing, result.submittedHash);
  }
  if (result.kind === 'idempotent') {
    return {
      evidence: result.evidence,
      idempotent: true,
      judgment: result.judgment,
      abnormalReasons: result.abnormalReasons,
      resolved: result.resolved,
    };
  }
  const evidence = insertEvidence(result.prepared);
  return {
    evidence,
    idempotent: false,
    judgment: result.prepared.judgment,
    abnormalReasons: result.prepared.abnormalReasons,
    resolved: result.prepared.resolved,
  };
}

function ensureExceptionWorkorder(
  nodeId: string,
  taskId: string,
  orderId: string,
  driverId: string,
  temperatureZone: Order['temperatureZone'],
  exceptionDescription: string,
  exceptionTime: string
): void {
  const existing = exceptionHandlingRepository.findByNodeId(nodeId);
  if (existing) {
    return;
  }
  exceptionHandlingRepository.createHandling({
    nodeId,
    taskId,
    orderId,
    driverId,
    temperatureZone,
    exceptionDescription,
    exceptionTime,
    handlingStatus: 'pending',
  });
}

const NODE_TYPE_TO_ORDER_STATUS: Readonly<Record<NodeType, 'warehoused' | 'loading' | 'in_transit' | 'delivered' | 'completed'>> = {
  warehouse_in: 'warehoused',
  loading: 'loading',
  departure: 'in_transit',
  arrival: 'in_transit',
  delivery: 'delivered',
  signature: 'completed',
};

function propagateNodeCompletion(taskId: string, nodeType: NodeType, isException: boolean): void {
  const task = taskRepository.findById(taskId);
  if (!task) return;

  if (isException) {
    taskRepository.updateStatus(taskId, 'in_transit');
    orderRepository.updateStatus(task.orderId, 'in_transit');
    return;
  }

  const newStatus = NODE_TYPE_TO_ORDER_STATUS[nodeType];
  if (newStatus) {
    taskRepository.updateStatus(taskId, newStatus);
    orderRepository.updateStatus(task.orderId, newStatus);
  }

  const allNodes = nodeRepository.findByTaskId(taskId);
  const completedNodes = allNodes.filter(n => n.status === 'completed');
  const hasException = allNodes.some(n => n.status === 'exception');
  if (completedNodes.length === allNodes.length && !hasException) {
    taskRepository.updateStatus(taskId, 'completed');
    orderRepository.updateStatus(task.orderId, 'completed');
  }
}

export const temperatureLedgerService = {
  generateBatchId(): string {
    return `ev-${randomUUID()}`;
  },

  generateReadingKey(prefix: string, parts: ReadonlyArray<string>): string {
    return `${prefix}:${parts.join(':')}`;
  },

  assessDuplicate(readingKey: string, submission: {
    source: EvidenceSource;
    temperatureCelsius: number;
    observedAt: string;
    nodeId: string;
    taskId?: string;
    orderId?: string;
    nodeType?: NodeType;
    orderNo?: string;
  }): { kind: 'none' } | { kind: 'idempotent'; existing: TemperatureEvidence } | { kind: 'conflict'; existing: TemperatureEvidence; submittedHash: string } {
    const existing = temperatureEvidenceRepository.findByReadingKey(readingKey);
    if (!existing) {
      return { kind: 'none' };
    }

    const temperatureCenti = celsiusToCenti(submission.temperatureCelsius);
    const observedAt = parseObservedAt(submission.observedAt, submission.source);
    const submittedHash = computeStandardizedPayloadHash({
      source: submission.source,
      readingKey,
      temperatureCenti,
      observedAt,
      nodeId: submission.nodeId,
      taskId: submission.taskId ?? null,
      orderId: submission.orderId ?? null,
      nodeType: submission.nodeType ?? null,
      orderNo: submission.orderNo ?? null,
    });

    if (existing.payloadHash === submittedHash) {
      return { kind: 'idempotent', existing };
    }
    return { kind: 'conflict', existing, submittedHash };
  },

  append(
    input: TemperatureEvidenceInput,
    batchId?: string
  ): { evidence: TemperatureEvidence; idempotent: boolean } {
    const result = appendCore(input, batchId ?? this.generateBatchId());
    return { evidence: result.evidence, idempotent: result.idempotent };
  },

  recordForNode(input: NodeEvidenceInput): NodeEvidenceOutcome {
    const resolved = resolveNodeById(input.nodeId);
    if (!resolved) {
      throw new LedgerValidationError('nodeId', `节点不存在: ${input.nodeId}`);
    }
    const { nodeId, taskId, orderId, order } = resolved;

    const existingNode = nodeRepository.findById(nodeId);
    if (!existingNode) {
      throw new LedgerValidationError('nodeId', `节点不存在: ${nodeId}`);
    }

    let temperatureCelsius: number;
    if (input.temperatureCelsius !== undefined && input.temperatureCelsius !== null) {
      temperatureCelsius = input.temperatureCelsius;
    } else if (existingNode.temperature !== undefined && existingNode.temperature !== null) {
      temperatureCelsius = existingNode.temperature;
    } else {
      throw new LedgerValidationError('temperatureCelsius', '温度值不能为空');
    }

    const observedAtRaw = input.observedAt ?? new Date().toISOString();
    if (input.source === 'driver_offline') {
      parseObservedAt(observedAtRaw, 'driver_offline');
    }
    const observedAt = parseObservedAt(observedAtRaw, input.source);

    const preJudgment = judgeTemperature(temperatureCelsius, order);
    const effectiveExceptionDescription = input.exceptionDescription && input.exceptionDescription.trim() !== ''
      ? input.exceptionDescription
      : preJudgment.reasons.join('; ');

    const mergedPayload: Record<string, unknown> = {
      nodeId,
      taskId,
      orderId,
      nodeType: input.nodeType ?? existingNode.nodeType,
      temperature: temperatureCelsius,
      observedAt,
      locationText: input.locationText ?? existingNode.locationText ?? null,
      operatorName: input.operatorName ?? existingNode.operatorName ?? null,
      exceptionDescription: effectiveExceptionDescription || null,
      clientSubmitId: input.clientSubmitId ?? null,
      ...input.rawPayload,
    };

    const prepareResult = prepareEvidence(
      {
        source: input.source,
        readingKey: input.readingKey,
        rawPayload: mergedPayload,
        temperatureCelsius,
        observedAt,
        nodeId,
        taskId,
        orderId,
        nodeType: input.nodeType,
        orderNo: order.orderNo,
        locationText: input.locationText,
        operatorName: input.operatorName,
      },
      this.generateBatchId()
    );

    if (prepareResult.kind === 'conflict') {
      return {
        status: 'conflict',
        conflictType: 'reading_key',
        existingEvidence: prepareResult.existing,
        submittedStandardizedHash: prepareResult.submittedHash,
        message: `readingKey ${input.readingKey} 已存在但标准化载荷不同 (409)`,
      };
    }

    if (prepareResult.kind === 'idempotent') {
      return {
        status: 'idempotent',
        evidence: prepareResult.evidence,
        judgment: prepareResult.judgment,
        abnormalReasons: prepareResult.abnormalReasons,
      };
    }

    const prepared = prepareResult.prepared;
    const isAbnormal = prepared.judgment === 'abnormal' || effectiveExceptionDescription !== '';
    const isAlreadyException = existingNode.status === 'exception'
      || exceptionHandlingRepository.findByNodeId(nodeId) !== undefined;

    const txn = db.transaction(() => {
      if (isAbnormal) {
        const updated = nodeRepository.completeNode(nodeId, {
          locationText: input.locationText ?? existingNode.locationText,
          temperature: temperatureCelsius,
          exceptionDescription: effectiveExceptionDescription || '温度异常',
          recordedAt: observedAt,
          clientSubmitId: input.clientSubmitId,
          version: input.version,
        });

        if (input.version !== undefined && !updated) {
          throw Object.assign(new Error('concurrent_update'), { code: 'concurrent_update' });
        }

        propagateNodeCompletion(taskId, existingNode.nodeType, true);

        ensureExceptionWorkorder(
          nodeId,
          taskId,
          orderId,
          taskRepository.findById(taskId)?.driverId ?? '',
          order.temperatureZone,
          effectiveExceptionDescription || '温度异常',
          observedAt
        );
      } else {
        if (isAlreadyException) {
          nodeRepository.updateNode(nodeId, {
            temperature: temperatureCelsius,
            recordedAt: observedAt,
          });
        } else {
          const updated = nodeRepository.completeNode(nodeId, {
            locationText: input.locationText ?? existingNode.locationText,
            temperature: temperatureCelsius,
            recordedAt: observedAt,
            clientSubmitId: input.clientSubmitId,
            version: input.version,
          });

          if (input.version !== undefined && !updated) {
            throw Object.assign(new Error('concurrent_update'), { code: 'concurrent_update' });
          }

          propagateNodeCompletion(taskId, existingNode.nodeType, false);
        }
      }

      const evidence = insertEvidence(prepared);
      return evidence;
    });

    let evidence: TemperatureEvidence;
    try {
      evidence = txn();
    } catch (error) {
      if (error instanceof Error && (error as { code?: string }).code === 'concurrent_update') {
        const currentNode = nodeRepository.findById(nodeId);
        return {
          status: 'concurrent_update',
          message: '检测到并发更新，请刷新后重试',
          currentNode: currentNode ?? existingNode,
        };
      }
      throw error;
    }

    return {
      status: 'created',
      evidence,
      judgment: prepared.judgment,
      abnormalReasons: prepared.abnormalReasons,
    };
  },

  appendDriverOffline(readings: DriverOfflineReading[]): EvidenceBatchCreateResult {
    const batchId = this.generateBatchId();
    const results: EvidenceBatchItemResult[] = [];
    let success = 0;
    let idempotent = 0;
    let conflict = 0;
    let failed = 0;

    for (const reading of readings) {
      try {
        if (!isNonEmptyString(reading.readingKey)) {
          throw new LedgerValidationError('readingKey', 'readingKey 不能为空');
        }
        asNodeType(reading.nodeType, 'nodeType');
        parseObservedAt(reading.observedAt, 'driver_offline');

        const node = nodeRepository.findById(reading.nodeId);
        const task = taskRepository.findById(reading.taskId);
        const order = task ? orderRepository.findById(task.orderId) : undefined;

        const rawPayload: Record<string, unknown> = {
          readingKey: reading.readingKey,
          nodeId: reading.nodeId,
          taskId: reading.taskId,
          orderId: reading.orderId ?? null,
          nodeType: reading.nodeType,
          temperature: reading.temperature,
          observedAt: reading.observedAt,
          locationText: reading.locationText ?? null,
          operatorName: reading.operatorName ?? null,
          clientSubmitId: reading.clientSubmitId ?? null,
        };

        const outcome = this.recordForNode({
          source: 'driver_offline',
          readingKey: reading.readingKey,
          rawPayload,
          nodeId: reading.nodeId,
          taskId: reading.taskId,
          orderId: reading.orderId ?? order?.id,
          nodeType: reading.nodeType,
          orderNo: order?.orderNo,
          temperatureCelsius: reading.temperature,
          observedAt: reading.observedAt,
          locationText: reading.locationText ?? node?.locationText,
          operatorName: reading.operatorName ?? node?.operatorName,
          clientSubmitId: reading.clientSubmitId,
        });

        if (outcome.status === 'conflict') {
          conflict++;
          results.push({
            readingKey: reading.readingKey,
            status: 'conflict',
            conflictEvidence: outcome.existingEvidence,
            message: outcome.message,
          });
        } else if (outcome.status === 'concurrent_update') {
          conflict++;
          results.push({
            readingKey: reading.readingKey,
            status: 'conflict',
            message: outcome.message,
          });
        } else if (outcome.status === 'idempotent') {
          idempotent++;
          results.push({ readingKey: reading.readingKey, status: 'idempotent', evidenceId: outcome.evidence.id, message: '幂等成功（标准化载荷相同）' });
        } else {
          success++;
          results.push({ readingKey: reading.readingKey, status: 'created', evidenceId: outcome.evidence.id, message: '已入账' });
        }
      } catch (error) {
        failed++;
        results.push({
          readingKey: reading.readingKey,
          status: 'failed',
          message: error instanceof Error ? error.message : '未知错误',
        });
      }
    }

    return { batchId, total: readings.length, success, idempotent, conflict, failed, results };
  },

  appendHistoricalBackfill(readings: HistoricalBackfillReading[]): EvidenceBatchCreateResult {
    const batchId = this.generateBatchId();
    const results: EvidenceBatchItemResult[] = [];
    let success = 0;
    let idempotent = 0;
    let conflict = 0;
    let failed = 0;

    for (const reading of readings) {
      try {
        if (!isNonEmptyString(reading.readingKey)) {
          throw new LedgerValidationError('readingKey', 'readingKey 不能为空');
        }
        asNodeType(reading.nodeType, 'nodeType');
        parseObservedAt(reading.observedAt, 'historical_backfill');

        const resolved = resolveNodeByOrderAndType(reading.orderNo, reading.nodeType);
        if (!resolved) {
          throw new LedgerValidationError('node', `未找到订单 ${reading.orderNo} 的 ${reading.nodeType} 节点`);
        }

        const rawPayload: Record<string, unknown> = {
          readingKey: reading.readingKey,
          orderNo: reading.orderNo,
          nodeType: reading.nodeType,
          temperature: reading.temperature,
          observedAt: reading.observedAt,
          locationText: reading.locationText ?? null,
          operatorName: reading.operatorName ?? null,
        };

        const { evidence, idempotent: isIdempotent } = this.append(
          {
            source: 'historical_backfill',
            readingKey: reading.readingKey,
            rawPayload,
            temperatureCelsius: reading.temperature,
            observedAt: reading.observedAt,
            orderNo: reading.orderNo,
            nodeType: reading.nodeType,
            nodeId: resolved.nodeId,
            taskId: resolved.taskId,
            orderId: resolved.orderId,
            locationText: reading.locationText,
            operatorName: reading.operatorName,
          },
          batchId
        );

        if (isIdempotent) {
          idempotent++;
          results.push({ readingKey: reading.readingKey, status: 'idempotent', evidenceId: evidence.id, message: '幂等成功（标准化载荷相同）' });
        } else {
          success++;
          results.push({ readingKey: reading.readingKey, status: 'created', evidenceId: evidence.id, message: '已入账' });
        }
      } catch (error) {
        if (error instanceof LedgerConflictError) {
          conflict++;
          results.push({
            readingKey: reading.readingKey,
            status: 'conflict',
            conflictEvidence: error.existingEvidence,
            message: error.message,
          });
        } else {
          failed++;
          results.push({
            readingKey: reading.readingKey,
            status: 'failed',
            message: error instanceof Error ? error.message : '未知错误',
          });
        }
      }
    }

    return { batchId, total: readings.length, success, idempotent, conflict, failed, results };
  },

  backfillFromExistingNodes(batchId?: string): EvidenceBatchCreateResult {
    const effectiveBatchId = batchId ?? this.generateBatchId();
    const results: EvidenceBatchItemResult[] = [];
    let success = 0;
    let idempotent = 0;
    let conflict = 0;
    let failed = 0;

    const nodes = nodeRepository.findByStatus('completed')
      .concat(nodeRepository.findByStatus('exception'));

    const seen = new Set<string>();
    for (const node of nodes) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);

      if (node.temperature === undefined || node.temperature === null) continue;

      const task = taskRepository.findById(node.taskId);
      const order = task ? orderRepository.findById(task.orderId) : undefined;
      if (!task || !order) continue;

      const observedAt = node.recordedAt || node.createdAt || new Date().toISOString();
      const readingKey = `backfill:${node.id}:${observedAt}`;

      const rawPayload: Record<string, unknown> = {
        nodeId: node.id,
        taskId: task.id,
        orderId: order.id,
        orderNo: order.orderNo,
        nodeType: node.nodeType,
        temperature: node.temperature,
        observedAt,
        locationText: node.locationText ?? null,
        operatorName: node.operatorName ?? null,
        fromExistingNode: true,
      };

      try {
        const { evidence, idempotent: isIdempotent } = this.append(
          {
            source: 'historical_backfill',
            readingKey,
            rawPayload,
            temperatureCelsius: node.temperature,
            observedAt,
            nodeId: node.id,
            taskId: task.id,
            orderId: order.id,
            nodeType: node.nodeType,
            orderNo: order.orderNo,
            locationText: node.locationText,
            operatorName: node.operatorName,
          },
          effectiveBatchId
        );

        if (isIdempotent) {
          idempotent++;
          results.push({ readingKey, status: 'idempotent', evidenceId: evidence.id, message: '幂等成功' });
        } else {
          success++;
          results.push({ readingKey, status: 'created', evidenceId: evidence.id, message: '已回填' });
        }
      } catch (error) {
        if (error instanceof LedgerConflictError) {
          conflict++;
          results.push({ readingKey, status: 'conflict', conflictEvidence: error.existingEvidence, message: error.message });
        } else {
          failed++;
          results.push({ readingKey, status: 'failed', message: error instanceof Error ? error.message : '未知错误' });
        }
      }
    }

    return { batchId: effectiveBatchId, total: results.length, success, idempotent, conflict, failed, results };
  },

  importCsv(csvText: string): EvidenceBatchCreateResult {
    const parsedRows = parseCsvToEvidenceInputs(csvText);
    const batchId = this.generateBatchId();
    const results: EvidenceBatchItemResult[] = [];
    let success = 0;
    let idempotent = 0;
    let conflict = 0;
    let failed = 0;

    for (const row of parsedRows) {
      try {
        const resolved = resolveNodeByOrderAndType(row.orderNo, row.nodeType);
        if (!resolved) {
          throw new LedgerValidationError('node', `未找到订单 ${row.orderNo} 的 ${row.nodeType} 节点`);
        }

        const { nodeId, taskId, orderId, order } = resolved;
        const node = nodeRepository.findById(nodeId);
        const existingException = exceptionHandlingRepository.findByNodeId(nodeId);

        const { evidence, idempotent: isIdempotent, judgment, abnormalReasons } = appendCore(
          {
            source: 'csv_import',
            readingKey: row.readingKey,
            rawPayload: row.rawPayload,
            temperatureCelsius: row.temperatureCelsius,
            observedAt: row.observedAt,
            orderNo: row.orderNo,
            nodeType: row.nodeType,
            nodeId,
            taskId,
            orderId,
            locationText: row.locationText,
            operatorName: row.operatorName,
          },
          batchId
        );

        if (isIdempotent) {
          idempotent++;
          results.push({
            readingKey: row.readingKey,
            status: 'idempotent',
            evidenceId: evidence.id,
            message: `第${row.lineNumber}行幂等成功（标准化载荷相同）`,
          });
          continue;
        }

        if (judgment === 'abnormal') {
          const exceptionDesc = abnormalReasons.join('; ');
          nodeRepository.completeNode(nodeId, {
            locationText: row.locationText ?? node?.locationText ?? '',
            temperature: row.temperatureCelsius,
            exceptionDescription: exceptionDesc,
            recordedAt: row.observedAt,
          });
          propagateNodeCompletion(taskId, row.nodeType, true);
          if (!existingException) {
            ensureExceptionWorkorder(
              nodeId,
              taskId,
              orderId,
              taskRepository.findById(taskId)?.driverId ?? '',
              order.temperatureZone,
              exceptionDesc,
              row.observedAt
            );
          }
        } else {
          if (node?.status === 'exception' || existingException) {
            nodeRepository.updateNode(nodeId, {
              temperature: row.temperatureCelsius,
              recordedAt: row.observedAt,
            });
          } else {
            nodeRepository.completeNode(nodeId, {
              locationText: row.locationText ?? node?.locationText ?? '',
              temperature: row.temperatureCelsius,
              recordedAt: row.observedAt,
            });
            propagateNodeCompletion(taskId, row.nodeType, false);
          }
        }

        success++;
        results.push({
          readingKey: row.readingKey,
          status: 'created',
          evidenceId: evidence.id,
          message: `第${row.lineNumber}行已入账（${judgment === 'abnormal' ? '温度异常，已创建/保留工单' : '正常'}）`,
        });
      } catch (error) {
        if (error instanceof LedgerConflictError) {
          conflict++;
          results.push({
            readingKey: row.readingKey,
            status: 'conflict',
            conflictEvidence: error.existingEvidence,
            message: `第${row.lineNumber}行: ${error.message}`,
          });
        } else {
          failed++;
          results.push({
            readingKey: row.readingKey,
            status: 'failed',
            message: `第${row.lineNumber}行: ${error instanceof Error ? error.message : '未知错误'}`,
          });
        }
      }
    }

    return { batchId, total: parsedRows.length, success, idempotent, conflict, failed, results };
  },

  getTimelineByNode(nodeId: string): EvidenceTimeline {
    const evidenceList = temperatureEvidenceRepository.findByNodeId(nodeId);
    const entries = sortTimeline(evidenceList.map(buildTimelineEntry));
    const abnormalEntries = entries.filter(e => e.isAbnormal);
    const normalEntries = entries.filter(e => !e.isAbnormal);

    return {
      nodeId,
      entries,
      hasAbnormal: abnormalEntries.length > 0,
      latestNormal: normalEntries.length > 0 ? normalEntries[normalEntries.length - 1] : undefined,
      abnormalCount: abnormalEntries.length,
    };
  },

  getTimelineByTask(taskId: string): EvidenceTimeline {
    const evidenceList = temperatureEvidenceRepository.findByTaskId(taskId);
    const entries = sortTimeline(evidenceList.map(buildTimelineEntry));
    const abnormalEntries = entries.filter(e => e.isAbnormal);
    const normalEntries = entries.filter(e => !e.isAbnormal);

    return {
      taskId,
      entries,
      hasAbnormal: abnormalEntries.length > 0,
      latestNormal: normalEntries.length > 0 ? normalEntries[normalEntries.length - 1] : undefined,
      abnormalCount: abnormalEntries.length,
    };
  },

  getTimelineByOrder(orderId: string): EvidenceTimeline {
    const evidenceList = temperatureEvidenceRepository.findByOrderId(orderId);
    const entries = sortTimeline(evidenceList.map(buildTimelineEntry));
    const abnormalEntries = entries.filter(e => e.isAbnormal);
    const normalEntries = entries.filter(e => !e.isAbnormal);

    return {
      orderId,
      entries,
      hasAbnormal: abnormalEntries.length > 0,
      latestNormal: normalEntries.length > 0 ? normalEntries[normalEntries.length - 1] : undefined,
      abnormalCount: abnormalEntries.length,
    };
  },

  getByReadingKey(readingKey: string): TemperatureEvidence | undefined {
    return temperatureEvidenceRepository.findByReadingKey(readingKey);
  },

  getByBatchId(batchId: string): TemperatureEvidence[] {
    return temperatureEvidenceRepository.findByBatchId(batchId);
  },

  nodeHasAbnormalEvidence(nodeId: string): boolean {
    return temperatureEvidenceRepository.findAbnormalByNodeId(nodeId).length > 0;
  },
};
