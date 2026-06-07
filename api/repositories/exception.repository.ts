import { BaseRepository } from './base';
import type {
  ExceptionHandling,
  ExceptionHandlingWithDetails,
  ExceptionHandlingQueryParams,
  ExceptionHandlingStatus,
  ExceptionHandlingResult,
  TemperatureZone,
  OrderStatus,
} from '../../shared/types';
import { taskRepository } from './task.repository';
import { nodeRepository } from './node.repository';
import { orderRepository } from './order.repository';
import { driverRepository } from './driver.repository';

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
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  };
  protected jsonFields: Array<keyof ExceptionHandling> = [];

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

  findWithDetails(params: ExceptionHandlingQueryParams = {}): { items: ExceptionHandlingWithDetails[]; total: number } {
    const conditions: string[] = [];
    const sqlParams: unknown[] = [];

    if (params.startDate) {
      conditions.push('eh.exception_time >= ?');
      sqlParams.push(params.startDate);
    }
    if (params.endDate) {
      conditions.push('eh.exception_time <= ?');
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
             u.name as handled_by_name
      FROM ${this.tableName} eh
      LEFT JOIN orders o ON eh.order_id = o.id
      LEFT JOIN drivers d ON eh.driver_id = d.id
      LEFT JOIN delivery_nodes n ON eh.node_id = n.id
      LEFT JOIN users u ON eh.handled_by = u.id
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
                u.name as handled_by_name
         FROM ${this.tableName} eh
         LEFT JOIN orders o ON eh.order_id = o.id
         LEFT JOIN drivers d ON eh.driver_id = d.id
         LEFT JOIN delivery_nodes n ON eh.node_id = n.id
         LEFT JOIN users u ON eh.handled_by = u.id
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
      };
    }

    return handling as ExceptionHandlingWithDetails;
  }

  createHandling(data: Omit<ExceptionHandling, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string; updatedAt?: string }): ExceptionHandling {
    const now = new Date().toISOString();
    const dataWithTimestamps = {
      ...data,
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

  countByHandlingStatus(handlingStatus: ExceptionHandlingStatus): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM ${this.tableName} WHERE handling_status = ?`
      )
      .get(handlingStatus) as { count: number };
    return row.count;
  }

  syncExceptionNodes(): number {
    const exceptionNodes = nodeRepository.findByStatus('exception');
    let createdCount = 0;

    for (const node of exceptionNodes) {
      const existing = this.findByNodeId(node.id);
      if (existing) continue;

      const task = taskRepository.findById(node.taskId);
      if (!task) continue;

      const order = orderRepository.findById(task.orderId);
      if (!order) continue;

      this.createHandling({
        nodeId: node.id,
        taskId: node.taskId,
        orderId: task.orderId,
        driverId: task.driverId,
        temperatureZone: order.temperatureZone,
        exceptionDescription: node.exceptionDescription || '未知异常',
        exceptionTime: node.recordedAt || node.createdAt,
        handlingStatus: 'pending',
      });

      createdCount++;
    }

    return createdCount;
  }
}

export const exceptionHandlingRepository = new ExceptionHandlingRepository();
