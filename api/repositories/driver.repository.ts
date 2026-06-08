import { BaseRepository } from './base';
import type { Driver } from '../../shared/types';

class DriverRepository extends BaseRepository<Driver> {
  protected tableName = 'drivers';
  protected fieldMap: Record<keyof Driver, string> = {
    id: 'id',
    name: 'name',
    phone: 'phone',
    driverId: 'driver_id',
    licenseNo: 'license_no',
    licenseType: 'license_type',
    status: 'status',
    createdAt: 'created_at',
  };
  protected jsonFields: Array<keyof Driver> = [];

  findByName(name: string): Driver | undefined {
    return this.findOneByField('name', name);
  }

  findByPhone(phone: string): Driver | undefined {
    return this.findOneByField('phone', phone);
  }

  findByLicenseNo(licenseNo: string): Driver | undefined {
    return this.findOneByField('licenseNo', licenseNo);
  }

  findByStatus(status: 'on_duty' | 'off_duty' | 'on_leave'): Driver[] {
    return this.findByField('status', status, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByLicenseType(licenseType: string): Driver[] {
    return this.findByField('licenseType', licenseType, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findOnDutyDrivers(): Driver[] {
    return this.findByStatus('on_duty');
  }

  searchByName(name: string): Driver[] {
    const rows = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE name LIKE ? ORDER BY created_at DESC`)
      .all(`%${name}%`) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  updateStatus(id: string, status: 'on_duty' | 'off_duty' | 'on_leave'): Driver | undefined {
    return this.update(id, { status });
  }

  createDriver(data: Omit<Driver, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): Driver {
    return this.create(data);
  }

  updateDriver(id: string, data: Partial<Omit<Driver, 'id' | 'createdAt'>>): Driver | undefined {
    return this.update(id, data);
  }
}

export const driverRepository = new DriverRepository();
