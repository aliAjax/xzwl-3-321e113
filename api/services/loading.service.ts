import { batchRepository } from '../repositories/batch.repository';
import { taskRepository } from '../repositories/task.repository';
import { orderRepository } from '../repositories/order.repository';
import { nodeRepository } from '../repositories/node.repository';
import { vehicleRepository } from '../repositories/vehicle.repository';
import { driverRepository } from '../repositories/driver.repository';
import type { LoadingBatch, DeliveryTask, Order, User } from '../../shared/types';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export const loadingService = {
  findAllBatches(options?: { limit?: number; offset?: number }): LoadingBatch[] {
    return batchRepository.findAll({ ...options, orderBy: 'createdAt', orderDir: 'DESC' });
  },

  findActiveBatches(): LoadingBatch[] {
    return batchRepository.findActiveBatches();
  },

  findBatchById(id: string): LoadingBatch | undefined {
    return batchRepository.findByIdWithDetails(id);
  },

  findBatchByNo(batchNo: string): LoadingBatch | undefined {
    return batchRepository.findByBatchNo(batchNo);
  },

  findBatchesByVehicleId(vehicleId: string): LoadingBatch[] {
    return batchRepository.findByVehicleId(vehicleId);
  },

  findBatchesByDriverId(driverId: string): LoadingBatch[] {
    return batchRepository.findByDriverId(driverId);
  },

  findBatchesByStatus(status: 'created' | 'loading' | 'departed' | 'completed'): LoadingBatch[] {
    return batchRepository.findByStatus(status);
  },

  findBatchesByDateRange(startDate: string, endDate: string): LoadingBatch[] {
    return batchRepository.findByDateRange(startDate, endDate);
  },

  getBatchWithDetails(batchId: string): {
    batch: LoadingBatch;
    tasks: DeliveryTask[];
    orders: Order[];
  } | undefined {
    const batch = batchRepository.findByIdWithDetails(batchId);
    if (!batch) return undefined;

    const tasks = taskRepository.findByBatchIdWithDetails(batchId);
    const orders = batch.orderIds
      .map(id => orderRepository.findByIdWithCustomer(id))
      .filter((o): o is Order => o !== undefined);

    return { batch, tasks, orders };
  },

  startLoading(batchId: string, operator: User): LoadingBatch | undefined {
    const batch = batchRepository.findById(batchId);
    if (!batch) {
      return undefined;
    }

    if (batch.status !== 'created') {
      throw new Error(`批次状态为 ${batch.status}，无法开始装车`);
    }

    const tasks = taskRepository.findByBatchId(batchId);
    const now = new Date().toISOString();

    for (const task of tasks) {
      const nodeId = generateId();
      nodeRepository.createNode({
        id: nodeId,
        taskId: task.id,
        nodeType: 'loading',
        nodeName: '装车作业',
        status: 'in_progress',
        locationText: '仓库',
        operatorId: operator.id,
        operatorName: operator.name,
        createdAt: now,
      });

      taskRepository.updateStatus(task.id, 'loading');
      orderRepository.updateStatus(task.orderId, 'loading');
    }

    return batchRepository.updateStatus(batchId, 'loading');
  },

  completeLoading(batchId: string, operator: User): LoadingBatch | undefined {
    const batch = batchRepository.findById(batchId);
    if (!batch) {
      return undefined;
    }

    if (batch.status !== 'loading') {
      throw new Error(`批次状态为 ${batch.status}，无法完成装车`);
    }

    const tasks = taskRepository.findByBatchId(batchId);
    const now = new Date().toISOString();

    for (const task of tasks) {
      const loadingNode = nodeRepository.findByTaskIdAndNodeType(task.id, 'loading');
      if (loadingNode) {
        nodeRepository.completeNode(loadingNode.id, {
          locationText: '仓库',
        });
      }

      const nodeId = generateId();
      nodeRepository.createNode({
        id: nodeId,
        taskId: task.id,
        nodeType: 'departure',
        nodeName: '车辆出发',
        status: 'pending',
        locationText: '仓库',
        operatorId: operator.id,
        operatorName: operator.name,
        createdAt: now,
      });

      taskRepository.updateStatus(task.id, 'in_transit');
      orderRepository.updateStatus(task.orderId, 'in_transit');
    }

    return batchRepository.updateStatus(batchId, 'departed');
  },

  departBatch(batchId: string, operator: User, departureTime?: string): LoadingBatch | undefined {
    const batch = batchRepository.findById(batchId);
    if (!batch) {
      return undefined;
    }

    if (batch.status !== 'departed') {
      throw new Error(`批次状态为 ${batch.status}，无法确认出发`);
    }

    const tasks = taskRepository.findByBatchId(batchId);
    const now = departureTime || new Date().toISOString();

    for (const task of tasks) {
      const departureNode = nodeRepository.findByTaskIdAndNodeType(task.id, 'departure');
      if (departureNode) {
        nodeRepository.completeNode(departureNode.id, {
          locationText: '仓库',
        });
      }

      const nodeId = generateId();
      nodeRepository.createNode({
        id: nodeId,
        taskId: task.id,
        nodeType: 'arrival',
        nodeName: '到达目的地',
        status: 'pending',
        locationText: '运输中',
        operatorId: operator.id,
        operatorName: operator.name,
        createdAt: now,
      });
    }

    const updatedBatch = batchRepository.update(batchId, {
      departureTime: now,
    });

    return updatedBatch;
  },

  addOrderToBatch(batchId: string, orderId: string): LoadingBatch | undefined {
    const batch = batchRepository.findById(batchId);
    if (!batch) {
      return undefined;
    }

    if (batch.status !== 'created') {
      throw new Error(`批次状态为 ${batch.status}，无法添加订单`);
    }

    const order = orderRepository.findById(orderId);
    if (!order) {
      throw new Error('订单不存在');
    }

    if (order.status !== 'created' && order.status !== 'warehoused') {
      throw new Error(`订单状态为 ${order.status}，无法添加到批次`);
    }

    if (batch.orderIds.includes(orderId)) {
      return batch;
    }

    const vehicle = vehicleRepository.findById(batch.vehicleId);
    if (vehicle) {
      const existingOrders = batch.orderIds
        .map(id => orderRepository.findById(id))
        .filter((o): o is Order => o !== undefined);
      const totalWeight = existingOrders.reduce((sum, o) => sum + o.weight, 0) + order.weight;

      if (totalWeight > vehicle.capacity) {
        throw new Error(`车辆载重不足，当前总重量 ${totalWeight}kg，车辆容量 ${vehicle.capacity}kg`);
      }

      if (!vehicle.temperatureZones.includes(order.temperatureZone)) {
        throw new Error(`车辆温区不匹配，订单需要 ${order.temperatureZone}，车辆只有 ${vehicle.temperatureZones.join(', ')}`);
      }
    }

    const updatedBatch = batchRepository.addOrderId(batchId, orderId);

    const existingTask = taskRepository.findByOrderId(orderId);
    if (!existingTask) {
      const taskId = generateId();
      const now = new Date().toISOString();
      taskRepository.createTask({
        id: taskId,
        batchId,
        orderId,
        driverId: batch.driverId,
        vehicleId: batch.vehicleId,
        status: 'warehoused',
        createdAt: now,
      });
    }

    orderRepository.updateStatus(orderId, 'warehoused');

    return updatedBatch;
  },

  removeOrderFromBatch(batchId: string, orderId: string): LoadingBatch | undefined {
    const batch = batchRepository.findById(batchId);
    if (!batch) {
      return undefined;
    }

    if (batch.status !== 'created') {
      throw new Error(`批次状态为 ${batch.status}，无法移除订单`);
    }

    if (!batch.orderIds.includes(orderId)) {
      return batch;
    }

    const updatedBatch = batchRepository.removeOrderId(batchId, orderId);

    const task = taskRepository.findByOrderId(orderId);
    if (task) {
      taskRepository.delete(task.id);
    }

    orderRepository.updateStatus(orderId, 'created');

    return updatedBatch;
  },

  getLoadingProgress(batchId: string): {
    totalOrders: number;
    loadedOrders: number;
    loadingOrders: number;
    pendingOrders: number;
    progress: number;
  } | undefined {
    const batch = batchRepository.findById(batchId);
    if (!batch) return undefined;

    const tasks = taskRepository.findByBatchId(batchId);
    const totalOrders = tasks.length;
    const loadingOrders = tasks.filter(t => t.status === 'loading').length;
    const pendingOrders = tasks.filter(t => t.status === 'warehoused').length;
    const loadedOrders = totalOrders - loadingOrders - pendingOrders;

    return {
      totalOrders,
      loadedOrders,
      loadingOrders,
      pendingOrders,
      progress: totalOrders > 0 ? (loadedOrders / totalOrders) * 100 : 0,
    };
  },

  getLoadingStats() {
    const batches = batchRepository.findAll();
    const today = new Date().toDateString();

    const todayBatches = batches.filter(b =>
      new Date(b.createdAt).toDateString() === today
    );

    const activeBatches = batches.filter(b =>
      ['created', 'loading', 'departed'].includes(b.status)
    );

    const loadingBatches = batches.filter(b => b.status === 'loading');
    const departedBatches = batches.filter(b => b.status === 'departed');
    const completedBatches = batches.filter(b => b.status === 'completed');

    return {
      totalBatches: batches.length,
      todayBatches: todayBatches.length,
      activeBatches: activeBatches.length,
      loadingBatches: loadingBatches.length,
      departedBatches: departedBatches.length,
      completedBatches: completedBatches.length,
    };
  },

  validateBatchReady(batchId: string): { ready: boolean; issues: string[] } {
    const issues: string[] = [];

    const batch = batchRepository.findByIdWithDetails(batchId);
    if (!batch) {
      return { ready: false, issues: ['批次不存在'] };
    }

    if (batch.status !== 'created') {
      issues.push(`批次状态为 ${batch.status}，需要为 created`);
    }

    if (batch.orderIds.length === 0) {
      issues.push('批次没有订单');
    }

    if (batch.vehicle && batch.vehicle.status !== 'active') {
      issues.push(`车辆状态为 ${batch.vehicle.status}，需要为 active`);
    }

    if (batch.driver && batch.driver.status !== 'on_duty') {
      issues.push(`司机状态为 ${batch.driver.status}，需要为 on_duty`);
    }

    const orders = batch.orderIds
      .map(id => orderRepository.findById(id))
      .filter((o): o is Order => o !== undefined);

    const invalidOrders = orders.filter(o => o.status !== 'warehoused');
    if (invalidOrders.length > 0) {
      issues.push(`以下订单状态不正确，需要为 warehoused：${invalidOrders.map(o => o.orderNo).join(', ')}`);
    }

    if (batch.vehicle) {
      const totalWeight = orders.reduce((sum, o) => sum + o.weight, 0);
      if (totalWeight > batch.vehicle.capacity) {
        issues.push(`车辆载重不足，总重量 ${totalWeight}kg，车辆容量 ${batch.vehicle.capacity}kg`);
      }
    }

    return { ready: issues.length === 0, issues };
  },

  getLoadingBatches(options?: { limit?: number; offset?: number }): LoadingBatch[] {
    return this.findAllBatches(options);
  },

  getLoadingBatchById(id: string): LoadingBatch | undefined {
    return this.findBatchById(id);
  },

  getLoadingTasks(batchId: string): DeliveryTask[] {
    return taskRepository.findByBatchIdWithDetails(batchId);
  },

  updateLoadingNode(
    nodeId: string,
    operatorId: string,
    operatorName: string,
    data: { locationText: string; temperature?: number; exceptionDescription?: string }
  ) {
    const node = nodeRepository.findById(nodeId);
    if (!node) return undefined;

    nodeRepository.updateNode(nodeId, {
      operatorId,
      operatorName,
    });

    return nodeRepository.completeNode(nodeId, data);
  },
};
