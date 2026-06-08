import type {
  Vehicle,
  Driver,
  Order,
  TemperatureZone,
  DispatchRequest,
  LoadingBatch,
  DeliveryTask,
} from '../../../shared/types';
import {
  WAREHOUSE_VEHICLE_ID,
  WAREHOUSE_DRIVER_ID,
  isWarehouseBatch,
  isWarehouseTask,
} from './dispatch.constants';

export interface ValidationRepositories {
  findOrderById: (id: string) => Order | undefined;
  findVehicleById: (id: string) => Vehicle | undefined;
  findDriverById: (id: string) => Driver | undefined;
  findRouteById: (id: string) => unknown | undefined;
  findBatchesByVehicleId: (vehicleId: string) => LoadingBatch[];
  findActiveTasksByDriverId: (driverId: string) => DeliveryTask[];
}

export function checkVehicleAvailableTime(vehicle: Vehicle, scheduledTime: string): boolean {
  const scheduled = new Date(scheduledTime);
  const hours = scheduled.getHours();
  const minutes = scheduled.getMinutes();
  const scheduledMinutes = hours * 60 + minutes;

  const [startH, startM] = vehicle.availableStartTime.split(':').map(Number);
  const [endH, endM] = vehicle.availableEndTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return scheduledMinutes >= startMinutes && scheduledMinutes <= endMinutes;
}

export function checkTemperatureMatch(vehicle: Vehicle, requiredZones: TemperatureZone[]): boolean {
  return requiredZones.every(zone => vehicle.temperatureZones.includes(zone));
}

export function checkVehicleTimeConflicts(
  vehicleId: string,
  scheduledTime: string,
  findBatchesByVehicleId: (vehicleId: string) => LoadingBatch[]
): string[] {
  const conflicts: string[] = [];
  const scheduledDate = new Date(scheduledTime).toDateString();

  const activeBatches = findBatchesByVehicleId(vehicleId).filter(b =>
    ['created', 'loading', 'departed'].includes(b.status) && !isWarehouseBatch(b)
  );

  for (const batch of activeBatches) {
    const batchDate = new Date(batch.createdAt).toDateString();
    if (batchDate === scheduledDate) {
      conflicts.push(`车辆在 ${batchDate} 已有批次 ${batch.batchNo} 的调度任务`);
    }
  }

  return conflicts;
}

export function checkDriverTimeConflicts(
  driverId: string,
  scheduledTime: string,
  findActiveTasksByDriverId: (driverId: string) => DeliveryTask[]
): string[] {
  const conflicts: string[] = [];
  const scheduledDate = new Date(scheduledTime).toDateString();

  const activeTasks = findActiveTasksByDriverId(driverId).filter(t => !isWarehouseTask(t));

  for (const task of activeTasks) {
    const taskDate = new Date(task.createdAt).toDateString();
    if (taskDate === scheduledDate) {
      conflicts.push(`司机在 ${scheduledDate} 已有配送任务`);
    }
  }

  return conflicts;
}

export function validateDispatchRequest(
  request: DispatchRequest,
  repos: ValidationRepositories
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (request.orderIds.length === 0) {
    errors.push('至少选择一个订单');
  }

  const orders = request.orderIds
    .map(id => repos.findOrderById(id))
    .filter((o): o is Order => o !== undefined);

  if (orders.length !== request.orderIds.length) {
    errors.push('部分订单不存在');
  }

  const invalidStatusOrders = orders.filter(o => !['created', 'warehoused'].includes(o.status));
  if (invalidStatusOrders.length > 0) {
    errors.push(`以下订单状态不正确，需要为 created 或 warehoused：${invalidStatusOrders.map(o => o.orderNo).join(', ')}`);
  }

  const vehicle = repos.findVehicleById(request.vehicleId);
  if (!vehicle) {
    errors.push('车辆不存在');
  } else {
    if (vehicle.id === WAREHOUSE_VEHICLE_ID) {
      errors.push('不能使用入仓专用车辆进行正式调度');
    }
    if (vehicle.status !== 'active') {
      errors.push(`车辆状态为 ${vehicle.status}，不可调度`);
    }

    const requiredZones = [...new Set(orders.map(o => o.temperatureZone))];
    if (!checkTemperatureMatch(vehicle, requiredZones)) {
      errors.push(`车辆温区不匹配，需要 ${requiredZones.join(', ')}，车辆只有 ${vehicle.temperatureZones.join(', ')}`);
    }

    const totalWeight = orders.reduce((sum, o) => sum + o.weight, 0);
    if (vehicle.capacity < totalWeight) {
      errors.push(`车辆载重不足，需要 ${totalWeight}kg，车辆容量 ${vehicle.capacity}kg`);
    }

    if (!checkVehicleAvailableTime(vehicle, request.scheduledDepartureTime)) {
      errors.push(`车辆不可用时间：${vehicle.availableStartTime}-${vehicle.availableEndTime}`);
    }

    const vehicleConflicts = checkVehicleTimeConflicts(
      vehicle.id,
      request.scheduledDepartureTime,
      repos.findBatchesByVehicleId
    );
    errors.push(...vehicleConflicts);
  }

  const driver = repos.findDriverById(request.driverId);
  if (!driver) {
    errors.push('司机不存在');
  } else {
    if (driver.id === WAREHOUSE_DRIVER_ID) {
      errors.push('不能使用入仓专用司机进行正式调度');
    }
    if (driver.status !== 'on_duty') {
      errors.push(`司机状态为 ${driver.status}，不可调度`);
    }

    const driverConflicts = checkDriverTimeConflicts(
      driver.id,
      request.scheduledDepartureTime,
      repos.findActiveTasksByDriverId
    );
    errors.push(...driverConflicts);
  }

  const route = repos.findRouteById(request.routeId);
  if (!route) {
    errors.push('线路不存在');
  }

  return { valid: errors.length === 0, errors };
}
