import { v4 as uuidv4 } from 'uuid';
import { orderRepository } from '../repositories/order.repository';
import { taskRepository } from '../repositories/task.repository';
import { nodeRepository } from '../repositories/node.repository';
import { customerRepository } from '../repositories/customer.repository';
import { vehicleRepository } from '../repositories/vehicle.repository';
import { driverRepository } from '../repositories/driver.repository';
import { routeRepository } from '../repositories/route.repository';
import { batchRepository } from '../repositories/batch.repository';
import type {
  Order,
  User,
  WarehouseInRegisterRequest,
  WarehouseInQueryParams,
  TemperatureZone,
  DeliveryTask,
  DeliveryNode,
  Customer,
  LoadingBatch,
  Vehicle,
  Driver,
  Route,
} from '../../shared/types';

const WAREHOUSE_VEHICLE_ID = 'veh-warehouse';
const WAREHOUSE_DRIVER_ID = 'drv-warehouse';

function generateId(): string {
  return uuidv4();
}

function generateWarehouseBatchNo(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `WH${dateStr}${random}`;
}

function ensureWarehouseVehicle(): Vehicle {
  const existing = vehicleRepository.findById(WAREHOUSE_VEHICLE_ID);
  if (existing) {
    return existing;
  }

  return vehicleRepository.createVehicle({
    id: WAREHOUSE_VEHICLE_ID,
    plateNo: '入仓专用',
    vehicleType: '虚拟车辆',
    temperatureZones: ['frozen', 'chilled', 'ambient'],
    capacity: 99999,
    availableStartTime: '00:00:00',
    availableEndTime: '23:59:59',
    status: 'active',
  });
}

function ensureWarehouseDriver(): Driver {
  const existing = driverRepository.findById(WAREHOUSE_DRIVER_ID);
  if (existing) {
    return existing;
  }

  return driverRepository.createDriver({
    id: WAREHOUSE_DRIVER_ID,
    name: '入仓暂存',
    phone: '00000000000',
    licenseNo: '000000000000000000',
    licenseType: 'A1',
    status: 'on_duty',
  });
}

function getWarehouseResources(): { vehicle: Vehicle; driver: Driver; route: Route } {
  const vehicle = ensureWarehouseVehicle();
  const driver = ensureWarehouseDriver();
  const routes = routeRepository.findAll();

  if (routes.length === 0) {
    throw new Error('系统中没有可用的路线');
  }

  return {
    vehicle,
    driver,
    route: routes[0],
  };
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
    batch: LoadingBatch;
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

    const { vehicle, driver, route } = getWarehouseResources();

    const now = new Date().toISOString();

    const batchNo = generateWarehouseBatchNo();
    const batchId = generateId();

    const batch = batchRepository.create({
      id: batchId,
      batchNo,
      vehicleId: vehicle.id,
      driverId: driver.id,
      routeId: route.id,
      orderIds: [order.id],
      status: 'created',
      createdAt: now,
    });

    const taskId = generateId();
    const task = taskRepository.createTask({
      id: taskId,
      batchId,
      orderId: order.id,
      driverId: driver.id,
      vehicleId: vehicle.id,
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
      batch,
    };
  },

  getWarehouseInStats() {
    const allOrders = orderRepository.findAll();
    const pendingCount = allOrders.filter((o) => o.status === 'created').length;
    const warehousedCount = allOrders.filter((o) => o.status === 'warehoused').length;
    const today = new Date().toDateString();
    const todayWarehoused = allOrders.filter(
      (o) =>
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
