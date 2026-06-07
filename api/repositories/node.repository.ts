import { BaseRepository } from './base';
import type { DeliveryNode, NodeType, NodeStatus } from '../../shared/types';

class NodeRepository extends BaseRepository<DeliveryNode> {
  protected tableName = 'delivery_nodes';
  protected fieldMap: Record<keyof DeliveryNode, string> = {
    id: 'id',
    taskId: 'task_id',
    nodeType: 'node_type',
    nodeName: 'node_name',
    status: 'status',
    recordedAt: 'recorded_at',
    locationText: 'location_text',
    exceptionDescription: 'exception_description',
    temperature: 'temperature',
    operatorId: 'operator_id',
    operatorName: 'operator_name',
    createdAt: 'created_at',
  };
  protected jsonFields: Array<keyof DeliveryNode> = [];

  findByTaskId(taskId: string): DeliveryNode[] {
    return this.findByField('taskId', taskId, { orderBy: 'createdAt', orderDir: 'ASC' });
  }

  findByNodeType(nodeType: NodeType): DeliveryNode[] {
    return this.findByField('nodeType', nodeType, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByStatus(status: NodeStatus): DeliveryNode[] {
    return this.findByField('status', status, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByTaskIdAndNodeType(taskId: string, nodeType: NodeType): DeliveryNode | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} 
         WHERE task_id = ? AND node_type = ? 
         ORDER BY created_at DESC 
         LIMIT 1`
      )
      .get(taskId, nodeType) as Record<string, unknown> | undefined;
    return row ? this.fromDatabase(row) : undefined;
  }

  findByTaskIdAndStatus(taskId: string, status: NodeStatus): DeliveryNode[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} 
         WHERE task_id = ? AND status = ? 
         ORDER BY created_at ASC`
      )
      .all(taskId, status) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  findByOperatorId(operatorId: string): DeliveryNode[] {
    return this.findByField('operatorId', operatorId, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByDateRange(startDate: string, endDate: string): DeliveryNode[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} 
         WHERE created_at BETWEEN ? AND ? 
         ORDER BY created_at DESC`
      )
      .all(startDate, endDate) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  findExceptionsByDateRange(startDate: string, endDate: string): DeliveryNode[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} 
         WHERE status = 'exception' AND created_at BETWEEN ? AND ? 
         ORDER BY created_at DESC`
      )
      .all(startDate, endDate) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  findRecentExceptions(limit: number = 10): DeliveryNode[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} 
         WHERE status = 'exception' 
         ORDER BY created_at DESC 
         LIMIT ?`
      )
      .all(limit) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  findByTaskIdWithDetails(taskId: string): DeliveryNode[] {
    const rows = this.db
      .prepare(
        `SELECT n.*,
                u.username as operator_username,
                u.role as operator_role
         FROM ${this.tableName} n
         LEFT JOIN users u ON n.operator_id = u.id
         WHERE n.task_id = ?
         ORDER BY n.created_at ASC`
      )
      .all(taskId) as Record<string, unknown>[];

    return rows.map(row => this.fromDatabase(row));
  }

  completeNode(
    id: string,
    data: {
      locationText: string;
      temperature?: number;
      exceptionDescription?: string;
    }
  ): DeliveryNode | undefined {
    const now = new Date().toISOString();
    const status: NodeStatus = data.exceptionDescription ? 'exception' : 'completed';

    return this.update(id, {
      status,
      recordedAt: now,
      locationText: data.locationText,
      temperature: data.temperature,
      exceptionDescription: data.exceptionDescription,
    });
  }

  updateNodeStatus(id: string, status: NodeStatus): DeliveryNode | undefined {
    const updates: Partial<DeliveryNode> = { status };
    if (status === 'in_progress') {
      updates.recordedAt = new Date().toISOString();
    }
    return this.update(id, updates);
  }

  countByTaskIdAndStatus(taskId: string, status: NodeStatus): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM ${this.tableName} 
         WHERE task_id = ? AND status = ?`
      )
      .get(taskId, status) as { count: number };
    return row.count;
  }

  countExceptionsByDateRange(startDate: string, endDate: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM ${this.tableName} 
         WHERE status = 'exception' AND created_at BETWEEN ? AND ?`
      )
      .get(startDate, endDate) as { count: number };
    return row.count;
  }

  createNode(data: Omit<DeliveryNode, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): DeliveryNode {
    return this.create(data);
  }

  updateNode(id: string, data: Partial<Omit<DeliveryNode, 'id' | 'createdAt'>>): DeliveryNode | undefined {
    return this.update(id, data);
  }
}

export const nodeRepository = new NodeRepository();
