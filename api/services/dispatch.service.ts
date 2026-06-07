import { orderRepository } from '../repositories/order.repository';
import { vehicleRepository } from '../repositories/vehicle.repository';
import { driverRepository } from '../repositories/driver.repository';
import { routeRepository } from '../repositories/route.repository';
import { batchRepository } from '../repositories/batch.repository';
import { taskRepository } from '../repositories/task.repository';
import type {
  Order,
  Vehicle,
  Driver,
  Route,
  LoadingBatch,
  DeliveryTask,
  TemperatureZone,
  DispatchMatchResult,
  DispatchRequest,
} from '../../shared/types';

function generateBatchNo(): string {
  const date = new Date();
  const prefix = `BATCH${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}${random}`;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export const dispatchService = {
  checkVehicleAvailableTime(vehicle: Vehicle, scheduledTime: string): boolean {
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

  checkTemperatureMatch(vehicle: Vehicle, requiredZones: TemperatureZone[]): boolean {
    return requiredZones.every(zone => vehicle.temperatureZones.includes(zone));
  },

  checkVehicleTimeConflicts(vehicleId: string, scheduledTime: string): string[] {
    const conflicts: string[] = [];
    const scheduledDate = new Date(scheduledTime).toDateString();

    const activeBatches = batchRepository.findByVehicleId(vehicleId).filter(b =>
      ['created', 'loading', 'departed'].includes(b.status)
    );

    for (const batch of activeBatches) {
      const batchDate = new Date(batch.createdAt).toDateString();
      if (batchDate === scheduledDate) {
        conflicts.push(`车辆在 ${batchDate} 已有批次 ${batch.batchNo} 的调度任务`);
      }
    }

    return conflicts;
  },

  checkDriverTimeConflicts(driverId: string, scheduledTime: string): string[] {
    const conflicts: string[] = [];
    const scheduledDate = new Date(scheduledTime).toDateString();

    const activeTasks = taskRepository.findActiveTasksByDriverId(driverId);

    for (const task of activeTasks) {
      const taskDate = new Date(task.createdAt).toDateString();
      if (taskDate === scheduledDate) {
        conflicts.push(`司机在 ${scheduledDate} 已有配送任务`);
      }
    }

    return conflicts;
  },

  calculateMatchScore(
    vehicle: Vehicle,
    driver: Driver,
    orders: Order[],
    scheduledTime: string
  ): { score: number; conflicts: string[] } {
    let score = 0;
    const conflicts: string[] = [];

    const requiredZones = [...new Set(orders.map(o => o.temperatureZone))];
    const totalWeight = orders.reduce((sum, o) => sum + o.weight, 0);
    const totalQuantity = orders.reduce((sum, o) => sum + o.quantity, 0);

    if (this.checkTemperatureMatch(vehicle, requiredZones)) {
      score += 40;
    } else {
      conflicts.push(`车辆温区不匹配，需要 ${requiredZones.join(', ')}，车辆只有 ${vehicle.temperatureZones.join(', ')}`);
    }

    if (this.checkVehicleAvailableTime(vehicle, scheduledTime)) {
      score += 20;
    } else {
      conflicts.push(`车辆不可用时间：${vehicle.availableStartTime}-${vehicle.availableEndTime}`);
    }

    const vehicleConflicts = this.checkVehicleTimeConflicts(vehicle.id, scheduledTime);
    if (vehicleConflicts.length === 0) {
      score += 15;
    } else {
      conflicts.push(...vehicleConflicts);
    }

    if (driver.status === 'on_duty') {
      score += 10;
    } else {
      conflicts.push(`司机当前状态为 ${driver.status}，不可调度`);
    }

    const driverConflicts = this.checkDriverTimeConflicts(driver.id, scheduledTime);
    if (driverConflicts.length === 0) {
      score += 10;
    } else {
      conflicts.push(...driverConflicts);
    }

    if (vehicle.capacity >= totalWeight) {
      score += 5;
    } else {
      conflicts.push(`车辆载重不足，需要 ${totalWeight}kg，车辆容量 ${vehicle.capacity}kg`);
    }

    if (vehicle.driverId === driver.id) {
      score += 5;
    }

    return { score, conflicts };
  },

  findMatchingVehicles(
    orderIds: string[],
    scheduledTime: string
  ): DispatchMatchResult[] {
    const orders = orderIds
      .map(id => orderRepository.findById(id))
      .filter((o): o is Order => o !== undefined);

    if (orders.length === 0) {
      throw new Error('未找到有效的订单');
    }

    const requiredZones = [...new Set(orders.map(o => o.temperatureZone))];
    const totalWeight = orders.reduce((sum, o) => sum + o.weight, 0);

    const activeVehicles = vehicleRepository.findByStatus('active');
    const onDutyDrivers = driverRepository.findByStatus('on_duty');

    const results: DispatchMatchResult[] = [];

    for (const vehicle of activeVehicles) {
      if (!this.checkTemperatureMatch(vehicle, requiredZones)) continue;
      if (vehicle.capacity < totalWeight) continue;
      if (!this.checkVehicleAvailableTime(vehicle, scheduledTime)) continue;

      const vehicleConflicts = this.checkVehicleTimeConflicts(vehicle.id, scheduledTime);
      if (vehicleConflicts.length > 0) continue;

      let driver: Driver | undefined;
      if (vehicle.driverId) {
        driver = driverRepository.findById(vehicle.driverId);
      }

      if (!driver) {
        for (const d of onDutyDrivers) {
          const driverConflicts = this.checkDriverTimeConflicts(d.id, scheduledTime);
          if (driverConflicts.length === 0) {
            driver = d;
            break;
          }
        }
      }

      if (!driver) continue;

      const driverConflicts = this.checkDriverTimeConflicts(driver.id, scheduledTime);
      if (driverConflicts.length > 0) continue;

      const { score, conflicts } = this.calculateMatchScore(vehicle, driver, orders, scheduledTime);

      results.push({
        vehicleId: vehicle.id,
        plateNo: vehicle.plateNo,
        driverId: driver.id,
        driverName: driver.name,
        temperatureMatch: this.checkTemperatureMatch(vehicle, requiredZones),
        timeAvailable: this.checkVehicleAvailableTime(vehicle, scheduledTime),
        conflicts,
        score,
      });
    }

    return results.sort((a, b) => b.score - a.score);
  },

  validateDispatchRequest(request: DispatchRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (request.orderIds.length === 0) {
      errors.push('至少选择一个订单');
    }

    const orders = request.orderIds
      .map(id => orderRepository.findById(id))
      .filter((o): o is Order => o !== undefined);

    if (orders.length !== request.orderIds.length) {
      errors.push('部分订单不存在');
    }

    const invalidStatusOrders = orders.filter(o => !['created', 'warehoused'].includes(o.status));
    if (invalidStatusOrders.length > 0) {
      errors.push(`以下订单状态不正确，需要为 created 或 warehoused：${invalidStatusOrders.map(o => o.orderNo).join(', ')}`);
    }

    const vehicle = vehicleRepository.findById(request.vehicleId);
    if (!vehicle) {
      errors.push('车辆不存在');
    } else {
      if (vehicle.status !== 'active') {
        errors.push(`车辆状态为 ${vehicle.status}，不可调度`);
      }

      const requiredZones = [...new Set(orders.map(o => o.temperatureZone))];
      if (!this.checkTemperatureMatch(vehicle, requiredZones)) {
        errors.push(`车辆温区不匹配，需要 ${requiredZones.join(', ')}，车辆只有 ${vehicle.temperatureZones.join(', ')}`);
      }

      const totalWeight = orders.reduce((sum, o) => sum + o.weight, 0);
      if (vehicle.capacity < totalWeight) {
        errors.push(`车辆载重不足，需要 ${totalWeight}kg，车辆容量 ${vehicle.capacity}kg`);
      }

      if (!this.checkVehicleAvailableTime(vehicle, request.scheduledDepartureTime)) {
        errors.push(`车辆不可用时间：${vehicle.availableStartTime}-${vehicle.availableEndTime}`);
      }

      const vehicleConflicts = this.checkVehicleTimeConflicts(vehicle.id, request.scheduledDepartureTime);
      errors.push(...vehicleConflicts);
    }

    const driver = driverRepository.findById(request.driverId);
    if (!driver) {
      errors.push('司机不存在');
    } else {
      if (driver.status !== 'on_duty') {
        errors.push(`司机状态为 ${driver.status}，不可调度`);
      }

      const driverConflicts = this.checkDriverTimeConflicts(driver.id, request.scheduledDepartureTime);
      errors.push(...driverConflicts);
    }

    const route = routeRepository.findById(request.routeId);
    if (!route) {
      errors.push('线路不存在');
    }

    return { valid: errors.length === 0, errors };
  },

  createDeliveryTasks(request: DispatchRequest): { batch: LoadingBatch; tasks: DeliveryTask[] } {
    const validation = this.validateDispatchRequest(request);
    if (!validation.valid) {
      throw new Error(`调度验证失败：${validation.errors.join('; ')}`);
    }

    const orders = request.orderIds
      .map(id => orderRepository.findById(id))
      .filter((o): o is Order => o !== undefined);

    const batchNo = generateBatchNo();
    const batchId = generateId();
    const now = new Date().toISOString();

    const batch = batchRepository.create({
      id: batchId,
      batchNo,
      vehicleId: request.vehicleId,
      driverId: request.driverId,
      routeId: request.routeId,
      orderIds: request.orderIds,
      status: 'created',
      createdAt: now,
    });

    const tasks: DeliveryTask[] = [];
    for (const order of orders) {
      const taskId = generateId();

      const task = taskRepository.create({
        id: taskId,
        batchId,
        orderId: order.id,
        driverId: request.driverId,
        vehicleId: request.vehicleId,
        status: 'warehoused',
        createdAt: now,
      });

      tasks.push(task);

      orderRepository.updateStatus(order.id, 'warehoused');
    }

    return { batch, tasks };
  },

  getDispatchPreview(request: DispatchRequest): {
    batch: LoadingBatch;
    tasks: DeliveryTask[];
    totalWeight: number;
    totalQuantity: number;
    estimatedDuration: number;
  } {
    const validation = this.validateDispatchRequest(request);
    if (!validation.valid) {
      throw new Error(`调度验证失败：${validation.errors.join('; ')}`);
    }

    const orders = request.orderIds
      .map(id => orderRepository.findById(id))
      .filter((o): o is Order => o !== undefined);

    const route = routeRepository.findById(request.routeId);
    if (!route) {
      throw new Error('线路不存在');
    }

    const totalWeight = orders.reduce((sum, o) => sum + o.weight, 0);
    const totalQuantity = orders.reduce((sum, o) => sum + o.quantity, 0);
    const estimatedDuration = route.stops.reduce((sum, s) => sum + s.estimatedTime, 0);

    const batchNo = generateBatchNo();
    const batchId = generateId();
    const now = new Date().toISOString();

    const batch: LoadingBatch = {
      id: batchId,
      batchNo,
      vehicleId: request.vehicleId,
      driverId: request.driverId,
      routeId: request.routeId,
      orderIds: request.orderIds,
      status: 'created',
      createdAt: now,
    };

    const tasks: DeliveryTask[] = orders.map(order => ({
      id: generateId(),
      batchId,
      orderId: order.id,
      driverId: request.driverId,
      vehicleId: request.vehicleId,
      status: 'warehoused',
      createdAt: now,
    }));

    return {
      batch,
      tasks,
      totalWeight,
      totalQuantity,
      estimatedDuration,
    };
  },

  cancelDispatch(batchId: string): boolean {
    const batch = batchRepository.findById(batchId);
    if (!batch) {
      throw new Error('批次不存在');
    }

    if (!['created', 'loading'].includes(batch.status)) {
      throw new Error(`批次状态为 ${batch.status}，无法取消`);
    }

    const tasks = taskRepository.findByBatchId(batchId);
    for (const task of tasks) {
      if (['completed', 'cancelled'].includes(task.status)) continue;

      orderRepository.updateStatus(task.orderId, 'created');
      taskRepository.updateStatus(task.id, 'cancelled');
    }

    batchRepository.updateStatus(batchId, 'completed');

    return true;
  },

  getActiveDispatches() {
    return batchRepository.findActiveBatches().map(batch =>
      batchRepository.findByIdWithDetails(batch.id)
    ).filter(Boolean);
  },

  getDispatchByBatchId(batchId: string) {
    const batch = batchRepository.findByIdWithDetails(batchId);
    if (!batch) return undefined;

    const tasks = taskRepository.findByBatchIdWithDetails(batchId);
    return { batch, tasks };
  },

  createDispatch(request: DispatchRequest) {
    return this.createDeliveryTasks(request);
  },

  getDispatchById(id: string) {
    return this.getDispatchByBatchId(id);
  },

  getDispatchesByDateRange(startDate: string, endDate: string) {
    return batchRepository.findByDateRange(startDate, endDate).map(batch =>
      batchRepository.findByIdWithDetails(batch.id)
    ).filter(Boolean);
  },
};
