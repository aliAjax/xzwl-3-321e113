import { customerRepository } from '../repositories/customer.repository';
import { orderRepository } from '../repositories/order.repository';
import type { Customer } from '../../shared/types';

export const customerService = {
  findAll(options?: { limit?: number; offset?: number }): Customer[] {
    return customerRepository.findAll({ ...options, orderBy: 'createdAt', orderDir: 'DESC' });
  },

  findAllSortedByPriority(): Customer[] {
    return customerRepository.findAllSortedByPriority();
  },

  findById(id: string): Customer | undefined {
    return customerRepository.findById(id);
  },

  findByName(name: string): Customer | undefined {
    return customerRepository.findByName(name);
  },

  findByPhone(phone: string): Customer | undefined {
    return customerRepository.findByPhone(phone);
  },

  findByPriority(priority: number): Customer[] {
    return customerRepository.findByPriority(priority);
  },

  searchByName(name: string): Customer[] {
    return customerRepository.searchByName(name);
  },

  create(data: Omit<Customer, 'id' | 'createdAt'>): Customer {
    const existingByName = customerRepository.findByName(data.name);
    if (existingByName) {
      throw new Error('客户名称已存在');
    }

    const existingByPhone = customerRepository.findByPhone(data.phone);
    if (existingByPhone) {
      throw new Error('联系电话已存在');
    }

    return customerRepository.createCustomer(data);
  },

  update(id: string, data: Partial<Omit<Customer, 'id' | 'createdAt'>>): Customer | undefined {
    const existing = customerRepository.findById(id);
    if (!existing) {
      return undefined;
    }

    if (data.name && data.name !== existing.name) {
      const existingByName = customerRepository.findByName(data.name);
      if (existingByName) {
        throw new Error('客户名称已存在');
      }
    }

    if (data.phone && data.phone !== existing.phone) {
      const existingByPhone = customerRepository.findByPhone(data.phone);
      if (existingByPhone) {
        throw new Error('联系电话已存在');
      }
    }

    return customerRepository.updateCustomer(id, data);
  },

  delete(id: string): boolean {
    const orders = orderRepository.findByCustomerId(id);
    if (orders.length > 0) {
      throw new Error('客户存在关联订单，无法删除');
    }
    return customerRepository.delete(id);
  },

  count(): number {
    return customerRepository.count();
  },

  exists(id: string): boolean {
    return customerRepository.exists(id);
  },

  getCustomerStats(customerId: string) {
    const orders = orderRepository.findByCustomerId(customerId);
    const totalOrders = orders.length;
    const completedOrders = orders.filter(o => o.status === 'completed').length;
    const pendingOrders = orders.filter(o =>
      ['created', 'warehoused', 'loading', 'in_transit', 'delivered'].includes(o.status)
    ).length;
    const cancelledOrders = orders.filter(o => o.status === 'cancelled').length;

    return {
      totalOrders,
      completedOrders,
      pendingOrders,
      cancelledOrders,
      completionRate: totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0,
    };
  },

  getCustomerOrders(customerId: string, options?: { limit?: number; offset?: number }) {
    return orderRepository.findByCustomerId(customerId).slice(
      options?.offset || 0,
      options?.limit ? (options.offset || 0) + options.limit : undefined
    );
  },

  getTopCustomers(limit: number = 10) {
    const customers = customerRepository.findAll();
    const customerStats = customers.map(customer => {
      const orders = orderRepository.findByCustomerId(customer.id);
      return {
        customer,
        orderCount: orders.length,
        totalWeight: orders.reduce((sum, o) => sum + o.weight, 0),
      };
    });

    return customerStats
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, limit);
  },
};
