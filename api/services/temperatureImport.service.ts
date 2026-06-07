import { orderRepository } from '../repositories/order.repository';
import { taskRepository } from '../repositories/task.repository';
import { nodeRepository } from '../repositories/node.repository';
import { exceptionHandlingRepository } from '../repositories/exception.repository';
import { deliveryService } from './delivery.service';
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
} from '../../shared/types';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

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

function parseCsvText(csvText: string): TemperatureRecordCsvRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length === 0) return [];

  const separator = lines[0].includes('\t') ? '\t' : ',';
  const headerLine = lines[0];
  const headers = headerLine.split(separator).map(h => h.trim().toLowerCase());

  const columnMap: Record<string, number> = {};
  headers.forEach((header, index) => {
    if (header === '订单号' || header === 'orderno') columnMap.orderNo = index;
    if (header === '节点类型' || header === 'nodetype') columnMap.nodeType = index;
    if (header === '记录时间' || header === 'recordedat') columnMap.recordedAt = index;
    if (header === '温度' || header === '温度值' || header === 'temperature') columnMap.temperature = index;
    if (header === '位置' || header === 'locationtext') columnMap.locationText = index;
    if (header === '操作人' || header === 'operatorname') columnMap.operatorName = index;
  });

  const requiredColumns = ['orderNo', 'nodeType', 'recordedAt', 'temperature'];
  const missingColumns = requiredColumns.filter(col => !(col in columnMap));
  if (missingColumns.length > 0) {
    throw new Error(`CSV缺少必要列: ${missingColumns.join(', ')}`);
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

function validateRecord(parsed: TemperatureRecordParsed): TemperatureRecordValidationResult {
  const failureReasons: string[] = [];
  let status: TemperatureRecordStatus = 'unmatched';
  let matched: TemperatureRecordValidationResult['matched'] | undefined;

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
    };
  }

  const { order, task, node } = matchResult.matched;
  matched = {
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
  };
}

function previewImport(csvText: string): TemperatureRecordImportPreview {
  const rows = parseCsvText(csvText);
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

function executeImport(
  records: TemperatureRecordValidationResult[],
  operator: User
): TemperatureRecordImportResult {
  const results: TemperatureRecordImportResult['results'] = [];
  let successCount = 0;
  let failedCount = 0;
  let exceptionCreatedCount = 0;

  const validRecords = records.filter(r => r.status === 'importable' || r.status === 'abnormal');

  for (const record of validRecords) {
    const { parsed, matched } = record;

    if (!matched) {
      results.push({
        lineNumber: record.lineNumber,
        orderNo: parsed.orderNo,
        success: false,
        isException: false,
        message: '未找到匹配的订单或节点',
      });
      failedCount++;
      continue;
    }

    const { node, task, order } = matched;

    try {
      if (record.status === 'importable') {
        nodeRepository.completeNode(node.id, {
          locationText: parsed.locationText,
          temperature: parsed.temperature!,
          recordedAt: parsed.recordedAt!.toISOString(),
        });

        deliveryService.updateOrderStatusFromNode(task.id, node.nodeType, 'completed');

        results.push({
          lineNumber: record.lineNumber,
          orderNo: parsed.orderNo,
          success: true,
          isException: false,
          nodeId: node.id,
          message: `节点 ${nodeTypeNames[node.nodeType]} 导入成功`,
        });
        successCount++;
      } else if (record.status === 'abnormal') {
        const exceptionDesc = record.failureReasons.join('; ');

        nodeRepository.completeNode(node.id, {
          locationText: parsed.locationText,
          temperature: parsed.temperature!,
          exceptionDescription: exceptionDesc,
          recordedAt: parsed.recordedAt!.toISOString(),
        });

        deliveryService.updateOrderStatusFromNode(task.id, node.nodeType, 'exception');

        const exceptionId = generateId();
        exceptionHandlingRepository.createHandling({
          id: exceptionId,
          nodeId: node.id,
          taskId: task.id,
          orderId: order.id,
          driverId: task.driverId,
          temperatureZone: order.temperatureZone,
          exceptionDescription: exceptionDesc,
          exceptionTime: parsed.recordedAt!.toISOString(),
          handlingStatus: 'pending',
        });

        results.push({
          lineNumber: record.lineNumber,
          orderNo: parsed.orderNo,
          success: true,
          isException: true,
          nodeId: node.id,
          exceptionId,
          message: `节点 ${nodeTypeNames[node.nodeType]} 导入成功（温度异常），已创建异常记录`,
        });
        successCount++;
        exceptionCreatedCount++;
      }
    } catch (error) {
      results.push({
        lineNumber: record.lineNumber,
        orderNo: parsed.orderNo,
        success: false,
        isException: false,
        message: `导入失败: ${error instanceof Error ? error.message : '未知错误'}`,
      });
      failedCount++;
    }
  }

  return {
    successCount,
    failedCount,
    exceptionCreatedCount,
    results,
  };
}

export const temperatureImportService = {
  parseCsvText,
  parseRow,
  matchRecord,
  validateTemperature,
  validateRecord,
  previewImport,
  executeImport,
};
