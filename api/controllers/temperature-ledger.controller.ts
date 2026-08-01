import { Request, Response } from 'express';
import { temperatureLedgerService } from '../services/temperature-ledger.service';
import { LedgerConflictError, LedgerValidationError } from '../../shared/temperature-ledger.types';
import type {
  DriverOfflineReading,
  HistoricalBackfillReading,
  TemperatureEvidenceInput,
} from '../../shared/temperature-ledger.types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toDriverOfflineReading(value: unknown): DriverOfflineReading {
  if (!isRecord(value)) {
    throw new LedgerValidationError('reading', '司机离线上报项必须是对象');
  }
  if (typeof value.readingKey !== 'string' || value.readingKey.trim() === '') {
    throw new LedgerValidationError('readingKey', 'readingKey 必须是非空字符串');
  }
  if (typeof value.nodeId !== 'string' || value.nodeId.trim() === '') {
    throw new LedgerValidationError('nodeId', 'nodeId 必须是非空字符串');
  }
  if (typeof value.taskId !== 'string' || value.taskId.trim() === '') {
    throw new LedgerValidationError('taskId', 'taskId 必须是非空字符串');
  }
  if (typeof value.nodeType !== 'string') {
    throw new LedgerValidationError('nodeType', 'nodeType 必须是字符串');
  }
  if (typeof value.temperature !== 'number' || !Number.isFinite(value.temperature)) {
    throw new LedgerValidationError('temperature', 'temperature 必须是有效数字');
  }
  if (typeof value.observedAt !== 'string' || value.observedAt.trim() === '') {
    throw new LedgerValidationError('observedAt', 'observedAt 必须是非空字符串');
  }

  return {
    readingKey: value.readingKey.trim(),
    nodeId: value.nodeId.trim(),
    taskId: value.taskId.trim(),
    orderId: typeof value.orderId === 'string' ? value.orderId.trim() : undefined,
    nodeType: value.nodeType as DriverOfflineReading['nodeType'],
    temperature: value.temperature,
    observedAt: value.observedAt.trim(),
    locationText: typeof value.locationText === 'string' ? value.locationText.trim() : undefined,
    operatorName: typeof value.operatorName === 'string' ? value.operatorName.trim() : undefined,
    clientSubmitId: typeof value.clientSubmitId === 'string' ? value.clientSubmitId.trim() : undefined,
  };
}

function toHistoricalBackfillReading(value: unknown): HistoricalBackfillReading {
  if (!isRecord(value)) {
    throw new LedgerValidationError('reading', '历史回填项必须是对象');
  }
  if (typeof value.readingKey !== 'string' || value.readingKey.trim() === '') {
    throw new LedgerValidationError('readingKey', 'readingKey 必须是非空字符串');
  }
  if (typeof value.orderNo !== 'string' || value.orderNo.trim() === '') {
    throw new LedgerValidationError('orderNo', 'orderNo 必须是非空字符串');
  }
  if (typeof value.nodeType !== 'string') {
    throw new LedgerValidationError('nodeType', 'nodeType 必须是字符串');
  }
  if (typeof value.temperature !== 'number' || !Number.isFinite(value.temperature)) {
    throw new LedgerValidationError('temperature', 'temperature 必须是有效数字');
  }
  if (typeof value.observedAt !== 'string' || value.observedAt.trim() === '') {
    throw new LedgerValidationError('observedAt', 'observedAt 必须是非空字符串');
  }

  return {
    readingKey: value.readingKey.trim(),
    orderNo: value.orderNo.trim(),
    nodeType: value.nodeType as HistoricalBackfillReading['nodeType'],
    temperature: value.temperature,
    observedAt: value.observedAt.trim(),
    locationText: typeof value.locationText === 'string' ? value.locationText.trim() : undefined,
    operatorName: typeof value.operatorName === 'string' ? value.operatorName.trim() : undefined,
  };
}

export const temperatureLedgerController = {
  append(req: Request, res: Response): Response {
    try {
      const body = req.body as Partial<TemperatureEvidenceInput>;
      if (!isRecord(body)) {
        return res.status(400).json({ message: '请求体必须是对象' });
      }

      const result = temperatureLedgerService.append(body as TemperatureEvidenceInput);
      return res.status(201).json({
        evidence: result.evidence,
        idempotent: result.idempotent,
      });
    } catch (error) {
      if (error instanceof LedgerConflictError) {
        return res.status(409).json({
          message: error.message,
          existingEvidence: error.existingEvidence,
          submittedPayloadHash: error.submittedPayloadHash,
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
      return res.status(200).json(result);
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
      return res.status(hasConflict ? 409 : 200).json(result);
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
      return res.status(hasConflict ? 409 : 200).json(result);
    } catch (error) {
      if (error instanceof LedgerValidationError) {
        return res.status(400).json({ message: error.message, field: error.field });
      }
      return res.status(500).json({ message: '历史回填失败', error: error instanceof Error ? error.message : '未知错误' });
    }
  },

  getByNode(req: Request, res: Response): Response {
    const { nodeId } = req.params;
    const timeline = temperatureLedgerService.getTimelineByNode(nodeId);
    return res.status(200).json(timeline);
  },

  getByTask(req: Request, res: Response): Response {
    const { taskId } = req.params;
    const timeline = temperatureLedgerService.getTimelineByTask(taskId);
    return res.status(200).json(timeline);
  },

  getByOrder(req: Request, res: Response): Response {
    const { orderId } = req.params;
    const timeline = temperatureLedgerService.getTimelineByOrder(orderId);
    return res.status(200).json(timeline);
  },

  getByReadingKey(req: Request, res: Response): Response {
    const { readingKey } = req.params;
    const evidence = temperatureLedgerService.getByReadingKey(readingKey);
    if (!evidence) {
      return res.status(404).json({ message: '证据不存在' });
    }
    return res.status(200).json(evidence);
  },

  getByBatch(req: Request, res: Response): Response {
    const { batchId } = req.params;
    const evidence = temperatureLedgerService.getByBatchId(batchId);
    return res.status(200).json({ batchId, items: evidence, total: evidence.length });
  },
};
