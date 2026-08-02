import { Request, Response } from 'express';
import { temperatureLedgerService } from '../services/temperature-ledger.service';
import { LedgerConflictError, LedgerValidationError } from '../../shared/temperature-ledger.types';
import {
  serializeEvidence,
  serializeTimeline,
  serializeBatchResult,
} from '../utils/evidence-serializer';
import type {
  DriverOfflineReading,
  HistoricalBackfillReading,
  EvidenceSource,
  NodeEvidenceInput,
} from '../../shared/temperature-ledger.types';
import type { NodeType } from '../../shared/types';

const EVIDENCE_SOURCES: ReadonlySet<EvidenceSource> = new Set([
  'csv_import',
  'driver_offline',
  'historical_backfill',
]);

const NODE_TYPES: ReadonlySet<string> = new Set([
  'warehouse_in',
  'loading',
  'departure',
  'arrival',
  'delivery',
  'signature',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new LedgerValidationError(field, `${field} 必须是非空字符串`);
  }
  return value.trim();
}

function optionalString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

function requireNumber(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new LedgerValidationError(field, `${field} 必须是有效数字`);
}

function optionalNumber(record: Record<string, unknown>, field: string): number | undefined {
  const value = record[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function requireSource(record: Record<string, unknown>): EvidenceSource {
  const value = record.source;
  if (typeof value !== 'string' || !EVIDENCE_SOURCES.has(value as EvidenceSource)) {
    throw new LedgerValidationError('source', `source 必须是其中之一: ${Array.from(EVIDENCE_SOURCES).join(', ')}`);
  }
  return value as EvidenceSource;
}

function requireNodeType(record: Record<string, unknown>, field: string): NodeType {
  const value = record[field];
  if (typeof value !== 'string' || !NODE_TYPES.has(value)) {
    throw new LedgerValidationError(field, `${field} 必须是有效节点类型`);
  }
  return value as NodeType;
}

function optionalNodeType(record: Record<string, unknown>, field: string): NodeType | undefined {
  const value = record[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !NODE_TYPES.has(value)) {
    throw new LedgerValidationError(field, `${field} 必须是有效节点类型`);
  }
  return value as NodeType;
}

function parseAppendBody(body: unknown): NodeEvidenceInput {
  if (!isRecord(body)) {
    throw new LedgerValidationError('body', '请求体必须是对象');
  }

  const source = requireSource(body);
  const readingKey = requireString(body, 'readingKey');
  const nodeId = requireString(body, 'nodeId');
  const temperatureCelsius = optionalNumber(body, 'temperatureCelsius');
  const observedAt = optionalString(body, 'observedAt');
  const taskId = optionalString(body, 'taskId');
  const orderId = optionalString(body, 'orderId');
  const nodeType = optionalNodeType(body, 'nodeType');
  const orderNo = optionalString(body, 'orderNo');
  const locationText = optionalString(body, 'locationText');
  const operatorName = optionalString(body, 'operatorName');
  const exceptionDescription = optionalString(body, 'exceptionDescription');
  const clientSubmitId = optionalString(body, 'clientSubmitId');

  const rawPayload = isRecord(body.rawPayload)
    ? body.rawPayload
    : { ...body };

  return {
    source,
    readingKey,
    rawPayload,
    nodeId,
    taskId,
    orderId,
    nodeType,
    orderNo,
    temperatureCelsius,
    observedAt,
    locationText,
    operatorName,
    exceptionDescription,
    clientSubmitId,
  };
}

function toDriverOfflineReading(value: unknown, index: number): DriverOfflineReading {
  if (!isRecord(value)) {
    throw new LedgerValidationError('reading', `第${index + 1}项必须是对象`);
  }
  const readingKey = requireString(value, 'readingKey');
  const nodeId = requireString(value, 'nodeId');
  const taskId = requireString(value, 'taskId');
  const nodeType = requireNodeType(value, 'nodeType');
  const temperature = requireNumber(value, 'temperature');
  const observedAt = requireString(value, 'observedAt');

  return {
    readingKey,
    nodeId,
    taskId,
    orderId: optionalString(value, 'orderId'),
    nodeType,
    temperature,
    observedAt,
    locationText: optionalString(value, 'locationText'),
    operatorName: optionalString(value, 'operatorName'),
    clientSubmitId: optionalString(value, 'clientSubmitId'),
  };
}

function toHistoricalBackfillReading(value: unknown, index: number): HistoricalBackfillReading {
  if (!isRecord(value)) {
    throw new LedgerValidationError('reading', `第${index + 1}项必须是对象`);
  }
  return {
    readingKey: requireString(value, 'readingKey'),
    orderNo: requireString(value, 'orderNo'),
    nodeType: requireNodeType(value, 'nodeType'),
    temperature: requireNumber(value, 'temperature'),
    observedAt: requireString(value, 'observedAt'),
    locationText: optionalString(value, 'locationText'),
    operatorName: optionalString(value, 'operatorName'),
  };
}

export const temperatureLedgerController = {
  append(req: Request, res: Response): Response {
    try {
      const input = parseAppendBody(req.body);
      const outcome = temperatureLedgerService.recordForNode(input);

      if (outcome.status === 'conflict') {
        return res.status(409).json({
          message: outcome.message,
          existingEvidence: serializeEvidence(outcome.existingEvidence),
          submittedStandardizedHash: outcome.submittedStandardizedHash,
        });
      }

      if (outcome.status === 'concurrent_update') {
        return res.status(409).json({
          message: outcome.message,
          currentNode: outcome.currentNode,
        });
      }

      return res.status(outcome.status === 'idempotent' ? 200 : 201).json({
        status: outcome.status,
        evidence: serializeEvidence(outcome.evidence),
        judgment: outcome.judgment,
        abnormalReasons: outcome.abnormalReasons,
      });
    } catch (error) {
      if (error instanceof LedgerConflictError) {
        return res.status(409).json({
          message: error.message,
          existingEvidence: serializeEvidence(error.existingEvidence),
          submittedStandardizedHash: error.submittedPayloadHash,
        });
      }
      if (error instanceof LedgerValidationError) {
        return res.status(400).json({ message: error.message, field: error.field });
      }
      return res.status(500).json({ message: '入账失败', error: error instanceof Error ? error.message : '未知错误' });
    }
  },

  importCsv(req: Request, res: Response): Response {
    try {
      const body = req.body;
      if (!isRecord(body) || typeof body.csvText !== 'string' || body.csvText.trim() === '') {
        return res.status(400).json({ message: 'csvText 必须是非空字符串' });
      }
      const result = temperatureLedgerService.importCsv(body.csvText);
      return res.status(200).json(serializeBatchResult(result));
    } catch (error) {
      if (error instanceof LedgerValidationError) {
        return res.status(400).json({ message: error.message, field: error.field });
      }
      return res.status(500).json({ message: 'CSV入账失败', error: error instanceof Error ? error.message : '未知错误' });
    }
  },

  uploadDriverOffline(req: Request, res: Response): Response {
    try {
      const body = req.body;
      if (!isRecord(body) || !Array.isArray(body.readings)) {
        return res.status(400).json({ message: 'readings 必须是数组' });
      }
      const readings = body.readings.map(toDriverOfflineReading);
      const result = temperatureLedgerService.appendDriverOffline(readings);
      const hasConflict = result.conflict > 0;
      return res.status(hasConflict ? 409 : 200).json(serializeBatchResult(result));
    } catch (error) {
      if (error instanceof LedgerValidationError) {
        return res.status(400).json({ message: error.message, field: error.field });
      }
      return res.status(500).json({ message: '司机离线上报失败', error: error instanceof Error ? error.message : '未知错误' });
    }
  },

  backfillHistorical(req: Request, res: Response): Response {
    try {
      const body = req.body;
      if (!isRecord(body) || !Array.isArray(body.readings)) {
        return res.status(400).json({ message: 'readings 必须是数组' });
      }
      const readings = body.readings.map(toHistoricalBackfillReading);
      const result = temperatureLedgerService.appendHistoricalBackfill(readings);
      const hasConflict = result.conflict > 0;
      return res.status(hasConflict ? 409 : 200).json(serializeBatchResult(result));
    } catch (error) {
      if (error instanceof LedgerValidationError) {
        return res.status(400).json({ message: error.message, field: error.field });
      }
      return res.status(500).json({ message: '历史回填失败', error: error instanceof Error ? error.message : '未知错误' });
    }
  },

  backfillFromExistingNodes(_req: Request, res: Response): Response {
    try {
      const result = temperatureLedgerService.backfillFromExistingNodes();
      return res.status(200).json(serializeBatchResult(result));
    } catch (error) {
      return res.status(500).json({
        message: '历史节点回填失败',
        error: error instanceof Error ? error.message : '未知错误',
      });
    }
  },

  getByNode(req: Request, res: Response): Response {
    const { nodeId } = req.params;
    const timeline = temperatureLedgerService.getTimelineByNode(nodeId);
    return res.status(200).json(serializeTimeline(timeline));
  },

  getByTask(req: Request, res: Response): Response {
    const { taskId } = req.params;
    const timeline = temperatureLedgerService.getTimelineByTask(taskId);
    return res.status(200).json(serializeTimeline(timeline));
  },

  getByOrder(req: Request, res: Response): Response {
    const { orderId } = req.params;
    const timeline = temperatureLedgerService.getTimelineByOrder(orderId);
    return res.status(200).json(serializeTimeline(timeline));
  },

  getByReadingKey(req: Request, res: Response): Response {
    const { readingKey } = req.params;
    const evidence = temperatureLedgerService.getByReadingKey(readingKey);
    if (!evidence) {
      return res.status(404).json({ message: '证据不存在' });
    }
    return res.status(200).json(serializeEvidence(evidence));
  },

  getByBatch(req: Request, res: Response): Response {
    const { batchId } = req.params;
    const evidence = temperatureLedgerService.getByBatchId(batchId);
    return res.status(200).json({
      batchId,
      items: evidence.map(serializeEvidence),
      total: evidence.length,
    });
  },
};
