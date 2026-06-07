import { Request, Response } from 'express';
import { warehouseService } from '../services/warehouse.service';
import type { WarehouseInRegisterRequest, WarehouseInQueryParams } from '@shared/types';

export const warehouseController = {
  async getPendingOrders(req: Request, res: Response): Promise<Response> {
    try {
      const params: WarehouseInQueryParams = {
        orderNo: req.query.orderNo as string | undefined,
        customerId: req.query.customerId as string | undefined,
        temperatureZone: req.query.temperatureZone as WarehouseInQueryParams['temperatureZone'],
      };

      const orders = warehouseService.getPendingOrders(params);
      return res.status(200).json(orders);
    } catch (error) {
      return res.status(500).json({ message: '获取待入仓订单失败', error: (error as Error).message });
    }
  },

  async getCustomers(req: Request, res: Response): Promise<Response> {
    try {
      const customers = warehouseService.getAllCustomers();
      return res.status(200).json(customers);
    } catch (error) {
      return res.status(500).json({ message: '获取客户列表失败', error: (error as Error).message });
    }
  },

  async registerWarehouseIn(req: Request, res: Response): Promise<Response> {
    try {
      const data = req.body as WarehouseInRegisterRequest;

      if (!data.orderId) {
        return res.status(400).json({ message: '订单ID不能为空' });
      }

      if (!data.locationText || data.locationText.trim() === '') {
        return res.status(400).json({ message: '仓库位置不能为空' });
      }

      if (data.temperature === undefined || data.temperature === null) {
        return res.status(400).json({ message: '实测温度不能为空' });
      }

      const user = (req as Request & { user?: { id: string; name: string; role: string } }).user;
      if (!user) {
        return res.status(401).json({ message: '未授权，请先登录' });
      }

      const result = warehouseService.registerWarehouseIn(data, {
        id: user.id,
        username: '',
        role: user.role as 'admin' | 'dispatcher' | 'driver',
        name: user.name,
        phone: '',
        createdAt: '',
      });

      return res.status(200).json({
        message: '入仓登记成功',
        order: result.order,
        task: result.task,
        node: result.node,
      });
    } catch (error) {
      return res.status(400).json({ message: (error as Error).message });
    }
  },

  async getStats(req: Request, res: Response): Promise<Response> {
    try {
      const stats = warehouseService.getWarehouseInStats();
      return res.status(200).json(stats);
    } catch (error) {
      return res.status(500).json({ message: '获取统计信息失败', error: (error as Error).message });
    }
  },
};
