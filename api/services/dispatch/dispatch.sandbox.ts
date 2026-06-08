import type {
  Order,
  Vehicle,
  Driver,
  Route,
  DispatchSandboxGenerateRequest,
  DispatchSandboxResult,
  DispatchSandboxPlan,
  DispatchSandboxPlanDetail,
  DispatchSandboxFilteredOrder,
  DispatchPreviewRequest,
} from '../../../shared/types';
import {
  WAREHOUSE_VEHICLE_ID,
  WAREHOUSE_DRIVER_ID,
} from './dispatch.constants';
import { MatchingRepositories, calculateMatchScore, findMatchingVehicles, calculateRouteMatchScore } from './dispatch.matching';
import { PreviewRepositories, previewDispatch } from './dispatch.preview';
import { checkTemperatureMatch } from './dispatch.validation';

export interface SandboxRepositories extends MatchingRepositories, PreviewRepositories {
  findAllRoutes: () => Route[];
}

export function generateSandboxPlans(
  request: DispatchSandboxGenerateRequest,
  repos: SandboxRepositories
): DispatchSandboxResult {
  const { orderIds, scheduledDepartureTime, maxPlans = 10 } = request;

  const allOrders = orderIds
    .map(id => repos.findOrderById(id))
    .filter((o): o is Order => o !== undefined);

  if (allOrders.length === 0) {
    throw new Error('未找到有效的订单');
  }

  const dispatchableOrders = allOrders.filter(o => ['created', 'warehoused'].includes(o.status));
  const nonDispatchableOrders = allOrders.filter(o => !['created', 'warehoused'].includes(o.status));

  if (dispatchableOrders.length === 0) {
    const orderNos = nonDispatchableOrders.map(o => `${o.orderNo}(${o.status})`).join(', ');
    throw new Error(`没有可调度的订单，以下订单状态不正确：${orderNos}。需要状态为 created 或 warehoused。`);
  }

  const orders = dispatchableOrders;
  const dispatchableOrderIds = dispatchableOrders.map(o => o.id);

  const totalWeight = orders.reduce((sum, o) => sum + o.weight, 0);
  const totalQuantity = orders.reduce((sum, o) => sum + o.quantity, 0);
  const requiredZones = [...new Set(orders.map(o => o.temperatureZone))];

  const activeVehicles = repos.findVehiclesByStatus('active').filter(v =>
    v.id !== WAREHOUSE_VEHICLE_ID
  );
  const onDutyDrivers = repos.findDriversByStatus('on_duty').filter(d =>
    d.id !== WAREHOUSE_DRIVER_ID
  );
  const allRoutes = repos.findAllRoutes();

  const scheduledTime = scheduledDepartureTime || new Date().toISOString();

  const filteredOrders: DispatchSandboxFilteredOrder[] = nonDispatchableOrders.map(o => ({
    id: o.id,
    orderNo: o.orderNo,
    status: o.status,
    reason: `订单状态为 ${o.status}，需要为 created 或 warehoused`,
  }));

  const plans: DispatchSandboxPlan[] = [];
  let planIndex = 0;

  const matchResults = findMatchingVehicles(dispatchableOrderIds, scheduledTime, repos);

  for (const match of matchResults) {
    const vehicle = activeVehicles.find(v => v.id === match.vehicleId);
    const driver = onDutyDrivers.find(d => d.id === match.driverId);
    if (!vehicle || !driver) continue;

    for (const route of allRoutes) {
      if (plans.length >= maxPlans) break;

      try {
        const previewRequest: DispatchPreviewRequest = {
          orderIds: dispatchableOrderIds,
          vehicleId: vehicle.id,
          driverId: driver.id,
          routeId: route.id,
          scheduledDepartureTime: scheduledTime,
        };

        const preview = previewDispatch(previewRequest, repos);

        const { score: matchScore } = calculateMatchScore(
          vehicle,
          driver,
          orders,
          scheduledTime,
          repos
        );

        const routeScore = calculateRouteMatchScore(route, orders);
        const finalScore = Math.round((matchScore * 0.7) + (routeScore * 0.3));

        planIndex++;
        plans.push({
          planId: `plan-${Date.now()}-${planIndex}`,
          planName: `方案 ${planIndex}`,
          vehicleId: vehicle.id,
          plateNo: vehicle.plateNo,
          vehicleType: vehicle.vehicleType,
          driverId: driver.id,
          driverName: driver.name,
          routeId: route.id,
          routeName: route.name,
          totalWeight: preview.totalWeight,
          totalQuantity: preview.totalQuantity,
          vehicleCapacity: vehicle.capacity,
          vehicleCapacityUsed: preview.vehicleCapacityUsed,
          vehicleCapacityPercent: preview.vehicleCapacityPercent,
          temperatureZones: preview.temperatureZones,
          vehicleTemperatureZones: vehicle.temperatureZones,
          temperatureMatch: match.temperatureMatch,
          stopCount: route.stops.length,
          estimatedDurationMinutes: preview.estimatedDurationMinutes,
          estimatedArrivalTime: preview.estimatedArrivalTime,
          scheduledDepartureTime: scheduledTime,
          conflictCount: preview.conflicts.length,
          warningCount: preview.warnings.length,
          score: finalScore,
          canDispatch: preview.canDispatch,
          conflicts: preview.conflicts,
        });
      } catch {
        continue;
      }
    }

    if (plans.length >= maxPlans) break;
  }

  if (plans.length === 0) {
    for (const vehicle of activeVehicles.slice(0, 3)) {
      for (const driver of onDutyDrivers.slice(0, 2)) {
        for (const route of allRoutes.slice(0, 2)) {
          if (plans.length >= maxPlans) break;

          try {
            const previewRequest: DispatchPreviewRequest = {
              orderIds: dispatchableOrderIds,
              vehicleId: vehicle.id,
              driverId: driver.id,
              routeId: route.id,
              scheduledDepartureTime: scheduledTime,
            };

            const preview = previewDispatch(previewRequest, repos);
            const { score: matchScore } = calculateMatchScore(
              vehicle,
              driver,
              orders,
              scheduledTime,
              repos
            );
            const routeScore = calculateRouteMatchScore(route, orders);
            const finalScore = Math.round((matchScore * 0.7) + (routeScore * 0.3));

            planIndex++;
            plans.push({
              planId: `plan-${Date.now()}-${planIndex}`,
              planName: `方案 ${planIndex}`,
              vehicleId: vehicle.id,
              plateNo: vehicle.plateNo,
              vehicleType: vehicle.vehicleType,
              driverId: driver.id,
              driverName: driver.name,
              routeId: route.id,
              routeName: route.name,
              totalWeight: preview.totalWeight,
              totalQuantity: preview.totalQuantity,
              vehicleCapacity: vehicle.capacity,
              vehicleCapacityUsed: preview.vehicleCapacityUsed,
              vehicleCapacityPercent: preview.vehicleCapacityPercent,
              temperatureZones: preview.temperatureZones,
              vehicleTemperatureZones: vehicle.temperatureZones,
              temperatureMatch: checkTemperatureMatch(vehicle, requiredZones),
              stopCount: route.stops.length,
              estimatedDurationMinutes: preview.estimatedDurationMinutes,
              estimatedArrivalTime: preview.estimatedArrivalTime,
              scheduledDepartureTime: scheduledTime,
              conflictCount: preview.conflicts.length,
              warningCount: preview.warnings.length,
              score: finalScore,
              canDispatch: preview.canDispatch,
              conflicts: preview.conflicts,
            });
          } catch {
            continue;
          }
        }
      }
    }
  }

  plans.sort((a, b) => {
    if (a.canDispatch !== b.canDispatch) return a.canDispatch ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.conflictCount - b.conflictCount;
  });

  plans.forEach((plan, index) => {
    plan.planName = `方案 ${index + 1}`;
  });

  return {
    totalOrders: allOrders.length,
    dispatchableOrders: dispatchableOrders.length,
    totalWeight,
    totalQuantity,
    requiredTemperatureZones: requiredZones,
    filteredOrders,
    plans,
  };
}

export function getSandboxPlanDetail(
  orderIds: string[],
  vehicleId: string,
  driverId: string,
  routeId: string,
  scheduledDepartureTime: string,
  planId: string,
  planName: string,
  repos: SandboxRepositories
): DispatchSandboxPlanDetail {
  const allOrders = orderIds
    .map(id => repos.findOrderById(id))
    .filter((o): o is Order => o !== undefined);

  const dispatchableOrders = allOrders.filter(o => ['created', 'warehoused'].includes(o.status));
  const dispatchableOrderIds = dispatchableOrders.map(o => o.id);

  const previewRequest: DispatchPreviewRequest = {
    orderIds: dispatchableOrderIds,
    vehicleId,
    driverId,
    routeId,
    scheduledDepartureTime,
  };

  const preview = previewDispatch(previewRequest, repos);
  const vehicle = repos.findVehicleById(vehicleId);
  const driver = repos.findDriverById(driverId);
  const route = repos.findRouteById(routeId) as Route | undefined;

  const orders = dispatchableOrders;

  const { score } = calculateMatchScore(
    vehicle!,
    driver!,
    orders,
    scheduledDepartureTime,
    repos
  );

  return {
    ...preview,
    planId,
    planName,
    score,
    route: route ? {
      id: route.id,
      name: route.name,
      stopCount: route.stops.length,
      stops: route.stops,
    } : null,
  };
}
