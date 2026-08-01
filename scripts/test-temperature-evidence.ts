import db from '../api/db/index.js';
import { temperatureEvidenceService } from '../api/services/temperatureEvidence/index.js';
import {
  celsiusToStorage,
  storageToCelsius,
  parseTemperatureString,
  parseObservedAt,
  hasTimezoneInfo,
  computePayloadHash,
  canonicalJson,
  DEFAULT_CSV_OFFSET_MINUTES,
} from '../api/services/temperatureEvidence/index.js';
import { orderRepository } from '../api/repositories/order.repository.js';
import type { User } from '../shared/types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

function assertThrows(fn: () => void, message: string): void {
  try {
    fn();
    console.error(`  ✗ ${message} (未抛出异常)`);
    failed++;
  } catch {
    console.log(`  ✓ ${message}`);
    passed++;
  }
}

console.log('\n=== 1. 温度标准化测试 ===');
assert(celsiusToStorage(5.25) === 525, '5.25°C → 525');
assert(celsiusToStorage(-18.5) === -1850, '-18.5°C → -1850');
assert(celsiusToStorage(0) === 0, '0°C → 0');
assert(storageToCelsius(525) === 5.25, '525 → 5.25°C');
assert(storageToCelsius(-1850) === -18.5, '-1850 → -18.5°C');

const parsed = parseTemperatureString('  -5.5 ');
assert(parsed.valueCelsius === -5.5, '解析温度字符串 "-5.5"');
assert(parsed.normalizedTempC === -550, '解析温度字符串标准化为 -550');
assertThrows(() => parseTemperatureString(''), '空温度字符串抛出异常');
assertThrows(() => parseTemperatureString('abc'), '无效温度字符串抛出异常');

console.log('\n=== 2. 时区检测与解析测试 ===');
assert(hasTimezoneInfo('2024-01-01T12:00:00Z') === true, 'Z 后缀检测到时区');
assert(hasTimezoneInfo('2024-01-01T12:00:00+08:00') === true, '+08:00 检测到时区');
assert(hasTimezoneInfo('2024-01-01T12:00:00-05:00') === true, '-05:00 检测到时区');
assert(hasTimezoneInfo('2024-01-01 12:00:00') === false, '无时区字符串检测为无时区');
assert(hasTimezoneInfo('2024-01-01') === false, '日期字符串检测为无时区');

const csvDate = parseObservedAt('2024-06-01 12:00:00', {
  requireTimezone: false,
  defaultOffsetMinutes: DEFAULT_CSV_OFFSET_MINUTES,
});
assert(csvDate.toISOString() === '2024-06-01T04:00:00.000Z', '旧CSV无时区按+08:00解析 → UTC 04:00');

const utcDate = parseObservedAt('2024-06-01T12:00:00Z', {
  requireTimezone: false,
});
assert(utcDate.toISOString() === '2024-06-01T12:00:00.000Z', 'UTC Z 时间正确解析');

assertThrows(
  () => parseObservedAt('2024-06-01 12:00:00', { requireTimezone: true }),
  '司机数据无时区应拒绝'
);

const driverDate = parseObservedAt('2024-06-01T12:00:00+08:00', {
  requireTimezone: true,
});
assert(driverDate.toISOString() === '2024-06-01T04:00:00.000Z', '司机数据带时区正确解析');

console.log('\n=== 3. 内容指纹测试 ===');
const payload1 = { a: 1, b: 'test', c: { d: 2 } };
const payload2 = { b: 'test', a: 1, c: { d: 2 } };
const hash1 = computePayloadHash({
  nodeId: 'n1', taskId: 't1', orderId: 'o1',
  normalizedTempC: 500, observedAt: '2024-01-01T00:00:00.000Z',
  locationText: '', operatorName: '',
});
const hash2 = computePayloadHash({
  nodeId: 'n1', taskId: 't1', orderId: 'o1',
  normalizedTempC: 500, observedAt: '2024-01-01T00:00:00.000Z',
  locationText: '', operatorName: '',
});
assert(hash1 === hash2, '相同内容生成相同指纹');
assert(canonicalJson(payload1) === canonicalJson(payload2), '键顺序不影响规范化JSON');

const hash3 = computePayloadHash({
  nodeId: 'n1', taskId: 't1', orderId: 'o1',
  normalizedTempC: 600, observedAt: '2024-01-01T00:00:00.000Z',
  locationText: '', operatorName: '',
});
assert(hash1 !== hash3, '不同内容生成不同指纹');

console.log('\n=== 4. 准备测试节点 ===');
const testOperator: User = {
  id: 'test-operator', username: 'test', role: 'admin', name: '测试', phone: '', createdAt: new Date().toISOString(),
};

const existingOrder = db.prepare("SELECT id FROM orders LIMIT 1").get() as { id: string } | undefined;
const existingDriver = db.prepare("SELECT id FROM drivers LIMIT 1").get() as { id: string } | undefined;
const existingVehicle = db.prepare("SELECT id FROM vehicles LIMIT 1").get() as { id: string } | undefined;
const existingBatch = db.prepare("SELECT id FROM loading_batches LIMIT 1").get() as { id: string } | undefined;

const testOrderId = existingOrder?.id ?? '';
let testTaskId = '';
let testNodeId = '';

if (!existingBatch) {
  const batchId = 'test-batch-' + Date.now();
  const routeId = (db.prepare("SELECT id FROM routes LIMIT 1").get() as { id: string } | undefined)?.id ?? '';
  db.prepare(`INSERT INTO loading_batches (id, batch_no, vehicle_id, driver_id, route_id, order_ids_json, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'created', ?)`)
    .run(batchId, 'TEST-BATCH', existingVehicle?.id ?? '', existingDriver?.id ?? '', routeId, '[]', new Date().toISOString());

  if (existingOrder) {
    const taskId = 'test-task-' + Date.now();
    db.prepare(`INSERT INTO delivery_tasks (id, batch_id, order_id, driver_id, vehicle_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'created', ?)`)
      .run(taskId, batchId, existingOrder.id, existingDriver?.id ?? '', existingVehicle?.id ?? '', new Date().toISOString());
    testTaskId = taskId;
  }
} else {
  testTaskId = (db.prepare("SELECT id FROM delivery_tasks LIMIT 1").get() as { id: string } | undefined)?.id ?? '';
}

if (testTaskId) {
  const existingNode = db.prepare("SELECT id FROM delivery_nodes WHERE task_id = ? LIMIT 1").get(testTaskId) as { id: string } | undefined;
  if (existingNode) {
    testNodeId = existingNode.id;
  } else {
    testNodeId = 'test-node-' + Date.now();
    db.prepare(`INSERT INTO delivery_nodes (id, task_id, node_type, node_name, status, location_text, temperature, operator_id, operator_name, version, created_at, updated_at)
      VALUES (?, ?, 'delivery', '配送', 'pending', '', NULL, NULL, ?, 1, ?, ?)`)
      .run(testNodeId, testTaskId, testOperator.name, new Date().toISOString(), new Date().toISOString());
  }
}

if (testNodeId) {
  console.log(`  使用节点: ${testNodeId} (task: ${testTaskId}, order: ${testOrderId})`);
} else {
  console.log('  ⊘ 无法创建测试节点');
}

if (testNodeId) {
  console.log('\n=== 5. 证据提交与幂等测试 ===');
  const readingKey = `test-reading-${Date.now()}`;
  const observedAt = '2024-06-01T08:00:00Z';

  const result1 = temperatureEvidenceService.submitOne({
    readingKey,
    nodeId: testNodeId,
    temperatureC: 5.0,
    observedAt,
    locationText: '测试位置',
    operatorName: '测试员',
    originalPayload: { test: true },
  }, { source: 'csv_import', requireTimezone: false, defaultOffsetMinutes: DEFAULT_CSV_OFFSET_MINUTES });

  assert(result1.status === 'created', `首次提交成功 (status: ${result1.status})`);
  assert(!!result1.evidenceId, '返回evidenceId');

  const result2 = temperatureEvidenceService.submitOne({
    readingKey,
    nodeId: testNodeId,
    temperatureC: 5.0,
    observedAt,
    locationText: '测试位置',
    operatorName: '测试员',
  }, { source: 'csv_import', requireTimezone: false, defaultOffsetMinutes: DEFAULT_CSV_OFFSET_MINUTES });

  assert(result2.status === 'duplicate', `相同readingKey+相同载荷幂等返回 (status: ${result2.status})`);

  const result3 = temperatureEvidenceService.submitOne({
    readingKey,
    nodeId: testNodeId,
    temperatureC: 99.0,
    observedAt,
    locationText: '不同位置',
    operatorName: '测试员',
  }, { source: 'csv_import', requireTimezone: false, defaultOffsetMinutes: DEFAULT_CSV_OFFSET_MINUTES });

  assert(result3.status === 'conflict', `相同readingKey+不同载荷返回冲突 (status: ${result3.status})`);

  console.log('\n=== 6. 司机数据时区拒绝测试 ===');
  const driverResult = temperatureEvidenceService.submitOne({
    readingKey: `driver-no-tz-${Date.now()}`,
    nodeId: testNodeId,
    temperatureC: 5.0,
    observedAt: '2024-06-01 12:00:00',
  }, { source: 'driver_offline', requireTimezone: true });

  assert(driverResult.status === 'error', '司机数据无时区返回error状态');
  assert(driverResult.message.includes('时区'), `错误消息包含时区提示: ${driverResult.message}`);

  console.log('\n=== 7. 时间线排序测试 ===');
  const baseKey = `timeline-test-${Date.now()}`;
  temperatureEvidenceService.submitOne({
    readingKey: `${baseKey}-1`,
    nodeId: testNodeId,
    temperatureC: 3.0,
    observedAt: '2024-06-01T10:00:00Z',
    operatorName: 'backfill',
  }, { source: 'historical_backfill', requireTimezone: false });

  temperatureEvidenceService.submitOne({
    readingKey: `${baseKey}-2`,
    nodeId: testNodeId,
    temperatureC: 4.0,
    observedAt: '2024-06-01T10:00:00Z',
    operatorName: 'csv',
  }, { source: 'csv_import', requireTimezone: false });

  temperatureEvidenceService.submitOne({
    readingKey: `${baseKey}-3`,
    nodeId: testNodeId,
    temperatureC: 5.0,
    observedAt: '2024-06-01T10:00:00Z',
    operatorName: 'driver',
  }, { source: 'driver_offline', requireTimezone: false });

  temperatureEvidenceService.submitOne({
    readingKey: `${baseKey}-4`,
    nodeId: testNodeId,
    temperatureC: 6.0,
    observedAt: '2024-06-01T09:00:00Z',
    operatorName: 'earlier',
  }, { source: 'csv_import', requireTimezone: false });

  const timeline = temperatureEvidenceService.getTimelineByTask(testTaskId);
  const testEntries = timeline.entries.filter(e => e.readingKey.startsWith(baseKey));

  assert(testEntries.length === 4, `时间线包含4条测试证据 (实际: ${testEntries.length})`);
  if (testEntries.length >= 4) {
    assert(testEntries[0].observedAt === '2024-06-01T09:00:00.000Z', '最早observedAt排第一');
    assert(testEntries[1].source === 'driver_offline', '同一时刻司机离线优先');
    assert(testEntries[2].source === 'csv_import', '同一时刻CSV导入其次');
    assert(testEntries[3].source === 'historical_backfill', '同一时刻历史回填最后');
  }

  console.log('\n=== 8. 异常判定测试 ===');
  const taskRow = db.prepare("SELECT order_id FROM delivery_tasks WHERE id = ?").get(testTaskId) as { order_id: string } | undefined;
  if (taskRow) {
    const order = orderRepository.findById(taskRow.order_id);
    if (order) {
      const abnormalKey = `abnormal-${Date.now()}`;
      const abnormalResult = temperatureEvidenceService.submitOne({
        readingKey: abnormalKey,
        nodeId: testNodeId,
        temperatureC: order.maxTemp + 10,
        observedAt: '2024-06-01T11:00:00Z',
        operatorName: 'test',
      }, { source: 'driver_offline', requireTimezone: false });

      assert(abnormalResult.status === 'created', '异常温度证据提交成功');

      const summary = temperatureEvidenceService.getNodeSummary(testNodeId);
      assert(summary.hasAnomaly === true, '节点存在异常证据');
      assert(summary.abnormalCount >= 1, `异常证据数量 >= 1 (实际: ${summary.abnormalCount})`);

      const normalKey = `normal-after-${Date.now()}`;
      temperatureEvidenceService.submitOne({
        readingKey: normalKey,
        nodeId: testNodeId,
        temperatureC: (order.minTemp + order.maxTemp) / 2,
        observedAt: '2024-06-01T12:00:00Z',
        operatorName: 'test',
      }, { source: 'csv_import', requireTimezone: false });

      const summaryAfterNormal = temperatureEvidenceService.getNodeSummary(testNodeId);
      assert(summaryAfterNormal.hasAnomaly === true, '新正常温度不能掩盖旧异常');
    }
  }
} else {
  console.log('  ⊘ 无可用节点，跳过节点相关测试');
}

console.log('\n=== 9. 只追加模型验证 ===');
const evidenceCount = db.prepare('SELECT COUNT(*) as count FROM temperature_evidence_ledger').get() as { count: number };
console.log(`  账本总记录数: ${evidenceCount.count}`);
const updateAttempt = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE '%evidence%update%'").all();
assert(updateAttempt.length === 0, '账本无UPDATE触发器（纯追加）');

console.log(`\n=== 测试结果: ${passed} 通过, ${failed} 失败 ===\n`);
process.exit(failed > 0 ? 1 : 0);
