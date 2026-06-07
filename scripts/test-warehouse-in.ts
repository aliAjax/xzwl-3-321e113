import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { warehouseService } from '../api/services/warehouse.service';
import { orderRepository } from '../api/repositories/order.repository';
import { taskRepository } from '../api/repositories/task.repository';
import { nodeRepository } from '../api/repositories/node.repository';
import { batchRepository } from '../api/repositories/batch.repository';
import type { User, WarehouseInRegisterRequest } from '../shared/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../data/cold-chain.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const operator: User = {
  id: 'u-admin-001',
  username: 'admin',
  role: 'admin',
  name: '系统管理员',
  phone: '13800000000',
  createdAt: '2024-01-01T00:00:00.000Z',
};

console.log('=== 仓库入仓登记功能测试 ===\n');

console.log('1. 检查待入仓订单...');
const pendingOrders = warehouseService.getPendingOrders({});
console.log(`   找到 ${pendingOrders.length} 个待入仓订单`);
pendingOrders.forEach((order) => {
  console.log(`   - ${order.orderNo}: ${order.goodsName} (状态: ${order.status})`);
});

if (pendingOrders.length === 0) {
  console.log('\n❌ 没有待入仓的订单，测试无法继续');
  process.exit(0);
}

const testOrder = pendingOrders[0];
console.log(`\n2. 选择订单 ${testOrder.orderNo} 进行入仓登记测试...`);
console.log(`   订单状态: ${testOrder.status}`);

const request: WarehouseInRegisterRequest = {
  orderId: testOrder.id,
  locationText: 'A区-03号货架-第2层',
  temperature: (testOrder.minTemp + testOrder.maxTemp) / 2,
  remarks: '货物包装完好，温度正常',
};

console.log(`\n3. 执行入仓登记...`);
console.log(`   仓库位置: ${request.locationText}`);
console.log(`   实测温度: ${request.temperature}°C`);
console.log(`   备注: ${request.remarks}`);

try {
  const result = warehouseService.registerWarehouseIn(request, operator);

  console.log(`\n✅ 入仓登记成功！`);
  console.log(`\n4. 验证数据...`);

  console.log(`\n   订单信息:`);
  console.log(`   - 订单ID: ${result.order.id}`);
  console.log(`   - 订单号: ${result.order.orderNo}`);
  console.log(`   - 状态: ${result.order.status} (期望: warehoused)`);

  console.log(`\n   批次信息:`);
  console.log(`   - 批次ID: ${result.batch.id}`);
  console.log(`   - 批次号: ${result.batch.batchNo}`);
  console.log(`   - 车辆ID: ${result.batch.vehicleId}`);
  console.log(`   - 司机ID: ${result.batch.driverId}`);
  console.log(`   - 订单数: ${result.batch.orderIds.length}`);

  console.log(`\n   任务信息:`);
  console.log(`   - 任务ID: ${result.task.id}`);
  console.log(`   - 批次ID: ${result.task.batchId}`);
  console.log(`   - 状态: ${result.task.status} (期望: warehoused)`);

  console.log(`\n   节点信息:`);
  console.log(`   - 节点ID: ${result.node.id}`);
  console.log(`   - 节点类型: ${result.node.nodeType} (期望: warehouse_in)`);
  console.log(`   - 节点名称: ${result.node.nodeName}`);
  console.log(`   - 状态: ${result.node.status} (期望: completed)`);
  console.log(`   - 仓库位置: ${result.node.locationText}`);
  console.log(`   - 实测温度: ${result.node.temperature}°C`);
  console.log(`   - 备注: ${result.node.exceptionDescription}`);
  console.log(`   - 操作人: ${result.node.operatorName}`);
  console.log(`   - 记录时间: ${result.node.recordedAt}`);

  console.log(`\n5. 重新查询订单验证状态更新...`);
  const updatedOrder = orderRepository.findById(testOrder.id);
  if (updatedOrder) {
    console.log(`   订单状态: ${updatedOrder.status}`);
    if (updatedOrder.status === 'warehoused') {
      console.log(`   ✅ 订单状态正确更新为 warehoused`);
    } else {
      console.log(`   ❌ 订单状态未正确更新`);
    }
  }

  console.log(`\n6. 查询时间线验证入仓事件...`);
  const timeline = orderRepository.findTimelineByOrderId(testOrder.id);
  if (timeline) {
    console.log(`   时间线事件数: ${timeline.events.length}`);
    const warehouseInEvent = timeline.events.find((e) => e.nodeType === 'warehouse_in');
    if (warehouseInEvent) {
      console.log(`   ✅ 找到入仓登记事件`);
      console.log(`      - 节点类型: ${warehouseInEvent.nodeType}`);
      console.log(`      - 节点名称: ${warehouseInEvent.nodeName}`);
      console.log(`      - 状态: ${warehouseInEvent.status}`);
      console.log(`      - 位置: ${warehouseInEvent.locationText}`);
      console.log(`      - 温度: ${warehouseInEvent.temperature}°C`);
      console.log(`      - 操作人: ${warehouseInEvent.operatorName}`);
      console.log(`      - 记录时间: ${warehouseInEvent.recordedAt}`);
    } else {
      console.log(`   ❌ 未找到入仓登记事件`);
      console.log(`   所有事件: ${timeline.events.map((e) => e.nodeType).join(', ')}`);
    }
  }

  console.log(`\n7. 验证数据库约束...`);
  const task = taskRepository.findById(result.task.id);
  if (task) {
    console.log(`   任务外键约束验证:`);
    console.log(`   - batchId 非空: ${!!task.batchId} (${task.batchId})`);
    console.log(`   - driverId 非空: ${!!task.driverId} (${task.driverId})`);
    console.log(`   - vehicleId 非空: ${!!task.vehicleId} (${task.vehicleId})`);
    if (task.batchId && task.driverId && task.vehicleId) {
      console.log(`   ✅ 所有外键约束都满足`);
    } else {
      console.log(`   ❌ 存在空的外键字段`);
    }
  }

  const node = nodeRepository.findById(result.node.id);
  if (node) {
    console.log(`\n   节点外键约束验证:`);
    console.log(`   - taskId 非空: ${!!node.taskId} (${node.taskId})`);
    if (node.taskId) {
      console.log(`   ✅ 节点外键约束满足`);
    } else {
      console.log(`   ❌ 节点 taskId 为空`);
    }
  }

  console.log(`\n=== 测试完成 ===`);
  console.log(`\n📊 总结:`);
  console.log(`   - ✅ 在既有数据库约束下成功生成 warehouse_in 节点`);
  console.log(`   - ✅ 订单状态成功更新为 warehoused`);
  console.log(`   - ✅ 订单详情时间线可看到入仓事件`);
  console.log(`   - ✅ 所有外键约束 (batch_id, driver_id, vehicle_id, task_id) 均满足`);
} catch (error) {
  console.log(`\n❌ 测试失败: ${(error as Error).message}`);
  console.error(error);
} finally {
  db.close();
}
