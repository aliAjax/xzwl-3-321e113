import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');
const dbPath = path.join(dataDir, 'cold-chain.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const hashPassword = (password: string) => bcrypt.hashSync(password, 10);

console.log('开始插入初始种子数据...');
console.log('注意: 仅插入不存在的记录，已有数据不会被覆盖\n');

function insertIfNotExists<T extends unknown[]>(
  table: string,
  idField: string,
  idValue: string,
  insertStmt: Database.Statement<T>,
  params: T,
  displayName: string
): void {
  const exists = db.prepare(`SELECT 1 FROM ${table} WHERE ${idField} = ?`).get(idValue);
  if (exists) {
    console.log(`  ⊘ ${displayName} (已存在，跳过)`);
  } else {
    insertStmt.run(params);
    console.log(`  ✓ ${displayName}`);
  }
}

const insertUser = db.prepare(`
  INSERT INTO users (id, username, password_hash, role, name, phone, driver_id)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertCustomer = db.prepare(`
  INSERT INTO customers (id, name, contact_name, phone, address, priority)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertVehicle = db.prepare(`
  INSERT INTO vehicles (id, plate_no, vehicle_type, temperature_zones, capacity, driver_id, available_start_time, available_end_time, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertDriver = db.prepare(`
  INSERT INTO drivers (id, name, phone, license_no, license_type, status)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertRoute = db.prepare(`
  INSERT INTO routes (id, name, description, stops_json)
  VALUES (?, ?, ?, ?)
`);

const insertOrder = db.prepare(`
  INSERT INTO orders (id, order_no, customer_id, temperature_zone, min_temp, max_temp, goods_name, quantity, weight, delivery_address, scheduled_delivery_time, status, remarks)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const pwdHash = hashPassword('123456');

console.log('司机数据:');
insertIfNotExists('drivers', 'id', 'drv-001', insertDriver,
  ['drv-001', '李师傅', '13700000001', '110101199001011234', 'A2', 'on_duty'] as const,
  'drv-001/李师傅'
);
insertIfNotExists('drivers', 'id', 'drv-002', insertDriver,
  ['drv-002', '王师傅', '13700000002', '110101199002022345', 'A1', 'on_duty'] as const,
  'drv-002/王师傅'
);
insertIfNotExists('drivers', 'id', 'drv-003', insertDriver,
  ['drv-003', '张师傅', '13700000003', '110101199003033456', 'A2', 'on_duty'] as const,
  'drv-003/张师傅'
);
insertIfNotExists('drivers', 'id', 'drv-warehouse', insertDriver,
  ['drv-warehouse', '入仓暂存', '00000000000', '000000000000000000', 'A1', 'on_duty'] as const,
  'drv-warehouse/入仓暂存'
);

console.log('\n用户数据:');
insertIfNotExists('users', 'id', 'u-admin-001', insertUser, 
  ['u-admin-001', 'admin', pwdHash, 'admin', '系统管理员', '13800000000', null] as const,
  'admin/系统管理员'
);
insertIfNotExists('users', 'id', 'u-dispatch-001', insertUser,
  ['u-dispatch-001', 'dispatcher', pwdHash, 'dispatcher', '张调度', '13800000001', null] as const,
  'dispatcher/张调度'
);
insertIfNotExists('users', 'id', 'u-driver-001', insertUser,
  ['u-driver-001', 'driver1', pwdHash, 'driver', '李司机', '13800000002', 'drv-001'] as const,
  'driver1/李司机'
);

console.log('\n客户数据:');
insertIfNotExists('customers', 'id', 'cust-001', insertCustomer,
  ['cust-001', '永辉超市', '王经理', '13900000001', '北京市朝阳区建国路88号', 1] as const,
  'cust-001/永辉超市'
);
insertIfNotExists('customers', 'id', 'cust-002', insertCustomer,
  ['cust-002', '盒马鲜生', '刘主管', '13900000002', '北京市海淀区中关村大街1号', 2] as const,
  'cust-002/盒马鲜生'
);
insertIfNotExists('customers', 'id', 'cust-003', insertCustomer,
  ['cust-003', '7-Eleven', '陈店长', '13900000003', '北京市西城区西单北大街1号', 1] as const,
  'cust-003/7-Eleven'
);

console.log('\n车辆数据:');
insertIfNotExists('vehicles', 'id', 'veh-001', insertVehicle,
  ['veh-001', '京A12345', '冷藏车', '["frozen","chilled","ambient"]', 5000, null, '06:00:00', '22:00:00', 'active'] as const,
  'veh-001/京A12345'
);
insertIfNotExists('vehicles', 'id', 'veh-002', insertVehicle,
  ['veh-002', '京B67890', '冷冻车', '["frozen","chilled"]', 8000, null, '05:00:00', '20:00:00', 'active'] as const,
  'veh-002/京B67890'
);
insertIfNotExists('vehicles', 'id', 'veh-003', insertVehicle,
  ['veh-003', '京C11111', '保温车', '["chilled","ambient"]', 3000, null, '07:00:00', '21:00:00', 'active'] as const,
  'veh-003/京C11111'
);
insertIfNotExists('vehicles', 'id', 'veh-warehouse', insertVehicle,
  ['veh-warehouse', '入仓专用', '虚拟车辆', '["frozen","chilled","ambient"]', 99999, null, '00:00:00', '23:59:59', 'active'] as const,
  'veh-warehouse/入仓专用'
);

console.log('\n线路数据:');
insertIfNotExists('routes', 'id', 'route-001', insertRoute,
  ['route-001', '朝阳线', '东部区域配送', JSON.stringify([
    { order: 1, address: '朝阳区建国路88号', estimatedTime: 30 },
    { order: 2, address: '朝阳区三里屯', estimatedTime: 45 }
  ])] as const,
  'route-001/朝阳线'
);
insertIfNotExists('routes', 'id', 'route-002', insertRoute,
  ['route-002', '海淀线', '北部区域配送', JSON.stringify([
    { order: 1, address: '海淀区中关村大街1号', estimatedTime: 40 },
    { order: 2, address: '海淀区五道口', estimatedTime: 35 }
  ])] as const,
  'route-002/海淀线'
);

console.log('\n订单数据:');
insertIfNotExists('orders', 'id', 'ord-001', insertOrder,
  ['ord-001', 'ORD20240601001', 'cust-001', 'frozen', -18, -12,
    '进口牛肉', 100, 500, '北京市朝阳区建国路88号',
    '2024-06-02 10:00:00', 'created', '需要优先配送'] as const,
  'ord-001/ORD20240601001'
);
insertIfNotExists('orders', 'id', 'ord-002', insertOrder,
  ['ord-002', 'ORD20240601002', 'cust-002', 'chilled', 2, 8,
    '新鲜蔬菜', 200, 300, '北京市海淀区中关村大街1号',
    '2024-06-02 09:00:00', 'created', ''] as const,
  'ord-002/ORD20240601002'
);
insertIfNotExists('orders', 'id', 'ord-003', insertOrder,
  ['ord-003', 'ORD20240601003', 'cust-003', 'ambient', 15, 25,
    '常温饮料', 500, 1000, '北京市西城区西单北大街1号',
    '2024-06-02 14:00:00', 'created', ''] as const,
  'ord-003/ORD20240601003'
);

console.log('\n✓ 种子数据处理完成！');
console.log('  所有初始账号默认密码: 123456');
db.close();
