import { vehicleRepository } from '../repositories/vehicle.repository';
import { driverRepository } from '../repositories/driver.repository';
import { taskRepository } from '../repositories/task.repository';
import type { Vehicle, TemperatureZone } from '../../shared/types';

export const vehicleService = {
  findAll(options?: { limit?: number; offset?: number }): Vehicle[] {
    return vehicleRepository.findAll({ ...options, orderBy: 'createdAt', orderDir: 'DESC' });
  },

  findById(id: string): Vehicle | undefined {
    return vehicleRepository.findById(id);
  },

  findByPlateNo(plateNo: string): Vehicle | undefined {
    return vehicleRepository.findByPlateNo(plateNo);
  },

  findByStatus(status: 'active' | 'maintenance' | 'disabled'): Vehicle[] {
    return vehicleRepository.findByStatus(status);
  },

  findByDriverId(driverId: string): Vehicle | undefined {
    return vehicleRepository.findByDriverId(driverId);
  },

  findByTemperatureZone(temperatureZone: TemperatureZone): Vehicle[] {
    return vehicleRepository.findByTemperatureZone(temperatureZone);
  },

  findAvailableVehicles(): Vehicle[] {
    return vehicleRepository.findAvailableVehicles();
  },

  findVehiclesWithCapacity(minCapacity: number): Vehicle[] {
    return vehicleRepository.findVehiclesWithCapacity(minCapacity);
  },

  searchByPlateNo(plateNo: string): Vehicle[] {
    return vehicleRepository.searchByPlateNo(plateNo);
  },

  create(data: Omit<Vehicle, 'id' | 'createdAt'>): Vehicle {
    const existing = vehicleRepository.findByPlateNo(data.plateNo);
    if (existing) {
      throw new Error('车牌号已存在');
    }

    if (data.driverId) {
      const driver = driverRepository.findById(data.driverId);
      if (!driver) {
        throw new Error('司机不存在');
      }

      const existingVehicleWithDriver = vehicleRepository.findByDriverId(data.driverId);
      if (existingVehicleWithDriver) {
        throw new Error('该司机已分配其他车辆');
      }
    }

    return vehicleRepository.createVehicle(data);
  },

  update(id: string, data: Partial<Omit<Vehicle, 'id' | 'createdAt'>>): Vehicle | undefined {
    const existing = vehicleRepository.findById(id);
    if (!existing) {
      return undefined;
    }

    if (data.plateNo && data.plateNo !== existing.plateNo) {
      const existingPlate = vehicleRepository.findByPlateNo(data.plateNo);
      if (existingPlate) {
        throw new Error('车牌号已存在');
      }
    }

    if (data.driverId !== undefined) {
      if (data.driverId) {
        const driver = driverRepository.findById(data.driverId);
        if (!driver) {
          throw new Error('司机不存在');
        }

        const existingVehicleWithDriver = vehicleRepository.findByDriverId(data.driverId);
        if (existingVehicleWithDriver && existingVehicleWithDriver.id !== id) {
          throw new Error('该司机已分配其他车辆');
        }
      }
    }

    return vehicleRepository.updateVehicle(id, data);
  },

  assignDriver(vehicleId: string, driverId: string | null): Vehicle | undefined {
    const vehicle = vehicleRepository.findById(vehicleId);
    if (!vehicle) {
      return undefined;
    }

    if (driverId) {
      const driver = driverRepository.findById(driverId);
      if (!driver) {
        throw new Error('司机不存在');
      }

      const existingVehicleWithDriver = vehicleRepository.findByDriverId(driverId);
      if (existingVehicleWithDriver && existingVehicleWithDriver.id !== vehicleId) {
        throw new Error('该司机已分配其他车辆');
      }
    }

    return vehicleRepository.assignDriver(vehicleId, driverId);
  },

  updateStatus(id: string, status: 'active' | 'maintenance' | 'disabled'): Vehicle | undefined {
    const existing = vehicleRepository.findById(id);
    if (!existing) {
      return undefined;
    }

    if (status === 'maintenance' || status === 'disabled') {
      const activeTasks = taskRepository.findByVehicleId(id).filter(t =>
        ['created', 'warehoused', 'loading', 'in_transit', 'delivered'].includes(t.status)
      );
      if (activeTasks.length > 0) {
        throw new Error('车辆有未完成的任务，无法设置为维护或停用状态');
      }
    }

    return vehicleRepository.updateStatus(id, status);
  },

  delete(id: string): boolean {
    const activeTasks = taskRepository.findByVehicleId(id).filter(t =>
      ['created', 'warehoused', 'loading', 'in_transit', 'delivered'].includes(t.status)
    );
    if (activeTasks.length > 0) {
      throw new Error('车辆有未完成的任务，无法删除');
    }
    return vehicleRepository.delete(id);
  },

  count(): number {
    return vehicleRepository.count();
  },

  exists(id: string): boolean {
    return vehicleRepository.exists(id);
  },

  checkTemperatureMatch(vehicle: Vehicle, requiredZone: TemperatureZone): boolean {
    return vehicle.temperatureZones.includes(requiredZone);
  },

  checkTimeAvailable(vehicle: Vehicle, scheduledTime: string): boolean {
    const scheduled = new Date(scheduledTime);
    const hours = scheduled.getHours();
    const minutes = scheduled.getMinutes();
    const scheduledMinutes = hours * 60 + minutes;

    const [startH, startM] = vehicle.availableStartTime.split(':').map(Number);
    const [endH, endM] = vehicle.availableEndTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return scheduledMinutes >= startMinutes && scheduledMinutes <= endMinutes;
  },

  getVehiclesByTemperatureAndCapacity(
    requiredZone: TemperatureZone,
    minCapacity: number
  ): Vehicle[] {
    const vehicles = vehicleRepository.findVehiclesWithCapacity(minCapacity);
    return vehicles.filter(v =>
      v.status === 'active' &&
      v.temperatureZones.includes(requiredZone)
    );
  },

  getAllVehicles(options?: { limit?: number; offset?: number }): Vehicle[] {
    return this.findAll(options);
  },

  getVehicleById(id: string): Vehicle | undefined {
    return this.findById(id);
  },

  getVehicleByPlateNo(plateNo: string): Vehicle | undefined {
    return this.findByPlateNo(plateNo);
  },

  getVehiclesByStatus(status: 'active' | 'maintenance' | 'disabled'): Vehicle[] {
    return this.findByStatus(status);
  },

  getAvailableVehicles(): Vehicle[] {
    return this.findAvailableVehicles();
  },

  getVehiclesByTemperatureZone(temperatureZone: TemperatureZone): Vehicle[] {
    return this.findByTemperatureZone(temperatureZone);
  },

  getVehiclesWithCapacity(minCapacity: number): Vehicle[] {
    return this.findVehiclesWithCapacity(minCapacity);
  },

  searchVehiclesByPlateNo(plateNo: string): Vehicle[] {
    return this.searchByPlateNo(plateNo);
  },

  createVehicle(data: Omit<Vehicle, 'id' | 'createdAt'>): Vehicle {
    return this.create(data);
  },

  updateVehicle(id: string, data: Partial<Omit<Vehicle, 'id' | 'createdAt'>>): Vehicle | undefined {
    return this.update(id, data);
  },

  updateVehicleStatus(id: string, status: 'active' | 'maintenance' | 'disabled'): Vehicle | undefined {
    return this.updateStatus(id, status);
  },

  deleteVehicle(id: string): boolean {
    return this.delete(id);
  },

  countVehicles(): number {
    return this.count();
  },

  vehicleExists(id: string): boolean {
    return this.exists(id);
  },
};
