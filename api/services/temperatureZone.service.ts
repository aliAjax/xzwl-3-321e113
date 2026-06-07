import { orderRepository } from '../repositories/order.repository';
import { vehicleRepository } from '../repositories/vehicle.repository';
import { taskRepository } from '../repositories/task.repository';
import { nodeRepository } from '../repositories/node.repository';
import type {
  TemperatureZone,
  TemperatureZoneSummary,
  TemperatureZoneStats,
  TemperatureZoneAbnormalRecord,
} from '../../shared/types';

const ZONES: TemperatureZone[] = ['frozen', 'chilled', 'ambient'];
const VIRTUAL_VEHICLE_TYPE = '虚拟车辆';

function isRealVehicle(vehicle: { vehicleType: string; status: string }): boolean {
  return vehicle.status === 'active' && vehicle.vehicleType !== VIRTUAL_VEHICLE_TYPE;
}

function getZoneStats(zone: TemperatureZone): TemperatureZoneStats {
  const pendingOrders = orderRepository
    .findByTemperatureZone(zone)
    .filter((o) => o.status === 'created' || o.status === 'warehoused').length;

  const inTransitOrders = orderRepository
    .findByTemperatureZone(zone)
    .filter((o) => o.status === 'in_transit').length;

  const availableVehicles = vehicleRepository
    .findByTemperatureZone(zone)
    .filter(isRealVehicle).length;

  return {
    pendingOrders,
    inTransitOrders,
    availableVehicles,
  };
}

function getRecentAbnormalRecords(limit: number = 10): TemperatureZoneAbnormalRecord[] {
  const recentNodes = nodeRepository
    .findAll()
    .filter((n) => n.temperature !== undefined && n.temperature !== null)
    .sort(
      (a, b) =>
        new Date(b.recordedAt || b.createdAt).getTime() -
        new Date(a.recordedAt || a.createdAt).getTime()
    );

  const abnormalRecords: TemperatureZoneAbnormalRecord[] = [];

  for (const node of recentNodes) {
    if (node.temperature === undefined || node.temperature === null) continue;

    const task = taskRepository.findById(node.taskId);
    if (!task) continue;

    const order = orderRepository.findById(task.orderId);
    if (!order) continue;

    const isAbnormal =
      node.temperature < order.minTemp || node.temperature > order.maxTemp;

    if (isAbnormal || node.status === 'exception') {
      abnormalRecords.push({
        id: node.id,
        orderId: order.id,
        orderNo: order.orderNo,
        temperatureZone: order.temperatureZone,
        temperature: node.temperature,
        minTemp: order.minTemp,
        maxTemp: order.maxTemp,
        recordedAt: node.recordedAt || node.createdAt,
        locationText: node.locationText,
        operatorName: node.operatorName,
        exceptionDescription: node.exceptionDescription,
      });
    }

    if (abnormalRecords.length >= limit) break;
  }

  return abnormalRecords;
}

export const temperatureZoneService = {
  getSummary(): TemperatureZoneSummary {
    return {
      frozen: getZoneStats('frozen'),
      chilled: getZoneStats('chilled'),
      ambient: getZoneStats('ambient'),
      recentAbnormalRecords: getRecentAbnormalRecords(10),
    };
  },

  getZoneSummaryByZone(zone: TemperatureZone): TemperatureZoneStats {
    return getZoneStats(zone);
  },

  getAbnormalRecords(limit: number = 10): TemperatureZoneAbnormalRecord[] {
    return getRecentAbnormalRecords(limit);
  },

  getZoneOrders(zone: TemperatureZone) {
    const orders = orderRepository
      .findByTemperatureZone(zone);
    const orderIds = orders.map((o) => o.id);

    const tasks = taskRepository.findAll().filter((t) => orderIds.includes(t.orderId));

    return {
      orders,
      tasks,
    };
  },

  getZoneVehicles(zone: TemperatureZone) {
    return vehicleRepository.findByTemperatureZone(zone).filter(isRealVehicle);
  },
};
