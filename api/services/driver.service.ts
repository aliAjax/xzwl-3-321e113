import { driverRepository } from '../repositories/driver.repository';
import { vehicleRepository } from '../repositories/vehicle.repository';
import { taskRepository } from '../repositories/task.repository';
import type { Driver } from '../../shared/types';

export const driverService = {
  findAll(options?: { limit?: number; offset?: number }): Driver[] {
    return driverRepository.findAll({ ...options, orderBy: 'createdAt', orderDir: 'DESC' });
  },

  findById(id: string): Driver | undefined {
    return driverRepository.findById(id);
  },

  findByName(name: string): Driver | undefined {
    return driverRepository.findByName(name);
  },

  findByPhone(phone: string): Driver | undefined {
    return driverRepository.findByPhone(phone);
  },

  findByLicenseNo(licenseNo: string): Driver | undefined {
    return driverRepository.findByLicenseNo(licenseNo);
  },

  findByStatus(status: 'on_duty' | 'off_duty' | 'on_leave'): Driver[] {
    return driverRepository.findByStatus(status);
  },

  findByLicenseType(licenseType: string): Driver[] {
    return driverRepository.findByLicenseType(licenseType);
  },

  findOnDutyDrivers(): Driver[] {
    return driverRepository.findOnDutyDrivers();
  },

  findAvailableDrivers(): Driver[] {
    const onDuty = driverRepository.findOnDutyDrivers();
    return onDuty.filter(driver => {
      const vehicle = vehicleRepository.findByDriverId(driver.id);
      return !vehicle;
    });
  },

  searchByName(name: string): Driver[] {
    return driverRepository.searchByName(name);
  },

  create(data: Omit<Driver, 'id' | 'createdAt'>): Driver {
    const existingByPhone = driverRepository.findByPhone(data.phone);
    if (existingByPhone) {
      throw new Error('手机号已存在');
    }

    const existingByLicense = driverRepository.findByLicenseNo(data.licenseNo);
    if (existingByLicense) {
      throw new Error('驾驶证号已存在');
    }

    return driverRepository.createDriver(data);
  },

  update(id: string, data: Partial<Omit<Driver, 'id' | 'createdAt'>>): Driver | undefined {
    const existing = driverRepository.findById(id);
    if (!existing) {
      return undefined;
    }

    if (data.phone && data.phone !== existing.phone) {
      const existingByPhone = driverRepository.findByPhone(data.phone);
      if (existingByPhone) {
        throw new Error('手机号已存在');
      }
    }

    if (data.licenseNo && data.licenseNo !== existing.licenseNo) {
      const existingByLicense = driverRepository.findByLicenseNo(data.licenseNo);
      if (existingByLicense) {
        throw new Error('驾驶证号已存在');
      }
    }

    return driverRepository.updateDriver(id, data);
  },

  updateStatus(id: string, status: 'on_duty' | 'off_duty' | 'on_leave'): Driver | undefined {
    const existing = driverRepository.findById(id);
    if (!existing) {
      return undefined;
    }

    if (status === 'off_duty' || status === 'on_leave') {
      const activeTasks = taskRepository.findByDriverId(id).filter(t =>
        ['created', 'warehoused', 'loading', 'in_transit', 'delivered'].includes(t.status)
      );
      if (activeTasks.length > 0) {
        throw new Error('司机有未完成的任务，无法设置为下班或休假状态');
      }

      const vehicle = vehicleRepository.findByDriverId(id);
      if (vehicle) {
        vehicleRepository.assignDriver(vehicle.id, null);
      }
    }

    return driverRepository.updateStatus(id, status);
  },

  delete(id: string): boolean {
    const activeTasks = taskRepository.findByDriverId(id).filter(t =>
      ['created', 'warehoused', 'loading', 'in_transit', 'delivered'].includes(t.status)
    );
    if (activeTasks.length > 0) {
      throw new Error('司机有未完成的任务，无法删除');
    }

    const vehicle = vehicleRepository.findByDriverId(id);
    if (vehicle) {
      vehicleRepository.assignDriver(vehicle.id, null);
    }

    return driverRepository.delete(id);
  },

  count(): number {
    return driverRepository.count();
  },

  exists(id: string): boolean {
    return driverRepository.exists(id);
  },

  getDriverWithVehicle(driverId: string): { driver: Driver; vehicle?: ReturnType<typeof vehicleRepository.findById> } | undefined {
    const driver = driverRepository.findById(driverId);
    if (!driver) return undefined;

    const vehicle = vehicleRepository.findByDriverId(driverId);
    return { driver, vehicle };
  },

  getDriverActiveTasks(driverId: string) {
    return taskRepository.findActiveTasksByDriverId(driverId);
  },

  checkDriverAvailable(driverId: string, scheduledTime: string): { available: boolean; reason?: string } {
    const driver = driverRepository.findById(driverId);
    if (!driver) {
      return { available: false, reason: '司机不存在' };
    }

    if (driver.status !== 'on_duty') {
      return { available: false, reason: `司机当前状态为 ${driver.status}，不可调度` };
    }

    const scheduledDate = new Date(scheduledTime).toDateString();
    const activeTasks = taskRepository.findActiveTasksByDriverId(driverId);

    for (const task of activeTasks) {
      if (task.batch) {
        const taskDate = new Date(task.createdAt).toDateString();
        if (taskDate === scheduledDate) {
          return { available: false, reason: '司机当天已有调度任务' };
        }
      }
    }

    return { available: true };
  },
};
