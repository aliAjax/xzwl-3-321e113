import { exceptionHandlingRepository } from '../repositories/exception.repository';
import { nodeRepository } from '../repositories/node.repository';
import { taskRepository } from '../repositories/task.repository';
import { orderRepository } from '../repositories/order.repository';
import { driverRepository } from '../repositories/driver.repository';
import { userRepository } from '../repositories/user.repository';
import type {
  ExceptionHandling,
  ExceptionHandlingWithDetails,
  ExceptionHandlingQueryParams,
  ExceptionHandlingUpdateRequest,
  ExceptionHandlingListResponse,
  ExceptionHandlingStatus,
  ExceptionHandlingResult,
  DeliveryNode,
  ExceptionProcessingNote,
  ExceptionHandlingAssignRequest,
  ExceptionHandlingEscalateRequest,
  ExceptionHandlingAddNoteRequest,
  ExceptionHandlingCloseRequest,
  ExceptionHandlingReopenRequest,
  ExceptionHandlingWorkorderStats,
  EscalationLevel,
  User,
} from '../../shared/types';

export const exceptionHandlingService = {
  async syncExceptions(): Promise<{ total: number; created: number; existing: number; skipped: number }> {
    const result = exceptionHandlingRepository.syncExceptionNodes();
    return result;
  },

  getExceptionList(params: ExceptionHandlingQueryParams = {}): ExceptionHandlingListResponse {
    exceptionHandlingRepository.syncExceptionNodes();

    const page = params.page || 1;
    const pageSize = params.pageSize || 20;

    const { items, total } = exceptionHandlingRepository.findWithDetails({
      ...params,
      page,
      pageSize,
    });

    return {
      items,
      total,
      page,
      pageSize,
    };
  },

  getExceptionDetail(id: string): (ExceptionHandlingWithDetails & { processingNotes?: ExceptionProcessingNote[] }) | undefined {
    const exception = exceptionHandlingRepository.findByIdWithDetails(id);
    if (!exception) return undefined;

    const processingNotes = exceptionHandlingRepository.findProcessingNotes(id);
    return {
      ...exception,
      processingNotes,
    };
  },

  getExceptionByNodeId(nodeId: string): ExceptionHandling | undefined {
    return exceptionHandlingRepository.findByNodeId(nodeId);
  },

  getTaskNodes(taskId: string) {
    return nodeRepository.findByTaskIdWithDetails(taskId);
  },

  getTemperatureRecords(taskId: string) {
    const nodes = nodeRepository.findByTaskId(taskId);
    return nodes
      .filter(n => n.temperature !== undefined && n.temperature !== null)
      .map(n => ({
        recordedAt: n.recordedAt || n.createdAt,
        temperature: n.temperature,
        locationText: n.locationText,
        nodeName: n.nodeName,
        status: n.status,
      }));
  },

  handleException(
    id: string,
    data: ExceptionHandlingUpdateRequest,
    handledBy: string
  ): ExceptionHandling | undefined {
    const existing = exceptionHandlingRepository.findById(id);
    if (!existing) return undefined;

    const user = userRepository.findById(handledBy);

    exceptionHandlingRepository.addProcessingNote(
      id,
      data.handlingNotes,
      'update_status',
      handledBy,
      user?.name,
      existing.handlingStatus,
      data.handlingStatus
    );

    return exceptionHandlingRepository.updateHandling(id, {
      handlingStatus: data.handlingStatus,
      handlingResult: data.handlingResult,
      handlingNotes: data.handlingNotes,
      handledBy,
    });
  },

  assignException(
    id: string,
    data: ExceptionHandlingAssignRequest,
    assignedBy: string
  ): ExceptionHandling | undefined {
    const existing = exceptionHandlingRepository.findById(id);
    if (!existing) return undefined;

    const assignee = userRepository.findById(data.assigneeId);
    if (!assignee) return undefined;

    const assigner = userRepository.findById(assignedBy);

    const note = data.note || `分配给 ${assignee.name} 处理`;

    exceptionHandlingRepository.addProcessingNote(
      id,
      note,
      'assign',
      assignedBy,
      assigner?.name,
      existing.assigneeId,
      data.assigneeId
    );

    return exceptionHandlingRepository.assignHandling(id, data.assigneeId);
  },

  escalateException(
    id: string,
    data: ExceptionHandlingEscalateRequest,
    escalatedBy: string
  ): ExceptionHandling | undefined {
    const existing = exceptionHandlingRepository.findById(id);
    if (!existing) return undefined;

    const user = userRepository.findById(escalatedBy);

    const levelLabels: Record<EscalationLevel, string> = {
      level_1: '一级（普通）',
      level_2: '二级（紧急）',
      level_3: '三级（严重）',
    };

    const note = data.note || `升级为 ${levelLabels[data.escalationLevel]}`;

    exceptionHandlingRepository.addProcessingNote(
      id,
      note,
      'escalate',
      escalatedBy,
      user?.name,
      existing.escalationLevel,
      data.escalationLevel
    );

    return exceptionHandlingRepository.escalateHandling(id, data.escalationLevel);
  },

  addNote(
    id: string,
    data: ExceptionHandlingAddNoteRequest,
    createdBy: string
  ): ExceptionProcessingNote | undefined {
    const existing = exceptionHandlingRepository.findById(id);
    if (!existing) return undefined;

    const user = userRepository.findById(createdBy);

    return exceptionHandlingRepository.addProcessingNote(
      id,
      data.note,
      'add_note',
      createdBy,
      user?.name
    );
  },

  closeException(
    id: string,
    data: ExceptionHandlingCloseRequest,
    closedBy: string
  ): ExceptionHandling | undefined {
    const existing = exceptionHandlingRepository.findById(id);
    if (!existing) return undefined;

    const user = userRepository.findById(closedBy);

    exceptionHandlingRepository.addProcessingNote(
      id,
      data.note,
      'close',
      closedBy,
      user?.name,
      'open',
      'closed'
    );

    return exceptionHandlingRepository.closeHandling(
      id,
      data.handlingResult,
      data.note,
      closedBy
    );
  },

  reopenException(
    id: string,
    data: ExceptionHandlingReopenRequest,
    reopenedBy: string
  ): ExceptionHandling | undefined {
    const existing = exceptionHandlingRepository.findById(id);
    if (!existing) return undefined;

    const user = userRepository.findById(reopenedBy);

    exceptionHandlingRepository.addProcessingNote(
      id,
      data.note,
      'reopen',
      reopenedBy,
      user?.name,
      'closed',
      'open'
    );

    return exceptionHandlingRepository.reopenHandling(id, reopenedBy);
  },

  getStats(params: ExceptionHandlingQueryParams = {}) {
    exceptionHandlingRepository.syncExceptionNodes();
    return exceptionHandlingRepository.getWorkorderStats(params);
  },

  getWorkorderStats(params: ExceptionHandlingQueryParams = {}): ExceptionHandlingWorkorderStats {
    exceptionHandlingRepository.syncExceptionNodes();
    return exceptionHandlingRepository.getWorkorderStats(params);
  },

  getRecentExceptionsWithHandlingStatus(limit: number = 10): Array<DeliveryNode & { handled: boolean; handlingStatus?: ExceptionHandlingStatus; isClosed?: boolean; escalationLevel?: EscalationLevel }> {
    const recentExceptions = nodeRepository.findRecentExceptions(limit);

    return recentExceptions.map(node => {
      const handling = exceptionHandlingRepository.findByNodeId(node.id);
      return {
        ...node,
        handled: !!handling && (handling.handlingStatus !== 'pending' || handling.isClosed),
        handlingStatus: handling?.handlingStatus,
        isClosed: handling?.isClosed,
        escalationLevel: handling?.escalationLevel,
      };
    });
  },

  isNodeHandled(nodeId: string): boolean {
    const handling = exceptionHandlingRepository.findByNodeId(nodeId);
    return !!handling && (handling.handlingStatus !== 'pending' || handling.isClosed);
  },

  isNodeClosed(nodeId: string): boolean {
    const handling = exceptionHandlingRepository.findByNodeId(nodeId);
    return !!handling && handling.isClosed;
  },

  getDrivers() {
    return driverRepository.findAll();
  },

  getOrders() {
    return orderRepository.findAll();
  },

  getUsers(): User[] {
    return userRepository.findAll();
  },

  getDispatchers(): User[] {
    return userRepository.findAll().filter(u => u.role === 'dispatcher' || u.role === 'admin');
  },

  createExceptionFromNode(nodeId: string, createdBy: string): ExceptionHandling | { error: string } {
    const existing = exceptionHandlingRepository.findByNodeId(nodeId);
    if (existing) {
      return { error: '该节点已存在异常工单' };
    }

    const node = nodeRepository.findById(nodeId);
    if (!node) {
      return { error: '节点不存在' };
    }

    if (node.status !== 'exception') {
      return { error: '该节点状态不是异常' };
    }

    const task = taskRepository.findById(node.taskId);
    if (!task) {
      return { error: '任务不存在' };
    }

    const order = orderRepository.findById(task.orderId);
    if (!order) {
      return { error: '订单不存在' };
    }

    const user = userRepository.findById(createdBy);

    const handling = exceptionHandlingRepository.createHandling({
      nodeId: node.id,
      taskId: node.taskId,
      orderId: task.orderId,
      driverId: task.driverId,
      temperatureZone: order.temperatureZone,
      exceptionDescription: node.exceptionDescription || '未知异常',
      exceptionTime: node.recordedAt || node.createdAt,
      handlingStatus: 'pending',
      escalationLevel: 'level_1',
      isClosed: false,
    });

    exceptionHandlingRepository.addProcessingNote(
      handling.id,
      '手动创建异常工单',
      'create',
      createdBy,
      user?.name
    );

    return handling;
  },
};
