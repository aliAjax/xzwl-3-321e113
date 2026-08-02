import { orderRepository } from '../repositories/order.repository';
import { taskRepository } from '../repositories/task.repository';
import { nodeRepository } from '../repositories/node.repository';
import { temperatureEvidenceRepository } from '../repositories/temperatureEvidence.repository';
import { deliveryService } from './delivery.service';
import { temperatureEvidenceService } from './temperatureEvidence.service';
import type {
  NodeType,
  TemperatureRecordCsvRow,
  TemperatureRecordParsed,
  TemperatureRecordValidationResult,
  TemperatureRecordImportPreview,
  TemperatureRecordImportResult,
  TemperatureRecordStatus,
  User,
  DeliveryNode,
  Order,
  DeliveryTask,
  TemperatureRecordColumnMapping,
  TemperatureRecordColumnParseResult,
  TemperatureRecordFieldKey,
} from '../../shared/types';


const nodeTypeMap: Record<string, NodeType> = {
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

const nodeTypeNames: Record<NodeType, string> = {
  warehouse_in: '入库',
  loading: '装车',
  departure: '出发',
  arrival: '到达',
  delivery: '配送',
  signature: '签收',
};

const columnHeaderMatchers: Record<TemperatureRecordFieldKey, string[]> = {
  orderNo: ['订单号', 'orderno', 'order no', 'order_id', 'orderid', '订单编号'],
  nodeType: ['节点类型', 'nodetype', 'node type', '节点', '操作类型', '环节'],
  recordedAt: ['记录时间', 'recordedat', 'recorded at', '时间', '日期', 'datetime', 'date', '发生时间'],
  temperature: ['温度', '温度值', 'temperature', 'temp', '测温值'],
  locationText: ['位置', 'locationtext', 'location', '地点', '地址', '存放位置'],
  operatorName: ['操作人', 'operatorname', 'operator', '操作员', '经办人', '负责人'],
};

function detectSeparator(line: string): string {
  if (line.includes('\t')) return '\t';
  return ',';
}

function autoDetectMapping(headers: string[]): TemperatureRecordColumnMapping {
  const mapping: TemperatureRecordColumnMapping = {
    orderNo: null,
    nodeType: null,
    recordedAt: null,
    temperature: null,
    locationText: null,
    operatorName: null,
  };

  const normalizedHeaders = headers.map(h => h.trim().toLowerCase());

  const fieldKeys = Object.keys(columnHeaderMatchers) as TemperatureRecordFieldKey[];
  for (const field of fieldKeys) {
    const patterns = columnHeaderMatchers[field];
    for (let i = 0; i < normalizedHeaders.length; i++) {
      const header = normalizedHeaders[i];
      if (patterns.some(pattern => header.includes(pattern))) {
        mapping[field] = i;
        break;
      }
    }
  }

  return mapping;
}

function parseColumns(csvText: string): TemperatureRecordColumnParseResult {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length === 0) {
    throw new Error('CSV内容为空');
  }

  const separator = detectSeparator(lines[0]);
  const headers = lines[0].split(separator).map(h => h.trim());

  if (headers.length === 0 || headers.every(h => h === '')) {
    throw new Error('无法识别CSV表头');
  }

  const autoMapping = autoDetectMapping(headers);

  const sampleRows: string[][] = [];
  for (let i = 1; i < Math.min(lines.length, 6); i++) {
    const line = lines[i].trim();
    if (line) {
      sampleRows.push(line.split(separator).map(v => v.trim()));
    }
  }

  return {
    headers,
    autoMapping,
    sampleRows,
    separator,
  };
}

function parseCsvText(csvText: string, mapping?: TemperatureRecordColumnMapping): TemperatureRecordCsvRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length === 0) return [];

  const separator = detectSeparator(lines[0]);
  const headerLine = lines[0];
  const headers = headerLine.split(separator).map(h => h.trim().toLowerCase());

  const columnMap: Record<string, number> = {};

  if (mapping) {
    if (mapping.orderNo !== null) columnMap.orderNo = mapping.orderNo;
    if (mapping.nodeType !== null) columnMap.nodeType = mapping.nodeType;
    if (mapping.recordedAt !== null) columnMap.recordedAt = mapping.recordedAt;
    if (mapping.temperature !== null) columnMap.temperature = mapping.temperature;
    if (mapping.locationText !== null) columnMap.locationText = mapping.locationText;
    if (mapping.operatorName !== null) columnMap.operatorName = mapping.operatorName;
  } else {
    headers.forEach((header, index) => {
      if (header === '订单号' || header === 'orderno') columnMap.orderNo = index;
      if (header === '节点类型' || header === 'nodetype') columnMap.nodeType = index;
      if (header === '记录时间' || header === 'recordedat') columnMap.recordedAt = index;
      if (header === '温度' || header === '温度值' || header === 'temperature') columnMap.temperature = index;
      if (header === '位置' || header === 'locationtext') columnMap.locationText = index;
      if (header === '操作人' || header === 'operatorname') columnMap.operatorName = index;
    });
  }

  const requiredColumns = ['orderNo', 'nodeType', 'recordedAt', 'temperature'];
  const missingColumns = requiredColumns.filter(col => !(col in columnMap));
  if (missingColumns.length > 0) {
    const columnLabels: Record<string, string> = {
      orderNo: '订单号',
      nodeType: '节点类型',
      recordedAt: '记录时间',
      temperature: '温度',
    };
    throw new Error(`缺少必要列: ${missingColumns.map(c => columnLabels[c] || c).join(', ')}`);
  }

  const rows: TemperatureRecordCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(separator).map(v => v.trim());
    rows.push({
      orderNo: values[columnMap.orderNo] || '',
      nodeType: values[columnMap.nodeType] || '',
      recordedAt: values[columnMap.recordedAt] || '',
      temperature: values[columnMap.temperature] || '',
      locationText: columnMap.locationText !== undefined ? values[columnMap.locationText] : undefined,
      operatorName: columnMap.operatorName !== undefined ? values[columnMap.operatorName] : undefined,
    });
  }

  return rows;
}

function parseRow(row: TemperatureRecordCsvRow, lineNumber: number): TemperatureRecordParsed {
  const nodeTypeKey = (row.nodeType || '').trim().toLowerCase();
  const nodeType = nodeTypeMap[nodeTypeKey] || null;

  let recordedAt: Date | null = null;
  const dateStr = (row.recordedAt || '').trim();
  if (dateStr) {
    const parsedDate = new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
      recordedAt = parsedDate;
    } else {
      const formats = [
        /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/,
        /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/,
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
        /^(\d{4})年(\d{2})月(\d{2})日\s*(\d{2})?:?(\d{2})?:?(\d{2})?$/,
      ];
      for (const regex of formats) {
        const match = dateStr.match(regex);
        if (match) {
          const [, y, m, d, h = '0', min = '0', s = '0'] = match;
          const constructedDate = new Date(
            parseInt(y),
            parseInt(m) - 1,
            parseInt(d),
            parseInt(h),
            parseInt(min),
            parseInt(s)
          );
          if (!isNaN(constructedDate.getTime())) {
            recordedAt = constructedDate;
            break;
          }
        }
      }
    }
  }

  let temperature: number | null = null;
  const tempStr = (row.temperature || '').trim();
  if (tempStr) {
    const parsedTemp = parseFloat(tempStr);
    if (!isNaN(parsedTemp)) {
      temperature = parsedTemp;
    }
  }

  return {
    lineNumber,
    orderNo: (row.orderNo || '').trim(),
    nodeType,
    recordedAt,
    temperature,
    locationText: (row.locationText || '').trim(),
    operatorName: (row.operatorName || '').trim(),
  };
}

function matchRecord(parsed: TemperatureRecordParsed): { matched?: { order: Order; task: DeliveryTask; node: DeliveryNode }; reasons: string[] } {
  const reasons: string[] = [];

  if (!parsed.orderNo) {
    reasons.push('订单号不能为空');
    return { reasons };
  }

  const order = orderRepository.findByOrderNo(parsed.orderNo);
  if (!order) {
    reasons.push(`未找到订单号: ${parsed.orderNo}`);
    return { reasons };
  }

  const task = taskRepository.findByOrderId(order.id);
  if (!task) {
    reasons.push(`订单 ${parsed.orderNo} 未关联任务`);
    return { reasons };
  }

  if (!parsed.nodeType) {
    reasons.push('节点类型无效');
    return { reasons };
  }

  const node = nodeRepository.findByTaskIdAndNodeType(task.id, parsed.nodeType);
  if (!node) {
    reasons.push(`任务中未找到节点类型: ${nodeTypeNames[parsed.nodeType]}`);
    return { reasons };
  }

  if (node.status === 'completed') {
    reasons.push(`节点 ${nodeTypeNames[parsed.nodeType]} 已完成，无需重复导入`);
    return { reasons };
  }

  return {
    matched: { order, task, node },
    reasons,
  };
}

function validateTemperature(parsed: TemperatureRecordParsed, order: Order): string[] {
  const reasons: string[] = [];

  if (parsed.temperature === null) {
    reasons.push('温度值无效');
    return reasons;
  }

  if (parsed.temperature < order.minTemp) {
    reasons.push(`温度 ${parsed.temperature}°C 低于最低要求 ${order.minTemp}°C`);
  }

  if (parsed.temperature > order.maxTemp) {
    reasons.push(`温度 ${parsed.temperature}°C 高于最高要求 ${order.maxTemp}°C`);
  }

  return reasons;
}

function analyzeSuggestedCorrections(parsed: TemperatureRecordParsed, failureReasons: string[]): string[] {
  const suggestions: string[] = [];
  const reasonText = failureReasons.join('; ');

  if (reasonText.includes('订单号')) {
    suggestions.push('订单号');
  }
  if (reasonText.includes('节点类型')) {
    suggestions.push('节点类型');
  }
  if (reasonText.includes('记录时间')) {
    suggestions.push('记录时间');
  }
  if (reasonText.includes('温度') || reasonText.includes('temp')) {
    suggestions.push('温度');
  }
  if (reasonText.includes('未找到订单') || reasonText.includes('未关联任务')) {
    suggestions.push('订单号');
  }
  if (reasonText.includes('未找到节点类型')) {
    suggestions.push('节点类型');
  }
  if (reasonText.includes('已完成') && reasonText.includes('重复导入')) {
    suggestions.push('节点类型');
  }

  return [...new Set(suggestions)];
}

function validateRecord(parsed: TemperatureRecordParsed): TemperatureRecordValidationResult {
  const failureReasons: string[] = [];
  let status: TemperatureRecordStatus = 'unmatched';

  if (!parsed.orderNo) {
    failureReasons.push('订单号不能为空');
  }
  if (!parsed.nodeType) {
    failureReasons.push(`节点类型无效: ${parsed.nodeType}`);
  }
  if (!parsed.recordedAt) {
    failureReasons.push('记录时间格式无效');
  }
  if (parsed.temperature === null) {
    failureReasons.push('温度值无效');
  }

  if (failureReasons.length > 0) {
    return {
      lineNumber: parsed.lineNumber,
      status: 'unmatched',
      parsed,
      failureReasons,
      suggestedCorrectionFields: analyzeSuggestedCorrections(parsed, failureReasons),
    };
  }

  const matchResult = matchRecord(parsed);
  failureReasons.push(...matchResult.reasons);

  if (!matchResult.matched) {
    return {
      lineNumber: parsed.lineNumber,
      status: 'unmatched',
      parsed,
      failureReasons,
      suggestedCorrectionFields: analyzeSuggestedCorrections(parsed, failureReasons),
    };
  }

  const { order, task, node } = matchResult.matched;
  const matched = {
    orderId: order.id,
    orderNo: order.orderNo,
    order,
    taskId: task.id,
    task,
    nodeId: node.id,
    node,
  };

  const tempReasons = validateTemperature(parsed, order);
  if (tempReasons.length > 0) {
    failureReasons.push(...tempReasons);
    status = 'abnormal';
  } else {
    status = 'importable';
  }

  return {
    lineNumber: parsed.lineNumber,
    status,
    parsed,
    matched,
    failureReasons,
    suggestedCorrectionFields: analyzeSuggestedCorrections(parsed, failureReasons),
  };
}

function previewImport(csvText: string, mapping?: TemperatureRecordColumnMapping): TemperatureRecordImportPreview {
  const rows = parseCsvText(csvText, mapping);
  const validationResults: TemperatureRecordValidationResult[] = [];

  rows.forEach((row, index) => {
    const parsed = parseRow(row, index + 2);
    const validation = validateRecord(parsed);
    validationResults.push(validation);
  });

  const importableRecords = validationResults.filter(r => r.status === 'importable');
  const abnormalRecords = validationResults.filter(r => r.status === 'abnormal');
  const unmatchedRecords = validationResults.filter(r => r.status === 'unmatched');

  return {
    totalCount: validationResults.length,
    importableCount: importableRecords.length,
    abnormalCount: abnormalRecords.length,
    unmatchedCount: unmatchedRecords.length,
    importableRecords,
    abnormalRecords,
    unmatchedRecords,
  };
}

/**
 * 将 parsed.recordedAt 归一化为 ISO 字符串。
 * 服务层的 TemperatureRecordParsed.recordedAt 声明为 Date，但页面预览结果经 JSON
 * 往返后会变成字符串（Date 无法序列化）。这里同时兼容 Date、字符串、时间戳，
 * 避免在真实 HTTP 调用链上直接对字符串调用 .toISOString() 而抛错。
 * 返回 null 表示无法解析成有效时间。
 */
function toIsoString(value: Date | string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function executeImport(
  records: TemperatureRecordValidationResult[],
  operator: User
): TemperatureRecordImportResult {
  const results: TemperatureRecordImportResult['results'] = [];
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let exceptionCreatedCount = 0;
  let conflictCount = 0;

  const skippedRecords = records.filter(r => r.status === 'unmatched');
  for (const record of skippedRecords) {
    results.push({
      lineNumber: record.lineNumber,
      orderNo: record.parsed.orderNo,
      success: false,
      isException: false,
      isSkipped: true,
      message: record.failureReasons.length > 0 ? record.failureReasons.join('; ') : '未匹配，已跳过',
    });
    skippedCount++;
  }

  const validRecords = records.filter(r => r.status === 'importable' || r.status === 'abnormal');

  for (const record of validRecords) {
    const { parsed, matched } = record;

    if (!matched) {
      results.push({
        lineNumber: record.lineNumber,
        orderNo: parsed.orderNo,
        success: false,
        isException: false,
        isSkipped: false,
        message: '未找到匹配的订单或节点',
      });
      failedCount++;
      continue;
    }

    const { node, task, order } = matched;

    try {
      // 一致性：节点更新、温度证据登记、异常工单创建在同一事务内完成。
      // - 账本冲突（同 readingKey 不同载荷）：抛出哨兵 → 回滚，节点不变、不建工单，判为冲突。
      // - 事务内任一步骤失败：整体回滚，不会出现“节点已变、证据/工单缺失”的中间态。
      const isAbnormal = record.status === 'abnormal';
      const exceptionDesc = isAbnormal ? record.failureReasons.join('; ') : undefined;

      // 兼容 JSON 往返后 recordedAt 变成字符串的情况，避免直接 .toISOString() 抛错。
      const recordedAtIso = toIsoString(parsed.recordedAt);
      if (!recordedAtIso) {
        results.push({
          lineNumber: record.lineNumber,
          orderNo: parsed.orderNo,
          success: false,
          isException: false,
          isSkipped: false,
          message: '记录时间格式无效',
        });
        failedCount++;
        continue;
      }

      const outcome = temperatureEvidenceRepository.runInTransaction((): { exceptionId?: string } => {
        nodeRepository.completeNode(node.id, {
          locationText: parsed.locationText,
          temperature: parsed.temperature!,
          exceptionDescription: exceptionDesc,
          recordedAt: recordedAtIso,
        });

        deliveryService.updateOrderStatusFromNode(
          task.id,
          node.nodeType,
          isAbnormal ? 'exception' : 'completed'
        );

        // 账本统一负责“写证据 + 建/关联异常工单”。
        const evidenceResult = temperatureEvidenceService.recordNodeEvidence({
          source: 'csv_import',
          orderId: order.id,
          taskId: task.id,
          nodeId: node.id,
          nodeType: node.nodeType,
          temperature: parsed.temperature!,
          observedAt: recordedAtIso,
          locationText: parsed.locationText,
          operatorName: parsed.operatorName,
          exceptionDescription: exceptionDesc,
        });

        if (evidenceResult.hasConflict) {
          throw { kind: 'evidence_conflict' };
        }

        return { exceptionId: evidenceResult.outcomes[0]?.exceptionId };
      });

      if (isAbnormal) {
        results.push({
          lineNumber: record.lineNumber,
          orderNo: parsed.orderNo,
          success: true,
          isException: true,
          isSkipped: false,
          nodeId: node.id,
          exceptionId: outcome.exceptionId,
          message: `节点 ${nodeTypeNames[node.nodeType]} 导入成功（温度异常），已创建异常记录`,
        });
        successCount++;
        exceptionCreatedCount++;
      } else {
        results.push({
          lineNumber: record.lineNumber,
          orderNo: parsed.orderNo,
          success: true,
          isException: false,
          isSkipped: false,
          nodeId: node.id,
          message: `节点 ${nodeTypeNames[node.nodeType]} 导入成功`,
        });
        successCount++;
      }
    } catch (error) {
      const failure = error as { kind?: string };
      if (failure && failure.kind === 'evidence_conflict') {
        results.push({
          lineNumber: record.lineNumber,
          orderNo: parsed.orderNo,
          success: false,
          isException: false,
          isSkipped: false,
          isConflict: true,
          nodeId: node.id,
          message: `温度证据冲突：同一 readingKey 已存在不同载荷，拒绝覆盖（409）`,
        });
        conflictCount++;
        continue;
      }
      results.push({
        lineNumber: record.lineNumber,
        orderNo: parsed.orderNo,
        success: false,
        isException: false,
        isSkipped: false,
        message: `导入失败: ${error instanceof Error ? error.message : '未知错误'}`,
      });
      failedCount++;
    }
  }

  return {
    successCount,
    failedCount,
    skippedCount,
    exceptionCreatedCount,
    conflictCount,
    results,
  };
}

export const temperatureImportService = {
  parseColumns,
  detectSeparator,
  autoDetectMapping,
  parseCsvText,
  parseRow,
  matchRecord,
  validateTemperature,
  validateRecord,
  previewImport,
  executeImport,
};
