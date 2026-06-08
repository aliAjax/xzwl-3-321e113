import { orderRepository } from '../repositories/order.repository';
import { vehicleRepository } from '../repositories/vehicle.repository';
import { driverRepository } from '../repositories/driver.repository';
import { routeRepository } from '../repositories/route.repository';
import { batchRepository } from '../repositories/batch.repository';
import { taskRepository } from '../repositories/task.repository';
import { nodeRepository } from '../repositories/node.repository';
import type {
  DispatchRequest,
  DispatchPreviewRequest,
  DispatchSandboxGenerateRequest,
  LoadingBatch,
  DeliveryTask,
} from '../../shared/types';
import {
  WAREHOUSE_VEHICLE_ID,
  WAREHOUSE_DRIVER_ID,
  isWarehouseBatch,
  isWarehouseTask,
  checkVehicleAvailableTime,
  checkTemperatureMatch,
  checkVehicleTimeConflicts,
  checkDriverTimeConflicts,
  validateDispatchRequest,
  calculateMatchScore,
  findMatchingVehicles,
  calculateRouteMatchScore,
  previewDispatch,
  createDeliveryTasks as createDeliveryTasksImpl,
  cancelDispatch as cancelDispatchImpl,
  generateSandboxPlans as generateSandboxPlansImpl,
  getSandboxPlanDetail as getSandboxPlanDetailImpl,
} from './dispatch';

const validationRepos = {
  findOrderById: (id: string) => orderRepository.findById(id),
  findVehicleById: (id: string) => vehicleRepository.findById(id),
  findDriverById: (id: string) => driverRepository.findById(id),
  findRouteById: (id: string) => routeRepository.findById(id),
  findBatchesByVehicleId: (vehicleId: string) => batchRepository.findByVehicleId(vehicleId),
  findActiveTasksByDriverId: (driverId: string) => taskRepository.findActiveTasksByDriverId(driverId),
};

const matchingRepos = {
  ...validationRepos,
  findVehiclesByStatus: (status: 'active' | 'maintenance' | 'disabled') => vehicleRepository.findByStatus(status),
  findDriversByStatus: (status: 'on_duty' | 'off_duty' | 'on_leave') => driverRepository.findByStatus(status),
};

const previewRepos = {
  ...matchingRepos,
  findOrderByIdWithCustomer: (id: string) => orderRepository.findByIdWithCustomer(id),
};

const writerRepos = {
  ...validationRepos,
  createBatch: (data: Parameters<typeof batchRepository.create>[0]) => batchRepository.create(data),
  updateBatchStatus: (id: string, status: LoadingBatch['status']) => batchRepository.updateStatus(id, status),
  removeOrderIdFromBatch: (batchId: string, orderId: string) => batchRepository.removeOrderId(batchId, orderId),
  findBatchById: (id: string) => batchRepository.findById(id),
  createTask: (data: Parameters<typeof taskRepository.create>[0]) => taskRepository.create(data),
  updateTask: (id: string, data: Partial<Omit<DeliveryTask, 'id' | 'createdAt'>>) => taskRepository.updateTask(id, data),
  findTaskByOrderId: (orderId: string) => taskRepository.findByOrderId(orderId),
  findTasksByBatchId: (batchId: string) => taskRepository.findByBatchId(batchId),
  updateTaskStatus: (id: string, status: DeliveryTask['status']) => taskRepository.updateStatus(id, status),
  updateOrderStatus: (id: string, status: Parameters<typeof orderRepository.updateStatus>[1]) => orderRepository.updateStatus(id, status),
  createNode: (data: Parameters<typeof nodeRepository.createNode>[0]) => nodeRepository.createNode(data),
  findNodeByTaskIdAndNodeType: (taskId: string, nodeType: Parameters<typeof nodeRepository.findByTaskIdAndNodeType>[1]) => nodeRepository.findByTaskIdAndNodeType(taskId, nodeType),
};

const sandboxRepos = {
  ...previewRepos,
  findAllRoutes: () => routeRepository.findAll(),
};

export const dispatchService = {
  checkVehicleAvailableTime(vehicle: Parameters<typeof checkVehicleAvailableTime>[0], scheduledTime: string) {
    return checkVehicleAvailableTime(vehicle, scheduledTime);
  },

  checkTemperatureMatch(vehicle: Parameters<typeof checkTemperatureMatch>[0], requiredZones: Parameters<typeof checkTemperatureMatch>[1]) {
    return checkTemperatureMatch(vehicle, requiredZones);
  },

  checkVehicleTimeConflicts(vehicleId: string, scheduledTime: string) {
    return checkVehicleTimeConflicts(vehicleId, scheduledTime, validationRepos.findBatchesByVehicleId);
  },

  checkDriverTimeConflicts(driverId: string, scheduledTime: string) {
    return checkDriverTimeConflicts(driverId, scheduledTime, validationRepos.findActiveTasksByDriverId);
  },

  calculateMatchScore(
    vehicle: Parameters<typeof calculateMatchScore>[0],
    driver: Parameters<typeof calculateMatchScore>[1],
    orders: Parameters<typeof calculateMatchScore>[2],
    scheduledTime: string
  ) {
    return calculateMatchScore(vehicle, driver, orders, scheduledTime, matchingRepos);
  },

  findMatchingVehicles(orderIds: string[], scheduledTime: string) {
    return findMatchingVehicles(orderIds, scheduledTime, matchingRepos);
  },

  validateDispatchRequest(request: DispatchRequest) {
    return validateDispatchRequest(request, validationRepos);
  },

  createDeliveryTasks(request: DispatchRequest) {
    return createDeliveryTasksImpl(request, writerRepos);
  },

  previewDispatch(request: DispatchPreviewRequest) {
    return previewDispatch(request, previewRepos);
  },

  cancelDispatch(batchId: string) {
    return cancelDispatchImpl(batchId, writerRepos);
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

  generateSandboxPlans(request: DispatchSandboxGenerateRequest) {
    return generateSandboxPlansImpl(request, sandboxRepos);
  },

  calculateRouteMatchScore(route: Parameters<typeof calculateRouteMatchScore>[0], orders: Parameters<typeof calculateRouteMatchScore>[1]) {
    return calculateRouteMatchScore(route, orders);
  },

  getSandboxPlanDetail(
    orderIds: string[],
    vehicleId: string,
    driverId: string,
    routeId: string,
    scheduledDepartureTime: string,
    planId: string,
    planName: string
  ) {
    return getSandboxPlanDetailImpl(
      orderIds,
      vehicleId,
      driverId,
      routeId,
      scheduledDepartureTime,
      planId,
      planName,
      sandboxRepos
    );
  },
};

export {
  WAREHOUSE_VEHICLE_ID,
  WAREHOUSE_DRIVER_ID,
  isWarehouseBatch,
  isWarehouseTask,
};
