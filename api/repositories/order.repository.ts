import { v4 as uuidv4 } from 'uuid';
import { BaseRepository } from './base';
import type { Order, OrderStatus, TemperatureZone, OrderTimeline, OrderTimelineEvent, NodeType, BatchOrderCreateItem, BatchOrderCreateResult } from '../../shared/types';

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

  findTimelineByOrderId(orderId: string): OrderTimeline | undefined {
    const order = this.findById(orderId);
    if (!order) return undefined;

    const taskRow = this.db
      .prepare(
        `SELECT t.id as task_id
         FROM delivery_tasks t
         WHERE t.order_id = ?
         ORDER BY t.created_at DESC
         LIMIT 1`
      )
      .get(orderId) as { task_id: string } | undefined;

    const events: OrderTimelineEvent[] = [];

    if (taskRow) {
      const nodeRows = this.db
        .prepare(
          `SELECT n.*
           FROM delivery_nodes n
           WHERE n.task_id = ?
           ORDER BY n.created_at ASC`
        )
        .all(taskRow.task_id) as Record<string, unknown>[];

      const nodeTypeOrder: NodeType[] = ['warehouse_in', 'loading', 'departure', 'arrival', 'delivery', 'signature'];
      const sortedNodes = nodeRows.sort((a, b) => {
        const aType = a.node_type as NodeType;
        const bType = b.node_type as NodeType;
        return nodeTypeOrder.indexOf(aType) - nodeTypeOrder.indexOf(bType);
      });

      for (const row of sortedNodes) {
        events.push({
          id: row.id as string,
          nodeType: row.node_type as NodeType,
          nodeName: row.node_name as string,
          status: row.status as OrderTimelineEvent['status'],
          recordedAt: row.recorded_at as string | undefined,
          locationText: row.location_text as string,
          exceptionDescription: row.exception_description as string | undefined,
          temperature: row.temperature as number | undefined,
          operatorId: row.operator_id as string | undefined,
          operatorName: row.operator_name as string | undefined,
          createdAt: row.created_at as string,
        });
      }
    }

    const completedCount = events.filter(e => e.status === 'completed' || e.status === 'exception').length;
    const totalCount = events.length;
    const currentNode = events.find(e => e.status === 'in_progress') || events.find(e => e.status === 'pending');

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      status: order.status,
      events,
      currentNode,
      completedCount,
      totalCount,
    };
  }

  findPendingWarehouseOrders(params: {
    orderNo?: string;
    customerId?: string;
    temperatureZone?: TemperatureZone;
  }): Order[] {
    let sql = `SELECT o.*,
                      c.name as customer_name,
                      c.contact_name as customer_contact_name,
                      c.phone as customer_phone,
                      c.address as customer_address,
                      c.priority as customer_priority,
                      c.created_at as customer_created_at
               FROM ${this.tableName} o
               LEFT JOIN customers c ON o.customer_id = c.id
               WHERE o.status = 'created'`;

    const paramsList: unknown[] = [];

    if (params.orderNo) {
      sql += ' AND o.order_no LIKE ?';
      paramsList.push(`%${params.orderNo}%`);
    }

    if (params.customerId) {
      sql += ' AND o.customer_id = ?';
      paramsList.push(params.customerId);
    }

    if (params.temperatureZone) {
      sql += ' AND o.temperature_zone = ?';
      paramsList.push(params.temperatureZone);
    }

    sql += ' ORDER BY o.created_at DESC';

    const rows = this.db.prepare(sql).all(...paramsList) as Record<string, unknown>[];
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

  createOrdersBatch(ordersData: BatchOrderCreateItem[]): BatchOrderCreateResult {
    const orderIds: string[] = [];
    const orderNos: string[] = [];
    const now = new Date().toISOString();

    const insertTransaction = this.db.transaction((orders: BatchOrderCreateItem[]) => {
      const insertStmt = this.db.prepare(`
        INSERT INTO orders (
          id, order_no, customer_id, temperature_zone, min_temp, max_temp,
          goods_name, quantity, weight, delivery_address, scheduled_delivery_time,
          status, remarks, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of orders) {
        const id = uuidv4();
        insertStmt.run(
          id,
          item.orderNo,
          item.customerId,
          item.temperatureZone,
          item.minTemp,
          item.maxTemp,
          item.goodsName,
          item.quantity,
          item.weight,
          item.deliveryAddress,
          item.scheduledDeliveryTime,
          'created',
          item.remarks || '',
          now,
          now
        );
        orderIds.push(id);
        orderNos.push(item.orderNo);
      }
    });

    try {
      insertTransaction(ordersData);
      return {
        success: true,
        orderIds,
        orderNos,
      };
    } catch (error) {
      return {
        success: false,
        errors: [{
          rowIndex: 0,
          field: 'system',
          message: '数据库操作失败：' + (error as Error).message,
        }],
      };
    }
  }
}

export const orderRepository = new OrderRepository();
