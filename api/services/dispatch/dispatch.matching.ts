import type {
  Order,
  Vehicle,
  Driver,
  Route,
  DispatchMatchResult,
  TemperatureZone,
  LoadingBatch,
  DeliveryTask,
} from '../../../shared/types';
import {
  WAREHOUSE_VEHICLE_ID,
  WAREHOUSE_DRIVER_ID,
} from './dispatch.constants';
import {
  checkTemperatureMatch,
  checkVehicleAvailableTime,
  checkVehicleTimeConflicts,
  checkDriverTimeConflicts,
} from './dispatch.validation';

export interface MatchingRepositories {
  findOrderById: (id: string) => Order | undefined;
  findVehicleById: (id: string) => Vehicle | undefined;
  findDriverById: (id: string) => Driver | undefined;
  findVehiclesByStatus: (status: 'active' | 'maintenance' | 'disabled') => Vehicle[];
  findDriversByStatus: (status: 'on_duty' | 'off_duty' | 'on_leave') => Driver[];
  findBatchesByVehicleId: (vehicleId: string) => LoadingBatch[];
  findActiveTasksByDriverId: (driverId: string) => DeliveryTask[];
}

export function calculateMatchScore(
  vehicle: Vehicle,
  driver: Driver,
  orders: Order[],
  scheduledTime: string,
  repos: Pick<MatchingRepositories, 'findBatchesByVehicleId' | 'findActiveTasksByDriverId'>
): { score: number; conflicts: string[] } {
  let score = 0;
  const conflicts: string[] = [];

  const requiredZones = [...new Set(orders.map(o => o.temperatureZone))];
  const totalWeight = orders.reduce((sum, o) => sum + o.weight, 0);

  if (checkTemperatureMatch(vehicle, requiredZones)) {
    score += 40;
  } else {
    conflicts.push(`车辆温区不匹配，需要 ${requiredZones.join(', ')}，车辆只有 ${vehicle.temperatureZones.join(', ')}`);
  }

  if (checkVehicleAvailableTime(vehicle, scheduledTime)) {
    score += 20;
  } else {
    conflicts.push(`车辆不可用时间：${vehicle.availableStartTime}-${vehicle.availableEndTime}`);
  }

  const vehicleConflicts = checkVehicleTimeConflicts(vehicle.id, scheduledTime, repos.findBatchesByVehicleId);
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

  const driverConflicts = checkDriverTimeConflicts(driver.id, scheduledTime, repos.findActiveTasksByDriverId);
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
}

export function findMatchingVehicles(
  orderIds: string[],
  scheduledTime: string,
  repos: MatchingRepositories
): DispatchMatchResult[] {
  const orders = orderIds
    .map(id => repos.findOrderById(id))
    .filter((o): o is Order => o !== undefined);

  if (orders.length === 0) {
    throw new Error('未找到有效的订单');
  }

  const requiredZones = [...new Set(orders.map(o => o.temperatureZone))];
  const totalWeight = orders.reduce((sum, o) => sum + o.weight, 0);

  const activeVehicles = repos.findVehiclesByStatus('active').filter(v =>
    v.id !== WAREHOUSE_VEHICLE_ID
  );
  const onDutyDrivers = repos.findDriversByStatus('on_duty').filter(d =>
    d.id !== WAREHOUSE_DRIVER_ID
  );

  const results: DispatchMatchResult[] = [];

  for (const vehicle of activeVehicles) {
    if (!checkTemperatureMatch(vehicle, requiredZones)) continue;
    if (vehicle.capacity < totalWeight) continue;
    if (!checkVehicleAvailableTime(vehicle, scheduledTime)) continue;

    const vehicleConflicts = checkVehicleTimeConflicts(vehicle.id, scheduledTime, repos.findBatchesByVehicleId);
    if (vehicleConflicts.length > 0) continue;

    let driver: Driver | undefined;
    if (vehicle.driverId) {
      driver = repos.findDriverById(vehicle.driverId);
    }

    if (!driver) {
      for (const d of onDutyDrivers) {
        const driverConflicts = checkDriverTimeConflicts(d.id, scheduledTime, repos.findActiveTasksByDriverId);
        if (driverConflicts.length === 0) {
          driver = d;
          break;
        }
      }
    }

    if (!driver) continue;

    const driverConflicts = checkDriverTimeConflicts(driver.id, scheduledTime, repos.findActiveTasksByDriverId);
    if (driverConflicts.length > 0) continue;

    const { score, conflicts } = calculateMatchScore(vehicle, driver, orders, scheduledTime, repos);

    results.push({
      vehicleId: vehicle.id,
      plateNo: vehicle.plateNo,
      driverId: driver.id,
      driverName: driver.name,
      temperatureMatch: checkTemperatureMatch(vehicle, requiredZones),
      timeAvailable: checkVehicleAvailableTime(vehicle, scheduledTime),
      conflicts,
      score,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

export function calculateRouteMatchScore(route: Route, orders: Order[]): number {
  let score = 0;
  const orderAddresses = orders.map(o => o.deliveryAddress);
  const routeAddresses = route.stops.map(s => s.address);

  for (const orderAddr of orderAddresses) {
    const isMatched = routeAddresses.some(
      rAddr => rAddr.includes(orderAddr) || orderAddr.includes(rAddr)
    );
    if (isMatched) {
      score += Math.floor(100 / orders.length);
    }
  }

  return Math.min(score, 100);
}
