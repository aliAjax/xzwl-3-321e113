import { Request, Response } from 'express';
import { dashboardService } from '../services/dashboard.service';

export const dashboardController = {
  async getStats(req: Request, res: Response): Promise<Response> {
    try {
      const stats = await dashboardService.getStats();
      return res.status(200).json(stats);
    } catch (error) {
      return res.status(500).json({ message: '获取统计数据失败', error: (error as Error).message });
    }
  },

  async getTodayTasks(req: Request, res: Response): Promise<Response> {
    try {
      const tasks = await dashboardService.getTodayTasks();
      return res.status(200).json(tasks);
    } catch (error) {
      return res.status(500).json({ message: '获取今日任务失败', error: (error as Error).message });
    }
  },

  async getRecentExceptions(req: Request, res: Response): Promise<Response> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      const exceptions = await dashboardService.getRecentExceptions(limit);
      return res.status(200).json(exceptions);
    } catch (error) {
      return res.status(500).json({ message: '获取最近异常失败', error: (error as Error).message });
    }
  },

  async getStatusCounts(req: Request, res: Response): Promise<Response> {
    try {
      const counts = await dashboardService.getStatusCounts();
      return res.status(200).json(counts);
    } catch (error) {
      return res.status(500).json({ message: '获取状态统计失败', error: (error as Error).message });
    }
  },

  async getDailyStats(req: Request, res: Response): Promise<Response> {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 7;

      const stats = await dashboardService.getDailyStats(days);
      return res.status(200).json(stats);
    } catch (error) {
      return res.status(500).json({ message: '获取每日统计失败', error: (error as Error).message });
    }
  },
};
