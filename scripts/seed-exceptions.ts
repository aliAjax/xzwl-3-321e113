import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../data/cold-chain.db');
const db = new Database(dbPath);

db.pragma('foreign_keys = OFF');

console.log('开始生成异常工单测试数据...');

const now = new Date();

const insertBatch = db.prepare(`
  INSERT OR REPLACE INTO loading_batches (id, batch_no, vehicle_id, driver_id, route_id, order_ids_json, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertDeliveryTask = db.prepare(`
  INSERT OR REPLACE INTO delivery_tasks (id, batch_id, order_id, driver_id, vehicle_id, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertDeliveryNode = db.prepare(`
  INSERT OR REPLACE INTO delivery_nodes (id, task_id, node_type, node_name, status, recorded_at, location_text, exception_description, temperature, operator_id, operator_name, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertExceptionHandling = db.prepare(`
  INSERT OR REPLACE INTO exception_handlings (id, node_id, task_id, order_id, driver_id, temperature_zone, exception_description, exception_time, handling_status, handling_result, handling_notes, handled_by, handled_at, escalation_level, assignee_id, is_closed, closed_by, closed_at, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const batchId = uuidv4();

insertBatch.run(
  batchId,
  'BATCH-TEST-' + Date.now(),
  'veh-001',
  'drv-001',
  'route-001',
  JSON.stringify(['ord-001', 'ord-002', 'ord-003']),
  'departed',
  now.toISOString()
);

console.log('✓ 创建批次:', batchId);

const tasks = [
  { id: uuidv4(), orderId: 'ord-001', driverId: 'drv-001', vehicleId: 'veh-001' },
  { id: uuidv4(), orderId: 'ord-002', driverId: 'drv-002', vehicleId: 'veh-002' },
  { id: uuidv4(), orderId: 'ord-003', driverId: 'drv-003', vehicleId: 'veh-003' },
];

tasks.forEach((task) => {
  const taskTime = new Date(now.getTime() - Math.random() * 86400000 * 3);
  insertDeliveryTask.run(
    task.id,
    batchId,
    task.orderId,
    task.driverId,
    task.vehicleId,
    'in_transit',
    taskTime.toISOString()
  );
  console.log('✓ 创建配送任务:', task.id, '订单:', task.orderId);
});

const nodes = [
  { taskIdx: 0, nodeType: 'delivery', nodeName: '卸货节点-001', exception: '温度异常，超过上限 3℃', temp: -10, zone: 'frozen' },
  { taskIdx: 0, nodeType: 'delivery', nodeName: '卸货节点-002', exception: '设备故障，无法制冷', temp: 5, zone: 'frozen' },
  { taskIdx: 1, nodeType: 'delivery', nodeName: '卸货节点-003', exception: '温度异常，低于下限 2℃', temp: 0, zone: 'chilled' },
  { taskIdx: 1, nodeType: 'delivery', nodeName: '卸货节点-004', exception: '包装破损，可能影响品质', temp: 5, zone: 'chilled' },
  { taskIdx: 2, nodeType: 'delivery', nodeName: '卸货节点-005', exception: '延迟送达超过 2 小时', temp: 20, zone: 'ambient' },
  { taskIdx: 0, nodeType: 'delivery', nodeName: '卸货节点-006', exception: '温度波动过大', temp: -8, zone: 'frozen' },
  { taskIdx: 1, nodeType: 'delivery', nodeName: '卸货节点-007', exception: '客户拒收', temp: 4, zone: 'chilled' },
  { taskIdx: 2, nodeType: 'delivery', nodeName: '卸货节点-008', exception: '货物丢失', temp: 22, zone: 'ambient' },
];

const exceptionConfigs = [
  { assigneeId: 'u-admin-001', handlingStatus: 'pending', escalationLevel: 'level_1', isClosed: false },
  { assigneeId: 'u-admin-001', handlingStatus: 'pending', escalationLevel: 'level_2', isClosed: false },
  { assigneeId: 'u-admin-001', handlingStatus: 'resolved', escalationLevel: 'level_1', isClosed: true, closedBy: 'u-admin-001' },
  { assigneeId: 'u-dispatch-001', handlingStatus: 'pending', escalationLevel: 'level_3', isClosed: false },
  { assigneeId: 'u-dispatch-001', handlingStatus: 'escalated', escalationLevel: 'level_3', isClosed: false },
  { assigneeId: 'u-admin-001', handlingStatus: 'pending', escalationLevel: 'level_3', isClosed: false },
  { assigneeId: null, handlingStatus: 'pending', escalationLevel: 'level_2', isClosed: false },
  { assigneeId: 'u-dispatch-001', handlingStatus: 'resolved', escalationLevel: 'level_3', isClosed: true, closedBy: 'u-admin-001' },
];

nodes.forEach((nodeConfig, idx) => {
  const task = tasks[nodeConfig.taskIdx];
  const exceptionConfig = exceptionConfigs[idx];
  const nodeId = uuidv4();
  const exceptionId = uuidv4();
  const exceptionTime = new Date(now.getTime() - Math.random() * 86400000 * 2);

  insertDeliveryNode.run(
    nodeId,
    task.id,
    nodeConfig.nodeType,
    nodeConfig.nodeName,
    'exception',
    exceptionTime.toISOString(),
    '测试地址',
    nodeConfig.exception,
    nodeConfig.temp,
    'u-admin-001',
    '系统管理员',
    exceptionTime.toISOString()
  );

  insertExceptionHandling.run(
    exceptionId,
    nodeId,
    task.id,
    task.orderId,
    task.driverId,
    nodeConfig.zone,
    nodeConfig.exception,
    exceptionTime.toISOString(),
    exceptionConfig.handlingStatus,
    exceptionConfig.handlingStatus === 'resolved' ? 'recovered' : null,
    exceptionConfig.handlingStatus === 'resolved' ? '问题已解决' : null,
    exceptionConfig.handlingStatus !== 'pending' ? exceptionConfig.assigneeId : null,
    exceptionConfig.handlingStatus !== 'pending' ? new Date(exceptionTime.getTime() + 3600000).toISOString() : null,
    exceptionConfig.escalationLevel,
    exceptionConfig.assigneeId,
    exceptionConfig.isClosed ? 1 : 0,
    exceptionConfig.isClosed ? (exceptionConfig.closedBy || null) : null,
    exceptionConfig.isClosed ? new Date(exceptionTime.getTime() + 7200000).toISOString() : null,
    exceptionTime.toISOString(),
    new Date().toISOString()
  );

  console.log(`✓ 生成异常工单 ${idx + 1}: ${nodeConfig.nodeName}`);
  console.log(`  - 处理人: ${exceptionConfig.assigneeId || '未分配'}`);
  console.log(`  - 升级级别: ${exceptionConfig.escalationLevel}`);
  console.log(`  - 处理状态: ${exceptionConfig.handlingStatus}`);
  console.log(`  - 闭环状态: ${exceptionConfig.isClosed ? '已闭环' : '未闭环'}`);
});

console.log(`\n共生成 ${nodes.length} 条异常工单测试数据！`);
console.log('数据分布：');
console.log('- 我的待处理 (admin, pending, 未闭环): 3 条 (level_1, level_2, level_3)');
console.log('- 高优先级未关闭 (level_3, 未闭环): 3 条');
console.log('- 已闭环: 2 条');
console.log('- 未分配: 1 条');

db.pragma('foreign_keys = ON');
db.close();
