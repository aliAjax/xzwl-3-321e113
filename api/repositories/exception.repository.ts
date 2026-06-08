import { BaseRepository } from './base';
import type {
  ExceptionHandling,
  ExceptionHandlingWithDetails,
  ExceptionHandlingQueryParams,
  ExceptionHandlingStatus,
  ExceptionHandlingResult,
  TemperatureZone,
  OrderStatus,
  EscalationLevel,
  ExceptionProcessingNote,
  NodeType,
  SlaStatus,
} from '../../shared/types';
import { calculateSlaDeadline, calculateSlaStatus } from '../../shared/types';
import { taskRepository } from './task.repository';
import { nodeRepository } from './node.repository';
import { orderRepository } from './order.repository';
import { driverRepository } from './driver.repository';
import { userRepository } from './user.repository';
import { customerRepository } from './customer.repository';
import { processingNoteRepository } from './processing-notes.repository';

class ExceptionHandlingRepository extends BaseRepository<ExceptionHandling> {
  protected tableName = 'exception_handlings';
  protected fieldMap: Record<keyof ExceptionHandling, string> = {
    id: 'id',
    nodeId: 'node_id',
    node: 'node',
    taskId: 'task_id',
    task: 'task',
    orderId: 'order_id',
    order: 'order',
    driverId: 'driver_id',
    driver: 'driver',
    temperatureZone: 'temperature_zone',
    exceptionDescription: 'exception_description',
    exceptionTime: 'exception_time',
    handlingStatus: 'handling_status',
    handlingResult: 'handling_result',
    handlingNotes: 'handling_notes',
    handledBy: 'handled_by',
    handledAt: 'handled_at',
    escalationLevel: 'escalation_level',
    assigneeId: 'assignee_id',
    assignee: 'assignee',
    isClosed: 'is_closed',
    closedAt: 'closed_at',
    closedBy: 'closed_by',
    slaDeadline: 'sla_deadline',
    processingNotes: 'processing_notes',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  };
  protected jsonFields: Array<keyof ExceptionHandling> = ['processingNotes'];

  findByNodeId(nodeId: string): ExceptionHandling | undefined {
    return this.findOneByField('nodeId', nodeId);
  }

  findByTaskId(taskId: string): ExceptionHandling[] {
    return this.findByField('taskId', taskId, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByOrderId(orderId: string): ExceptionHandling[] {
    return this.findByField('orderId', orderId, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByDriverId(driverId: string): ExceptionHandling[] {
    return this.findByField('driverId', driverId, { orderBy: 'exceptionTime', orderDir: 'DESC' });
  }

  findByHandlingStatus(handlingStatus: ExceptionHandlingStatus): ExceptionHandling[] {
    return this.findByField('handlingStatus', handlingStatus, { orderBy: 'exceptionTime', orderDir: 'DESC' });
  }

  findByTemperatureZone(temperatureZone: TemperatureZone): ExceptionHandling[] {
    return this.findByField('temperatureZone', temperatureZone, { orderBy: 'exceptionTime', orderDir: 'DESC' });
  }

  findByDateRange(startDate: string, endDate: string): ExceptionHandling[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} 
         WHERE exception_time BETWEEN ? AND ? 
         ORDER BY exception_time DESC`
      )
      .all(startDate, endDate) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  findByAssigneeId(assigneeId: string): ExceptionHandling[] {
    return this.findByField('assigneeId', assigneeId, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByEscalationLevel(escalationLevel: EscalationLevel): ExceptionHandling[] {
    return this.findByField('escalationLevel', escalationLevel, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  findByIsClosed(isClosed: boolean): ExceptionHandling[] {
    return this.findByField('isClosed', isClosed ? 1 : 0, { orderBy: 'createdAt', orderDir: 'DESC' });
  }

  calculateSlaDeadlineForHandling(handling: ExceptionHandling): string | undefined {
    const node = nodeRepository.findById(handling.nodeId);
    if (!node) return undefined;

    const order = orderRepository.findById(handling.orderId);
    if (!order) return undefined;

    const customer = customerRepository.findById(order.customerId);
    const customerPriority = customer?.priority || 1;

    return calculateSlaDeadline(
      handling.exceptionTime,
      handling.temperatureZone,
      customerPriority,
      node.nodeType as NodeType,
      handling.escalationLevel
    );
  }

  updateSlaDeadline(id: string): ExceptionHandling | undefined {
    const handling = this.findById(id);
    if (!handling) return undefined;

    const slaDeadline = this.calculateSlaDeadlineForHandling(handling);
    return this.update(id, { slaDeadline, updatedAt: new Date().toISOString() });
  }

  getSlaStats(params: ExceptionHandlingQueryParams = {}): { slaOnTime: number; slaWarning: number; slaOverdue: number } {
    const conditions: string[] = [];
    const sqlParams: unknown[] = [];

    if (params.startDate) {
      conditions.push('datetime(eh.exception_time) >= datetime(?)');
      sqlParams.push(params.startDate);
    }
    if (params.endDate) {
      conditions.push('datetime(eh.exception_time) <= datetime(?)');
      sqlParams.push(params.endDate);
    }
    if (params.temperatureZone) {
      conditions.push('eh.temperature_zone = ?');
      sqlParams.push(params.temperatureZone);
    }
    if (params.driverId) {
      conditions.push('eh.driver_id = ?');
      sqlParams.push(params.driverId);
    }
    if (params.handlingStatus) {
      conditions.push('eh.handling_status = ?');
      sqlParams.push(params.handlingStatus);
    }
    if (params.escalationLevel) {
      conditions.push('eh.escalation_level = ?');
      sqlParams.push(params.escalationLevel);
    }
    if (params.assigneeId) {
      conditions.push('eh.assignee_id = ?');
      sqlParams.push(params.assigneeId);
    }
    if (params.isClosed !== undefined) {
      conditions.push('eh.is_closed = ?');
      sqlParams.push(params.isClosed ? 1 : 0);
    }

    if (params.highPriority) {
      conditions.push('(eh.escalation_level = ? OR (eh.sla_deadline IS NOT NULL AND datetime(eh.sla_deadline) < datetime(\'now\') AND eh.is_closed = 0))');
      sqlParams.push('level_3');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT eh.*, o.customer_id as order_customer_id
      FROM ${this.tableName} eh
      LEFT JOIN orders o ON eh.order_id = o.id
      ${whereClause}
    `;

    const rows = this.db.prepare(sql).all(...sqlParams) as Record<string, unknown>[];
    const now = new Date();

    let slaOnTime = 0;
    let slaWarning = 0;
    let slaOverdue = 0;

    for (const row of rows) {
      const handling = this.fromDatabase(row);
      const status = calculateSlaStatus(handling.slaDeadline, handling.isClosed, now);
      
      if (status === 'on_time') slaOnTime++;
      else if (status === 'warning') slaWarning++;
      else if (status === 'overdue') slaOverdue++;
    }

    return { slaOnTime, slaWarning, slaOverdue };
  }

  findOverdueExceptions(): ExceptionHandling[] {
    const now = new Date().toISOString();
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} 
         WHERE is_closed = 0 
           AND sla_deadline IS NOT NULL 
           AND datetime(sla_deadline) < datetime(?)
         ORDER BY sla_deadline ASC`
      )
      .all(now) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  autoEscalateOverdue(): { totalOverdue: number; level3Count: number; needsAttention: number } {
    const overdue = this.findOverdueExceptions();
    let level3Count = 0;
    let needsAttention = 0;

    for (const handling of overdue) {
      if (handling.escalationLevel === 'level_3') {
        level3Count++;
      } else {
        needsAttention++;
      }
    }

    return {
      totalOverdue: overdue.length,
      level3Count,
      needsAttention,
    };
  }

  countByEscalationLevel(escalationLevel: EscalationLevel): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM ${this.tableName} WHERE escalation_level = ?`)
      .get(escalationLevel) as { count: number };
    return row.count;
  }

  countByIsClosed(isClosed: boolean): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM ${this.tableName} WHERE is_closed = ?`)
      .get(isClosed ? 1 : 0) as { count: number };
    return row.count;
  }

  countUnassigned(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM ${this.tableName} WHERE assignee_id IS NULL`)
      .get() as { count: number };
    return row.count;
  }

  findWithDetails(params: ExceptionHandlingQueryParams = {}): { items: ExceptionHandlingWithDetails[]; total: number } {
    const conditions: string[] = [];
    const sqlParams: unknown[] = [];

    if (params.startDate) {
      conditions.push('datetime(eh.exception_time) >= datetime(?)');
      sqlParams.push(params.startDate);
    }
    if (params.endDate) {
      conditions.push('datetime(eh.exception_time) <= datetime(?)');
      sqlParams.push(params.endDate);
    }
    if (params.temperatureZone) {
      conditions.push('eh.temperature_zone = ?');
      sqlParams.push(params.temperatureZone);
    }
    if (params.driverId) {
      conditions.push('eh.driver_id = ?');
      sqlParams.push(params.driverId);
    }
    if (params.handlingStatus) {
      conditions.push('eh.handling_status = ?');
      sqlParams.push(params.handlingStatus);
    }
    if (params.orderStatus) {
      conditions.push('o.status = ?');
      sqlParams.push(params.orderStatus);
    }
    if (params.escalationLevel) {
      conditions.push('eh.escalation_level = ?');
      sqlParams.push(params.escalationLevel);
    }
    if (params.assigneeId) {
      conditions.push('eh.assignee_id = ?');
      sqlParams.push(params.assigneeId);
    }
    if (params.isClosed !== undefined) {
      conditions.push('eh.is_closed = ?');
      sqlParams.push(params.isClosed ? 1 : 0);
    }

    if (params.highPriority) {
      conditions.push('(eh.escalation_level = ? OR (eh.sla_deadline IS NOT NULL AND datetime(eh.sla_deadline) < datetime(\'now\') AND eh.is_closed = 0))');
      sqlParams.push('level_3');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(*) as count 
      FROM ${this.tableName} eh
      LEFT JOIN orders o ON eh.order_id = o.id
      ${whereClause}
    `;
    const countRow = this.db.prepare(countSql).get(...sqlParams) as { count: number };
    const total = countRow.count;

    let dataSql = `
      SELECT eh.*,
             o.order_no as order_order_no,
             o.goods_name as order_goods_name,
             o.status as order_status,
             o.delivery_address as order_delivery_address,
             o.scheduled_delivery_time as order_scheduled_delivery_time,
             o.min_temp as order_min_temp,
             o.max_temp as order_max_temp,
             d.name as driver_name,
             d.phone as driver_phone,
             n.node_type as node_node_type,
             n.node_name as node_node_name,
             n.temperature as node_temperature,
             n.location_text as node_location_text,
             n.recorded_at as node_recorded_at,
             n.operator_name as node_operator_name,
             u.name as handled_by_name,
             a.name as assignee_name,
             a.username as assignee_username,
             a.role as assignee_role,
             a.phone as assignee_phone,
             cb.name as closed_by_name
      FROM ${this.tableName} eh
      LEFT JOIN orders o ON eh.order_id = o.id
      LEFT JOIN drivers d ON eh.driver_id = d.id
      LEFT JOIN delivery_nodes n ON eh.node_id = n.id
      LEFT JOIN users u ON eh.handled_by = u.id
      LEFT JOIN users a ON eh.assignee_id = a.id
      LEFT JOIN users cb ON eh.closed_by = cb.id
      ${whereClause}
      ORDER BY eh.exception_time DESC
    `;

    if (params.page && params.pageSize) {
      dataSql += ' LIMIT ? OFFSET ?';
      sqlParams.push(params.pageSize, (params.page - 1) * params.pageSize);
    }

    const rows = this.db.prepare(dataSql).all(...sqlParams) as Record<string, unknown>[];

    const items = rows.map(row => {
      const handling = this.fromDatabase(row);

      if (row.order_order_no) {
        handling.order = {
          id: row.order_id as string,
          orderNo: row.order_order_no as string,
          customerId: '',
          temperatureZone: row.temperature_zone as TemperatureZone,
          minTemp: row.order_min_temp as number,
          maxTemp: row.order_max_temp as number,
          goodsName: row.order_goods_name as string,
          quantity: 0,
          weight: 0,
          deliveryAddress: row.order_delivery_address as string,
          scheduledDeliveryTime: row.order_scheduled_delivery_time as string,
          status: row.order_status as OrderStatus,
          remarks: '',
          createdAt: '',
          updatedAt: '',
        };
      }

      if (row.driver_name) {
        handling.driver = {
          id: row.driver_id as string,
          name: row.driver_name as string,
          phone: row.driver_phone as string,
          licenseNo: '',
          licenseType: '',
          status: 'on_duty',
          createdAt: '',
        };
      }

      if (row.node_node_type) {
        handling.node = {
          id: row.node_id as string,
          taskId: row.task_id as string,
          nodeType: row.node_node_type as any,
          nodeName: row.node_node_name as string,
          status: 'exception',
          recordedAt: row.node_recorded_at as string,
          locationText: row.node_location_text as string,
          exceptionDescription: row.exception_description as string,
          temperature: row.node_temperature as number,
          operatorId: '',
          operatorName: row.node_operator_name as string,
          createdAt: '',
          version: 1,
          updatedAt: row.node_recorded_at as string || new Date().toISOString(),
        };
      }

      if (row.assignee_name) {
        handling.assignee = {
          id: row.assignee_id as string,
          username: row.assignee_username as string,
          role: row.assignee_role as any,
          name: row.assignee_name as string,
          phone: row.assignee_phone as string,
          createdAt: '',
        };
      }

      return handling as ExceptionHandlingWithDetails;
    });

    return { items, total };
  }

  findByIdWithDetails(id: string): ExceptionHandlingWithDetails | undefined {
    const row = this.db
      .prepare(
        `SELECT eh.*,
                o.order_no as order_order_no,
                o.goods_name as order_goods_name,
                o.status as order_status,
                o.delivery_address as order_delivery_address,
                o.scheduled_delivery_time as order_scheduled_delivery_time,
                o.min_temp as order_min_temp,
                o.max_temp as order_max_temp,
                o.customer_id as order_customer_id,
                d.name as driver_name,
                d.phone as driver_phone,
                n.node_type as node_node_type,
                n.node_name as node_node_name,
                n.temperature as node_temperature,
                n.location_text as node_location_text,
                n.recorded_at as node_recorded_at,
                n.operator_name as node_operator_name,
                n.operator_id as node_operator_id,
                u.name as handled_by_name,
                a.name as assignee_name,
                a.username as assignee_username,
                a.role as assignee_role,
                a.phone as assignee_phone,
                cb.name as closed_by_name
         FROM ${this.tableName} eh
         LEFT JOIN orders o ON eh.order_id = o.id
         LEFT JOIN drivers d ON eh.driver_id = d.id
         LEFT JOIN delivery_nodes n ON eh.node_id = n.id
         LEFT JOIN users u ON eh.handled_by = u.id
         LEFT JOIN users a ON eh.assignee_id = a.id
         LEFT JOIN users cb ON eh.closed_by = cb.id
         WHERE eh.id = ?`
      )
      .get(id) as Record<string, unknown> | undefined;

    if (!row) return undefined;

    const handling = this.fromDatabase(row);

    if (row.order_order_no) {
      handling.order = {
        id: row.order_id as string,
        orderNo: row.order_order_no as string,
        customerId: row.order_customer_id as string,
        temperatureZone: row.temperature_zone as TemperatureZone,
        minTemp: row.order_min_temp as number,
        maxTemp: row.order_max_temp as number,
        goodsName: row.order_goods_name as string,
        quantity: 0,
        weight: 0,
        deliveryAddress: row.order_delivery_address as string,
        scheduledDeliveryTime: row.order_scheduled_delivery_time as string,
        status: row.order_status as OrderStatus,
        remarks: '',
        createdAt: '',
        updatedAt: '',
      };
    }

    if (row.driver_name) {
      handling.driver = {
        id: row.driver_id as string,
        name: row.driver_name as string,
        phone: row.driver_phone as string,
        licenseNo: '',
        licenseType: '',
        status: 'on_duty',
        createdAt: '',
      };
    }

    if (row.node_node_type) {
      handling.node = {
        id: row.node_id as string,
        taskId: row.task_id as string,
        nodeType: row.node_node_type as any,
        nodeName: row.node_node_name as string,
        status: 'exception',
        recordedAt: row.node_recorded_at as string,
        locationText: row.node_location_text as string,
        exceptionDescription: row.exception_description as string,
        temperature: row.node_temperature as number,
        operatorId: row.node_operator_id as string,
        operatorName: row.node_operator_name as string,
        createdAt: '',
        version: 1,
        updatedAt: row.node_recorded_at as string || new Date().toISOString(),
      };
    }

    if (row.assignee_name) {
      handling.assignee = {
        id: row.assignee_id as string,
        username: row.assignee_username as string,
        role: row.assignee_role as any,
        name: row.assignee_name as string,
        phone: row.assignee_phone as string,
        createdAt: '',
      };
    }

    return handling as ExceptionHandlingWithDetails;
  }

  createHandling(
    data: Omit<ExceptionHandling, 'id' | 'createdAt' | 'updatedAt' | 'escalationLevel' | 'isClosed'> & {
      id?: string;
      createdAt?: string;
      updatedAt?: string;
      escalationLevel?: EscalationLevel;
      isClosed?: boolean;
    }
  ): ExceptionHandling {
    const now = new Date().toISOString();
    const escalationLevel = data.escalationLevel || 'level_1' as EscalationLevel;
    
    const tempHandling: ExceptionHandling = {
      id: '',
      nodeId: data.nodeId,
      taskId: data.taskId,
      orderId: data.orderId,
      driverId: data.driverId,
      temperatureZone: data.temperatureZone,
      exceptionDescription: data.exceptionDescription,
      exceptionTime: data.exceptionTime,
      handlingStatus: data.handlingStatus,
      escalationLevel,
      isClosed: false,
      createdAt: now,
      updatedAt: now,
    };
    
    const slaDeadline = this.calculateSlaDeadlineForHandling(tempHandling);
    
    const dataWithTimestamps = {
      ...data,
      escalationLevel,
      isClosed: data.isClosed || false,
      slaDeadline,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    };
    return this.create(dataWithTimestamps);
  }

  updateHandling(
    id: string,
    data: {
      handlingStatus: ExceptionHandlingStatus;
      handlingResult?: ExceptionHandlingResult;
      handlingNotes?: string;
      handledBy?: string;
      handledAt?: string;
    }
  ): ExceptionHandling | undefined {
    const now = new Date().toISOString();
    return this.update(id, {
      ...data,
      updatedAt: now,
      handledAt: data.handledAt || (data.handlingStatus !== 'pending' ? now : undefined),
    });
  }

  assignHandling(
    id: string,
    assigneeId: string
  ): ExceptionHandling | undefined {
    const now = new Date().toISOString();
    return this.update(id, {
      assigneeId,
      updatedAt: now,
    });
  }

  escalateHandling(
    id: string,
    escalationLevel: EscalationLevel
  ): ExceptionHandling | undefined {
    const now = new Date().toISOString();
    const existing = this.findById(id);
    if (!existing) return undefined;

    const updatedHandling = { ...existing, escalationLevel };
    const slaDeadline = this.calculateSlaDeadlineForHandling(updatedHandling);

    return this.update(id, {
      escalationLevel,
      slaDeadline,
      updatedAt: now,
    });
  }

  closeHandling(
    id: string,
    handlingResult: ExceptionHandlingResult,
    handlingNotes: string,
    closedBy: string
  ): ExceptionHandling | undefined {
    const now = new Date().toISOString();
    return this.update(id, {
      handlingResult,
      handlingNotes,
      handlingStatus: 'resolved',
      isClosed: true,
      closedAt: now,
      closedBy,
      handledBy: closedBy,
      handledAt: now,
      updatedAt: now,
    });
  }

  reopenHandling(
    id: string,
    reopenedBy: string
  ): ExceptionHandling | undefined {
    const now = new Date().toISOString();
    return this.update(id, {
      handlingStatus: 'pending',
      isClosed: false,
      closedAt: null as any,
      closedBy: null as any,
      updatedAt: now,
    });
  }

  countByHandlingStatus(handlingStatus: ExceptionHandlingStatus): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM ${this.tableName} WHERE handling_status = ?`
      )
      .get(handlingStatus) as { count: number };
    return row.count;
  }

  syncExceptionNodes(): { total: number; created: number; existing: number; skipped: number; slaUpdated: number } {
    const exceptionNodes = nodeRepository.findByStatus('exception');
    let createdCount = 0;
    let existingCount = 0;
    let skippedCount = 0;
    let slaUpdatedCount = 0;

    for (const node of exceptionNodes) {
      const existing = this.findByNodeId(node.id);
      if (existing) {
        existingCount++;
        let needsUpdate = false;
        const updates: Partial<ExceptionHandling> = {};

        if (!existing.escalationLevel) {
          updates.escalationLevel = 'level_1';
          updates.isClosed = existing.handlingStatus === 'resolved' ? true : false;
          needsUpdate = true;
        }

        if (!existing.slaDeadline) {
          const slaDeadline = this.calculateSlaDeadlineForHandling(existing);
          if (slaDeadline) {
            updates.slaDeadline = slaDeadline;
            needsUpdate = true;
            slaUpdatedCount++;
          }
        }

        if (needsUpdate) {
          this.update(existing.id, updates);
        }
        continue;
      }

      const task = taskRepository.findById(node.taskId);
      if (!task) {
        skippedCount++;
        continue;
      }

      const order = orderRepository.findById(task.orderId);
      if (!order) {
        skippedCount++;
        continue;
      }

      const handling = this.createHandling({
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

      processingNoteRepository.addNoteWithAction(
        handling.id,
        '系统自动创建异常工单',
        'create',
        undefined,
        '系统'
      );

      createdCount++;
    }

    return {
      total: exceptionNodes.length,
      created: createdCount,
      existing: existingCount,
      skipped: skippedCount,
      slaUpdated: slaUpdatedCount,
    };
  }

  getWorkorderStats(params: ExceptionHandlingQueryParams = {}): {
    total: number;
    pending: number;
    resolved: number;
    escalated: number;
    closed: number;
    open: number;
    level1: number;
    level2: number;
    level3: number;
    unassigned: number;
    slaOnTime: number;
    slaWarning: number;
    slaOverdue: number;
  } {
    const conditions: string[] = [];
    const sqlParams: unknown[] = [];

    if (params.startDate) {
      conditions.push('datetime(exception_time) >= datetime(?)');
      sqlParams.push(params.startDate);
    }
    if (params.endDate) {
      conditions.push('datetime(exception_time) <= datetime(?)');
      sqlParams.push(params.endDate);
    }
    if (params.temperatureZone) {
      conditions.push('temperature_zone = ?');
      sqlParams.push(params.temperatureZone);
    }
    if (params.driverId) {
      conditions.push('driver_id = ?');
      sqlParams.push(params.driverId);
    }
    if (params.handlingStatus) {
      conditions.push('handling_status = ?');
      sqlParams.push(params.handlingStatus);
    }
    if (params.escalationLevel) {
      conditions.push('escalation_level = ?');
      sqlParams.push(params.escalationLevel);
    }
    if (params.assigneeId) {
      conditions.push('assignee_id = ?');
      sqlParams.push(params.assigneeId);
    }
    if (params.isClosed !== undefined) {
      conditions.push('is_closed = ?');
      sqlParams.push(params.isClosed ? 1 : 0);
    }

    if (params.highPriority) {
      conditions.push('(escalation_level = ? OR (sla_deadline IS NOT NULL AND datetime(sla_deadline) < datetime(\'now\') AND is_closed = 0))');
      sqlParams.push('level_3');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
    const totalRow = this.db.prepare(countSql).get(...sqlParams) as { count: number };
    const total = totalRow.count;

    const pendingRow = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause} ${conditions.length > 0 ? 'AND' : 'WHERE'} handling_status = ?`).get(...sqlParams, 'pending') as { count: number };
    const pending = pendingRow.count;

    const resolvedRow = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause} ${conditions.length > 0 ? 'AND' : 'WHERE'} handling_status = ?`).get(...sqlParams, 'resolved') as { count: number };
    const resolved = resolvedRow.count;

    const escalatedRow = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause} ${conditions.length > 0 ? 'AND' : 'WHERE'} handling_status = ?`).get(...sqlParams, 'escalated') as { count: number };
    const escalated = escalatedRow.count;

    const closedRow = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause} ${conditions.length > 0 ? 'AND' : 'WHERE'} is_closed = ?`).get(...sqlParams, 1) as { count: number };
    const closed = closedRow.count;

    const level1Row = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause} ${conditions.length > 0 ? 'AND' : 'WHERE'} escalation_level = ?`).get(...sqlParams, 'level_1') as { count: number };
    const level1 = level1Row.count;

    const level2Row = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause} ${conditions.length > 0 ? 'AND' : 'WHERE'} escalation_level = ?`).get(...sqlParams, 'level_2') as { count: number };
    const level2 = level2Row.count;

    const level3Row = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause} ${conditions.length > 0 ? 'AND' : 'WHERE'} escalation_level = ?`).get(...sqlParams, 'level_3') as { count: number };
    const level3 = level3Row.count;

    const unassignedRow = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause} ${conditions.length > 0 ? 'AND' : 'WHERE'} assignee_id IS NULL`).get(...sqlParams) as { count: number };
    const unassigned = unassignedRow.count;

    const slaStats = this.getSlaStats(params);

    return {
      total,
      pending,
      resolved,
      escalated,
      closed,
      open: total - closed,
      level1,
      level2,
      level3,
      unassigned,
      slaOnTime: slaStats.slaOnTime,
      slaWarning: slaStats.slaWarning,
      slaOverdue: slaStats.slaOverdue,
    };
  }

  findProcessingNotes(exceptionHandlingId: string): ExceptionProcessingNote[] {
    return processingNoteRepository.findByExceptionHandlingId(exceptionHandlingId);
  }

  addProcessingNote(
    exceptionHandlingId: string,
    note: string,
    actionType: ExceptionProcessingNote['actionType'],
    createdBy?: string,
    createdByName?: string,
    oldValue?: string,
    newValue?: string
  ): ExceptionProcessingNote {
    return processingNoteRepository.addNoteWithAction(
      exceptionHandlingId,
      note,
      actionType,
      createdBy,
      createdByName,
      oldValue,
      newValue
    );
  }
}

export const exceptionHandlingRepository = new ExceptionHandlingRepository();
