import { Request, Response } from 'express';
import { temperatureEvidenceService } from '../services/temperatureEvidence/index.js';
import type {
  TemperatureEvidenceSubmitRecord,
  User,
} from '../../shared/types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSubmitRecord(value: unknown): value is TemperatureEvidenceSubmitRecord {
  if (!isRecord(value)) return false;
  if (typeof value.readingKey !== 'string' || value.readingKey.trim() === '') return false;
  if (typeof value.nodeId !== 'string' || value.nodeId.trim() === '') return false;
  if (typeof value.temperatureC !== 'number' || !Number.isFinite(value.temperatureC)) return false;
  if (typeof value.observedAt !== 'string' || value.observedAt.trim() === '') return false;
  if (value.locationText !== undefined && typeof value.locationText !== 'string') return false;
  if (value.operatorName !== undefined && typeof value.operatorName !== 'string') return false;
  if (value.originalPayload !== undefined && !isRecord(value.originalPayload)) return false;
  return true;
}

function parseSubmitRecords(body: unknown): TemperatureEvidenceSubmitRecord[] | { error: string } {
  if (!isRecord(body)) {
    return { error: '请求体格式无效' };
  }
  const records = body.records;
  if (!Array.isArray(records)) {
    return { error: 'records 必须是数组' };
  }
  if (records.length === 0) {
    return { error: 'records 不能为空' };
  }
  for (let i = 0; i < records.length; i++) {
    if (!isSubmitRecord(records[i])) {
      return { error: `第 ${i + 1} 条记录格式无效` };
    }
  }
  return records as TemperatureEvidenceSubmitRecord[];
}

export const temperatureEvidenceController = {
  async submitDriver(req: Request, res: Response): Promise<Response> {
    try {
      const operator = req.user as User | undefined;
      if (!operator) {
        return res.status(401).json({ message: '未授权，请先登录' });
      }

      const parsed = parseSubmitRecords(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ message: parsed.error });
      }

      const enrichedRecords = parsed.map((record) => ({
        ...record,
        operatorName: record.operatorName || operator.name,
      }));

      const result = temperatureEvidenceService.submitDriverOffline(enrichedRecords);

      if (result.conflictCount > 0) {
        return res.status(409).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({
        message: '司机温度证据上报失败',
        error: error instanceof Error ? error.message : '未知错误',
      });
    }
  },

  async submitBackfill(req: Request, res: Response): Promise<Response> {
    try {
      const operator = req.user as User | undefined;
      if (!operator) {
        return res.status(401).json({ message: '未授权，请先登录' });
      }

      const parsed = parseSubmitRecords(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ message: parsed.error });
      }

      const enrichedRecords = parsed.map((record) => ({
        ...record,
        operatorName: record.operatorName || operator.name,
      }));

      const result = temperatureEvidenceService.submitHistoricalBackfill(enrichedRecords);

      if (result.conflictCount > 0) {
        return res.status(409).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({
        message: '历史回填失败',
        error: error instanceof Error ? error.message : '未知错误',
      });
    }
  },

  async getByNode(req: Request, res: Response): Promise<Response> {
    try {
      const { nodeId } = req.params;
      if (!nodeId) {
        return res.status(400).json({ message: '节点ID不能为空' });
      }

      const items = temperatureEvidenceService.getEvidenceByNode(nodeId);
      return res.status(200).json({ items, total: items.length });
    } catch (error) {
      return res.status(500).json({
        message: '获取节点温度证据失败',
        error: error instanceof Error ? error.message : '未知错误',
      });
    }
  },

  async getNodeSummary(req: Request, res: Response): Promise<Response> {
    try {
      const { nodeId } = req.params;
      if (!nodeId) {
        return res.status(400).json({ message: '节点ID不能为空' });
      }

      const summary = temperatureEvidenceService.getNodeSummary(nodeId);
      return res.status(200).json(summary);
    } catch (error) {
      return res.status(500).json({
        message: '获取节点温度证据摘要失败',
        error: error instanceof Error ? error.message : '未知错误',
      });
    }
  },

  async getTimelineByTask(req: Request, res: Response): Promise<Response> {
    try {
      const { taskId } = req.params;
      if (!taskId) {
        return res.status(400).json({ message: '任务ID不能为空' });
      }

      const timeline = temperatureEvidenceService.getTimelineByTask(taskId);
      return res.status(200).json(timeline);
    } catch (error) {
      return res.status(500).json({
        message: '获取温度证据时间线失败',
        error: error instanceof Error ? error.message : '未知错误',
      });
    }
  },

  async getByBatch(req: Request, res: Response): Promise<Response> {
    try {
      const { batchId } = req.params;
      if (!batchId) {
        return res.status(400).json({ message: '批次ID不能为空' });
      }

      const items = temperatureEvidenceService.getEvidenceByBatch(batchId);
      return res.status(200).json({ items, total: items.length });
    } catch (error) {
      return res.status(500).json({
        message: '获取批次温度证据失败',
        error: error instanceof Error ? error.message : '未知错误',
      });
    }
  },
};
