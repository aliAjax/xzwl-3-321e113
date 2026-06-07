import { BaseRepository } from './base';
import type { Order, OrderStatus, TemperatureZone } from '../../shared/types';

class OrderRepository extends BaseRepository<Order> {
  protected tableName = 'orders';
  protected fieldMap: Record<keyof Order, string> = {
    id: 'id',
    orderNo: 'order_no',
    customerId: 'customer_id',
    customer: 'customer',
    temperatureZone: 'temperature_zone',
    minTemp: 'min_temp',
    maxTemp: 'max_temp',
    goodsName: 'goods_name',
    quantity: 'quantity',
    weight: 'weight',
    deliveryAddress: 'delivery_address',
    scheduledDeliveryTime: 'scheduled_delivery_time',
    status: 'status',
    remarks: 'remarks',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  };
  protected jsonFields: Array<keyof Order> = [];

  findByOrderNo(orderNo: string): Order | undefined {
    return this.findOneByField('orderNo', orderNo);
  }

  findByCustomerId(customerId: string): Order[] {
    return this.findByField('customerId', customerId, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByStatus(status: OrderStatus): Order[] {
    return this.findByField('status', status, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByTemperatureZone(temperatureZone: TemperatureZone): Order[] {
    return this.findByField('temperatureZone', temperatureZone, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByDateRange(startDate: string, endDate: string): Order[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} 
         WHERE scheduled_delivery_time BETWEEN ? AND ? 
         ORDER BY scheduled_delivery_time ASC`
      )
      .all(startDate, endDate) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  findByStatusAndDateRange(status: OrderStatus, startDate: string, endDate: string): Order[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} 
         WHERE status = ? AND scheduled_delivery_time BETWEEN ? AND ? 
         ORDER BY scheduled_delivery_time ASC`
      )
      .all(status, startDate, endDate) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  searchByGoodsName(goodsName: string): Order[] {
    const rows = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE goods_name LIKE ? ORDER BY created_at DESC`)
      .all(`%${goodsName}%`) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  findByIdWithCustomer(id: string): Order | undefined {
    const row = this.db
      .prepare(
        `SELECT o.*, 
                c.name as customer_name, 
                c.contact_name as customer_contact_name, 
                c.phone as customer_phone, 
                c.address as customer_address, 
                c.priority as customer_priority, 
                c.created_at as customer_created_at 
         FROM ${this.tableName} o 
         LEFT JOIN customers c ON o.customer_id = c.id 
         WHERE o.id = ?`
      )
      .get(id) as Record<string, unknown> | undefined;

    if (!row) return undefined;

    const order = this.fromDatabase(row);
    if (row.customer_name) {
      order.customer = {
        id: row.customer_id as string,
        name: row.customer_name as string,
        contactName: row.customer_contact_name as string,
        phone: row.customer_phone as string,
        address: row.customer_address as string,
        priority: row.customer_priority as number,
        createdAt: row.customer_created_at as string,
      };
    }
    return order;
  }

  findAllWithCustomer(options: { limit?: number; offset?: number } = {}): Order[] {
    let sql = `SELECT o.*, 
                      c.name as customer_name, 
                      c.contact_name as customer_contact_name, 
                      c.phone as customer_phone, 
                      c.address as customer_address, 
                      c.priority as customer_priority, 
                      c.created_at as customer_created_at 
               FROM ${this.tableName} o 
               LEFT JOIN customers c ON o.customer_id = c.id 
               ORDER BY o.created_at DESC`;
    const params: unknown[] = [];

    if (options.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }
    if (options.offset !== undefined) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(row => {
      const order = this.fromDatabase(row);
      if (row.customer_name) {
        order.customer = {
          id: row.customer_id as string,
          name: row.customer_name as string,
          contactName: row.customer_contact_name as string,
          phone: row.customer_phone as string,
          address: row.customer_address as string,
          priority: row.customer_priority as number,
          createdAt: row.customer_created_at as string,
        };
      }
      return order;
    });
  }

  updateStatus(id: string, status: OrderStatus): Order | undefined {
    const now = new Date().toISOString();
    return this.update(id, { status, updatedAt: now });
  }

  createOrder(data: Omit<Order, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string; updatedAt?: string }): Order {
    const now = new Date().toISOString();
    return this.create({
      ...data,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    });
  }

  updateOrder(id: string, data: Partial<Omit<Order, 'id' | 'createdAt'>>): Order | undefined {
    const now = new Date().toISOString();
    return this.update(id, { ...data, updatedAt: now });
  }
}

export const orderRepository = new OrderRepository();
