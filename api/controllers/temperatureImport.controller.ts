import { Request, Response } from 'express';
import { temperatureImportService } from '../services/temperatureImport.service';
import type {
  TemperatureRecordImportRequest,
  TemperatureRecordValidationResult,
  User,
  TemperatureRecordColumnMapping,
} from '../../shared/types';

export const temperatureImportController = {
  async parseColumns(req: Request, res: Response): Promise<Response> {
    try {
      const { csvText } = req.body;

      if (!csvText) {
        return res.status(400).json({ message: 'CSV文本不能为空' });
      }

      const result = temperatureImportService.parseColumns(csvText);
      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({ message: '解析列失败', error: (error as Error).message });
    }
  },

  async previewImport(req: Request, res: Response): Promise<Response> {
    try {
      const { csvText, mapping } = req.body as { csvText: string; mapping?: TemperatureRecordColumnMapping };

      if (!csvText) {
        return res.status(400).json({ message: 'CSV文本不能为空' });
      }

      const result = temperatureImportService.previewImport(csvText, mapping);
      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({ message: '预览导入失败', error: (error as Error).message });
    }
  },

  async confirmImport(req: Request, res: Response): Promise<Response> {
    try {
      const operator = (req as any).user as User;
      if (!operator) {
        return res.status(401).json({ message: '未授权，请先登录' });
      }

      const { records } = req.body as TemperatureRecordImportRequest;

      if (!records || !Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ message: '导入记录不能为空' });
      }

      const result = temperatureImportService.executeImport(records as TemperatureRecordValidationResult[], operator);
      return res.status(200).json({ message: '导入完成', ...result });
    } catch (error) {
      return res.status(500).json({ message: '导入失败', error: (error as Error).message });
    }
  },
};
