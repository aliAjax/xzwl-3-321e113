import { v4 as uuidv4 } from 'uuid';
import { orderRepository } from '../repositories/order.repository';
import type { Order, OrderStatus, TemperatureZone } from '@shared/types';

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
};
