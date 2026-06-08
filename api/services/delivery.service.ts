import { taskRepository } from '../repositories/task.repository';
import { nodeRepository } from '../repositories/node.repository';
import { orderRepository } from '../repositories/order.repository';
import { batchRepository } from '../repositories/batch.repository';
import type {
  DeliveryTask,
  DeliveryNode,
  NodeType,
  NodeStatus,
  OrderStatus,
  NodeUpdateRequest,
  NodeUpdateResponse,
  ConflictType,
  User,
} from '../../shared/types';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

const nodeTypeNames: Record<NodeType, string> = {
  warehouse_in: '入库',
  loading: '装车',
  departure: '出发',
  arrival: '到达',
  delivery: '配送',
  signature: '签收',
};

const statusTransitionMap: Record<NodeType, OrderStatus> = {
  warehouse_in: 'warehoused',
  loading: 'loading',
  departure: 'in_transit',
  arrival: 'in_transit',
  delivery: 'delivered',
  signature: 'completed',
};

export const deliveryService = {
  findAllTasks(options?: { limit?: number; offset?: number }): DeliveryTask[] {
    return taskRepository.findAll({ ...options, orderBy: 'createdAt', orderDir: 'DESC' });
  },

  findTaskById(id: string): DeliveryTask | undefined {
    return taskRepository.findByIdWithDetails(id);
  },

  findTaskByOrderId(orderId: string): DeliveryTask | undefined {
    return taskRepository.findByOrderId(orderId);
  },

  findTasksByDriverId(driverId: string): DeliveryTask[] {
    return taskRepository.findByDriverId(driverId);
  },

  findTasksByVehicleId(vehicleId: string): DeliveryTask[] {
    return taskRepository.findByVehicleId(vehicleId);
  },

  findTasksByBatchId(batchId: string): DeliveryTask[] {
    return taskRepository.findByBatchIdWithDetails(batchId);
  },

  findTasksByStatus(status: OrderStatus): DeliveryTask[] {
    return taskRepository.findByStatus(status);
  },

  findActiveTasksByDriverId(driverId: string): DeliveryTask[] {
    return taskRepository.findActiveTasksByDriverId(driverId);
  },

  findTasksByDateRange(startDate: string, endDate: string): DeliveryTask[] {
    return taskRepository.findByDateRange(startDate, endDate);
  },

  getTaskWithNodes(taskId: string): { task: DeliveryTask; nodes: DeliveryNode[] } | undefined {
    const task = taskRepository.findByIdWithDetails(taskId);
    if (!task) return undefined;

    const nodes = nodeRepository.findByTaskIdWithDetails(taskId);
    return { task, nodes };
  },

  createDeliveryNode(
    taskId: string,
    nodeType: NodeType,
    operator: User,
    locationText: string = ''
  ): DeliveryNode | undefined {
    const task = taskRepository.findById(taskId);
    if (!task) {
      return undefined;
    }

    const existingNode = nodeRepository.findByTaskIdAndNodeType(taskId, nodeType);
    if (existingNode && existingNode.status !== 'pending') {
      throw new Error(`节点类型 ${nodeType} 已存在且状态为 ${existingNode.status}`);
    }

    if (existingNode) {
      nodeRepository.updateNode(existingNode.id, {
        operatorId: operator.id,
        operatorName: operator.name,
      });
      return existingNode;
    }

    const nodeId = generateId();
    const now = new Date().toISOString();

    const node = nodeRepository.createNode({
      id: nodeId,
      taskId,
      nodeType,
      nodeName: nodeTypeNames[nodeType],
      status: 'pending',
      locationText,
      operatorId: operator.id,
      operatorName: operator.name,
      createdAt: now,
    });

    return node;
  },

  createDeliveryNodesForTask(taskId: string, operator: User): DeliveryNode[] {
    const task = taskRepository.findById(taskId);
    if (!task) {
      throw new Error('任务不存在');
    }

    const nodeTypes: NodeType[] = ['warehouse_in', 'loading', 'departure', 'arrival', 'delivery', 'signature'];
    const nodes: DeliveryNode[] = [];
    const now = new Date().toISOString();

    for (const nodeType of nodeTypes) {
      const existingNode = nodeRepository.findByTaskIdAndNodeType(taskId, nodeType);
      if (!existingNode) {
        const nodeId = generateId();
        const node = nodeRepository.createNode({
          id: nodeId,
          taskId,
          nodeType,
          nodeName: nodeTypeNames[nodeType],
          status: 'pending',
          locationText: '',
          operatorId: operator.id,
          operatorName: operator.name,
          createdAt: now,
        });
        nodes.push(node);
      } else {
        nodes.push(existingNode);
      }
    }

    return nodes;
  },

  updateNodeStatus(
    nodeId: string,
    request: NodeUpdateRequest,
    operator: User
  ): NodeUpdateResponse {
    const node = nodeRepository.findById(nodeId);
    if (!node) {
      return { success: false };
    }

    if (request.clientSubmitId) {
      const existingNode = nodeRepository.findByClientSubmitId(request.clientSubmitId);
      if (existingNode) {
        return {
          success: true,
          node: existingNode,
          isDuplicate: true,
        };
      }
    }

    if (node.status === 'completed') {
      return {
        success: false,
        conflict: {
          type: 'already_completed',
          message: '该节点已完成，无法重复提交',
          currentNode: node,
          submittedData: request,
        },
      };
    }

    if (request.updatedAt && node.updatedAt > request.updatedAt) {
      return {
        success: false,
        conflict: {
          type: 'updated_by_other',
          message: '该节点已被后台或其他方式更新，请刷新后重试',
          currentNode: node,
          submittedData: request,
        },
      };
    }

    const updatedNode = nodeRepository.completeNode(nodeId, {
      locationText: request.locationText,
      temperature: request.temperature,
      exceptionDescription: request.exceptionDescription,
      clientSubmitId: request.clientSubmitId,
    });

    if (updatedNode) {
      this.updateOrderStatusFromNode(node.taskId, node.nodeType, updatedNode.status);
    }

    return {
      success: true,
      node: updatedNode,
    };
  },

  startNode(nodeId: string, operator: User): DeliveryNode | undefined {
    const node = nodeRepository.findById(nodeId);
    if (!node) {
      return undefined;
    }

    if (node.status !== 'pending') {
      throw new Error(`节点状态为 ${node.status}，无法开始`);
    }

    return nodeRepository.updateNodeStatus(nodeId, 'in_progress');
  },

  updateOrderStatusFromNode(
    taskId: string,
    nodeType: NodeType,
    nodeStatus: NodeStatus
  ): void {
    const task = taskRepository.findById(taskId);
    if (!task) return;

    if (nodeStatus === 'exception') {
      taskRepository.updateStatus(taskId, 'in_transit');
      orderRepository.updateStatus(task.orderId, 'in_transit');
      return;
    }

    if (nodeStatus === 'completed') {
      const newStatus = statusTransitionMap[nodeType];
      if (newStatus) {
        taskRepository.updateStatus(taskId, newStatus);
        orderRepository.updateStatus(task.orderId, newStatus);
      }
    }

    const allNodes = nodeRepository.findByTaskId(taskId);
    const completedNodes = allNodes.filter(n => n.status === 'completed');
    const hasException = allNodes.some(n => n.status === 'exception');

    if (completedNodes.length === allNodes.length && !hasException) {
      taskRepository.updateStatus(taskId, 'completed');
      orderRepository.updateStatus(task.orderId, 'completed');
    }
  },

  recordArrival(
    taskId: string,
    operator: User,
    locationText: string,
    temperature?: number
  ): DeliveryNode | undefined {
    const arrivalNode = nodeRepository.findByTaskIdAndNodeType(taskId, 'arrival');
    if (!arrivalNode) {
      throw new Error('到达节点不存在');
    }

    if (arrivalNode.status === 'completed') {
      throw new Error('到达节点已完成');
    }

    return this.updateNodeStatus(
      arrivalNode.id,
      {
        status: 'completed',
        locationText,
        temperature,
      },
      operator
    );
  },

  recordDelivery(
    taskId: string,
    operator: User,
    locationText: string,
    temperature?: number,
    exceptionDescription?: string
  ): DeliveryNode | undefined {
    const deliveryNode = nodeRepository.findByTaskIdAndNodeType(taskId, 'delivery');
    if (!deliveryNode) {
      throw new Error('配送节点不存在');
    }

    if (deliveryNode.status === 'completed') {
      throw new Error('配送节点已完成');
    }

    return this.updateNodeStatus(
      deliveryNode.id,
      {
        status: exceptionDescription ? 'exception' : 'completed',
        locationText,
        temperature,
        exceptionDescription,
      },
      operator
    );
  },

  recordSignature(
    taskId: string,
    operator: User,
    locationText: string,
    signatoryName?: string
  ): DeliveryNode | undefined {
    const signatureNode = nodeRepository.findByTaskIdAndNodeType(taskId, 'signature');
    if (!signatureNode) {
      throw new Error('签收节点不存在');
    }

    if (signatureNode.status === 'completed') {
      throw new Error('签收节点已完成');
    }

    const deliveryNode = nodeRepository.findByTaskIdAndNodeType(taskId, 'delivery');
    if (deliveryNode && deliveryNode.status !== 'completed' && deliveryNode.status !== 'exception') {
      throw new Error('请先完成配送节点');
    }

    const exceptionDescription = signatoryName ? undefined : '未签收';

    return this.updateNodeStatus(
      signatureNode.id,
      {
        status: exceptionDescription ? 'exception' : 'completed',
        locationText,
        exceptionDescription,
      },
      operator
    );
  },

  recordException(
    taskId: string,
    nodeType: NodeType,
    operator: User,
    locationText: string,
    exceptionDescription: string,
    temperature?: number
  ): DeliveryNode | undefined {
    const node = nodeRepository.findByTaskIdAndNodeType(taskId, nodeType);
    if (!node) {
      throw new Error('节点不存在');
    }

    if (node.status === 'completed') {
      throw new Error('节点已完成');
    }

    return this.updateNodeStatus(
      node.id,
      {
        status: 'exception',
        locationText,
        temperature,
        exceptionDescription,
      },
      operator
    );
  },

  getTaskProgress(taskId: string): {
    totalNodes: number;
    completedNodes: number;
    pendingNodes: number;
    inProgressNodes: number;
    exceptionNodes: number;
    progress: number;
  } | undefined {
    const task = taskRepository.findById(taskId);
    if (!task) return undefined;

    const nodes = nodeRepository.findByTaskId(taskId);
    const totalNodes = nodes.length;
    const completedNodes = nodes.filter(n => n.status === 'completed').length;
    const pendingNodes = nodes.filter(n => n.status === 'pending').length;
    const inProgressNodes = nodes.filter(n => n.status === 'in_progress').length;
    const exceptionNodes = nodes.filter(n => n.status === 'exception').length;

    return {
      totalNodes,
      completedNodes,
      pendingNodes,
      inProgressNodes,
      exceptionNodes,
      progress: totalNodes > 0 ? (completedNodes / totalNodes) * 100 : 0,
    };
  },

  getDriverTodayTasks(driverId: string): {
    tasks: DeliveryTask[];
    completed: number;
    inTransit: number;
    pending: number;
    exceptions: number;
  } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const allTasks = taskRepository.findActiveTasksByDriverId(driverId);
    const todayTasks = allTasks.filter(task => {
      const taskDate = new Date(task.createdAt);
      return taskDate >= today && taskDate < tomorrow;
    });

    const completed = todayTasks.filter(t => t.status === 'completed').length;
    const inTransit = todayTasks.filter(t => t.status === 'in_transit').length;
    const pending = todayTasks.filter(t =>
      ['created', 'warehoused', 'loading'].includes(t.status)
    ).length;

    const exceptions = todayTasks.reduce((count, task) => {
      const nodes = nodeRepository.findByTaskId(task.id);
      const hasException = nodes.some(n => n.status === 'exception');
      return count + (hasException ? 1 : 0);
    }, 0);

    return {
      tasks: todayTasks,
      completed,
      inTransit,
      pending,
      exceptions,
    };
  },

  getBatchProgress(batchId: string): {
    totalTasks: number;
    completedTasks: number;
    inTransitTasks: number;
    pendingTasks: number;
    exceptionTasks: number;
    progress: number;
  } | undefined {
    const batch = batchRepository.findById(batchId);
    if (!batch) return undefined;

    const tasks = taskRepository.findByBatchId(batchId);
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const inTransitTasks = tasks.filter(t => t.status === 'in_transit').length;
    const pendingTasks = tasks.filter(t =>
      ['created', 'warehoused', 'loading'].includes(t.status)
    ).length;

    const exceptionTasks = tasks.reduce((count, task) => {
      const nodes = nodeRepository.findByTaskId(task.id);
      const hasException = nodes.some(n => n.status === 'exception');
      return count + (hasException ? 1 : 0);
    }, 0);

    return {
      totalTasks,
      completedTasks,
      inTransitTasks,
      pendingTasks,
      exceptionTasks,
      progress: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
    };
  },

  completeBatch(batchId: string): boolean {
    const batch = batchRepository.findById(batchId);
    if (!batch) {
      throw new Error('批次不存在');
    }

    if (batch.status !== 'departed') {
      throw new Error(`批次状态为 ${batch.status}，无法完成`);
    }

    const tasks = taskRepository.findByBatchId(batchId);
    const incompleteTasks = tasks.filter(t =>
      ['created', 'warehoused', 'loading', 'in_transit', 'delivered'].includes(t.status)
    );

    if (incompleteTasks.length > 0) {
      throw new Error(`还有 ${incompleteTasks.length} 个任务未完成，无法完成批次`);
    }

    batchRepository.updateStatus(batchId, 'completed');
    return true;
  },

  getTaskExceptions(taskId: string): DeliveryNode[] {
    return nodeRepository.findByTaskIdAndStatus(taskId, 'exception');
  },

  getRecentExceptions(limit: number = 10): DeliveryNode[] {
    return nodeRepository.findRecentExceptions(limit);
  },

  getDeliveryStats() {
    const tasks = taskRepository.findAll();
    const today = new Date().toDateString();

    const todayTasks = tasks.filter(t =>
      new Date(t.createdAt).toDateString() === today
    );

    const completedTasks = tasks.filter(t => t.status === 'completed');
    const inTransitTasks = tasks.filter(t => t.status === 'in_transit');
    const pendingTasks = tasks.filter(t =>
      ['created', 'warehoused', 'loading'].includes(t.status)
    );

    const exceptionNodes = nodeRepository.findRecentExceptions(1000);
    const todayExceptions = exceptionNodes.filter(n =>
      new Date(n.createdAt).toDateString() === today
    );

    return {
      totalTasks: tasks.length,
      todayTasks: todayTasks.length,
      completedTasks: completedTasks.length,
      inTransitTasks: inTransitTasks.length,
      pendingTasks: pendingTasks.length,
      todayExceptions: todayExceptions.length,
      totalExceptions: exceptionNodes.length,
      completionRate: tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0,
    };
  },

  getDriverTasks(driverId: string) {
    return this.findActiveTasksByDriverId(driverId);
  },

  getTaskById(taskId: string) {
    return this.findTaskById(taskId);
  },

  getTaskNodes(taskId: string) {
    return nodeRepository.findByTaskIdWithDetails(taskId);
  },

  getTasksByBatchId(batchId: string) {
    return this.findTasksByBatchId(batchId);
  },

  getExceptionNodes(startDate: string, endDate: string) {
    return nodeRepository.findExceptionsByDateRange(startDate, endDate);
  },

  createNextNode(taskId: string, nodeType: NodeType) {
    return this.createDeliveryNode(taskId, nodeType, {
      id: '',
      username: '',
      role: 'driver',
      name: '',
      phone: '',
      createdAt: ''
    });
  },

  completeTask(taskId: string) {
    const task = taskRepository.findById(taskId);
    if (!task) return undefined;
    return taskRepository.updateStatus(taskId, 'completed');
  },
};
