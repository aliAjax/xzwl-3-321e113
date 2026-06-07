import { Request, Response } from 'express';
import { deliveryService } from '../services/delivery.service';
import type { NodeUpdateRequest, NodeType } from '@shared/types';

export const deliveryController = {
  async getDriverTasks(req: Request, res: Response): Promise<Response> {
    try {
      if (!req.user) {
        return res.status(401).json({ message: '未登录' });
      }

      const driverId = req.params.driverId || req.user.id;

      if (!driverId) {
        return res.status(400).json({ message: '司机ID不能为空' });
      }

      const tasks = await deliveryService.getDriverTasks(driverId);
      return res.status(200).json(tasks);
    } catch (error) {
      return res.status(500).json({ message: '获取司机任务失败', error: (error as Error).message });
    }
  },

  async getTaskById(req: Request, res: Response): Promise<Response> {
    try {
      const { taskId } = req.params;

      if (!taskId) {
        return res.status(400).json({ message: '任务ID不能为空' });
      }

      const task = await deliveryService.getTaskById(taskId);

      if (!task) {
        return res.status(404).json({ message: '任务不存在' });
      }

      return res.status(200).json(task);
    } catch (error) {
      return res.status(500).json({ message: '获取任务详情失败', error: (error as Error).message });
    }
  },

  async getTaskNodes(req: Request, res: Response): Promise<Response> {
    try {
      const { taskId } = req.params;

      if (!taskId) {
        return res.status(400).json({ message: '任务ID不能为空' });
      }

      const nodes = await deliveryService.getTaskNodes(taskId);
      return res.status(200).json(nodes);
    } catch (error) {
      return res.status(500).json({ message: '获取任务节点失败', error: (error as Error).message });
    }
  },

  async updateNode(req: Request, res: Response): Promise<Response> {
    try {
      const { nodeId } = req.params;
      const request = req.body as NodeUpdateRequest;

      if (!nodeId) {
        return res.status(400).json({ message: '节点ID不能为空' });
      }

      if (!request.status || !request.locationText) {
        return res.status(400).json({ message: '状态和位置信息不能为空' });
      }

      if (!req.user) {
        return res.status(401).json({ message: '未登录' });
      }

      const node = await deliveryService.updateNode(
        nodeId,
        req.user.id,
        req.user.name,
        request
      );

      if (!node) {
        return res.status(404).json({ message: '节点不存在' });
      }

      return res.status(200).json(node);
    } catch (error) {
      return res.status(500).json({ message: '更新节点失败', error: (error as Error).message });
    }
  },

  async startNode(req: Request, res: Response): Promise<Response> {
    try {
      const { nodeId } = req.params;

      if (!nodeId) {
        return res.status(400).json({ message: '节点ID不能为空' });
      }

      const node = await deliveryService.startNode(nodeId);

      if (!node) {
        return res.status(404).json({ message: '节点不存在或状态不正确' });
      }

      return res.status(200).json(node);
    } catch (error) {
      return res.status(500).json({ message: '开始节点失败', error: (error as Error).message });
    }
  },

  async createNode(req: Request, res: Response): Promise<Response> {
    try {
      const { taskId } = req.params;
      const { nodeType } = req.body as { nodeType: NodeType };

      if (!taskId || !nodeType) {
        return res.status(400).json({ message: '任务ID和节点类型不能为空' });
      }

      const node = await deliveryService.createNextNode(taskId, nodeType);

      if (!node) {
        return res.status(404).json({ message: '任务不存在' });
      }

      return res.status(201).json(node);
    } catch (error) {
      return res.status(500).json({ message: '创建节点失败', error: (error as Error).message });
    }
  },

  async completeTask(req: Request, res: Response): Promise<Response> {
    try {
      const { taskId } = req.params;

      if (!taskId) {
        return res.status(400).json({ message: '任务ID不能为空' });
      }

      const task = await deliveryService.completeTask(taskId);

      if (!task) {
        return res.status(404).json({ message: '任务不存在' });
      }

      return res.status(200).json(task);
    } catch (error) {
      return res.status(500).json({ message: '完成任务失败', error: (error as Error).message });
    }
  },

  async getTasksByBatchId(req: Request, res: Response): Promise<Response> {
    try {
      const { batchId } = req.params;

      if (!batchId) {
        return res.status(400).json({ message: '批次ID不能为空' });
      }

      const tasks = await deliveryService.getTasksByBatchId(batchId);
      return res.status(200).json(tasks);
    } catch (error) {
      return res.status(500).json({ message: '获取批次任务失败', error: (error as Error).message });
    }
  },

  async getExceptions(req: Request, res: Response): Promise<Response> {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ message: '开始日期和结束日期不能为空' });
      }

      const exceptions = await deliveryService.getExceptionNodes(
        startDate as string,
        endDate as string
      );
      return res.status(200).json(exceptions);
    } catch (error) {
      return res.status(500).json({ message: '获取异常节点失败', error: (error as Error).message });
    }
  },
};
