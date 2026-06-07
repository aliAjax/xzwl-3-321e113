import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../data/cold-chain.db');
const db = new Database(dbPath);

const hashPassword = (password: string) => bcrypt.hashSync(password, 10);

console.log('开始插入初始数据...');

const insertUser = db.prepare(`
  INSERT OR REPLACE INTO users (id, username, password_hash, role, name, phone)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertCustomer = db.prepare(`
  INSERT OR REPLACE INTO customers (id, name, contact_name, phone, address, priority)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertVehicle = db.prepare(`
  INSERT OR REPLACE INTO vehicles (id, plate_no, vehicle_type, temperature_zones, capacity, driver_id, available_start_time, available_end_time, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertDriver = db.prepare(`
  INSERT OR REPLACE INTO drivers (id, name, phone, license_no, license_type, status)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertRoute = db.prepare(`
  INSERT OR REPLACE INTO routes (id, name, description, stops_json)
  VALUES (?, ?, ?, ?)
`);

const insertOrder = db.prepare(`
  INSERT OR REPLACE INTO orders (id, order_no, customer_id, temperature_zone, min_temp, max_temp, goods_name, quantity, weight, delivery_address, scheduled_delivery_time, status, remarks)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const pwdHash = hashPassword('123456');

insertUser.run('u-admin-001', 'admin', pwdHash, 'admin', '系统管理员', '13800000000');
insertUser.run('u-dispatch-001', 'dispatcher', pwdHash, 'dispatcher', '张调度', '13800000001');
insertUser.run('u-driver-001', 'driver1', pwdHash, 'driver', '李司机', '13800000002');
console.log('✓ 用户数据插入完成');

insertCustomer.run('cust-001', '永辉超市', '王经理', '13900000001', '北京市朝阳区建国路88号', 1);
insertCustomer.run('cust-002', '盒马鲜生', '刘主管', '13900000002', '北京市海淀区中关村大街1号', 2);
insertCustomer.run('cust-003', '7-Eleven', '陈店长', '13900000003', '北京市西城区西单北大街1号', 1);
console.log('✓ 客户数据插入完成');

insertVehicle.run('veh-001', '京A12345', '冷藏车', '["frozen","chilled","ambient"]', 5000, null, '06:00:00', '22:00:00', 'active');
insertVehicle.run('veh-002', '京B67890', '冷冻车', '["frozen","chilled"]', 8000, null, '05:00:00', '20:00:00', 'active');
insertVehicle.run('veh-003', '京C11111', '保温车', '["chilled","ambient"]', 3000, null, '07:00:00', '21:00:00', 'active');
insertVehicle.run('veh-warehouse', '入仓专用', '虚拟车辆', '["frozen","chilled","ambient"]', 99999, null, '00:00:00', '23:59:59', 'active');
console.log('✓ 车辆数据插入完成');

insertDriver.run('drv-001', '李师傅', '13700000001', '110101199001011234', 'A2', 'on_duty');
insertDriver.run('drv-002', '王师傅', '13700000002', '110101199002022345', 'A1', 'on_duty');
insertDriver.run('drv-003', '张师傅', '13700000003', '110101199003033456', 'A2', 'on_duty');
insertDriver.run('drv-warehouse', '入仓暂存', '00000000000', '000000000000000000', 'A1', 'on_duty');
console.log('✓ 司机数据插入完成');

insertRoute.run('route-001', '朝阳线', '东部区域配送', JSON.stringify([
  { order: 1, address: '朝阳区建国路88号', estimatedTime: 30 },
  { order: 2, address: '朝阳区三里屯', estimatedTime: 45 }
]));
insertRoute.run('route-002', '海淀线', '北部区域配送', JSON.stringify([
  { order: 1, address: '海淀区中关村大街1号', estimatedTime: 40 },
  { order: 2, address: '海淀区五道口', estimatedTime: 35 }
]));
console.log('✓ 线路数据插入完成');

insertOrder.run(
  'ord-001', 'ORD20240601001', 'cust-001', 'frozen', -18, -12,
  '进口牛肉', 100, 500, '北京市朝阳区建国路88号',
  '2024-06-02 10:00:00', 'created', '需要优先配送'
);
insertOrder.run(
  'ord-002', 'ORD20240601002', 'cust-002', 'chilled', 2, 8,
  '新鲜蔬菜', 200, 300, '北京市海淀区中关村大街1号',
  '2024-06-02 09:00:00', 'created', ''
);
insertOrder.run(
  'ord-003', 'ORD20240601003', 'cust-003', 'ambient', 15, 25,
  '常温饮料', 500, 1000, '北京市西城区西单北大街1号',
  '2024-06-02 14:00:00', 'created', ''
);
console.log('✓ 订单数据插入完成');

console.log('所有初始数据插入完成！');
db.close();
