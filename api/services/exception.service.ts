import { exceptionHandlingRepository } from '../repositories/exception.repository';
import { nodeRepository } from '../repositories/node.repository';
import { taskRepository } from '../repositories/task.repository';
import { orderRepository } from '../repositories/order.repository';
import { driverRepository } from '../repositories/driver.repository';
import type {
  ExceptionHandling,
  ExceptionHandlingWithDetails,
  ExceptionHandlingQueryParams,
  ExceptionHandlingUpdateRequest,
  ExceptionHandlingListResponse,
  ExceptionHandlingStatus,
  DeliveryNode,
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

  getExceptionDetail(id: string): ExceptionHandlingWithDetails | undefined {
    return exceptionHandlingRepository.findByIdWithDetails(id);
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
    return exceptionHandlingRepository.updateHandling(id, {
      handlingStatus: data.handlingStatus,
      handlingResult: data.handlingResult,
      handlingNotes: data.handlingNotes,
      handledBy,
    });
  },

  getStats() {
    exceptionHandlingRepository.syncExceptionNodes();

    const pending = exceptionHandlingRepository.countByHandlingStatus('pending');
    const resolved = exceptionHandlingRepository.countByHandlingStatus('resolved');
    const escalated = exceptionHandlingRepository.countByHandlingStatus('escalated');

    return {
      pending,
      resolved,
      escalated,
      total: pending + resolved + escalated,
    };
  },

  getRecentExceptionsWithHandlingStatus(limit: number = 10): Array<DeliveryNode & { handled: boolean; handlingStatus?: ExceptionHandlingStatus }> {
    const recentExceptions = nodeRepository.findRecentExceptions(limit);

    return recentExceptions.map(node => {
      const handling = exceptionHandlingRepository.findByNodeId(node.id);
      return {
        ...node,
        handled: !!handling && handling.handlingStatus !== 'pending',
        handlingStatus: handling?.handlingStatus,
      };
    });
  },

  isNodeHandled(nodeId: string): boolean {
    const handling = exceptionHandlingRepository.findByNodeId(nodeId);
    return !!handling && handling.handlingStatus !== 'pending';
  },

  getDrivers() {
    return driverRepository.findAll();
  },

  getOrders() {
    return orderRepository.findAll();
  },
};
