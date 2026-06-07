import { BaseRepository } from './base';
import type { LoadingBatch, BatchStatus } from '../../shared/types';

class BatchRepository extends BaseRepository<LoadingBatch> {
  protected tableName = 'loading_batches';
  protected fieldMap: Record<keyof LoadingBatch, string> = {
    id: 'id',
    batchNo: 'batch_no',
    vehicleId: 'vehicle_id',
    vehicle: 'vehicle',
    driverId: 'driver_id',
    driver: 'driver',
    routeId: 'route_id',
    route: 'route',
    orderIds: 'order_ids_json',
    orders: 'orders',
    status: 'status',
    departureTime: 'departure_time',
    createdAt: 'created_at',
  };
  protected jsonFields: Array<keyof LoadingBatch> = ['orderIds'];

  findByBatchNo(batchNo: string): LoadingBatch | undefined {
    return this.findOneByField('batchNo', batchNo);
  }

  findByVehicleId(vehicleId: string): LoadingBatch[] {
    return this.findByField('vehicleId', vehicleId, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByDriverId(driverId: string): LoadingBatch[] {
    return this.findByField('driverId', driverId, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByRouteId(routeId: string): LoadingBatch[] {
    return this.findByField('routeId', routeId, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByStatus(status: BatchStatus): LoadingBatch[] {
    return this.findByField('status', status, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByDateRange(startDate: string, endDate: string): LoadingBatch[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} 
         WHERE created_at BETWEEN ? AND ? 
         ORDER BY created_at DESC`
      )
      .all(startDate, endDate) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  findActiveBatches(): LoadingBatch[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} 
         WHERE status IN ('created', 'loading', 'departed') 
         ORDER BY created_at DESC`
      )
      .all() as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  findByIdWithDetails(id: string): LoadingBatch | undefined {
    const row = this.db
      .prepare(
        `SELECT b.*,
                v.plate_no as vehicle_plate_no,
                v.vehicle_type as vehicle_type,
                v.temperature_zones as vehicle_temperature_zones,
                v.capacity as vehicle_capacity,
                v.status as vehicle_status,
                d.name as driver_name,
                d.phone as driver_phone,
                d.license_no as driver_license_no,
                d.license_type as driver_license_type,
                d.status as driver_status,
                r.name as route_name,
                r.description as route_description,
                r.stops_json as route_stops
         FROM ${this.tableName} b
         LEFT JOIN vehicles v ON b.vehicle_id = v.id
         LEFT JOIN drivers d ON b.driver_id = d.id
         LEFT JOIN routes r ON b.route_id = r.id
         WHERE b.id = ?`
      )
      .get(id) as Record<string, unknown> | undefined;

    if (!row) return undefined;

    const batch = this.fromDatabase(row);

    if (row.vehicle_plate_no) {
      batch.vehicle = {
        id: row.vehicle_id as string,
        plateNo: row.vehicle_plate_no as string,
        vehicleType: row.vehicle_type as string,
        temperatureZones: typeof row.vehicle_temperature_zones === 'string'
          ? JSON.parse(row.vehicle_temperature_zones as string)
          : row.vehicle_temperature_zones as string[],
        capacity: row.vehicle_capacity as number,
        availableStartTime: '',
        availableEndTime: '',
        status: row.vehicle_status as 'active' | 'maintenance' | 'disabled',
        createdAt: '',
      };
    }

    if (row.driver_name) {
      batch.driver = {
        id: row.driver_id as string,
        name: row.driver_name as string,
        phone: row.driver_phone as string,
        licenseNo: row.driver_license_no as string,
        licenseType: row.driver_license_type as string,
        status: row.driver_status as 'on_duty' | 'off_duty' | 'on_leave',
        createdAt: '',
      };
    }

    if (row.route_name) {
      batch.route = {
        id: row.route_id as string,
        name: row.route_name as string,
        description: row.route_description as string,
        stops: typeof row.route_stops === 'string'
          ? JSON.parse(row.route_stops as string)
          : row.route_stops as [],
        createdAt: '',
      };
    }

    return batch;
  }

  updateStatus(id: string, status: BatchStatus): LoadingBatch | undefined {
    const updates: Partial<LoadingBatch> = { status };
    if (status === 'departed') {
      updates.departureTime = new Date().toISOString();
    }
    return this.update(id, updates);
  }

  addOrderId(batchId: string, orderId: string): LoadingBatch | undefined {
    const batch = this.findById(batchId);
    if (!batch) return undefined;

    if (batch.orderIds.includes(orderId)) {
      return batch;
    }

    const updatedOrderIds = [...batch.orderIds, orderId];
    return this.update(batchId, { orderIds: updatedOrderIds });
  }

  removeOrderId(batchId: string, orderId: string): LoadingBatch | undefined {
    const batch = this.findById(batchId);
    if (!batch) return undefined;

    const updatedOrderIds = batch.orderIds.filter(id => id !== orderId);
    return this.update(batchId, { orderIds: updatedOrderIds });
  }

  createBatch(data: Omit<LoadingBatch, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): LoadingBatch {
    return this.create(data);
  }

  updateBatch(id: string, data: Partial<Omit<LoadingBatch, 'id' | 'createdAt'>>): LoadingBatch | undefined {
    return this.update(id, data);
  }
}

export const batchRepository = new BatchRepository();
