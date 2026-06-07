import { Request, Response } from 'express';
import { deliveryService } from '../services/delivery.service';
import { nodeRepository } from '../repositories/node.repository';
import db from '../db';
import type { NodeUpdateRequest, NodeType, User } from '@shared/types';

function getNodeWithDetails(nodeId: string): any {
  const row = db
    .prepare(
      `SELECT n.*,
              t.status as task_status,
              o.id as order_id,
              o.order_no as order_order_no,
              o.goods_name as order_goods_name,
              o.temperature_zone as order_temperature_zone,
              o.min_temp as order_min_temp,
              o.max_temp as order_max_temp,
              o.delivery_address as order_delivery_address,
              o.quantity as order_quantity,
              o.weight as order_weight,
              o.scheduled_delivery_time as order_scheduled_delivery_time,
              d.id as driver_id,
              d.name as driver_name,
              d.phone as driver_phone,
              v.id as vehicle_id,
              v.plate_no as vehicle_plate_no,
              v.vehicle_type as vehicle_vehicle_type
       FROM delivery_nodes n
       LEFT JOIN delivery_tasks t ON n.task_id = t.id
       LEFT JOIN orders o ON t.order_id = o.id
       LEFT JOIN drivers d ON t.driver_id = d.id
       LEFT JOIN vehicles v ON t.vehicle_id = v.id
       WHERE n.id = ?`
    )
    .get(nodeId) as Record<string, unknown> | undefined;

  if (!row) return undefined;

  const node = nodeRepository.fromDatabase(row);

  return {
    ...node,
    task: row.task_status ? {
      id: row.task_id,
      status: row.task_status,
    } : undefined,
    order: row.order_order_no ? {
      id: row.order_id,
      orderNo: row.order_order_no,
      goodsName: row.order_goods_name,
      temperatureZone: row.order_temperature_zone,
      minTemp: row.order_min_temp,
      maxTemp: row.order_max_temp,
      deliveryAddress: row.order_delivery_address,
      quantity: row.order_quantity,
      weight: row.order_weight,
      scheduledDeliveryTime: row.order_scheduled_delivery_time,
    } : undefined,
    driver: row.driver_name ? {
      id: row.driver_id,
      name: row.driver_name,
      phone: row.driver_phone,
    } : undefined,
    vehicle: row.vehicle_plate_no ? {
      id: row.vehicle_id,
      plateNo: row.vehicle_plate_no,
      vehicleType: row.vehicle_vehicle_type,
    } : undefined,
  };
}

export const deliveryController = {
  async getDriverTasks(req: Request, res: Response): Promise<Response> {
    try {
      if (!req.user) {
        return res.status(401).json({ message: '未登录' });
      }

      const driverId = req.params.driverId || req.user.driverId || req.user.id;

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

  async getNodeById(req: Request, res: Response): Promise<Response> {
    try {
      const { nodeId } = req.params;

      if (!nodeId) {
        return res.status(400).json({ message: '节点ID不能为空' });
      }

      const node = getNodeWithDetails(nodeId);

      if (!node) {
        return res.status(404).json({ message: '节点不存在' });
      }

      return res.status(200).json(node);
    } catch (error) {
      return res.status(500).json({ message: '获取节点详情失败', error: (error as Error).message });
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
      const nodeId = req.params.nodeId || req.params.id;
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

      const result = deliveryService.updateNodeStatus(
        nodeId,
        request,
        req.user as User
      );

      if (!result) {
        return res.status(404).json({ message: '节点不存在' });
      }

      const nodeWithDetails = getNodeWithDetails(nodeId);
      return res.status(200).json(nodeWithDetails);
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

      if (!req.user) {
        return res.status(401).json({ message: '未登录' });
      }

      const result = deliveryService.startNode(nodeId, req.user as User);

      if (!result) {
        return res.status(404).json({ message: '节点不存在或状态不正确' });
      }

      const nodeWithDetails = getNodeWithDetails(nodeId);
      return res.status(200).json(nodeWithDetails);
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

      if (!req.user) {
        return res.status(401).json({ message: '未登录' });
      }

      const node = deliveryService.createDeliveryNode(
        taskId,
        nodeType,
        req.user as User
      );

      if (!node) {
        return res.status(404).json({ message: '任务不存在' });
      }

      const nodeWithDetails = getNodeWithDetails(node.id);
      return res.status(201).json(nodeWithDetails);
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
