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
    clientSubmitId: 'client_submit_id',
    version: 'version',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  };
  protected jsonFields: Array<keyof DeliveryNode> = [];

  private updateWithVersionBump(
    id: string,
    data: Partial<Omit<DeliveryNode, 'id' | 'createdAt'>>
  ): DeliveryNode | undefined {
    const dbData = this.toDatabase(data as Partial<DeliveryNode>);
    delete dbData.version;

    if (Object.keys(dbData).length === 0) {
      return this.findById(id);
    }

    const setClause = Object.keys(dbData).map(field => `${field} = ?`).join(', ');
    const values = [...Object.values(dbData), id];
    const sql = `UPDATE ${this.tableName} SET ${setClause}, version = COALESCE(version, 1) + 1 WHERE id = ?`;
    const result = this.db.prepare(sql).run(...values);

    if (result.changes === 0) {
      return undefined;
    }

    return this.findById(id);
  }

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

  findByClientSubmitId(clientSubmitId: string): DeliveryNode | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} 
         WHERE client_submit_id = ? 
         LIMIT 1`
      )
      .get(clientSubmitId) as Record<string, unknown> | undefined;
    return row ? this.fromDatabase(row) : undefined;
  }

  completeNode(
    id: string,
    data: {
      locationText: string;
      temperature?: number;
      exceptionDescription?: string;
      recordedAt?: string;
      clientSubmitId?: string;
      version?: number;
    }
  ): DeliveryNode | undefined {
    const now = data.recordedAt || new Date().toISOString();
    const status: NodeStatus = data.exceptionDescription ? 'exception' : 'completed';
    const updatedAt = new Date().toISOString();

    if (data.version !== undefined) {
      const result = this.db
        .prepare(
          `UPDATE delivery_nodes SET
            status = ?,
            recorded_at = ?,
            location_text = ?,
            temperature = ?,
            exception_description = ?,
            client_submit_id = ?,
            version = COALESCE(version, 1) + 1,
            updated_at = ?
          WHERE id = ? AND version = ?`
        )
        .run(
          status,
          now,
          data.locationText,
          data.temperature ?? null,
          data.exceptionDescription ?? null,
          data.clientSubmitId ?? null,
          updatedAt,
          id,
          data.version
        );

      if (result.changes === 0) {
        return undefined;
      }

      return this.findById(id);
    }

    return this.updateWithVersionBump(id, {
      status,
      recordedAt: now,
      locationText: data.locationText,
      temperature: data.temperature,
      exceptionDescription: data.exceptionDescription,
      clientSubmitId: data.clientSubmitId,
      updatedAt,
    });
  }

  updateNodeStatus(id: string, status: NodeStatus): DeliveryNode | undefined {
    const updates: Partial<DeliveryNode> = {
      status,
      updatedAt: new Date().toISOString(),
    };
    if (status === 'in_progress') {
      updates.recordedAt = new Date().toISOString();
    }
    return this.updateWithVersionBump(id, updates);
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
    const updates: Partial<DeliveryNode> = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    return this.updateWithVersionBump(id, updates);
  }

  mapFromDatabase(row: Record<string, unknown>): DeliveryNode {
    return this.fromDatabase(row);
  }
}

export const nodeRepository = new NodeRepository();
