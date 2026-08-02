import Database from 'better-sqlite3';
import assert from 'assert';
import { v4 as uuidv4 } from 'uuid';
import type { Database as DatabaseType } from 'better-sqlite3';

import { BaseRepository } from '../api/repositories/base';
import { orderRepository } from '../api/repositories/order.repository';
import { taskRepository } from '../api/repositories/task.repository';
import { nodeRepository } from '../api/repositories/node.repository';
import { exceptionHandlingRepository } from '../api/repositories/exception.repository';
import { processingNoteRepository } from '../api/repositories/processing-notes.repository';
import { customerRepository } from '../api/repositories/customer.repository';
import { temperatureEvidenceRepository } from '../api/repositories/temperature-evidence.repository';
import { temperatureImportService } from '../api/services/temperatureImport.service';
import { deliveryService } from '../api/services/delivery.service';
import * as V007 from './migrations/V007__temperature_evidence_ledger';
import type {
  Order,
  DeliveryTask,
  DeliveryNode,
  User,
  TemperatureRecordColumnMapping,
} from '../shared/types';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    const msg = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${msg}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${msg}`);
  }
}

function initTestDatabase(): DatabaseType {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const migrations = [
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'dispatcher', 'driver')),
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20),
      driver_id VARCHAR(36) REFERENCES drivers(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS customers (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      contact_name VARCHAR(50) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      address TEXT NOT NULL,
      priority INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id VARCHAR(36) PRIMARY KEY,
      order_no VARCHAR(50) UNIQUE NOT NULL,
      customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
      temperature_zone VARCHAR(20) NOT NULL CHECK (temperature_zone IN ('frozen', 'chilled', 'ambient')),
      min_temp DECIMAL(5,2) NOT NULL,
      max_temp DECIMAL(5,2) NOT NULL,
      goods_name VARCHAR(200) NOT NULL,
      quantity INTEGER NOT NULL,
      weight DECIMAL(10,2) NOT NULL,
      delivery_address TEXT NOT NULL,
      scheduled_delivery_time DATETIME NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'warehoused', 'loading', 'in_transit', 'delivered', 'completed', 'cancelled')),
      remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS vehicles (
      id VARCHAR(36) PRIMARY KEY,
      plate_no VARCHAR(20) UNIQUE NOT NULL,
      vehicle_type VARCHAR(50) NOT NULL,
      temperature_zones VARCHAR(100) NOT NULL,
      capacity DECIMAL(10,2) NOT NULL,
      driver_id VARCHAR(36),
      available_start_time TIME NOT NULL,
      available_end_time TIME NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'disabled')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS drivers (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      license_no VARCHAR(50) NOT NULL,
      license_type VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'on_duty' CHECK (status IN ('on_duty', 'off_duty', 'on_leave')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS routes (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      stops_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS loading_batches (
      id VARCHAR(36) PRIMARY KEY,
      batch_no VARCHAR(50) UNIQUE NOT NULL,
      vehicle_id VARCHAR(36) NOT NULL REFERENCES vehicles(id),
      driver_id VARCHAR(36) NOT NULL REFERENCES drivers(id),
      route_id VARCHAR(36) NOT NULL REFERENCES routes(id),
      order_ids_json TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'loading', 'departed', 'completed')),
      departure_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS delivery_tasks (
      id VARCHAR(36) PRIMARY KEY,
      batch_id VARCHAR(36) NOT NULL REFERENCES loading_batches(id),
      order_id VARCHAR(36) NOT NULL REFERENCES orders(id),
      driver_id VARCHAR(36) NOT NULL REFERENCES drivers(id),
      vehicle_id VARCHAR(36) NOT NULL REFERENCES vehicles(id),
      status VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'warehoused', 'loading', 'in_transit', 'delivered', 'completed', 'cancelled')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(order_id)
    )`,
    `CREATE TABLE IF NOT EXISTS delivery_nodes (
      id VARCHAR(36) PRIMARY KEY,
      task_id VARCHAR(36) NOT NULL REFERENCES delivery_tasks(id),
      node_type VARCHAR(30) NOT NULL CHECK (node_type IN ('warehouse_in', 'loading', 'departure', 'arrival', 'delivery', 'signature')),
      node_name VARCHAR(100) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'exception')),
      recorded_at DATETIME,
      location_text VARCHAR(200),
      exception_description TEXT,
      temperature DECIMAL(5,2),
      operator_id VARCHAR(36) REFERENCES users(id),
      operator_name VARCHAR(100),
      client_submit_id VARCHAR(64),
      version INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS exception_handlings (
      id VARCHAR(36) PRIMARY KEY,
      node_id VARCHAR(36) NOT NULL REFERENCES delivery_nodes(id),
      task_id VARCHAR(36) NOT NULL REFERENCES delivery_tasks(id),
      order_id VARCHAR(36) NOT NULL REFERENCES orders(id),
      driver_id VARCHAR(36) NOT NULL REFERENCES drivers(id),
      temperature_zone VARCHAR(20) NOT NULL CHECK (temperature_zone IN ('frozen', 'chilled', 'ambient')),
      exception_description TEXT NOT NULL,
      exception_time DATETIME NOT NULL,
      handling_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (handling_status IN ('pending', 'resolved', 'escalated')),
      handling_result VARCHAR(20) CHECK (handling_result IN ('recovered', 'compensated', 're_routed', 'cancelled', 'other')),
      handling_notes TEXT,
      handled_by VARCHAR(36) REFERENCES users(id),
      handled_at DATETIME,
      escalation_level VARCHAR(20) NOT NULL DEFAULT 'level_1' CHECK (escalation_level IN ('level_1', 'level_2', 'level_3')),
      assignee_id VARCHAR(36) REFERENCES users(id),
      is_closed BOOLEAN NOT NULL DEFAULT 0,
      closed_by VARCHAR(36) REFERENCES users(id),
      closed_at DATETIME,
      sla_deadline DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(node_id)
    )`,
    `CREATE TABLE IF NOT EXISTS exception_processing_notes (
      id VARCHAR(36) PRIMARY KEY,
      exception_handling_id VARCHAR(36) NOT NULL REFERENCES exception_handlings(id),
      note TEXT NOT NULL,
      created_by VARCHAR(36) REFERENCES users(id),
      created_by_name VARCHAR(100),
      action_type VARCHAR(20) NOT NULL,
      old_value TEXT,
      new_value TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  migrations.forEach(sql => db.exec(sql));

  // 温度证据账本表：与生产迁移保持一致，直接复用 V007
  V007.up(db);

  return db;
}

function patchRepositories(db: DatabaseType): void {
  (BaseRepository.prototype as any).db = db;
  (orderRepository as any).db = db;
  (taskRepository as any).db = db;
  (nodeRepository as any).db = db;
  (exceptionHandlingRepository as any).db = db;
  (processingNoteRepository as any).db = db;
  (customerRepository as any).db = db;
  (temperatureEvidenceRepository as any).db = db;
}

function createTestUser(): User {
  const id = uuidv4();
  testDb.prepare(`
    INSERT INTO users (id, username, password_hash, role, name, phone, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, 'testuser', 'hash', 'dispatcher', 'Test User', '13800138000', new Date().toISOString());
  return {
    id,
    username: 'testuser',
    role: 'dispatcher',
    name: 'Test User',
    phone: '13800138000',
    createdAt: new Date().toISOString(),
  };
}

function createTestCustomer(): string {
  const id = uuidv4();
  testDb.prepare(`
    INSERT INTO customers (id, name, contact_name, phone, address, priority, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, 'Test Customer', 'Contact', '13800138000', 'Test Address', 1, new Date().toISOString());
  return id;
}

function createTestDriver(): string {
  const id = uuidv4();
  testDb.prepare(`
    INSERT INTO drivers (id, name, phone, license_no, license_type, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, 'Test Driver', '13800138001', 'LICENSE123', 'A1', 'on_duty', new Date().toISOString());
  return id;
}

function createTestVehicle(driverId: string): string {
  const id = uuidv4();
  testDb.prepare(`
    INSERT INTO vehicles (id, plate_no, vehicle_type, temperature_zones, capacity, driver_id, available_start_time, available_end_time, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, '京A12345', '冷藏车', 'chilled', 1000, driverId, '08:00', '20:00', 'active', new Date().toISOString());
  return id;
}

function createTestRoute(): string {
  const id = uuidv4();
  testDb.prepare(`
    INSERT INTO routes (id, name, description, stops_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, 'Test Route', 'Test Description', '[]', new Date().toISOString());
  return id;
}

function createTestBatch(vehicleId: string, driverId: string, routeId: string, orderIds: string[]): string {
  const id = uuidv4();
  testDb.prepare(`
    INSERT INTO loading_batches (id, batch_no, vehicle_id, driver_id, route_id, order_ids_json, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, 'BATCH001', vehicleId, driverId, routeId, JSON.stringify(orderIds), 'created', new Date().toISOString());
  return id;
}

function createTestOrder(orderNo: string, customerId: string, minTemp: number, maxTemp: number): Order {
  const id = uuidv4();
  const now = new Date().toISOString();
  testDb.prepare(`
    INSERT INTO orders (id, order_no, customer_id, temperature_zone, min_temp, max_temp, goods_name, quantity, weight, delivery_address, scheduled_delivery_time, status, remarks, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, orderNo, customerId, 'chilled', minTemp, maxTemp, 'Test Goods', 10, 100, 'Test Address', now, 'created', '', now, now
  );
  return orderRepository.findById(id)!;
}

function createTestTask(orderId: string, batchId: string, driverId: string, vehicleId: string): DeliveryTask {
  const id = uuidv4();
  testDb.prepare(`
    INSERT INTO delivery_tasks (id, batch_id, order_id, driver_id, vehicle_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, batchId, orderId, driverId, vehicleId, 'created', new Date().toISOString());
  return taskRepository.findById(id)!;
}

function createTestNodes(taskId: string, userId: string, userName: string): DeliveryNode[] {
  const nodeTypes = [
    { type: 'warehouse_in', name: '入库' },
    { type: 'loading', name: '装车' },
    { type: 'departure', name: '出发' },
    { type: 'arrival', name: '到达' },
    { type: 'delivery', name: '配送' },
    { type: 'signature', name: '签收' },
  ];

  const nodes: DeliveryNode[] = [];
  const now = new Date().toISOString();

  for (const nt of nodeTypes) {
    const id = uuidv4();
    testDb.prepare(`
      INSERT INTO delivery_nodes (id, task_id, node_type, node_name, status, location_text, operator_id, operator_name, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, taskId, nt.type, nt.name, 'pending', '', userId, userName, 1, now, now);
    nodes.push(nodeRepository.findById(id)!);
  }

  return nodes;
}

function setupFullTestData(): {
  user: User; order: Order; task: DeliveryTask; nodes: DeliveryNode[] } {
  testDb.exec('DELETE FROM exception_processing_notes');
  testDb.exec('DELETE FROM exception_handlings');
  testDb.exec('DELETE FROM temperature_evidence');
  testDb.exec('DELETE FROM delivery_nodes');
  testDb.exec('DELETE FROM delivery_tasks');
  testDb.exec('DELETE FROM loading_batches');
  testDb.exec('DELETE FROM orders');
  testDb.exec('DELETE FROM customers');
  testDb.exec('DELETE FROM routes');
  testDb.exec('DELETE FROM vehicles');
  testDb.exec('DELETE FROM drivers');
  testDb.exec('DELETE FROM users');

  const user = createTestUser();
  const customerId = createTestCustomer();
  const driverId = createTestDriver();
  const vehicleId = createTestVehicle(driverId);
  const routeId = createTestRoute();
  const order = createTestOrder('ORD001', customerId, 0, 8);
  const batchId = createTestBatch(vehicleId, driverId, routeId, [order.id]);
  const task = createTestTask(order.id, batchId, driverId, vehicleId);
  const nodes = createTestNodes(task.id, user.id, user.name);

  return { user, order, task, nodes };
}

console.log('========================================');
console.log('温度记录导入服务层测试');
console.log('========================================');

console.log('\n[初始化] 创建内存数据库...');
const testDb = initTestDatabase();
patchRepositories(testDb);
console.log('✓ 内存数据库初始化完成');

console.log('\n========================================');
console.log('1. 表头自动识别测试');
console.log('========================================');

test('标准中文表头自动识别', () => {
  const headers = ['订单号', '节点类型', '记录时间', '温度', '位置', '操作人'];
  const mapping = temperatureImportService.autoDetectMapping(headers);
  assert.strictEqual(mapping.orderNo, 0, '订单号列索引应为0');
  assert.strictEqual(mapping.nodeType, 1, '节点类型列索引应为1');
  assert.strictEqual(mapping.recordedAt, 2, '记录时间列索引应为2');
  assert.strictEqual(mapping.temperature, 3, '温度列索引应为3');
  assert.strictEqual(mapping.locationText, 4, '位置列索引应为4');
  assert.strictEqual(mapping.operatorName, 5, '操作人列索引应为5');
});

test('英文表头自动识别', () => {
  const headers = ['OrderNo', 'NodeType', 'RecordedAt', 'Temperature', 'Location', 'Operator'];
  const mapping = temperatureImportService.autoDetectMapping(headers);
  assert.strictEqual(mapping.orderNo, 0);
  assert.strictEqual(mapping.nodeType, 1);
  assert.strictEqual(mapping.recordedAt, 2);
  assert.strictEqual(mapping.temperature, 3);
  assert.strictEqual(mapping.locationText, 4);
  assert.strictEqual(mapping.operatorName, 5);
});

test('混合大小写和空格表头', () => {
  const headers = [' Order No ', ' Node Type ', ' Recorded At ', ' Temp ', ' Location ', ' Operator Name '];
  const mapping = temperatureImportService.autoDetectMapping(headers);
  assert.strictEqual(mapping.orderNo, 0);
  assert.strictEqual(mapping.nodeType, 1);
  assert.strictEqual(mapping.recordedAt, 2);
  assert.strictEqual(mapping.temperature, 3);
});

test('别名表头识别 - 订单编号、测温值、发生时间', () => {
  const headers = ['订单编号', '操作类型', '发生时间', '测温值', '存放位置', '经办人'];
  const mapping = temperatureImportService.autoDetectMapping(headers);
  assert.strictEqual(mapping.orderNo, 0);
  assert.strictEqual(mapping.nodeType, 1);
  assert.strictEqual(mapping.recordedAt, 2);
  assert.strictEqual(mapping.temperature, 3);
  assert.strictEqual(mapping.locationText, 4);
  assert.strictEqual(mapping.operatorName, 5);
});

test('别名表头识别 - order_id、环节、日期', () => {
  const headers = ['order_id', '环节', '日期', 'temperature', '地址', '负责人'];
  const mapping = temperatureImportService.autoDetectMapping(headers);
  assert.strictEqual(mapping.orderNo, 0);
  assert.strictEqual(mapping.nodeType, 1);
  assert.strictEqual(mapping.recordedAt, 2);
  assert.strictEqual(mapping.temperature, 3);
  assert.strictEqual(mapping.locationText, 4);
  assert.strictEqual(mapping.operatorName, 5);
});

test('列顺序打乱时仍能正确识别', () => {
  const headers = ['温度', '订单号', '操作人', '节点类型', '位置', '记录时间'];
  const mapping = temperatureImportService.autoDetectMapping(headers);
  assert.strictEqual(mapping.temperature, 0);
  assert.strictEqual(mapping.orderNo, 1);
  assert.strictEqual(mapping.operatorName, 2);
  assert.strictEqual(mapping.nodeType, 3);
  assert.strictEqual(mapping.locationText, 4);
  assert.strictEqual(mapping.recordedAt, 5);
});

test('缺少可选列时只识别必需列', () => {
  const headers = ['订单号', '节点类型', '记录时间', '温度'];
  const mapping = temperatureImportService.autoDetectMapping(headers);
  assert.strictEqual(mapping.orderNo, 0);
  assert.strictEqual(mapping.nodeType, 1);
  assert.strictEqual(mapping.recordedAt, 2);
  assert.strictEqual(mapping.temperature, 3);
  assert.strictEqual(mapping.locationText, null);
  assert.strictEqual(mapping.operatorName, null);
});

test('无法识别的表头返回null', () => {
  const headers = ['未知列1', '未知列2', '未知列3', '未知列4'];
  const mapping = temperatureImportService.autoDetectMapping(headers);
  assert.strictEqual(mapping.orderNo, null);
  assert.strictEqual(mapping.nodeType, null);
  assert.strictEqual(mapping.recordedAt, null);
  assert.strictEqual(mapping.temperature, null);
});

console.log('\n========================================');
console.log('2. 分隔符识别测试');
console.log('========================================');

test('逗号分隔符识别', () => {
  const line = '订单号,节点类型,记录时间,温度';
  const result = temperatureImportService.parseColumns(line);
  assert.strictEqual(result.separator, ',');
  assert.deepStrictEqual(result.headers, ['订单号', '节点类型', '记录时间', '温度']);
});

test('制表符分隔符识别', () => {
  const line = '订单号\t节点类型\t记录时间\t温度';
  const result = temperatureImportService.parseColumns(line);
  assert.strictEqual(result.separator, '\t');
  assert.deepStrictEqual(result.headers, ['订单号', '节点类型', '记录时间', '温度']);
});

test('逗号分隔CSV解析', () => {
  const csv = `订单号,节点类型,记录时间,温度,位置,操作人\nORD001,入库,2024-01-15 10:30:00,5.0,冷库A,张三`;
  const rows = temperatureImportService.parseCsvText(csv);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].orderNo, 'ORD001');
  assert.strictEqual(rows[0].nodeType, '入库');
  assert.strictEqual(rows[0].recordedAt, '2024-01-15 10:30:00');
  assert.strictEqual(rows[0].temperature, '5.0');
  assert.strictEqual(rows[0].locationText, '冷库A');
  assert.strictEqual(rows[0].operatorName, '张三');
});

test('制表符分隔CSV解析', () => {
  const csv = `订单号\t节点类型\t记录时间\t温度\t位置\t操作人\nORD001\t入库\t2024-01-15 10:30:00\t5.0\t冷库A\t张三`;
  const rows = temperatureImportService.parseCsvText(csv);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].orderNo, 'ORD001');
  assert.strictEqual(rows[0].nodeType, '入库');
});

test('包含空行自动跳过', () => {
  const csv = `订单号,节点类型,记录时间,温度\n\nORD001,入库,2024-01-15 10:30:00,5.0\n\nORD002,装车,2024-01-15 11:00:00,4.0\n`;
  const rows = temperatureImportService.parseCsvText(csv);
  assert.strictEqual(rows.length, 2);
});

test('自定义列映射解析', () => {
  const csv = `col1,col2,col3,col4\nORD001,入库,2024-01-15 10:30:00,5.0`;
  const mapping: TemperatureRecordColumnMapping = {
    orderNo: 0,
    nodeType: 1,
    recordedAt: 2,
    temperature: 3,
    locationText: null,
    operatorName: null,
  };
  const rows = temperatureImportService.parseCsvText(csv, mapping);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].orderNo, 'ORD001');
  assert.strictEqual(rows[0].nodeType, '入库');
  assert.strictEqual(rows[0].recordedAt, '2024-01-15 10:30:00');
  assert.strictEqual(rows[0].temperature, '5.0');
  assert.strictEqual(rows[0].locationText, undefined);
  assert.strictEqual(rows[0].operatorName, undefined);
});

test('缺少必需列抛出错误', () => {
  const csv = `订单号,记录时间,温度\nORD001,2024-01-15 10:30:00,5.0`;
  assert.throws(() => {
    temperatureImportService.parseCsvText(csv);
  }, /缺少必要列: 节点类型/);
});

test('空CSV内容抛出错误', () => {
  assert.throws(() => {
    temperatureImportService.parseColumns('');
  }, /无法识别CSV表头/);
});

test('纯空白CSV内容抛出错误', () => {
  assert.throws(() => {
    temperatureImportService.parseColumns('   \n  \n  ');
  }, /无法识别CSV表头/);
});

console.log('\n========================================');
console.log('3. 日期格式解析测试');
console.log('========================================');

test('ISO 8601格式解析', () => {
  const row = {
    orderNo: 'ORD001',
    nodeType: '入库',
    recordedAt: '2024-01-15T10:30:00.000Z',
    temperature: '5.0',
  };
  const parsed = temperatureImportService.parseRow(row, 2);
  assert.ok(parsed.recordedAt instanceof Date);
  assert.strictEqual(parsed.recordedAt!.getFullYear(), 2024);
  assert.strictEqual(parsed.recordedAt!.getMonth(), 0);
  assert.strictEqual(parsed.recordedAt!.getDate(), 15);
});

test('YYYY-MM-DD HH:mm:ss格式解析', () => {
  const row = {
    orderNo: 'ORD001',
    nodeType: '入库',
    recordedAt: '2024-01-15 10:30:00',
    temperature: '5.0',
  };
  const parsed = temperatureImportService.parseRow(row, 2);
  assert.ok(parsed.recordedAt instanceof Date);
  assert.strictEqual(parsed.recordedAt!.getFullYear(), 2024);
  assert.strictEqual(parsed.recordedAt!.getMonth(), 0);
  assert.strictEqual(parsed.recordedAt!.getDate(), 15);
  assert.strictEqual(parsed.recordedAt!.getHours(), 10);
  assert.strictEqual(parsed.recordedAt!.getMinutes(), 30);
});

test('YYYY/MM/DD HH:mm:ss格式解析', () => {
  const row = {
    orderNo: 'ORD001',
    nodeType: '入库',
    recordedAt: '2024/01/15 10:30:00',
    temperature: '5.0',
  };
  const parsed = temperatureImportService.parseRow(row, 2);
  assert.ok(parsed.recordedAt instanceof Date);
  assert.strictEqual(parsed.recordedAt!.getFullYear(), 2024);
  assert.strictEqual(parsed.recordedAt!.getMonth(), 0);
  assert.strictEqual(parsed.recordedAt!.getDate(), 15);
});

test('中文日期格式解析 - 年月日时分秒', () => {
  const row = {
    orderNo: 'ORD001',
    nodeType: '入库',
    recordedAt: '2024年01月15日 10:30:00',
    temperature: '5.0',
  };
  const parsed = temperatureImportService.parseRow(row, 2);
  assert.ok(parsed.recordedAt instanceof Date);
  assert.strictEqual(parsed.recordedAt!.getFullYear(), 2024);
  assert.strictEqual(parsed.recordedAt!.getMonth(), 0);
  assert.strictEqual(parsed.recordedAt!.getDate(), 15);
});

test('中文日期格式解析 - 仅日期', () => {
  const row = {
    orderNo: 'ORD001',
    nodeType: '入库',
    recordedAt: '2024年01月15日',
    temperature: '5.0',
  };
  const parsed = temperatureImportService.parseRow(row, 2);
  assert.ok(parsed.recordedAt instanceof Date);
  assert.strictEqual(parsed.recordedAt!.getFullYear(), 2024);
  assert.strictEqual(parsed.recordedAt!.getMonth(), 0);
  assert.strictEqual(parsed.recordedAt!.getDate(), 15);
});

test('无效日期返回null', () => {
  const row = {
    orderNo: 'ORD001',
    nodeType: '入库',
    recordedAt: '无效日期',
    temperature: '5.0',
  };
  const parsed = temperatureImportService.parseRow(row, 2);
  assert.strictEqual(parsed.recordedAt, null);
});

test('空日期返回null', () => {
  const row = {
    orderNo: 'ORD001',
    nodeType: '入库',
    recordedAt: '',
    temperature: '5.0',
  };
  const parsed = temperatureImportService.parseRow(row, 2);
  assert.strictEqual(parsed.recordedAt, null);
});

test('温度值解析', () => {
  const row = {
    orderNo: 'ORD001',
    nodeType: '入库',
    recordedAt: '2024-01-15 10:30:00',
    temperature: '-18.5',
  };
  const parsed = temperatureImportService.parseRow(row, 2);
  assert.strictEqual(parsed.temperature, -18.5);
});

test('无效温度值返回null', () => {
  const row = {
    orderNo: 'ORD001',
    nodeType: '入库',
    recordedAt: '2024-01-15 10:30:00',
    temperature: 'abc',
  };
  const parsed = temperatureImportService.parseRow(row, 2);
  assert.strictEqual(parsed.temperature, null);
});

test('节点类型中文映射', () => {
  const types: Array<{ input: string; expected: string }> = [
    { input: '入库', expected: 'warehouse_in' },
    { input: '装车', expected: 'loading' },
    { input: '出发', expected: 'departure' },
    { input: '到达', expected: 'arrival' },
    { input: '配送', expected: 'delivery' },
    { input: '签收', expected: 'signature' },
  ];

  for (const t of types) {
    const row = {
      orderNo: 'ORD001',
      nodeType: t.input,
      recordedAt: '2024-01-15 10:30:00',
      temperature: '5.0',
    };
    const parsed = temperatureImportService.parseRow(row, 2);
    assert.strictEqual(parsed.nodeType, t.expected as any);
  }
});

test('节点类型英文映射', () => {
  const types: Array<{ input: string; expected: string }> = [
    { input: 'warehouse_in', expected: 'warehouse_in' },
    { input: 'loading', expected: 'loading' },
    { input: 'departure', expected: 'departure' },
    { input: 'arrival', expected: 'arrival' },
    { input: 'delivery', expected: 'delivery' },
    { input: 'signature', expected: 'signature' },
  ];

  for (const t of types) {
    const row = {
      orderNo: 'ORD001',
      nodeType: t.input,
      recordedAt: '2024-01-15 10:30:00',
      temperature: '5.0',
    };
    const parsed = temperatureImportService.parseRow(row, 2);
    assert.strictEqual(parsed.nodeType, t.expected as any);
  }
});

test('未知节点类型返回null', () => {
  const row = {
    orderNo: 'ORD001',
    nodeType: 'unknown',
    recordedAt: '2024-01-15 10:30:00',
    temperature: '5.0',
  };
  const parsed = temperatureImportService.parseRow(row, 2);
  assert.strictEqual(parsed.nodeType, null);
});

console.log('\n========================================');
console.log('4. 温度上下限校验测试');
console.log('========================================');

setupFullTestData();

test('温度在范围内通过校验', () => {
  const order = orderRepository.findByOrderNo('ORD001')!;
  const parsed = {
    lineNumber: 2,
    orderNo: 'ORD001',
    nodeType: 'warehouse_in' as const,
    recordedAt: new Date(),
    temperature: 4.0,
    locationText: '',
    operatorName: '',
  };
  const reasons = temperatureImportService.validateTemperature(parsed, order);
  assert.deepStrictEqual(reasons, []);
});

test('温度等于下限通过校验', () => {
  const order = orderRepository.findByOrderNo('ORD001')!;
  const parsed = {
    lineNumber: 2,
    orderNo: 'ORD001',
    nodeType: 'warehouse_in' as const,
    recordedAt: new Date(),
    temperature: 0,
    locationText: '',
    operatorName: '',
  };
  const reasons = temperatureImportService.validateTemperature(parsed, order);
  assert.deepStrictEqual(reasons, []);
});

test('温度等于上限通过校验', () => {
  const order = orderRepository.findByOrderNo('ORD001')!;
  const parsed = {
    lineNumber: 2,
    orderNo: 'ORD001',
    nodeType: 'warehouse_in' as const,
    recordedAt: new Date(),
    temperature: 8,
    locationText: '',
    operatorName: '',
  };
  const reasons = temperatureImportService.validateTemperature(parsed, order);
  assert.deepStrictEqual(reasons, []);
});

test('温度低于下限校验失败', () => {
  const order = orderRepository.findByOrderNo('ORD001')!;
  const parsed = {
    lineNumber: 2,
    orderNo: 'ORD001',
    nodeType: 'warehouse_in' as const,
    recordedAt: new Date(),
    temperature: -5,
    locationText: '',
    operatorName: '',
  };
  const reasons = temperatureImportService.validateTemperature(parsed, order);
  assert.strictEqual(reasons.length, 1);
  assert.ok(reasons[0].includes('低于最低要求'));
  assert.ok(reasons[0].includes('-5'));
});

test('温度高于上限校验失败', () => {
  const order = orderRepository.findByOrderNo('ORD001')!;
  const parsed = {
    lineNumber: 2,
    orderNo: 'ORD001',
    nodeType: 'warehouse_in' as const,
    recordedAt: new Date(),
    temperature: 15,
    locationText: '',
    operatorName: '',
  };
  const reasons = temperatureImportService.validateTemperature(parsed, order);
  assert.strictEqual(reasons.length, 1);
  assert.ok(reasons[0].includes('高于最高要求'));
  assert.ok(reasons[0].includes('15'));
});

test('温度为null校验失败', () => {
  const order = orderRepository.findByOrderNo('ORD001')!;
  const parsed = {
    lineNumber: 2,
    orderNo: 'ORD001',
    nodeType: 'warehouse_in' as const,
    recordedAt: new Date(),
    temperature: null,
    locationText: '',
    operatorName: '',
  };
  const reasons = temperatureImportService.validateTemperature(parsed, order);
  assert.deepStrictEqual(reasons, ['温度值无效']);
});

test('冷冻订单温度校验', () => {
  const customerId = createTestCustomer();
  const frozenOrder = createTestOrder('ORD-FROZEN', customerId, -30, -10);
  const parsed = {
    lineNumber: 2,
    orderNo: 'ORD-FROZEN',
    nodeType: 'warehouse_in' as const,
    recordedAt: new Date(),
    temperature: -20,
    locationText: '',
    operatorName: '',
  };
  const reasons = temperatureImportService.validateTemperature(parsed, frozenOrder);
  assert.deepStrictEqual(reasons, []);

  const parsedHigh = { ...parsed, temperature: -5 };
  const reasonsHigh = temperatureImportService.validateTemperature(parsedHigh, frozenOrder);
  assert.strictEqual(reasonsHigh.length, 1);
  assert.ok(reasonsHigh[0].includes('高于最高要求'));
});

test('常温订单温度校验', () => {
  const customerId = createTestCustomer();
  const ambientOrder = createTestOrder('ORD-AMBIENT', customerId, 15, 30);
  const parsed = {
    lineNumber: 2,
    orderNo: 'ORD-AMBIENT',
    nodeType: 'warehouse_in' as const,
    recordedAt: new Date(),
    temperature: 22,
    locationText: '',
    operatorName: '',
  };
  const reasons = temperatureImportService.validateTemperature(parsed, ambientOrder);
  assert.deepStrictEqual(reasons, []);

  const parsedLow = { ...parsed, temperature: 10 };
  const reasonsLow = temperatureImportService.validateTemperature(parsedLow, ambientOrder);
  assert.strictEqual(reasonsLow.length, 1);
  assert.ok(reasonsLow[0].includes('低于最低要求'));
});

console.log('\n========================================');
console.log('5. 未匹配订单跳过测试');
console.log('========================================');

setupFullTestData();

test('不存在的订单号返回未匹配', () => {
  const parsed = {
    lineNumber: 2,
    orderNo: 'NOT-EXIST',
    nodeType: 'warehouse_in' as const,
    recordedAt: new Date(),
    temperature: 5.0,
    locationText: '',
    operatorName: '',
  };
  const result = temperatureImportService.validateRecord(parsed);
  assert.strictEqual(result.status, 'unmatched');
  assert.ok(result.failureReasons.some(r => r.includes('未找到订单号')));
});

test('空订单号返回未匹配', () => {
  const parsed = {
    lineNumber: 2,
    orderNo: '',
    nodeType: 'warehouse_in' as const,
    recordedAt: new Date(),
    temperature: 5.0,
    locationText: '',
    operatorName: '',
  };
  const result = temperatureImportService.validateRecord(parsed);
  assert.strictEqual(result.status, 'unmatched');
  assert.ok(result.failureReasons.some(r => r.includes('订单号不能为空')));
});

test('无效节点类型返回未匹配', () => {
  const parsed = {
    lineNumber: 2,
    orderNo: 'ORD001',
    nodeType: null,
    recordedAt: new Date(),
    temperature: 5.0,
    locationText: '',
    operatorName: '',
  };
  const result = temperatureImportService.validateRecord(parsed);
  assert.strictEqual(result.status, 'unmatched');
  assert.ok(result.failureReasons.some(r => r.includes('节点类型无效')));
});

test('无效日期返回未匹配', () => {
  const parsed = {
    lineNumber: 2,
    orderNo: 'ORD001',
    nodeType: 'warehouse_in' as const,
    recordedAt: null,
    temperature: 5.0,
    locationText: '',
    operatorName: '',
  };
  const result = temperatureImportService.validateRecord(parsed);
  assert.strictEqual(result.status, 'unmatched');
  assert.ok(result.failureReasons.some(r => r.includes('记录时间格式无效')));
});

test('无效温度返回未匹配', () => {
  const parsed = {
    lineNumber: 2,
    orderNo: 'ORD001',
    nodeType: 'warehouse_in' as const,
    recordedAt: new Date(),
    temperature: null,
    locationText: '',
    operatorName: '',
  };
  const result = temperatureImportService.validateRecord(parsed);
  assert.strictEqual(result.status, 'unmatched');
  assert.ok(result.failureReasons.some(r => r.includes('温度值无效')));
});

test('已完成节点返回未匹配', () => {
  const node = nodeRepository.findAll()[0];
  nodeRepository.completeNode(node.id, {
    locationText: '测试位置',
    temperature: 5.0,
    recordedAt: new Date().toISOString(),
  });

  const parsed = {
    lineNumber: 2,
    orderNo: 'ORD001',
    nodeType: node.nodeType,
    recordedAt: new Date(),
    temperature: 5.0,
    locationText: '',
    operatorName: '',
  };
  const result = temperatureImportService.validateRecord(parsed);
  assert.strictEqual(result.status, 'unmatched');
  assert.ok(result.failureReasons.some(r => r.includes('已完成，无需重复导入')));
});

test('预览导入时未匹配记录正确分类', () => {
  setupFullTestData();
  const csv = `订单号,节点类型,记录时间,温度\nNOT-EXIST,入库,2024-01-15 10:30:00,5.0\nORD001,入库,2024-01-15 10:30:00,5.0\n,入库,2024-01-15 10:30:00,5.0`;
  const preview = temperatureImportService.previewImport(csv);
  assert.strictEqual(preview.totalCount, 3);
  assert.strictEqual(preview.unmatchedCount, 2);
  assert.strictEqual(preview.importableCount, 1);
});

test('执行导入时未匹配记录标记为跳过', () => {
  const { user } = setupFullTestData();

  const csv = `订单号,节点类型,记录时间,温度\nNOT-EXIST,入库,2024-01-15 10:30:00,5.0\nORD001,入库,2024-01-15 10:30:00,5.0`;
  const preview = temperatureImportService.previewImport(csv);
  const result = temperatureImportService.executeImport(preview.importableRecords.concat(preview.unmatchedRecords), user);

  assert.strictEqual(result.skippedCount, 1);
  assert.strictEqual(result.successCount, 1);
  assert.strictEqual(result.results[0].isSkipped, true);
  assert.strictEqual(result.results[1].isSkipped, false);
});

console.log('\n========================================');
console.log('6. 异常温度创建异常记录测试');
console.log('========================================');

setupFullTestData();

test('温度异常时状态为abnormal', () => {
  const parsed = {
    lineNumber: 2,
    orderNo: 'ORD001',
    nodeType: 'warehouse_in' as const,
    recordedAt: new Date(),
    temperature: 15.0,
    locationText: '冷库A',
    operatorName: '张三',
  };
  const result = temperatureImportService.validateRecord(parsed);
  assert.strictEqual(result.status, 'abnormal');
  assert.ok(result.failureReasons.some(r => r.includes('高于最高要求')));
  assert.ok(result.matched);
});

test('温度过高异常记录导入时创建异常记录', () => {
  const { user } = setupFullTestData();

  const csv = `订单号,节点类型,记录时间,温度\nORD001,入库,2024-01-15 10:30:00,15.0`;
  const preview = temperatureImportService.previewImport(csv);

  assert.strictEqual(preview.abnormalCount, 1);
  assert.strictEqual(preview.abnormalRecords[0].status, 'abnormal');

  const result = temperatureImportService.executeImport(preview.abnormalRecords, user);

  assert.strictEqual(result.successCount, 1);
  assert.strictEqual(result.exceptionCreatedCount, 1);
  assert.strictEqual(result.results[0].isException, true);
  assert.ok(result.results[0].exceptionId);
});

test('异常记录正确写入数据库', () => {
  const { user, order, task } = setupFullTestData();

  const csv = `订单号,节点类型,记录时间,温度\nORD001,入库,2024-01-15 10:30:00,15.0`;
  const preview = temperatureImportService.previewImport(csv);
  const result = temperatureImportService.executeImport(preview.abnormalRecords, user);

  const exceptionId = result.results[0].exceptionId!;
  const exception = exceptionHandlingRepository.findById(exceptionId);
  assert.ok(exception, `异常记录不存在，exceptionId: ${exceptionId}`);
  assert.strictEqual(exception!.orderId, order.id);
  assert.strictEqual(exception!.taskId, task.id);
  assert.strictEqual(exception!.handlingStatus, 'pending');
  assert.strictEqual(exception!.isClosed, false);
  assert.ok(exception!.exceptionDescription.includes('高于最高要求'));
});

test('温度过低异常节点状态为exception', () => {
  const { user } = setupFullTestData();

  const csv = `订单号,节点类型,记录时间,温度\nORD001,入库,2024-01-15 10:30:00,-5.0`;
  const preview = temperatureImportService.previewImport(csv);
  assert.strictEqual(preview.abnormalCount, 1, `温度过低应检测为异常，实际: abnormal=${preview.abnormalCount}`);
  const result = temperatureImportService.executeImport(preview.abnormalRecords, user);

  const nodeId = result.results[0].nodeId!;
  const node = nodeRepository.findById(nodeId);
  assert.ok(node, `节点不存在，nodeId: ${nodeId}`);
  assert.strictEqual(node!.status, 'exception');
  assert.strictEqual(node!.temperature, -5.0);
  assert.ok(node!.exceptionDescription!.includes('低于最低要求'));
});

test('正常温度导入节点状态为completed', () => {
  const { user } = setupFullTestData();

  const csv = `订单号,节点类型,记录时间,温度\nORD001,入库,2024-01-15 10:30:00,5.0`;
  const preview = temperatureImportService.previewImport(csv);
  assert.strictEqual(preview.importableCount, 1, `正常温度应可导入，实际: importable=${preview.importableCount}`);
  const result = temperatureImportService.executeImport(preview.importableRecords, user);

  assert.strictEqual(result.successCount, 1);
  assert.strictEqual(result.exceptionCreatedCount, 0);
  assert.strictEqual(result.results[0].isException, false);

  const nodeId = result.results[0].nodeId!;
  const node = nodeRepository.findById(nodeId);
  assert.strictEqual(node!.status, 'completed');
  assert.strictEqual(node!.temperature, 5.0);
  assert.strictEqual(node!.exceptionDescription, undefined);
});

test('异常记录包含SLA截止时间', () => {
  const { user } = setupFullTestData();

  const csv = `订单号,节点类型,记录时间,温度\nORD001,入库,2024-01-15 10:30:00,15.0`;
  const preview = temperatureImportService.previewImport(csv);
  const result = temperatureImportService.executeImport(preview.abnormalRecords, user);

  const exceptionId = result.results[0].exceptionId!;
  const exception = exceptionHandlingRepository.findById(exceptionId);
  assert.ok(exception, `异常记录不存在，exceptionId: ${exceptionId}`);
  assert.ok(exception!.slaDeadline, `SLA截止时间为空`);
});

test('混合正常和异常记录导入', () => {
  const { user } = setupFullTestData();

  const csv = `订单号,节点类型,记录时间,温度\nORD001,入库,2024-01-15 10:30:00,5.0\nORD001,装车,2024-01-15 11:00:00,15.0`;
  const preview = temperatureImportService.previewImport(csv);

  assert.strictEqual(preview.importableCount, 1, `正常记录数应为1，实际: importable=${preview.importableCount}`);
  assert.strictEqual(preview.abnormalCount, 1, `异常记录数应为1，实际: abnormal=${preview.abnormalCount}`);

  const allRecords = [...preview.importableRecords, ...preview.abnormalRecords];
  const result = temperatureImportService.executeImport(allRecords, user);

  assert.strictEqual(result.successCount, 2);
  assert.strictEqual(result.exceptionCreatedCount, 1);
});

console.log('\n========================================');
console.log('7. 综合场景测试');
console.log('========================================');

test('完整导入流程 - 从解析到执行', () => {
  const { user, order } = setupFullTestData();

  const csv = `订单号,节点类型,记录时间,温度,位置,操作人\nORD001,入库,2024-01-15 10:30:00,5.0,冷库A,张三\nORD001,装车,2024-01-15 11:00:00,4.0,装车台B,李四`;

  const parseResult = temperatureImportService.parseColumns(csv);
  assert.strictEqual(parseResult.separator, ',');
  assert.strictEqual(parseResult.autoMapping.orderNo, 0);
  assert.strictEqual(parseResult.autoMapping.nodeType, 1);

  const preview = temperatureImportService.previewImport(csv);
  assert.strictEqual(preview.totalCount, 2);
  assert.strictEqual(preview.importableCount, 2);

  const result = temperatureImportService.executeImport(preview.importableRecords, user);
  assert.strictEqual(result.successCount, 2);
  assert.strictEqual(result.failedCount, 0);
  assert.strictEqual(result.skippedCount, 0);
});

test('制表符分隔完整流程', () => {
  const { user } = setupFullTestData();

  const csv = `订单号\t节点类型\t记录时间\t温度\t位置\t操作人\nORD001\t入库\t2024-01-15 10:30:00\t5.0\t冷库A\t张三`;

  const parseResult = temperatureImportService.parseColumns(csv);
  assert.strictEqual(parseResult.separator, '\t');

  const preview = temperatureImportService.previewImport(csv);
  assert.strictEqual(preview.importableCount, 1);

  const result = temperatureImportService.executeImport(preview.importableRecords, user);
  assert.strictEqual(result.successCount, 1);
});

test('建议修正字段正确返回', () => {
  const parsed = {
    lineNumber: 2,
    orderNo: '',
    nodeType: null,
    recordedAt: null,
    temperature: null,
    locationText: '',
    operatorName: '',
  };
  const result = temperatureImportService.validateRecord(parsed);
  assert.ok(result.suggestedCorrectionFields.includes('订单号'));
  assert.ok(result.suggestedCorrectionFields.includes('节点类型'));
  assert.ok(result.suggestedCorrectionFields.includes('记录时间'));
  assert.ok(result.suggestedCorrectionFields.includes('温度'));
});

console.log('\n========================================');
console.log('测试结果汇总');
console.log('========================================');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);

if (failures.length > 0) {
  console.log('\n失败详情:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
} else {
  console.log('\n✓ 所有测试通过!');
}

testDb.close();
