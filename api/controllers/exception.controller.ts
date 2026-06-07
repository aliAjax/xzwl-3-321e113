import { Request, Response } from 'express';
import { exceptionHandlingService } from '../services/exception.service';
import type {
  ExceptionHandlingQueryParams,
  ExceptionHandlingUpdateRequest,
  ExceptionHandlingStatus,
  TemperatureZone,
  OrderStatus,
} from '../../shared/types';

export const exceptionHandlingController = {
  async syncExceptions(req: Request, res: Response): Promise<Response> {
    try {
      const result = await exceptionHandlingService.syncExceptions();
      return res.status(200).json({
        message: `同步成功，共 ${result.total} 个异常节点，新增 ${result.created} 条，已存在 ${result.existing} 条，跳过 ${result.skipped} 条`,
        ...result,
      });
    } catch (error) {
      return res.status(500).json({ message: '同步异常记录失败', error: (error as Error).message });
    }
  },

  async getList(req: Request, res: Response): Promise<Response> {
    try {
      const params: ExceptionHandlingQueryParams = {
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        temperatureZone: req.query.temperatureZone as TemperatureZone | undefined,
        driverId: req.query.driverId as string | undefined,
        orderStatus: req.query.orderStatus as OrderStatus | undefined,
        handlingStatus: req.query.handlingStatus as ExceptionHandlingStatus | undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 20,
      };

      const result = exceptionHandlingService.getExceptionList(params);
      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({ message: '获取异常列表失败', error: (error as Error).message });
    }
  },

  async getDetail(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const exception = exceptionHandlingService.getExceptionDetail(id);

      if (!exception) {
        return res.status(404).json({ message: '异常记录不存在' });
      }

      const nodes = exceptionHandlingService.getTaskNodes(exception.taskId);
      const temperatureRecords = exceptionHandlingService.getTemperatureRecords(exception.taskId);

      return res.status(200).json({
        exception,
        nodes,
        temperatureRecords,
      });
    } catch (error) {
      return res.status(500).json({ message: '获取异常详情失败', error: (error as Error).message });
    }
  },

  async handleException(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const data = req.body as ExceptionHandlingUpdateRequest;

      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: '未授权，请先登录' });
      }

      if (!data.handlingStatus) {
        return res.status(400).json({ message: '处理状态不能为空' });
      }

      if (!data.handlingResult) {
        return res.status(400).json({ message: '处理结果不能为空' });
      }

      if (!data.handlingNotes?.trim()) {
        return res.status(400).json({ message: '处理备注不能为空' });
      }

      const existing = exceptionHandlingService.getExceptionDetail(id);
      if (!existing) {
        return res.status(404).json({ message: '异常记录不存在' });
      }

      const result = exceptionHandlingService.handleException(id, data, userId);
      return res.status(200).json({ message: '处理成功', data: result });
    } catch (error) {
      return res.status(500).json({ message: '处理异常失败', error: (error as Error).message });
    }
  },

  async getStats(req: Request, res: Response): Promise<Response> {
    try {
      const stats = exceptionHandlingService.getStats();
      return res.status(200).json(stats);
    } catch (error) {
      return res.status(500).json({ message: '获取统计数据失败', error: (error as Error).message });
    }
  },

  async getDrivers(req: Request, res: Response): Promise<Response> {
    try {
      const drivers = exceptionHandlingService.getDrivers();
      return res.status(200).json(drivers);
    } catch (error) {
      return res.status(500).json({ message: '获取司机列表失败', error: (error as Error).message });
    }
  },

  async getTemperatureRecords(req: Request, res: Response): Promise<Response> {
    try {
      const { taskId } = req.params;
      const records = exceptionHandlingService.getTemperatureRecords(taskId);
      return res.status(200).json(records);
    } catch (error) {
      return res.status(500).json({ message: '获取温度记录失败', error: (error as Error).message });
    }
  },
};
