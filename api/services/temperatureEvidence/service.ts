import crypto from 'crypto';
import { temperatureEvidenceRepository } from '../../repositories/temperatureEvidence.repository.js';
import { nodeRepository } from '../../repositories/node.repository.js';
import { taskRepository } from '../../repositories/task.repository.js';
import { orderRepository } from '../../repositories/order.repository.js';
import {
  celsiusToStorage,
  storageToCelsius,
  parseObservedAt,
  computePayloadHash,
  isAbnormalTemperature,
  DEFAULT_CSV_OFFSET_MINUTES,
  type NormalizedTemperaturePayload,
} from './normalizer.js';
import type {
  TemperatureEvidence,
  TemperatureEvidenceSource,
  TemperatureEvidenceSubmitRecord,
  TemperatureEvidenceSubmitResponse,
  TemperatureEvidenceSubmitResultItem,
  TemperatureEvidenceTimelineEntry,
  TemperatureEvidenceTimelineResponse,
  TemperatureEvidenceNodeSummary,
} from '../../../shared/types.js';
import { TEMPERATURE_EVIDENCE_SOURCE_PRIORITY as SOURCE_PRIORITY } from '../../../shared/types.js';

export interface SubmitEvidenceOptions {
  source: TemperatureEvidenceSource;
  requireTimezone: boolean;
  defaultOffsetMinutes?: number;
  batchId?: string;
}

export interface ResolvedNodeContext {
  nodeId: string;
  taskId: string;
  orderId: string;
  minTemp: number;
  maxTemp: number;
}

function resolveNodeContext(nodeId: string): ResolvedNodeContext {
  const node = nodeRepository.findById(nodeId);
  if (!node) {
    throw new Error(`节点不存在: ${nodeId}`);
  }

  const task = taskRepository.findById(node.taskId);
  if (!task) {
    throw new Error(`任务不存在: ${node.taskId}`);
  }

  const order = orderRepository.findById(task.orderId);
  if (!order) {
    throw new Error(`订单不存在: ${task.orderId}`);
  }

  return {
    nodeId: node.id,
    taskId: task.id,
    orderId: order.id,
    minTemp: order.minTemp,
    maxTemp: order.maxTemp,
  };
}

function toTimelineEntry(evidence: TemperatureEvidence): TemperatureEvidenceTimelineEntry {
  const priority: number = SOURCE_PRIORITY[evidence.source];
  return {
    id: evidence.id,
    batchId: evidence.batchId,
    source: evidence.source,
    readingKey: evidence.readingKey,
    nodeId: evidence.nodeId,
    taskId: evidence.taskId,
    orderId: evidence.orderId,
    temperatureCelsius: storageToCelsius(evidence.normalizedTempC),
    normalizedTempC: evidence.normalizedTempC,
    observedAt: evidence.observedAt,
    receivedAt: evidence.receivedAt,
    locationText: evidence.locationText,
    operatorName: evidence.operatorName,
    isAbnormal: evidence.isAbnormal,
    isAnomalous: evidence.isAbnormal,
    sourcePriority: priority,
    createdAt: evidence.createdAt,
  };
}

class TemperatureEvidenceService {
  submitOne(
    record: TemperatureEvidenceSubmitRecord,
    options: SubmitEvidenceOptions
  ): TemperatureEvidenceSubmitResultItem {
    const readingKey = record.readingKey.trim();
    if (!readingKey) {
      return {
        readingKey: record.readingKey,
        status: 'error',
        message: 'readingKey 不能为空',
      };
    }

    let context: ResolvedNodeContext;
    try {
      context = resolveNodeContext(record.nodeId);
    } catch (e) {
      return {
        readingKey,
        status: 'error',
        message: e instanceof Error ? e.message : '节点解析失败',
      };
    }

    let observedAt: Date;
    try {
      observedAt = parseObservedAt(record.observedAt, {
        requireTimezone: options.requireTimezone,
        defaultOffsetMinutes: options.defaultOffsetMinutes,
      });
    } catch (e) {
      return {
        readingKey,
        status: 'error',
        message: e instanceof Error ? e.message : '时间解析失败',
      };
    }

    let normalizedTempC: number;
    try {
      normalizedTempC = celsiusToStorage(record.temperatureC);
    } catch (e) {
      return {
        readingKey,
        status: 'error',
        message: e instanceof Error ? e.message : '温度解析失败',
      };
    }

    const observedAtUtc = observedAt.toISOString();
    const receivedAtUtc = new Date().toISOString();
    const locationText = record.locationText?.trim() ?? '';
    const operatorName = record.operatorName?.trim() ?? '';

    const normalizedPayload: NormalizedTemperaturePayload = {
      nodeId: context.nodeId,
      taskId: context.taskId,
      orderId: context.orderId,
      normalizedTempC,
      observedAt: observedAtUtc,
      locationText,
      operatorName,
    };

    const payloadHash = computePayloadHash(normalizedPayload);

    const existing = temperatureEvidenceRepository.findByReadingKey(readingKey);
    if (existing) {
      if (existing.payloadHash === payloadHash) {
        return {
          readingKey,
          status: 'duplicate',
          evidenceId: existing.id,
          message: '相同证据已存在，幂等返回',
        };
      }
      return {
        readingKey,
        status: 'conflict',
        evidenceId: existing.id,
        message: '相同 readingKey 但载荷不同，冲突 (409)，禁止覆盖',
      };
    }

    const tempCelsius = storageToCelsius(normalizedTempC);
    const abnormal = isAbnormalTemperature(tempCelsius, context.minTemp, context.maxTemp);

    const originalPayload = record.originalPayload ?? {
      temperatureC: record.temperatureC,
      observedAt: record.observedAt,
      locationText,
      operatorName,
    };

    const evidenceId = crypto.randomUUID();
    const batchId = options.batchId ?? crypto.randomUUID();

    try {
      const created = temperatureEvidenceRepository.append({
        id: evidenceId,
        batchId,
        source: options.source,
        readingKey,
        nodeId: context.nodeId,
        taskId: context.taskId,
        orderId: context.orderId,
        originalPayload: JSON.stringify(originalPayload),
        normalizedTempC,
        observedAt: observedAtUtc,
        receivedAt: receivedAtUtc,
        locationText,
        operatorName,
        payloadHash,
        isAbnormal: abnormal,
      });

      return {
        readingKey,
        status: 'created',
        evidenceId: created.id,
        message: abnormal ? '证据已记录（温度异常）' : '证据已记录',
      };
    } catch (e) {
      return {
        readingKey,
        status: 'error',
        message: e instanceof Error ? e.message : '证据写入失败',
      };
    }
  }

  submitBatch(
    records: TemperatureEvidenceSubmitRecord[],
    options: SubmitEvidenceOptions
  ): TemperatureEvidenceSubmitResponse {
    const batchId = options.batchId ?? crypto.randomUUID();
    const results: TemperatureEvidenceSubmitResultItem[] = [];
    let createdCount = 0;
    let duplicateCount = 0;
    let conflictCount = 0;
    let errorCount = 0;

    for (const record of records) {
      const result = this.submitOne(record, { ...options, batchId });
      results.push(result);
      switch (result.status) {
        case 'created':
          createdCount++;
          break;
        case 'duplicate':
          duplicateCount++;
          break;
        case 'conflict':
          conflictCount++;
          break;
        case 'error':
          errorCount++;
          break;
      }
    }

    return {
      batchId,
      source: options.source,
      totalCount: records.length,
      createdCount,
      duplicateCount,
      conflictCount,
      errorCount,
      results,
    };
  }

  submitCsvImport(records: TemperatureEvidenceSubmitRecord[]): TemperatureEvidenceSubmitResponse {
    return this.submitBatch(records, {
      source: 'csv_import',
      requireTimezone: false,
      defaultOffsetMinutes: DEFAULT_CSV_OFFSET_MINUTES,
    });
  }

  submitDriverOffline(records: TemperatureEvidenceSubmitRecord[]): TemperatureEvidenceSubmitResponse {
    return this.submitBatch(records, {
      source: 'driver_offline',
      requireTimezone: true,
    });
  }

  submitHistoricalBackfill(records: TemperatureEvidenceSubmitRecord[]): TemperatureEvidenceSubmitResponse {
    return this.submitBatch(records, {
      source: 'historical_backfill',
      requireTimezone: false,
      defaultOffsetMinutes: DEFAULT_CSV_OFFSET_MINUTES,
    });
  }

  getEvidenceByNode(nodeId: string): TemperatureEvidence[] {
    return temperatureEvidenceRepository.findByNodeId(nodeId);
  }

  getEvidenceByTask(taskId: string): TemperatureEvidence[] {
    return temperatureEvidenceRepository.findByTaskId(taskId);
  }

  getEvidenceByBatch(batchId: string): TemperatureEvidence[] {
    return temperatureEvidenceRepository.findByBatchId(batchId);
  }

  getTimelineByTask(taskId: string): TemperatureEvidenceTimelineResponse {
    const evidenceList = temperatureEvidenceRepository.findTimelineByTaskId(taskId);
    const entries = evidenceList.map(toTimelineEntry);
    const abnormalCount = entries.filter((e) => e.isAbnormal).length;

    return {
      taskId,
      entries,
      hasAnomaly: abnormalCount > 0,
      totalCount: entries.length,
      abnormalCount,
    };
  }

  getNodeSummary(nodeId: string): TemperatureEvidenceNodeSummary {
    const evidenceList = temperatureEvidenceRepository.findByNodeId(nodeId);
    const anomalous = evidenceList.filter((e) => e.isAbnormal);
    const latestObservedAt = evidenceList.length > 0
      ? evidenceList.reduce((latest, e) => (e.observedAt > latest ? e.observedAt : latest), evidenceList[0].observedAt)
      : undefined;

    return {
      nodeId,
      totalEvidenceCount: evidenceList.length,
      abnormalCount: anomalous.length,
      latestObservedAt,
      hasAnomaly: anomalous.length > 0,
      anomalousEvidence: anomalous,
    };
  }

  hasAbnormalEvidence(nodeId: string): boolean {
    return temperatureEvidenceRepository.hasAbnormalEvidence(nodeId);
  }
}

export const temperatureEvidenceService = new TemperatureEvidenceService();
