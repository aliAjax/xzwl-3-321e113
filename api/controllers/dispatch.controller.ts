import { Request, Response } from 'express';
import { dispatchService } from '../services/dispatch.service';
import type { DispatchRequest } from '@shared/types';

export const dispatchController = {
  async findMatches(req: Request, res: Response): Promise<Response> {
    try {
      const { orderIds, scheduledTime } = req.body as { orderIds: string[]; scheduledTime?: string };

      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ message: '订单ID列表不能为空' });
      }

      const time = scheduledTime || new Date().toISOString();
      const matches = dispatchService.findMatchingVehicles(orderIds, time);
      return res.status(200).json(matches);
    } catch (error) {
      return res.status(500).json({ message: '获取匹配结果失败', error: (error as Error).message });
    }
  },

  async create(req: Request, res: Response): Promise<Response> {
    try {
      const request = req.body as DispatchRequest;

      if (!request.orderIds || request.orderIds.length === 0) {
        return res.status(400).json({ message: '订单ID列表不能为空' });
      }
      if (!request.vehicleId) {
        return res.status(400).json({ message: '车辆ID不能为空' });
      }
      if (!request.driverId) {
        return res.status(400).json({ message: '司机ID不能为空' });
      }

      const result = await dispatchService.createDispatch(request);

      if (!result) {
        return res.status(400).json({ message: '创建调度失败，请检查订单、车辆或司机是否有效' });
      }

      return res.status(201).json(result);
    } catch (error) {
      return res.status(500).json({ message: '创建调度失败', error: (error as Error).message });
    }
  },

  async getActive(req: Request, res: Response): Promise<Response> {
    try {
      const dispatches = await dispatchService.getActiveDispatches();
      return res.status(200).json(dispatches);
    } catch (error) {
      return res.status(500).json({ message: '获取活动调度失败', error: (error as Error).message });
    }
  },

  async getById(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: '调度ID不能为空' });
      }

      const dispatch = await dispatchService.getDispatchById(id);

      if (!dispatch) {
        return res.status(404).json({ message: '调度不存在' });
      }

      return res.status(200).json(dispatch);
    } catch (error) {
      return res.status(500).json({ message: '获取调度详情失败', error: (error as Error).message });
    }
  },

  async getByDateRange(req: Request, res: Response): Promise<Response> {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ message: '开始日期和结束日期不能为空' });
      }

      const dispatches = await dispatchService.getDispatchesByDateRange(
        startDate as string,
        endDate as string
      );
      return res.status(200).json(dispatches);
    } catch (error) {
      return res.status(500).json({ message: '获取调度列表失败', error: (error as Error).message });
    }
  },

  async cancel(req: Request, res: Response): Promise<Response> {
    try {
      const { batchId } = req.params;

      if (!batchId) {
        return res.status(400).json({ message: '调度批次ID不能为空' });
      }

      const success = await dispatchService.cancelDispatch(batchId);

      if (!success) {
        return res.status(404).json({ message: '调度不存在' });
      }

      return res.status(200).json({ message: '取消成功' });
    } catch (error) {
      return res.status(500).json({ message: '取消调度失败', error: (error as Error).message });
    }
  },
};
