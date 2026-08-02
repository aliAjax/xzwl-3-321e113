import { Request, Response } from 'express';
import {
  temperatureEvidenceService,
  TemperatureEvidenceError,
} from '../services/temperatureEvidence.service';
import {
  toTemperatureEvidenceView,
  type TemperatureEvidenceAppendResponse,
  type TemperatureEvidenceConflictResponse,
} from '../../shared/types';

function handleServiceError(error: unknown, res: Response): Response {
  if (error instanceof TemperatureEvidenceError) {
    if (error.statusCode === 409 && error.conflict) {
      const body: TemperatureEvidenceConflictResponse = {
        success: false,
        message: error.message,
        ...error.conflict,
      };
      return res.status(409).json(body);
    }
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  return res.status(500).json({
    success: false,
    message: '温度证据处理失败',
    error: error instanceof Error ? error.message : '未知错误',
  });
}

export const temperatureEvidenceController = {
  /** 追加温度证据：同时承接CSV导入、司机离线上报和历史回填（只追加、不覆盖） */
  async append(req: Request, res: Response): Promise<Response> {
    try {
      if (!req.user) {
        return res.status(401).json({ message: '未登录' });
      }

      const result = temperatureEvidenceService.appendEvidence(req.body);
      const body: TemperatureEvidenceAppendResponse = {
        success: true,
        status: result.status,
        evidence: toTemperatureEvidenceView(result.evidence),
      };
      return res.status(result.status === 'appended' ? 201 : 200).json(body);
    } catch (error) {
      return handleServiceError(error, res);
    }
  },

  /** 节点温度证据时间线：按 observedAt → 来源优先级 → receivedAt 排序，含异常判定 */
  async getNodeTimeline(req: Request, res: Response): Promise<Response> {
    try {
      const { nodeId } = req.params;
      if (!nodeId) {
        return res.status(400).json({ message: '节点ID不能为空' });
      }

      const timeline = temperatureEvidenceService.getNodeTimeline(nodeId);
      return res.status(200).json(timeline);
    } catch (error) {
      return handleServiceError(error, res);
    }
  },

  /** 按批次查询证据（同一导入/上报批次可审计） */
  async getBatchEvidence(req: Request, res: Response): Promise<Response> {
    try {
      const { batchId } = req.params;
      if (!batchId) {
        return res.status(400).json({ message: '批次ID不能为空' });
      }

      const items = temperatureEvidenceService.getBatchEvidence(batchId);
      return res.status(200).json({ batchId, items });
    } catch (error) {
      return handleServiceError(error, res);
    }
  },
};
