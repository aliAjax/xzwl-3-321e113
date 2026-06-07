import { v4 as uuidv4 } from 'uuid';
import { orderRepository } from '../repositories/order.repository';
import { taskRepository } from '../repositories/task.repository';
import { nodeRepository } from '../repositories/node.repository';
import { customerRepository } from '../repositories/customer.repository';
import type {
  Order,
  User,
  WarehouseInRegisterRequest,
  WarehouseInQueryParams,
  TemperatureZone,
  DeliveryTask,
  DeliveryNode,
  Customer,
} from '../../shared/types';

function generateId(): string {
  return uuidv4();
}

export const warehouseService = {
  getPendingOrders(params: WarehouseInQueryParams): Order[] {
    return orderRepository.findPendingWarehouseOrders({
      orderNo: params.orderNo,
      customerId: params.customerId,
      temperatureZone: params.temperatureZone as TemperatureZone,
    });
  },

  getAllCustomers(): Customer[] {
    return customerRepository.findAll();
  },

  registerWarehouseIn(request: WarehouseInRegisterRequest, operator: User): {
    order: Order;
    task: DeliveryTask;
    node: DeliveryNode;
  } {
    const order = orderRepository.findById(request.orderId);
    if (!order) {
      throw new Error('订单不存在');
    }

    if (order.status !== 'created') {
      throw new Error(`订单状态为 ${order.status}，无法进行入仓登记`);
    }

    const existingTask = taskRepository.findByOrderId(order.id);
    if (existingTask) {
      throw new Error('该订单已存在配送任务');
    }

    const now = new Date().toISOString();

    const taskId = generateId();
    const task = taskRepository.createTask({
      id: taskId,
      batchId: null as unknown as string,
      orderId: order.id,
      driverId: null as unknown as string,
      vehicleId: null as unknown as string,
      status: 'warehoused',
      createdAt: now,
    });

    const nodeId = generateId();
    const node = nodeRepository.createNode({
      id: nodeId,
      taskId: taskId,
      nodeType: 'warehouse_in',
      nodeName: '入仓登记',
      status: 'completed',
      recordedAt: now,
      locationText: request.locationText,
      temperature: request.temperature,
      exceptionDescription: request.remarks,
      operatorId: operator.id,
      operatorName: operator.name,
      createdAt: now,
    });

    const updatedOrder = orderRepository.updateStatus(order.id, 'warehoused');
    if (!updatedOrder) {
      throw new Error('更新订单状态失败');
    }

    return {
      order: updatedOrder,
      task,
      node,
    };
  },

  getWarehouseInStats() {
    const allOrders = orderRepository.findAll();
    const pendingCount = allOrders.filter(o => o.status === 'created').length;
    const warehousedCount = allOrders.filter(o => o.status === 'warehoused').length;
    const today = new Date().toDateString();
    const todayWarehoused = allOrders.filter(o =>
      o.status === 'warehoused' &&
      new Date(o.updatedAt).toDateString() === today
    ).length;

    return {
      pendingCount,
      warehousedCount,
      todayWarehoused,
    };
  },
};
