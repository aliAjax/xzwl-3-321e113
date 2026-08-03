import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import os from 'os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cold-chain-test-'));
const dbPath = path.join(tmpDir, 'test.db');
process.env.DB_PATH = dbPath;

const { default: db } = await import('../api/db/index.js');

const migrations = [
  await import('../scripts/migrations/V001__init_schema.js'),
  await import('../scripts/migrations/V002__add_driver_id_to_users.js'),
  await import('../scripts/migrations/V003__add_client_submit_id.js'),
  await import('../scripts/migrations/V004__add_optimistic_lock.js'),
  await import('../scripts/migrations/V005__exception_workorder.js'),
  await import('../scripts/migrations/V006__add_sla_deadline.js'),
  await import('../scripts/migrations/V007__temperature_evidence_ledger.js'),
];

for (const m of migrations) {
  m.up(db);
}

const { deliveryService } = await import('../api/services/delivery.service.js');
import type { User } from '../shared/types';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) { console.log(`  ✓ ${msg}`); passed++; }
  else { console.error(`  ✗ ${msg}`); failed++; }
}

const now = new Date().toISOString();

const driverId = uuidv4();
db.prepare(`INSERT INTO drivers (id, name, phone, license_no, license_type, status, created_at) VALUES (?, 'TestDriver', '138', 'L1', 'A1', 'on_duty', ?)`).run(driverId, now);
const customerId = uuidv4();
db.prepare(`INSERT INTO customers (id, name, contact_name, phone, address, priority, created_at) VALUES (?, 'Cust', 'Contact', '139', 'Addr', 1, ?)`).run(customerId, now);
const vehicleId = uuidv4();
db.prepare(`INSERT INTO vehicles (id, plate_no, vehicle_type, temperature_zones, capacity, driver_id, available_start_time, available_end_time, status, created_at) VALUES (?, 'TEST', 'truck', 'chilled', 1000, ?, '08:00', '18:00', 'active', ?)`).run(vehicleId, driverId, now);
const routeId = uuidv4();
db.prepare(`INSERT INTO routes (id, name, description, stops_json, created_at) VALUES (?, 'R1', '', '[]', ?)`).run(routeId, now);
const orderId = uuidv4();
db.prepare(`INSERT INTO orders (id, order_no, customer_id, temperature_zone, min_temp, max_temp, goods_name, quantity, weight, delivery_address, scheduled_delivery_time, status, created_at, updated_at) VALUES (?, 'ORD-TXN', ?, 'chilled', 0, 8, 'Goods', 1, 10, 'Addr', ?, 'created', ?, ?)`).run(orderId, customerId, now, now, now);
const batchId = uuidv4();
db.prepare(`INSERT INTO loading_batches (id, batch_no, vehicle_id, driver_id, route_id, order_ids_json, status, created_at) VALUES (?, 'BATCH-TXN', ?, ?, ?, '[]', 'departed', ?)`).run(batchId, vehicleId, driverId, routeId, now);
const taskId = uuidv4();
db.prepare(`INSERT INTO delivery_tasks (id, batch_id, order_id, driver_id, vehicle_id, status, created_at) VALUES (?, ?, ?, ?, ?, 'in_transit', ?)`).run(taskId, batchId, orderId, driverId, vehicleId, now);
const nodeId = uuidv4();
db.prepare(`INSERT INTO delivery_nodes (id, task_id, node_type, node_name, status, location_text, version, created_at, updated_at) VALUES (?, ?, 'delivery', '配送', 'pending', '', 1, ?, ?)`).run(nodeId, taskId, now, now);

const driverUser: User = {
  id: 'driver-1', username: 'driver1', role: 'driver', name: '李司机',
  phone: '138', driverId, createdAt: now,
};

console.log('\n=== 事务回滚测试：并发版本冲突不残留证据 ===');

const evidenceCountBefore = db.prepare('SELECT COUNT(*) as c FROM temperature_evidence_ledger').get() as { c: number };
const nodeBefore = db.prepare('SELECT status, temperature, version FROM delivery_nodes WHERE id = ?').get(nodeId) as { status: string; temperature: number | null; version: number };

assert(nodeBefore.status === 'pending', `节点初始状态为 pending (实际: ${nodeBefore.status})`);
assert(nodeBefore.temperature === null, `节点初始温度为 null (实际: ${nodeBefore.temperature})`);
assert(nodeBefore.version === 1, `节点初始版本为 1 (实际: ${nodeBefore.version})`);
assert(evidenceCountBefore.c === 0, `账本初始为空 (实际: ${evidenceCountBefore.c})`);

const result = deliveryService.updateNodeStatus(nodeId, {
  status: 'completed',
  locationText: '冷库A',
  temperature: -15,
  version: 999,
  updatedAt: '2099-01-01T00:00:00Z',
}, driverUser);

assert(result.success === false, '过期版本返回失败');
assert(result.conflict?.type === 'concurrent_update', `冲突类型为 concurrent_update (实际: ${result.conflict?.type})`);

const evidenceCountAfter = db.prepare('SELECT COUNT(*) as c FROM temperature_evidence_ledger').get() as { c: number };
const nodeAfter = db.prepare('SELECT status, temperature, version FROM delivery_nodes WHERE id = ?').get(nodeId) as { status: string; temperature: number | null; version: number };

assert(evidenceCountAfter.c === 0, `事务回滚后账本仍为空，无残留证据 (实际: ${evidenceCountAfter.c})`);
assert(nodeAfter.status === 'pending', `节点状态仍为 pending (实际: ${nodeAfter.status})`);
assert(nodeAfter.temperature === null, `节点温度仍为 null (实际: ${nodeAfter.temperature})`);
assert(nodeAfter.version === 1, `节点版本仍为 1 (实际: ${nodeAfter.version})`);

console.log('\n=== 成功提交测试：正确版本写入证据和节点 ===');

const successResult = deliveryService.updateNodeStatus(nodeId, {
  status: 'completed',
  locationText: '冷库A',
  temperature: 5,
  version: 1,
  updatedAt: '2099-01-01T00:00:00Z',
}, driverUser);

assert(successResult.success === true, '正确版本提交成功');

const evidenceCountSuccess = db.prepare('SELECT COUNT(*) as c FROM temperature_evidence_ledger').get() as { c: number };
const nodeSuccess = db.prepare('SELECT status, temperature, version FROM delivery_nodes WHERE id = ?').get(nodeId) as { status: string; temperature: number | null; version: number };

assert(evidenceCountSuccess.c === 1, `账本写入 1 条证据 (实际: ${evidenceCountSuccess.c})`);
assert(nodeSuccess.status === 'completed', `节点状态为 completed (实际: ${nodeSuccess.status})`);
assert(nodeSuccess.version === 2, `节点版本递增为 2 (实际: ${nodeSuccess.version})`);

const evidenceRow = db.prepare('SELECT normalized_temp_c, source FROM temperature_evidence_ledger WHERE node_id = ?').get(nodeId) as { normalized_temp_c: number; source: string };
assert(evidenceRow.source === 'driver_offline', `证据来源为 driver_offline (实际: ${evidenceRow.source})`);
assert(evidenceRow.normalized_temp_c === 500, `标准化温度为 500 (5°C × 100, 实际: ${evidenceRow.normalized_temp_c})`);

console.log(`\n=== 测试结果: ${passed} 通过, ${failed} 失败 ===\n`);
db.close();
fs.rmSync(tmpDir, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
