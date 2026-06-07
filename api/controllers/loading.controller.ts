import { Request, Response } from 'express';
import { loadingService } from '../services/loading.service';

export const loadingController = {
  async getBatches(req: Request, res: Response): Promise<Response> {
    try {
      const batches = await loadingService.getLoadingBatches();
      return res.status(200).json(batches);
    } catch (error) {
      return res.status(500).json({ message: '获取装车批次失败', error: (error as Error).message });
    }
  },

  async getBatchById(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: '批次ID不能为空' });
      }

      const batch = await loadingService.getLoadingBatchById(id);

      if (!batch) {
        return res.status(404).json({ message: '批次不存在' });
      }

      return res.status(200).json(batch);
    } catch (error) {
      return res.status(500).json({ message: '获取批次详情失败', error: (error as Error).message });
    }
  },

  async startLoading(req: Request, res: Response): Promise<Response> {
    try {
      const { batchId } = req.params;

      if (!batchId) {
        return res.status(400).json({ message: '批次ID不能为空' });
      }

      const batch = await loadingService.startLoading(batchId);

      if (!batch) {
        return res.status(400).json({ message: '开始装车失败，请检查批次状态是否正确' });
      }

      return res.status(200).json(batch);
    } catch (error) {
      return res.status(500).json({ message: '开始装车失败', error: (error as Error).message });
    }
  },

  async getTasks(req: Request, res: Response): Promise<Response> {
    try {
      const { batchId } = req.params;

      if (!batchId) {
        return res.status(400).json({ message: '批次ID不能为空' });
      }

      const tasks = await loadingService.getLoadingTasks(batchId);
      return res.status(200).json(tasks);
    } catch (error) {
      return res.status(500).json({ message: '获取装车任务失败', error: (error as Error).message });
    }
  },

  async updateNode(req: Request, res: Response): Promise<Response> {
    try {
      const { nodeId } = req.params;
      const { operatorId, operatorName, locationText, temperature, exceptionDescription } = req.body;

      if (!nodeId || !locationText) {
        return res.status(400).json({ message: '节点ID和位置信息不能为空' });
      }

      if (!req.user) {
        return res.status(401).json({ message: '未登录' });
      }

      const node = await loadingService.updateLoadingNode(
        nodeId,
        operatorId || req.user.id,
        operatorName || req.user.name,
        { locationText, temperature, exceptionDescription }
      );

      if (!node) {
        return res.status(404).json({ message: '节点不存在或状态不正确' });
      }

      return res.status(200).json(node);
    } catch (error) {
      return res.status(500).json({ message: '更新节点失败', error: (error as Error).message });
    }
  },

  async completeLoading(req: Request, res: Response): Promise<Response> {
    try {
      const { batchId } = req.params;

      if (!batchId) {
        return res.status(400).json({ message: '批次ID不能为空' });
      }

      const batch = await loadingService.completeLoading(batchId);

      if (!batch) {
        return res.status(400).json({ message: '完成装车失败，请检查批次状态是否正确' });
      }

      return res.status(200).json(batch);
    } catch (error) {
      return res.status(500).json({ message: '完成装车失败', error: (error as Error).message });
    }
  },

  async addOrder(req: Request, res: Response): Promise<Response> {
    try {
      const { batchId } = req.params;
      const { orderId } = req.body as { orderId: string };

      if (!batchId || !orderId) {
        return res.status(400).json({ message: '批次ID和订单ID不能为空' });
      }

      const batch = await loadingService.addOrderToBatch(batchId, orderId);

      if (!batch) {
        return res.status(400).json({ message: '添加订单失败，请检查批次或订单状态' });
      }

      return res.status(200).json(batch);
    } catch (error) {
      return res.status(500).json({ message: '添加订单失败', error: (error as Error).message });
    }
  },

  async removeOrder(req: Request, res: Response): Promise<Response> {
    try {
      const { batchId, orderId } = req.params;

      if (!batchId || !orderId) {
        return res.status(400).json({ message: '批次ID和订单ID不能为空' });
      }

      const batch = await loadingService.removeOrderFromBatch(batchId, orderId);

      if (!batch) {
        return res.status(400).json({ message: '移除订单失败，请检查批次状态' });
      }

      return res.status(200).json(batch);
    } catch (error) {
      return res.status(500).json({ message: '移除订单失败', error: (error as Error).message });
    }
  },
};
