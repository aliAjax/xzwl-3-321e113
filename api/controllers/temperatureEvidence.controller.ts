import { Request, Response } from 'express';
import { temperatureEvidenceService } from '../services/temperatureEvidence.service';
import type {
  TemperatureEvidenceIngestRequest,
  TemperatureEvidenceCsvIngestRequest,
  TemperatureEvidenceSource,
} from '../../shared/types';

const VALID_SOURCES: readonly TemperatureEvidenceSource[] = ['driver_offline', 'csv_import', 'historical_backfill'];

function isValidSource(value: unknown): value is TemperatureEvidenceSource {
  return typeof value === 'string' && VALID_SOURCES.includes(value as TemperatureEvidenceSource);
}

export const temperatureEvidenceController = {
  // 承接司机离线上报与历史回填（source 显式指定）。
  async ingest(req: Request, res: Response): Promise<Response> {
    try {
      const body = req.body as TemperatureEvidenceIngestRequest;

      if (!isValidSource(body.source)) {
        return res.status(400).json({ message: 'source 无效，应为 driver_offline / csv_import / historical_backfill' });
      }

      if (!Array.isArray(body.items) || body.items.length === 0) {
        return res.status(400).json({ message: 'items 不能为空' });
      }

      const result = temperatureEvidenceService.ingest(body);

      // 存在载荷冲突时返回 409，且禁止强制覆盖。
      const statusCode = result.hasConflict ? 409 : 200;
      return res.status(statusCode).json(result);
    } catch (error) {
      return res.status(500).json({ message: '温度证据写入失败', error: (error as Error).message });
    }
  },

  // 承接 CSV 导入。
  async ingestCsv(req: Request, res: Response): Promise<Response> {
    try {
      const body = req.body as TemperatureEvidenceCsvIngestRequest;

      if (!body.csvText || typeof body.csvText !== 'string') {
        return res.status(400).json({ message: 'csvText 不能为空' });
      }

      const result = temperatureEvidenceService.ingestCsv(body);
      const statusCode = result.hasConflict ? 409 : 200;
      return res.status(statusCode).json(result);
    } catch (error) {
      return res.status(500).json({ message: 'CSV 温度证据导入失败', error: (error as Error).message });
    }
  },

  async getTimeline(req: Request, res: Response): Promise<Response> {
    try {
      const { orderId } = req.params;
      if (!orderId) {
        return res.status(400).json({ message: '订单ID不能为空' });
      }

      const timeline = temperatureEvidenceService.getTimeline(orderId);
      if (!timeline) {
        return res.status(404).json({ message: '订单不存在' });
      }

      return res.status(200).json(timeline);
    } catch (error) {
      return res.status(500).json({ message: '获取温度证据时间线失败', error: (error as Error).message });
    }
  },
};
