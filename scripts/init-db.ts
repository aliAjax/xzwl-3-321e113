import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');
const dbPath = path.join(dataDir, 'cold-chain.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
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
    closed_by VARCHAR(36) REFERENCES users(id),
    closed_at DATETIME,
    sla_deadline DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(node_id)
  )`,
];

const indexes = [
  'CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id)',
  'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)',
  'CREATE INDEX IF NOT EXISTS idx_orders_scheduled ON orders(scheduled_delivery_time)',
  'CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status)',
  'CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status)',
  'CREATE INDEX IF NOT EXISTS idx_batches_status ON loading_batches(status)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_batch ON delivery_tasks(batch_id)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_order ON delivery_tasks(order_id)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_driver ON delivery_tasks(driver_id)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_status ON delivery_tasks(status)',
  'CREATE INDEX IF NOT EXISTS idx_nodes_task ON delivery_nodes(task_id)',
  'CREATE INDEX IF NOT EXISTS idx_nodes_recorded ON delivery_nodes(recorded_at)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_client_submit_id ON delivery_nodes(client_submit_id) WHERE client_submit_id IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS idx_nodes_updated ON delivery_nodes(updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_nodes_version ON delivery_nodes(id, version)',
  'CREATE INDEX IF NOT EXISTS idx_exception_node ON exception_handlings(node_id)',
  'CREATE INDEX IF NOT EXISTS idx_exception_status ON exception_handlings(handling_status)',
  'CREATE INDEX IF NOT EXISTS idx_exception_time ON exception_handlings(exception_time)',
  'CREATE INDEX IF NOT EXISTS idx_exception_driver ON exception_handlings(driver_id)',
  'CREATE INDEX IF NOT EXISTS idx_exception_zone ON exception_handlings(temperature_zone)',
  'CREATE INDEX IF NOT EXISTS idx_exception_sla_deadline ON exception_handlings(sla_deadline)',
];

console.log('开始初始化数据库...');

migrations.forEach((sql, index) => {
  try {
    db.exec(sql);
    console.log(`✓ 执行迁移 ${index + 1}/${migrations.length}`);
  } catch (error) {
    console.error(`✗ 迁移 ${index + 1} 失败:`, error);
  }
});

indexes.forEach((sql, index) => {
  try {
    db.exec(sql);
    console.log(`✓ 创建索引 ${index + 1}/${indexes.length}`);
  } catch (error) {
    console.error(`✗ 索引 ${index + 1} 失败:`, error);
  }
});

console.log('数据库初始化完成！');
db.close();
