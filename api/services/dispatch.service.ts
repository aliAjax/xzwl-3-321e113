import { orderRepository } from '../repositories/order.repository';
import { vehicleRepository } from '../repositories/vehicle.repository';
import { driverRepository } from '../repositories/driver.repository';
import { routeRepository } from '../repositories/route.repository';
import { batchRepository } from '../repositories/batch.repository';
import { taskRepository } from '../repositories/task.repository';
import { nodeRepository } from '../repositories/node.repository';
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
  DispatchPreviewRequest,
  DispatchPreviewResult,
  DispatchPreviewConflict,
  DispatchPreviewSuggestion,
  DispatchPreviewOrder,
  DispatchSandboxGenerateRequest,
  DispatchSandboxResult,
  DispatchSandboxPlan,
  DispatchSandboxPlanDetail,
  DispatchSandboxFilteredOrder,
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

const WAREHOUSE_VEHICLE_ID = 'veh-warehouse';
const WAREHOUSE_DRIVER_ID = 'drv-warehouse';
const WAREHOUSE_BATCH_PREFIX = 'WH';

function isWarehouseBatch(batch?: LoadingBatch): boolean {
  return Boolean(batch?.batchNo?.startsWith(WAREHOUSE_BATCH_PREFIX));
}

function isWarehouseTask(task: DeliveryTask): boolean {
  if (task.driverId === WAREHOUSE_DRIVER_ID || task.vehicleId === WAREHOUSE_VEHICLE_ID) {
    return true;
  }

  return isWarehouseBatch(batchRepository.findById(task.batchId));
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
      ['created', 'loading', 'departed'].includes(b.status) && !isWarehouseBatch(b)
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

    const activeTasks = taskRepository.findActiveTasksByDriverId(driverId).filter(t => !isWarehouseTask(t));

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

    const activeVehicles = vehicleRepository.findByStatus('active').filter(v =>
      v.id !== WAREHOUSE_VEHICLE_ID
    );
    const onDutyDrivers = driverRepository.findByStatus('on_duty').filter(d =>
      d.id !== WAREHOUSE_DRIVER_ID
    );

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
      if (vehicle.id === WAREHOUSE_VEHICLE_ID) {
        errors.push('不能使用入仓专用车辆进行正式调度');
      }
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
      if (driver.id === WAREHOUSE_DRIVER_ID) {
        errors.push('不能使用入仓专用司机进行正式调度');
      }
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
      let task: DeliveryTask | undefined;

      const existingTask = taskRepository.findByOrderId(order.id);

      if (existingTask) {
        if (existingTask.batchId !== batchId) {
          batchRepository.removeOrderId(existingTask.batchId, order.id);
          const oldBatch = batchRepository.findById(existingTask.batchId);
          if (oldBatch && oldBatch.orderIds.length === 0) {
            batchRepository.updateStatus(oldBatch.id, 'completed');
          }
        }

        task = taskRepository.updateTask(existingTask.id, {
          batchId,
          driverId: request.driverId,
          vehicleId: request.vehicleId,
          status: 'warehoused',
        });

        const existingWarehouseInNode = nodeRepository.findByTaskIdAndNodeType(existingTask.id, 'warehouse_in');
        if (!existingWarehouseInNode) {
          const nodeId = generateId();
          nodeRepository.createNode({
            id: nodeId,
            taskId: existingTask.id,
            nodeType: 'warehouse_in',
            nodeName: '入仓登记',
            status: 'completed',
            recordedAt: now,
            locationText: '仓库',
            operatorId: '',
            operatorName: '系统',
            createdAt: now,
          });
        }
      } else {
        const taskId = generateId();
        task = taskRepository.create({
          id: taskId,
          batchId,
          orderId: order.id,
          driverId: request.driverId,
          vehicleId: request.vehicleId,
          status: 'warehoused',
          createdAt: now,
        });

        const nodeId = generateId();
        nodeRepository.createNode({
          id: nodeId,
          taskId: taskId,
          nodeType: 'warehouse_in',
          nodeName: '入仓登记',
          status: 'completed',
          recordedAt: now,
          locationText: '仓库',
          operatorId: '',
          operatorName: '系统',
          createdAt: now,
        });
      }

      if (task) {
        tasks.push(task);
      }

      if (order.status !== 'warehoused') {
        orderRepository.updateStatus(order.id, 'warehoused');
      }
    }

    return { batch, tasks };
  },

  previewDispatch(request: DispatchPreviewRequest): DispatchPreviewResult {
    const conflicts: DispatchPreviewConflict[] = [];
    const suggestions: DispatchPreviewSuggestion[] = [];
    const warnings: string[] = [];

    const validation = this.validateDispatchRequest(request);
    const canDispatch = validation.valid;

    const errorMessageMap: Record<string, { type: DispatchPreviewConflict['type']; severity: 'error' | 'warning' }> = {
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

    function getConflictType(message: string): { type: DispatchPreviewConflict['type']; severity: 'error' | 'warning' } {
      for (const [key, value] of Object.entries(errorMessageMap)) {
        if (message.includes(key)) {
          return value;
        }
      }
      return { type: 'order', severity: 'error' };
    }

    for (const error of validation.errors) {
      const { type, severity } = getConflictType(error);
      conflicts.push({ type, severity, message: error });
    }

    const orders = request.orderIds
      .map(id => orderRepository.findByIdWithCustomer(id))
      .filter((o): o is Order => o !== undefined);

    const vehicle = vehicleRepository.findById(request.vehicleId);
    const driver = driverRepository.findById(request.driverId);
    const route = routeRepository.findById(request.routeId);

    if (vehicle && orders.length > 0) {
      const requiredZones = [...new Set(orders.map(o => o.temperatureZone))];
      const totalWeight = orders.reduce((sum, o) => sum + o.weight, 0);

      if (!this.checkTemperatureMatch(vehicle, requiredZones)) {
        const altVehicles = vehicleRepository
          .findByStatus('active')
          .filter(v =>
            v.id !== WAREHOUSE_VEHICLE_ID &&
            this.checkTemperatureMatch(v, requiredZones)
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
        const largerVehicles = vehicleRepository
          .findByStatus('active')
          .filter(v =>
            v.id !== WAREHOUSE_VEHICLE_ID &&
            v.capacity >= totalWeight &&
            this.checkTemperatureMatch(v, requiredZones)
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

      if (!this.checkVehicleAvailableTime(vehicle, request.scheduledDepartureTime)) {
        suggestions.push({
          type: 'adjust_time',
          priority: 4,
          message: `请将发车时间调整至车辆可用时段 ${vehicle.availableStartTime}-${vehicle.availableEndTime} 内`,
        });
      }
    }

    if (driver && driver.status !== 'on_duty') {
      const altDrivers = driverRepository.findByStatus('on_duty').filter(
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
      suggestions.push({
        type: 'alternative_driver',
        priority: 6,
        message: `该车辆的固定司机为 ${driverRepository.findById(vehicle.driverId)?.name || '未知'}，建议优先使用固定司机`,
        details: { driverId: vehicle.driverId },
      });
    }

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

    const totalWeight = orders.reduce((sum, o) => sum + o.weight, 0);
    const totalQuantity = orders.reduce((sum, o) => sum + o.quantity, 0);
    const temperatureZones = [...new Set(orders.map(o => o.temperatureZone))];
    const estimatedDurationMinutes = route ? route.stops.reduce((sum, s) => sum + s.estimatedTime, 0) : 0;

    const departureTime = new Date(request.scheduledDepartureTime);
    const estimatedArrivalTime = new Date(departureTime.getTime() + estimatedDurationMinutes * 60000).toISOString();

    const vehicleCapacityUsed = totalWeight;
    const vehicleCapacityPercent = vehicle ? (totalWeight / vehicle.capacity) * 100 : 0;

    if (vehicle && vehicleCapacityPercent >= 90 && vehicleCapacityPercent <= 100) {
      warnings.push(`车辆容量使用率已达 ${vehicleCapacityPercent.toFixed(1)}%，接近满载`);
    }

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

    suggestions.sort((a, b) => a.priority - b.priority);

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

  generateSandboxPlans(request: DispatchSandboxGenerateRequest): DispatchSandboxResult {
    const { orderIds, scheduledDepartureTime, maxPlans = 10 } = request;

    const allOrders = orderIds
      .map(id => orderRepository.findById(id))
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

    const activeVehicles = vehicleRepository.findByStatus('active').filter(v =>
      v.id !== WAREHOUSE_VEHICLE_ID
    );
    const onDutyDrivers = driverRepository.findByStatus('on_duty').filter(d =>
      d.id !== WAREHOUSE_DRIVER_ID
    );
    const allRoutes = routeRepository.findAll();

    const scheduledTime = scheduledDepartureTime || new Date().toISOString();

    const filteredOrders: DispatchSandboxFilteredOrder[] = nonDispatchableOrders.map(o => ({
      id: o.id,
      orderNo: o.orderNo,
      status: o.status,
      reason: `订单状态为 ${o.status}，需要为 created 或 warehoused`,
    }));

    const plans: DispatchSandboxPlan[] = [];
    let planIndex = 0;

    const matchResults = this.findMatchingVehicles(dispatchableOrderIds, scheduledTime);

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

          const preview = this.previewDispatch(previewRequest);

          const { score: matchScore } = this.calculateMatchScore(
            vehicle,
            driver,
            orders,
            scheduledTime
          );

          const routeScore = this.calculateRouteMatchScore(route, orders);
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

              const preview = this.previewDispatch(previewRequest);
              const { score: matchScore } = this.calculateMatchScore(
                vehicle,
                driver,
                orders,
                scheduledTime
              );
              const routeScore = this.calculateRouteMatchScore(route, orders);
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
                temperatureMatch: this.checkTemperatureMatch(vehicle, requiredZones),
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
  },

  calculateRouteMatchScore(route: Route, orders: Order[]): number {
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
  },

  getSandboxPlanDetail(
    orderIds: string[],
    vehicleId: string,
    driverId: string,
    routeId: string,
    scheduledDepartureTime: string,
    planId: string,
    planName: string
  ): DispatchSandboxPlanDetail {
    const allOrders = orderIds
      .map(id => orderRepository.findById(id))
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

    const preview = this.previewDispatch(previewRequest);
    const vehicle = vehicleRepository.findById(vehicleId);
    const driver = driverRepository.findById(driverId);
    const route = routeRepository.findById(routeId);

    const orders = dispatchableOrders;

    const { score } = this.calculateMatchScore(
      vehicle!,
      driver!,
      orders,
      scheduledDepartureTime
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
  },
};
