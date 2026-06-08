import type {
  Order,
  LoadingBatch,
  DeliveryTask,
  DispatchRequest,
} from '../../../shared/types';
import { generateBatchNo, generateId } from './dispatch.constants';
import { validateDispatchRequest, ValidationRepositories } from './dispatch.validation';

export interface WriterRepositories extends ValidationRepositories {
  createBatch: (data: Omit<LoadingBatch, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) => LoadingBatch;
  updateBatchStatus: (id: string, status: LoadingBatch['status']) => LoadingBatch | undefined;
  removeOrderIdFromBatch: (batchId: string, orderId: string) => LoadingBatch | undefined;
  findBatchById: (id: string) => LoadingBatch | undefined;
  createTask: (data: Omit<DeliveryTask, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) => DeliveryTask;
  updateTask: (id: string, data: Partial<Omit<DeliveryTask, 'id' | 'createdAt'>>) => DeliveryTask | undefined;
  findTaskByOrderId: (orderId: string) => DeliveryTask | undefined;
  findTasksByBatchId: (batchId: string) => DeliveryTask[];
  updateTaskStatus: (id: string, status: DeliveryTask['status']) => DeliveryTask | undefined;
  updateOrderStatus: (id: string, status: Order['status']) => Order | undefined;
  createNode: (data: Omit<import('../../../shared/types').DeliveryNode, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) => import('../../../shared/types').DeliveryNode;
  findNodeByTaskIdAndNodeType: (taskId: string, nodeType: import('../../../shared/types').NodeType) => import('../../../shared/types').DeliveryNode | undefined;
}

export function createDeliveryTasks(
  request: DispatchRequest,
  repos: WriterRepositories
): { batch: LoadingBatch; tasks: DeliveryTask[] } {
  const validation = validateDispatchRequest(request, repos);
  if (!validation.valid) {
    throw new Error(`调度验证失败：${validation.errors.join('; ')}`);
  }

  const orders = request.orderIds
    .map(id => repos.findOrderById(id))
    .filter((o): o is Order => o !== undefined);

  const batchNo = generateBatchNo();
  const batchId = generateId();
  const now = new Date().toISOString();

  const batch = repos.createBatch({
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

    const existingTask = repos.findTaskByOrderId(order.id);

    if (existingTask) {
      if (existingTask.batchId !== batchId) {
        repos.removeOrderIdFromBatch(existingTask.batchId, order.id);
        const oldBatch = repos.findBatchById(existingTask.batchId);
        if (oldBatch && oldBatch.orderIds.length === 0) {
          repos.updateBatchStatus(oldBatch.id, 'completed');
        }
      }

      task = repos.updateTask(existingTask.id, {
        batchId,
        driverId: request.driverId,
        vehicleId: request.vehicleId,
        status: 'warehoused',
      });

      const existingWarehouseInNode = repos.findNodeByTaskIdAndNodeType(existingTask.id, 'warehouse_in');
      if (!existingWarehouseInNode) {
        const nodeId = generateId();
        repos.createNode({
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
          version: 1,
          updatedAt: now,
        });
      }
    } else {
      const taskId = generateId();
      task = repos.createTask({
        id: taskId,
        batchId,
        orderId: order.id,
        driverId: request.driverId,
        vehicleId: request.vehicleId,
        status: 'warehoused',
        createdAt: now,
      });

      const nodeId = generateId();
      repos.createNode({
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
        version: 1,
        updatedAt: now,
      });
    }

    if (task) {
      tasks.push(task);
    }

    if (order.status !== 'warehoused') {
      repos.updateOrderStatus(order.id, 'warehoused');
    }
  }

  return { batch, tasks };
}

export function cancelDispatch(
  batchId: string,
  repos: Pick<WriterRepositories, 'findBatchById' | 'findTasksByBatchId' | 'updateTaskStatus' | 'updateOrderStatus' | 'updateBatchStatus'>
): boolean {
  const batch = repos.findBatchById(batchId);
  if (!batch) {
    throw new Error('批次不存在');
  }

  if (!['created', 'loading'].includes(batch.status)) {
    throw new Error(`批次状态为 ${batch.status}，无法取消`);
  }

  const tasks = repos.findTasksByBatchId(batchId);
  for (const task of tasks) {
    if (['completed', 'cancelled'].includes(task.status)) continue;

    repos.updateOrderStatus(task.orderId, 'created');
    repos.updateTaskStatus(task.id, 'cancelled');
  }

  repos.updateBatchStatus(batchId, 'completed');

  return true;
}
