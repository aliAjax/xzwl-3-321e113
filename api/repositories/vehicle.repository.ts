import { BaseRepository } from './base';
import type { Vehicle, TemperatureZone } from '../../shared/types';

class VehicleRepository extends BaseRepository<Vehicle> {
  protected tableName = 'vehicles';
  protected fieldMap: Record<keyof Vehicle, string> = {
    id: 'id',
    plateNo: 'plate_no',
    vehicleType: 'vehicle_type',
    temperatureZones: 'temperature_zones',
    capacity: 'capacity',
    driverId: 'driver_id',
    availableStartTime: 'available_start_time',
    availableEndTime: 'available_end_time',
    status: 'status',
    createdAt: 'created_at',
  };
  protected jsonFields: Array<keyof Vehicle> = ['temperatureZones'];

  findByPlateNo(plateNo: string): Vehicle | undefined {
    return this.findOneByField('plateNo', plateNo);
  }

  findByStatus(status: 'active' | 'maintenance' | 'disabled'): Vehicle[] {
    return this.findByField('status', status, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByDriverId(driverId: string): Vehicle | undefined {
    return this.findOneByField('driverId', driverId);
  }

  findByTemperatureZone(temperatureZone: TemperatureZone): Vehicle[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} 
         WHERE temperature_zones LIKE ? 
         ORDER BY created_at DESC`
      )
      .all(`%${temperatureZone}%`) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  findAvailableVehicles(): Vehicle[] {
    return this.findByStatus('active').filter(v => !v.driverId);
  }

  findVehiclesWithCapacity(minCapacity: number): Vehicle[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} 
         WHERE status = 'active' AND capacity >= ? 
         ORDER BY capacity ASC`
      )
      .all(minCapacity) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  searchByPlateNo(plateNo: string): Vehicle[] {
    const rows = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE plate_no LIKE ? ORDER BY created_at DESC`)
      .all(`%${plateNo}%`) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  assignDriver(vehicleId: string, driverId: string | null): Vehicle | undefined {
    return this.update(vehicleId, { driverId: driverId || undefined });
  }

  updateStatus(id: string, status: 'active' | 'maintenance' | 'disabled'): Vehicle | undefined {
    return this.update(id, { status });
  }

  createVehicle(data: Omit<Vehicle, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): Vehicle {
    return this.create(data);
  }

  updateVehicle(id: string, data: Partial<Omit<Vehicle, 'id' | 'createdAt'>>): Vehicle | undefined {
    return this.update(id, data);
  }
}

export const vehicleRepository = new VehicleRepository();
