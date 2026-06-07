import { BaseRepository } from './base';
import type { DeliveryTask, OrderStatus } from '../../shared/types';

class TaskRepository extends BaseRepository<DeliveryTask> {
  protected tableName = 'delivery_tasks';
  protected fieldMap: Record<keyof DeliveryTask, string> = {
    id: 'id',
    batchId: 'batch_id',
    batch: 'batch',
    orderId: 'order_id',
    order: 'order',
    driverId: 'driver_id',
    driver: 'driver',
    vehicleId: 'vehicle_id',
    vehicle: 'vehicle',
    status: 'status',
    nodes: 'nodes',
    createdAt: 'created_at',
  };
  protected jsonFields: Array<keyof DeliveryTask> = [];

  findByBatchId(batchId: string): DeliveryTask[] {
    return this.findByField('batchId', batchId, { orderBy: 'createdAt', orderDir: 'ASC' });
  }

  findByOrderId(orderId: string): DeliveryTask | undefined {
    return this.findOneByField('orderId', orderId);
  }

  findByDriverId(driverId: string): DeliveryTask[] {
    return this.findByField('driverId', driverId, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByVehicleId(vehicleId: string): DeliveryTask[] {
    return this.findByField('vehicleId', vehicleId, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByStatus(status: OrderStatus): DeliveryTask[] {
    return this.findByField('status', status, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByDriverIdAndStatus(driverId: string, status: OrderStatus): DeliveryTask[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} 
         WHERE driver_id = ? AND status = ? 
         ORDER BY created_at DESC`
      )
      .all(driverId, status) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  findByDateRange(startDate: string, endDate: string): DeliveryTask[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} 
         WHERE created_at BETWEEN ? AND ? 
         ORDER BY created_at DESC`
      )
      .all(startDate, endDate) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  findActiveTasksByDriverId(driverId: string): DeliveryTask[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} 
         WHERE driver_id = ? AND status IN ('created', 'warehoused', 'loading', 'in_transit', 'delivered') 
         ORDER BY created_at ASC`
      )
      .all(driverId) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  findByIdWithDetails(id: string): DeliveryTask | undefined {
    const row = this.db
      .prepare(
        `SELECT t.*,
                b.batch_no as batch_batch_no,
                b.status as batch_status,
                b.departure_time as batch_departure_time,
                o.order_no as order_order_no,
                o.goods_name as order_goods_name,
                o.quantity as order_quantity,
                o.weight as order_weight,
                o.delivery_address as order_delivery_address,
                o.scheduled_delivery_time as order_scheduled_delivery_time,
                o.temperature_zone as order_temperature_zone,
                o.min_temp as order_min_temp,
                o.max_temp as order_max_temp,
                o.customer_id as order_customer_id,
                v.plate_no as vehicle_plate_no,
                v.vehicle_type as vehicle_vehicle_type,
                d.name as driver_name,
                d.phone as driver_phone
         FROM ${this.tableName} t
         LEFT JOIN loading_batches b ON t.batch_id = b.id
         LEFT JOIN orders o ON t.order_id = o.id
         LEFT JOIN vehicles v ON t.vehicle_id = v.id
         LEFT JOIN drivers d ON t.driver_id = d.id
         WHERE t.id = ?`
      )
      .get(id) as Record<string, unknown> | undefined;

    if (!row) return undefined;

    const task = this.fromDatabase(row);

    if (row.batch_batch_no) {
      task.batch = {
        id: row.batch_id as string,
        batchNo: row.batch_batch_no as string,
        vehicleId: '',
        driverId: '',
        routeId: '',
        orderIds: [],
        status: row.batch_status as 'created' | 'loading' | 'departed' | 'completed',
        departureTime: row.batch_departure_time as string,
        createdAt: '',
      };
    }

    if (row.order_order_no) {
      task.order = {
        id: row.order_id as string,
        orderNo: row.order_order_no as string,
        customerId: row.order_customer_id as string,
        temperatureZone: row.order_temperature_zone as 'frozen' | 'chilled' | 'ambient',
        minTemp: row.order_min_temp as number,
        maxTemp: row.order_max_temp as number,
        goodsName: row.order_goods_name as string,
        quantity: row.order_quantity as number,
        weight: row.order_weight as number,
        deliveryAddress: row.order_delivery_address as string,
        scheduledDeliveryTime: row.order_scheduled_delivery_time as string,
        status: row.status as OrderStatus,
        remarks: '',
        createdAt: '',
        updatedAt: '',
      };
    }

    if (row.vehicle_plate_no) {
      task.vehicle = {
        id: row.vehicle_id as string,
        plateNo: row.vehicle_plate_no as string,
        vehicleType: row.vehicle_vehicle_type as string,
        temperatureZones: [],
        capacity: 0,
        availableStartTime: '',
        availableEndTime: '',
        status: 'active',
        createdAt: '',
      };
    }

    if (row.driver_name) {
      task.driver = {
        id: row.driver_id as string,
        name: row.driver_name as string,
        phone: row.driver_phone as string,
        licenseNo: '',
        licenseType: '',
        status: 'on_duty',
        createdAt: '',
      };
    }

    return task;
  }

  findByBatchIdWithDetails(batchId: string): DeliveryTask[] {
    const rows = this.db
      .prepare(
        `SELECT t.*,
                o.order_no as order_order_no,
                o.goods_name as order_goods_name,
                o.quantity as order_quantity,
                o.weight as order_weight,
                o.delivery_address as order_delivery_address,
                o.scheduled_delivery_time as order_scheduled_delivery_time,
                c.name as customer_name
         FROM ${this.tableName} t
         LEFT JOIN orders o ON t.order_id = o.id
         LEFT JOIN customers c ON o.customer_id = c.id
         WHERE t.batch_id = ?
         ORDER BY t.created_at ASC`
      )
      .all(batchId) as Record<string, unknown>[];

    return rows.map(row => {
      const task = this.fromDatabase(row);
      if (row.order_order_no) {
        task.order = {
          id: row.order_id as string,
          orderNo: row.order_order_no as string,
          customerId: row.customer_id as string,
          temperatureZone: 'ambient',
          minTemp: 0,
          maxTemp: 0,
          goodsName: row.order_goods_name as string,
          quantity: row.order_quantity as number,
          weight: row.order_weight as number,
          deliveryAddress: row.order_delivery_address as string,
          scheduledDeliveryTime: row.order_scheduled_delivery_time as string,
          status: row.status as OrderStatus,
          remarks: '',
          createdAt: '',
          updatedAt: '',
          customer: row.customer_name ? {
            id: row.customer_id as string,
            name: row.customer_name as string,
            contactName: '',
            phone: '',
            address: '',
            priority: 1,
            createdAt: '',
          } : undefined,
        };
      }
      return task;
    });
  }

  updateStatus(id: string, status: OrderStatus): DeliveryTask | undefined {
    return this.update(id, { status });
  }

  countByDriverIdAndStatus(driverId: string, status: OrderStatus): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM ${this.tableName} 
         WHERE driver_id = ? AND status = ?`
      )
      .get(driverId, status) as { count: number };
    return row.count;
  }

  createTask(data: Omit<DeliveryTask, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): DeliveryTask {
    return this.create(data);
  }

  updateTask(id: string, data: Partial<Omit<DeliveryTask, 'id' | 'createdAt'>>): DeliveryTask | undefined {
    return this.update(id, data);
  }
}

export const taskRepository = new TaskRepository();
