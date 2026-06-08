import { v4 as uuidv4 } from 'uuid';
import { orderRepository } from '../repositories/order.repository';
import { customerService } from './customer.service';
import type { Order, OrderStatus, TemperatureZone, OrderTimeline, BatchOrderValidationError, BatchOrderCreateItem } from '@shared/types';
import { TEMPERATURE_ZONE_RANGES } from '@shared/types';
export const orderService = {
  async getAllOrders(options?: { limit?: number; offset?: number }): Promise<Order[]> {
    return orderRepository.findAllWithCustomer(options);
  },

  async getOrderById(id: string): Promise<Order | undefined> {
    return orderRepository.findByIdWithCustomer(id);
  },

  async getOrderByOrderNo(orderNo: string): Promise<Order | undefined> {
    return orderRepository.findByOrderNo(orderNo);
  },

  async getOrdersByCustomerId(customerId: string): Promise<Order[]> {
    return orderRepository.findByCustomerId(customerId);
  },

  async getOrdersByStatus(status: OrderStatus): Promise<Order[]> {
    return orderRepository.findByStatus(status);
  },

  async getOrdersByTemperatureZone(temperatureZone: TemperatureZone): Promise<Order[]> {
    return orderRepository.findByTemperatureZone(temperatureZone);
  },

  async getOrdersByDateRange(startDate: string, endDate: string): Promise<Order[]> {
    return orderRepository.findByDateRange(startDate, endDate);
  },

  async searchOrdersByGoodsName(goodsName: string): Promise<Order[]> {
    return orderRepository.searchByGoodsName(goodsName);
  },

  async createOrder(data: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order> {
    const id = uuidv4();
    return orderRepository.createOrder({ ...data, id });
  },

  async updateOrder(id: string, data: Partial<Omit<Order, 'id' | 'createdAt'>>): Promise<Order | undefined> {
    return orderRepository.updateOrder(id, data);
  },

  async updateOrderStatus(id: string, status: OrderStatus): Promise<Order | undefined> {
    return orderRepository.updateStatus(id, status);
  },

  async deleteOrder(id: string): Promise<boolean> {
    return orderRepository.delete(id);
  },

  async countOrders(): Promise<number> {
    return orderRepository.count();
  },

  async orderExists(id: string): Promise<boolean> {
    return orderRepository.exists(id);
  },

  async getOrderTimeline(orderId: string): Promise<OrderTimeline | undefined> {
    return orderRepository.findTimelineByOrderId(orderId);
  },

  async createOrdersBatch(ordersData: BatchOrderCreateItem[]): Promise<BatchOrderCreateResult> {
    const errors: BatchOrderValidationError[] = [];
    const existingOrderNos = new Set<string>();

    for (let i = 0; i < ordersData.length; i++) {
      const item = ordersData[i];
      const rowIndex = i + 1;

      if (!item.orderNo || item.orderNo.trim() === '') {
        errors.push({ rowIndex, field: 'orderNo', message: '订单号不能为空' });
      } else if (existingOrderNos.has(item.orderNo)) {
        errors.push({ rowIndex, field: 'orderNo', message: `订单号 ${item.orderNo} 在列表中重复` });
      } else {
        existingOrderNos.add(item.orderNo);
        const existing = orderRepository.findByOrderNo(item.orderNo);
        if (existing) {
          errors.push({ rowIndex, field: 'orderNo', message: `订单号 ${item.orderNo} 已存在` });
        }
      }

      if (!item.customerId || item.customerId.trim() === '') {
        errors.push({ rowIndex, field: 'customerId', message: '客户不能为空' });
      } else {
        const customerExists = customerService.customerExists(item.customerId);
        if (!customerExists) {
          errors.push({ rowIndex, field: 'customerId', message: '客户不存在' });
        }
      }

      if (!item.temperatureZone) {
        errors.push({ rowIndex, field: 'temperatureZone', message: '温区不能为空' });
      } else if (!TEMPERATURE_ZONE_RANGES[item.temperatureZone]) {
        errors.push({ rowIndex, field: 'temperatureZone', message: '无效的温区类型' });
      } else {
        const range = TEMPERATURE_ZONE_RANGES[item.temperatureZone];
        if (item.minTemp === undefined || item.minTemp === null || isNaN(item.minTemp)) {
          errors.push({ rowIndex, field: 'minTemp', message: '最低温度不能为空' });
        } else if (item.minTemp < range.min || item.minTemp > range.max) {
          errors.push({ rowIndex, field: 'minTemp', message: `最低温度需在 ${range.min}°C 到 ${range.max}°C 之间` });
        }

        if (item.maxTemp === undefined || item.maxTemp === null || isNaN(item.maxTemp)) {
          errors.push({ rowIndex, field: 'maxTemp', message: '最高温度不能为空' });
        } else if (item.maxTemp < range.min || item.maxTemp > range.max) {
          errors.push({ rowIndex, field: 'maxTemp', message: `最高温度需在 ${range.min}°C 到 ${range.max}°C 之间` });
        }

        if (item.minTemp !== undefined && item.maxTemp !== undefined && item.minTemp > item.maxTemp) {
          errors.push({ rowIndex, field: 'minTemp', message: '最低温度不能大于最高温度' });
        }
      }

      if (!item.goodsName || item.goodsName.trim() === '') {
        errors.push({ rowIndex, field: 'goodsName', message: '货物名称不能为空' });
      }

      if (item.quantity === undefined || item.quantity === null || isNaN(item.quantity)) {
        errors.push({ rowIndex, field: 'quantity', message: '货物数量不能为空' });
      } else if (item.quantity <= 0) {
        errors.push({ rowIndex, field: 'quantity', message: '货物数量必须大于0' });
      }

      if (item.weight === undefined || item.weight === null || isNaN(item.weight)) {
        errors.push({ rowIndex, field: 'weight', message: '货物重量不能为空' });
      } else if (item.weight <= 0) {
        errors.push({ rowIndex, field: 'weight', message: '货物重量必须大于0' });
      }

      if (!item.deliveryAddress || item.deliveryAddress.trim() === '') {
        errors.push({ rowIndex, field: 'deliveryAddress', message: '配送地址不能为空' });
      }

      if (!item.scheduledDeliveryTime || item.scheduledDeliveryTime.trim() === '') {
        errors.push({ rowIndex, field: 'scheduledDeliveryTime', message: '计划送达时间不能为空' });
      } else {
        const deliveryDate = new Date(item.scheduledDeliveryTime);
        if (isNaN(deliveryDate.getTime())) {
          errors.push({ rowIndex, field: 'scheduledDeliveryTime', message: '计划送达时间格式无效' });
        }
      }
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    const result = orderRepository.createOrdersBatch(ordersData);
    return result;
  },
};
