import { Request, Response } from 'express';
import { orderService } from '../services/order.service';
import type { Order, OrderStatus, TemperatureZone, OrderTimeline } from '@shared/types';

export const orderController = {
  async getAll(req: Request, res: Response): Promise<Response> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;

      const orders = await orderService.getAllOrders({ limit, offset });
      return res.status(200).json(orders);
    } catch (error) {
      return res.status(500).json({ message: '获取订单列表失败', error: (error as Error).message });
    }
  },

  async getById(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: '订单ID不能为空' });
      }

      const order = await orderService.getOrderById(id);

      if (!order) {
        return res.status(404).json({ message: '订单不存在' });
      }

      return res.status(200).json(order);
    } catch (error) {
      return res.status(500).json({ message: '获取订单详情失败', error: (error as Error).message });
    }
  },

  async getByOrderNo(req: Request, res: Response): Promise<Response> {
    try {
      const { orderNo } = req.params;

      if (!orderNo) {
        return res.status(400).json({ message: '订单号不能为空' });
      }

      const order = await orderService.getOrderByOrderNo(orderNo);

      if (!order) {
        return res.status(404).json({ message: '订单不存在' });
      }

      return res.status(200).json(order);
    } catch (error) {
      return res.status(500).json({ message: '获取订单详情失败', error: (error as Error).message });
    }
  },

  async getByCustomerId(req: Request, res: Response): Promise<Response> {
    try {
      const { customerId } = req.params;

      if (!customerId) {
        return res.status(400).json({ message: '客户ID不能为空' });
      }

      const orders = await orderService.getOrdersByCustomerId(customerId);
      return res.status(200).json(orders);
    } catch (error) {
      return res.status(500).json({ message: '获取客户订单失败', error: (error as Error).message });
    }
  },

  async getByStatus(req: Request, res: Response): Promise<Response> {
    try {
      const { status } = req.params;

      if (!status) {
        return res.status(400).json({ message: '订单状态不能为空' });
      }

      const orders = await orderService.getOrdersByStatus(status as OrderStatus);
      return res.status(200).json(orders);
    } catch (error) {
      return res.status(500).json({ message: '获取订单列表失败', error: (error as Error).message });
    }
  },

  async getByTemperatureZone(req: Request, res: Response): Promise<Response> {
    try {
      const { temperatureZone } = req.params;

      if (!temperatureZone) {
        return res.status(400).json({ message: '温控区域不能为空' });
      }

      const orders = await orderService.getOrdersByTemperatureZone(temperatureZone as TemperatureZone);
      return res.status(200).json(orders);
    } catch (error) {
      return res.status(500).json({ message: '获取订单列表失败', error: (error as Error).message });
    }
  },

  async getByDateRange(req: Request, res: Response): Promise<Response> {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ message: '开始日期和结束日期不能为空' });
      }

      const orders = await orderService.getOrdersByDateRange(
        startDate as string,
        endDate as string
      );
      return res.status(200).json(orders);
    } catch (error) {
      return res.status(500).json({ message: '获取订单列表失败', error: (error as Error).message });
    }
  },

  async search(req: Request, res: Response): Promise<Response> {
    try {
      const { goodsName } = req.query;

      if (!goodsName) {
        return res.status(400).json({ message: '商品名称不能为空' });
      }

      const orders = await orderService.searchOrdersByGoodsName(goodsName as string);
      return res.status(200).json(orders);
    } catch (error) {
      return res.status(500).json({ message: '搜索订单失败', error: (error as Error).message });
    }
  },

  async create(req: Request, res: Response): Promise<Response> {
    try {
      const data = req.body as Omit<Order, 'id' | 'createdAt' | 'updatedAt'>;

      if (!data.orderNo || !data.customerId || !data.goodsName) {
        return res.status(400).json({ message: '订单号、客户ID和商品名称不能为空' });
      }

      const order = await orderService.createOrder(data);
      return res.status(201).json(order);
    } catch (error) {
      return res.status(500).json({ message: '创建订单失败', error: (error as Error).message });
    }
  },

  async update(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const data = req.body as Partial<Omit<Order, 'id' | 'createdAt'>>;

      if (!id) {
        return res.status(400).json({ message: '订单ID不能为空' });
      }

      const exists = await orderService.orderExists(id);
      if (!exists) {
        return res.status(404).json({ message: '订单不存在' });
      }

      const order = await orderService.updateOrder(id, data);

      if (!order) {
        return res.status(404).json({ message: '订单不存在' });
      }

      return res.status(200).json(order);
    } catch (error) {
      return res.status(500).json({ message: '更新订单失败', error: (error as Error).message });
    }
  },

  async updateStatus(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const { status } = req.body as { status: OrderStatus };

      if (!id || !status) {
        return res.status(400).json({ message: '订单ID和状态不能为空' });
      }

      const exists = await orderService.orderExists(id);
      if (!exists) {
        return res.status(404).json({ message: '订单不存在' });
      }

      const order = await orderService.updateOrderStatus(id, status);

      if (!order) {
        return res.status(404).json({ message: '订单不存在' });
      }

      return res.status(200).json(order);
    } catch (error) {
      return res.status(500).json({ message: '更新订单状态失败', error: (error as Error).message });
    }
  },

  async delete(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: '订单ID不能为空' });
      }

      const exists = await orderService.orderExists(id);
      if (!exists) {
        return res.status(404).json({ message: '订单不存在' });
      }

      const success = await orderService.deleteOrder(id);

      if (!success) {
        return res.status(404).json({ message: '订单不存在' });
      }

      return res.status(200).json({ message: '删除成功' });
    } catch (error) {
      return res.status(500).json({ message: '删除订单失败', error: (error as Error).message });
    }
  },

  async count(req: Request, res: Response): Promise<Response> {
    try {
      const count = await orderService.countOrders();
      return res.status(200).json({ count });
    } catch (error) {
      return res.status(500).json({ message: '获取订单数量失败', error: (error as Error).message });
    }
  },

  async getTimeline(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: '订单ID不能为空' });
      }

      const timeline = await orderService.getOrderTimeline(id);

      if (!timeline) {
        return res.status(404).json({ message: '订单不存在' });
      }

      return res.status(200).json(timeline);
    } catch (error) {
      return res.status(500).json({ message: '获取订单追踪信息失败', error: (error as Error).message });
    }
  },
};
