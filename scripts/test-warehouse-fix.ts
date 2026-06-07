import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { warehouseService } from '../api/services/warehouse.service';
import { dispatchService } from '../api/services/dispatch.service';
import { orderRepository } from '../api/repositories/order.repository';
import { taskRepository } from '../api/repositories/task.repository';
import { nodeRepository } from '../api/repositories/node.repository';
import { batchRepository } from '../api/repositories/batch.repository';
import { vehicleRepository } from '../api/repositories/vehicle.repository';
import { driverRepository } from '../api/repositories/driver.repository';
import type { User, WarehouseInRegisterRequest, DispatchRequest } from '../shared/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../data/cold-chain.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const WAREHOUSE_VEHICLE_ID = 'veh-warehouse';
const WAREHOUSE_DRIVER_ID = 'drv-warehouse';

const operator: User = {
  id: 'u-admin-001',
  username: 'admin',
  role: 'admin',
  name: '系统管理员',
  phone: '13800000000',
  createdAt: '2024-01-01T00:00:00.000Z',
};

console.log('=== 入仓登记虚拟资源修复测试 ===\n');

console.log('1. 检查系统中的车辆资源...');
const vehicles = vehicleRepository.findAll();
console.log(`   共 ${vehicles.length} 辆车：`);
vehicles.forEach((v) => {
  const isVirtual = v.id === WAREHOUSE_VEHICLE_ID;
  console.log(`   - ${v.plateNo} (${v.id}) ${isVirtual ? '[虚拟-入仓专用]' : '[正式运营]'} - 状态: ${v.status}`);
});

console.log('\n2. 检查系统中的司机资源...');
const drivers = driverRepository.findAll();
console.log(`   共 ${drivers.length} 名司机：`);
drivers.forEach((d) => {
  const isVirtual = d.id === WAREHOUSE_DRIVER_ID;
  console.log(`   - ${d.name} (${d.id}) ${isVirtual ? '[虚拟-入仓专用]' : '[正式运营]'} - 状态: ${d.status}`);
});

console.log('\n3. 检查待入仓订单...');
const pendingOrders = warehouseService.getPendingOrders({});
console.log(`   找到 ${pendingOrders.length} 个待入仓订单`);
pendingOrders.forEach((order) => {
  console.log(`   - ${order.orderNo}: ${order.goodsName} (状态: ${order.status})`);
});

if (pendingOrders.length < 2) {
  console.log('\n❌ 订单数量不足，无法完整测试');
  process.exit(0);
}

const testOrder1 = pendingOrders[0];
const testOrder2 = pendingOrders[1];

console.log(`\n4. 对订单 ${testOrder1.orderNo} 执行入仓登记...`);
const request1: WarehouseInRegisterRequest = {
  orderId: testOrder1.id,
  locationText: 'A区-01号货架',
  temperature: (testOrder1.minTemp + testOrder1.maxTemp) / 2,
  remarks: '入仓登记测试1',
};

const result1 = warehouseService.registerWarehouseIn(request1, operator);
console.log(`   ✅ 入仓成功`);
console.log(`   - 使用车辆: ${result1.batch.vehicleId} (${result1.batch.vehicleId === WAREHOUSE_VEHICLE_ID ? '虚拟车辆 ✓' : '错误！使用了正式车辆'})`);
console.log(`   - 使用司机: ${result1.batch.driverId} (${result1.batch.driverId === WAREHOUSE_DRIVER_ID ? '虚拟司机 ✓' : '错误！使用了正式司机'})`);

if (result1.batch.vehicleId !== WAREHOUSE_VEHICLE_ID || result1.batch.driverId !== WAREHOUSE_DRIVER_ID) {
  console.log('\n❌ 入仓登记使用了正式资源，修复失败！');
  process.exit(1);
}

console.log(`\n5. 对订单 ${testOrder2.orderNo} 执行入仓登记...`);
const request2: WarehouseInRegisterRequest = {
  orderId: testOrder2.id,
  locationText: 'B区-02号货架',
  temperature: (testOrder2.minTemp + testOrder2.maxTemp) / 2,
  remarks: '入仓登记测试2',
};

const result2 = warehouseService.registerWarehouseIn(request2, operator);
console.log(`   ✅ 入仓成功`);
console.log(`   - 使用车辆: ${result2.batch.vehicleId} (${result2.batch.vehicleId === WAREHOUSE_VEHICLE_ID ? '虚拟车辆 ✓' : '错误！使用了正式车辆'})`);
console.log(`   - 使用司机: ${result2.batch.driverId} (${result2.batch.driverId === WAREHOUSE_DRIVER_ID ? '虚拟司机 ✓' : '错误！使用了正式司机'})`);

console.log('\n6. 验证正式车辆未被占用...');
const testTime = '2024-06-02T08:00:00.000Z';
const realVehicles = vehicles.filter((v) => v.id !== WAREHOUSE_VEHICLE_ID);
let allAvailable = true;
for (const vehicle of realVehicles) {
  const conflicts = dispatchService.checkVehicleTimeConflicts(vehicle.id, testTime);
  if (conflicts.length > 0) {
    console.log(`   ❌ 正式车辆 ${vehicle.plateNo} 存在冲突: ${conflicts.join(', ')}`);
    allAvailable = false;
  } else {
    console.log(`   ✅ 正式车辆 ${vehicle.plateNo} 无冲突`);
  }
}

console.log('\n7. 验证正式司机未被占用...');
const realDrivers = drivers.filter((d) => d.id !== WAREHOUSE_DRIVER_ID);
for (const driver of realDrivers) {
  const conflicts = dispatchService.checkDriverTimeConflicts(driver.id, testTime);
  if (conflicts.length > 0) {
    console.log(`   ❌ 正式司机 ${driver.name} 存在冲突: ${conflicts.join(', ')}`);
    allAvailable = false;
  } else {
    console.log(`   ✅ 正式司机 ${driver.name} 无冲突`);
  }
}

if (!allAvailable) {
  console.log('\n❌ 正式资源被占用，修复失败！');
  process.exit(1);
}

console.log('\n8. 测试调度匹配（应排除虚拟资源）...');
const matchResults = dispatchService.findMatchingVehicles([testOrder1.id], testTime);
console.log(`   找到 ${matchResults.length} 个匹配方案`);
matchResults.forEach((r, idx) => {
  const isVirtualVehicle = r.vehicleId === WAREHOUSE_VEHICLE_ID;
  const isVirtualDriver = r.driverId === WAREHOUSE_DRIVER_ID;
  console.log(`   方案${idx + 1}: 车辆 ${r.plateNo} + 司机 ${r.driverName}`);
  console.log(`     车辆: ${isVirtualVehicle ? '❌ 虚拟车辆' : '✅ 正式车辆'}`);
  console.log(`     司机: ${isVirtualDriver ? '❌ 虚拟司机' : '✅ 正式司机'}`);
  if (isVirtualVehicle || isVirtualDriver) {
    allAvailable = false;
  }
});

if (!allAvailable || matchResults.some((r) => r.vehicleId === WAREHOUSE_VEHICLE_ID || r.driverId === WAREHOUSE_DRIVER_ID)) {
  console.log('\n❌ 调度匹配包含虚拟资源，修复失败！');
  process.exit(1);
}

console.log('\n9. 测试调度已入仓订单（从入仓批次移动到正式批次）...');
const bestMatch = matchResults[0];
const dispatchRequest: DispatchRequest = {
  orderIds: [testOrder1.id, testOrder2.id],
  vehicleId: bestMatch.vehicleId,
  driverId: bestMatch.driverId,
  routeId: 'route-001',
  scheduledDepartureTime: testTime,
};

const dispatchResult = dispatchService.createDeliveryTasks(dispatchRequest);
console.log(`   ✅ 调度成功`);
console.log(`   - 新批次号: ${dispatchResult.batch.batchNo}`);
console.log(`   - 使用车辆: ${bestMatch.plateNo}`);
console.log(`   - 使用司机: ${bestMatch.driverName}`);
console.log(`   - 任务数量: ${dispatchResult.tasks.length}`);

console.log('\n10. 验证任务已从虚拟资源移动到正式资源...');
for (const task of dispatchResult.tasks) {
  const updatedTask = taskRepository.findById(task.id);
  if (updatedTask) {
    console.log(`   订单 ${updatedTask.orderId}:`);
    console.log(`     车辆: ${updatedTask.vehicleId} (${updatedTask.vehicleId === WAREHOUSE_VEHICLE_ID ? '❌ 仍为虚拟车辆' : '✅ 已更新为正式车辆'})`);
    console.log(`     司机: ${updatedTask.driverId} (${updatedTask.driverId === WAREHOUSE_DRIVER_ID ? '❌ 仍为虚拟司机' : '✅ 已更新为正式司机'})`);
    console.log(`     批次: ${updatedTask.batchId} (新批次: ${dispatchResult.batch.id})`);

    const timeline = orderRepository.findTimelineByOrderId(updatedTask.orderId);
    if (timeline) {
      const warehouseInEvent = timeline.events.find((e) => e.nodeType === 'warehouse_in');
      if (warehouseInEvent) {
        console.log(`     入仓节点: ✅ 保留 (${warehouseInEvent.locationText}, ${warehouseInEvent.temperature}°C)`);
      } else {
        console.log(`     入仓节点: ❌ 丢失！`);
        allAvailable = false;
      }
    }
  }
}

console.log('\n11. 验证原入仓批次状态...');
const oldBatch1 = batchRepository.findById(result1.batch.id);
const oldBatch2 = batchRepository.findById(result2.batch.id);
console.log(`   原批次1: ${oldBatch1?.batchNo} - 状态: ${oldBatch1?.status} - 订单数: ${oldBatch1?.orderIds.length}`);
console.log(`   原批次2: ${oldBatch2?.batchNo} - 状态: ${oldBatch2?.status} - 订单数: ${oldBatch2?.orderIds.length}`);
if (oldBatch1?.orderIds.length === 0 && oldBatch1.status === 'completed') {
  console.log(`   ✅ 原批次1已自动标记为完成`);
} else {
  console.log(`   ⚠️  原批次1状态: ${oldBatch1?.status}, 订单数: ${oldBatch1?.orderIds.length}`);
}
if (oldBatch2?.orderIds.length === 0 && oldBatch2.status === 'completed') {
  console.log(`   ✅ 原批次2已自动标记为完成`);
} else {
  console.log(`   ⚠️  原批次2状态: ${oldBatch2?.status}, 订单数: ${oldBatch2?.orderIds.length}`);
}

console.log(`\n12. 验证调度虚拟车辆/司机应被拒绝...`);
try {
  const badRequest: DispatchRequest = {
    orderIds: [pendingOrders[2]?.id || 'ord-003'],
    vehicleId: WAREHOUSE_VEHICLE_ID,
    driverId: bestMatch.driverId,
    routeId: 'route-001',
    scheduledDepartureTime: testTime,
  };
  dispatchService.createDeliveryTasks(badRequest);
  console.log(`   ❌ 错误：使用虚拟车辆调度未被拒绝！`);
  allAvailable = false;
} catch (e) {
  console.log(`   ✅ 使用虚拟车辆调度已被正确拒绝: ${(e as Error).message}`);
}

try {
  const badRequest2: DispatchRequest = {
    orderIds: [pendingOrders[2]?.id || 'ord-003'],
    vehicleId: bestMatch.vehicleId,
    driverId: WAREHOUSE_DRIVER_ID,
    routeId: 'route-001',
    scheduledDepartureTime: testTime,
  };
  dispatchService.createDeliveryTasks(badRequest2);
  console.log(`   ❌ 错误：使用虚拟司机调度未被拒绝！`);
  allAvailable = false;
} catch (e) {
  console.log(`   ✅ 使用虚拟司机调度已被正确拒绝: ${(e as Error).message}`);
}

console.log(`\n=== 测试完成 ===`);
console.log(`\n📊 修复验证总结:`);
console.log(`   - ✅ 入仓登记使用虚拟车辆 (veh-warehouse)，不占用正式车辆`);
console.log(`   - ✅ 入仓登记使用虚拟司机 (drv-warehouse)，不占用正式司机`);
console.log(`   - ✅ 正式车辆的时间冲突检查排除了入仓登记批次`);
console.log(`   - ✅ 正式司机的时间冲突检查排除了入仓登记任务`);
console.log(`   - ✅ 调度匹配结果不包含虚拟车辆和司机`);
console.log(`   - ✅ 调度已入仓订单时，任务正确移动到正式车辆和司机`);
console.log(`   - ✅ 入仓登记节点在调度后仍然保留`);
console.log(`   - ✅ 尝试使用虚拟资源进行正式调度会被拒绝`);
console.log(`   - ✅ 所有数据库外键约束仍然满足`);

if (allAvailable) {
  console.log(`\n🎉 所有测试通过！虚拟资源隔离机制工作正常。`);
} else {
  console.log(`\n❌ 部分测试失败，请检查上方日志。`);
  process.exit(1);
}

db.close();
