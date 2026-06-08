import type {
  Order,
  Vehicle,
  Driver,
  Route,
  DispatchPreviewRequest,
  DispatchPreviewResult,
  DispatchPreviewConflict,
  DispatchPreviewSuggestion,
  DispatchPreviewOrder,
  TemperatureZone,
} from '../../../shared/types';
import {
  WAREHOUSE_VEHICLE_ID,
  WAREHOUSE_DRIVER_ID,
} from './dispatch.constants';
import {
  checkTemperatureMatch,
  checkVehicleAvailableTime,
  validateDispatchRequest,
  ValidationRepositories,
} from './dispatch.validation';

export interface PreviewRepositories extends ValidationRepositories {
  findOrderByIdWithCustomer: (id: string) => Order | undefined;
  findVehiclesByStatus: (status: 'active' | 'maintenance' | 'disabled') => Vehicle[];
  findDriversByStatus: (status: 'on_duty' | 'off_duty' | 'on_leave') => Driver[];
}

const ERROR_MESSAGE_MAP: Record<string, { type: DispatchPreviewConflict['type']; severity: 'error' | 'warning' }> = {
  '订单不存在': { type: 'order', severity: 'error' },
  '部分订单不存在': { type: 'order', severity: 'error' },
  '订单状态': { type: 'order', severity: 'error' },
  '车辆不存在': { type: 'vehicle', severity: 'error' },
  '入仓专用车辆': { type: 'vehicle', severity: 'error' },
  '车辆状态': { type: 'vehicle', severity: 'error' },
  '温区不匹配': { type: 'temperature', severity: 'error' },
  '载重不足': { type: 'capacity', severity: 'error' },
  '不可用时间': { type: 'time', severity: 'error' },
  '已有批次': { type: 'vehicle', severity: 'error' },
  '已有调度任务': { type: 'vehicle', severity: 'error' },
  '司机不存在': { type: 'driver', severity: 'error' },
  '入仓专用司机': { type: 'driver', severity: 'error' },
  '司机状态': { type: 'driver', severity: 'error' },
  '已有配送任务': { type: 'driver', severity: 'error' },
  '线路不存在': { type: 'route', severity: 'error' },
  '至少选择一个订单': { type: 'order', severity: 'error' },
};

export function classifyConflict(message: string): { type: DispatchPreviewConflict['type']; severity: 'error' | 'warning' } {
  for (const [key, value] of Object.entries(ERROR_MESSAGE_MAP)) {
    if (message.includes(key)) {
      return value;
    }
  }
  return { type: 'order', severity: 'error' };
}

export function generateSuggestions(
  orders: Order[],
  vehicle: Vehicle | undefined,
  driver: Driver | undefined,
  route: Route | undefined,
  scheduledDepartureTime: string,
  repos: PreviewRepositories
): DispatchPreviewSuggestion[] {
  const suggestions: DispatchPreviewSuggestion[] = [];

  if (vehicle && orders.length > 0) {
    const requiredZones = [...new Set(orders.map(o => o.temperatureZone))];
    const totalWeight = orders.reduce((sum, o) => sum + o.weight, 0);

    if (!checkTemperatureMatch(vehicle, requiredZones)) {
      const altVehicles = repos
        .findVehiclesByStatus('active')
        .filter(v =>
          v.id !== WAREHOUSE_VEHICLE_ID &&
          checkTemperatureMatch(v, requiredZones)
        );
      if (altVehicles.length > 0) {
        suggestions.push({
          type: 'alternative_vehicle',
          priority: 1,
          message: `推荐以下温区匹配的车辆：${altVehicles.map(v => v.plateNo).join(', ')}`,
          details: { vehicleIds: altVehicles.map(v => v.id) },
        });
      }
    }

    if (vehicle.capacity < totalWeight) {
      const largerVehicles = repos
        .findVehiclesByStatus('active')
        .filter(v =>
          v.id !== WAREHOUSE_VEHICLE_ID &&
          v.capacity >= totalWeight &&
          checkTemperatureMatch(v, requiredZones)
        );
      if (largerVehicles.length > 0) {
        suggestions.push({
          type: 'alternative_vehicle',
          priority: 2,
          message: `推荐以下载重足够的车辆：${largerVehicles.map(v => `${v.plateNo}(${v.capacity}kg)`).join(', ')}`,
          details: { vehicleIds: largerVehicles.map(v => v.id) },
        });
      } else {
        suggestions.push({
          type: 'split_batch',
          priority: 3,
          message: '建议将订单拆分为多个批次配送',
        });
      }
    }

    if (!checkVehicleAvailableTime(vehicle, scheduledDepartureTime)) {
      suggestions.push({
        type: 'adjust_time',
        priority: 4,
        message: `请将发车时间调整至车辆可用时段 ${vehicle.availableStartTime}-${vehicle.availableEndTime} 内`,
      });
    }
  }

  if (driver && driver.status !== 'on_duty') {
    const altDrivers = repos.findDriversByStatus('on_duty').filter(
      d => d.id !== WAREHOUSE_DRIVER_ID
    );
    if (altDrivers.length > 0) {
      suggestions.push({
        type: 'alternative_driver',
        priority: 5,
        message: `推荐以下在岗司机：${altDrivers.map(d => d.name).join(', ')}`,
        details: { driverIds: altDrivers.map(d => d.id) },
      });
    }
  }

  if (vehicle && driver && vehicle.driverId && vehicle.driverId !== driver.id) {
    const fixedDriver = repos.findDriverById(vehicle.driverId);
    suggestions.push({
      type: 'alternative_driver',
      priority: 6,
      message: `该车辆的固定司机为 ${fixedDriver?.name || '未知'}，建议优先使用固定司机`,
      details: { driverId: vehicle.driverId },
    });
  }

  return suggestions.sort((a, b) => a.priority - b.priority);
}

export function generateWarnings(
  orders: Order[],
  vehicle: Vehicle | undefined,
  route: Route | undefined
): string[] {
  const warnings: string[] = [];

  if (route && orders.length > 0) {
    const orderAddresses = orders.map(o => o.deliveryAddress);
    const routeAddresses = route.stops.map(s => s.address);
    const unmatchedAddresses = orderAddresses.filter(
      addr => !routeAddresses.some(rAddr => rAddr.includes(addr) || addr.includes(rAddr))
    );
    if (unmatchedAddresses.length > 0 && route.stops.length > 0) {
      warnings.push(`部分订单配送地址可能不在所选线路覆盖范围内：${unmatchedAddresses.slice(0, 3).join(', ')}${unmatchedAddresses.length > 3 ? '...' : ''}`);
    }
  }

  if (vehicle) {
    const totalWeight = orders.reduce((sum, o) => sum + o.weight, 0);
    const vehicleCapacityPercent = (totalWeight / vehicle.capacity) * 100;
    if (vehicleCapacityPercent >= 90 && vehicleCapacityPercent <= 100) {
      warnings.push(`车辆容量使用率已达 ${vehicleCapacityPercent.toFixed(1)}%，接近满载`);
    }
  }

  return warnings;
}

export function previewDispatch(
  request: DispatchPreviewRequest,
  repos: PreviewRepositories
): DispatchPreviewResult {
  const conflicts: DispatchPreviewConflict[] = [];

  const validation = validateDispatchRequest(request, repos);
  const canDispatch = validation.valid;

  for (const error of validation.errors) {
    const { type, severity } = classifyConflict(error);
    conflicts.push({ type, severity, message: error });
  }

  const orders = request.orderIds
    .map(id => repos.findOrderByIdWithCustomer(id))
    .filter((o): o is Order => o !== undefined);

  const vehicle = repos.findVehicleById(request.vehicleId);
  const driver = repos.findDriverById(request.driverId);
  const route = repos.findRouteById(request.routeId) as Route | undefined;

  const suggestions = generateSuggestions(orders, vehicle, driver, route, request.scheduledDepartureTime, repos);
  const warnings = generateWarnings(orders, vehicle, route);

  const totalWeight = orders.reduce((sum, o) => sum + o.weight, 0);
  const totalQuantity = orders.reduce((sum, o) => sum + o.quantity, 0);
  const temperatureZones = [...new Set(orders.map(o => o.temperatureZone))];
  const estimatedDurationMinutes = route ? route.stops.reduce((sum, s) => sum + s.estimatedTime, 0) : 0;

  const departureTime = new Date(request.scheduledDepartureTime);
  const estimatedArrivalTime = new Date(departureTime.getTime() + estimatedDurationMinutes * 60000).toISOString();

  const vehicleCapacityUsed = totalWeight;
  const vehicleCapacityPercent = vehicle ? (totalWeight / vehicle.capacity) * 100 : 0;

  const previewOrders: DispatchPreviewOrder[] = orders.map(order => ({
    id: order.id,
    orderNo: order.orderNo,
    goodsName: order.goodsName,
    quantity: order.quantity,
    weight: order.weight,
    temperatureZone: order.temperatureZone,
    deliveryAddress: order.deliveryAddress,
    customerName: order.customer?.name,
  }));

  return {
    canDispatch,
    totalWeight,
    totalQuantity,
    temperatureZones,
    estimatedDurationMinutes,
    estimatedArrivalTime,
    vehicleCapacityUsed,
    vehicleCapacityPercent: Math.round(vehicleCapacityPercent * 10) / 10,
    conflicts,
    suggestions,
    orders: previewOrders,
    vehicle: vehicle ? {
      id: vehicle.id,
      plateNo: vehicle.plateNo,
      vehicleType: vehicle.vehicleType,
      capacity: vehicle.capacity,
      temperatureZones: vehicle.temperatureZones,
      availableStartTime: vehicle.availableStartTime,
      availableEndTime: vehicle.availableEndTime,
    } : null,
    driver: driver ? {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      status: driver.status,
    } : null,
    route: route ? {
      id: route.id,
      name: route.name,
      stopCount: route.stops.length,
    } : null,
    scheduledDepartureTime: request.scheduledDepartureTime,
    warnings,
  };
}
