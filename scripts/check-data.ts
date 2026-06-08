import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../data/cold-chain.db');
const db = new Database(dbPath);

console.log('=== 检查现有数据 ===');
console.log('Users:', db.prepare('SELECT id, name, role FROM users').all());
console.log('Drivers:', db.prepare('SELECT id, name FROM drivers').all());
console.log('Vehicles:', db.prepare('SELECT id, plate_no FROM vehicles').all());
console.log('Routes:', db.prepare('SELECT id, name FROM routes').all());
console.log('Customers:', db.prepare('SELECT id, name FROM customers').all());
console.log('Orders:', db.prepare('SELECT id, order_no FROM orders').all());
console.log('Loading batches:', db.prepare('SELECT id, batch_no FROM loading_batches').all());
console.log('Delivery tasks:', db.prepare('SELECT id, order_id FROM delivery_tasks').all());
console.log('Exception handlings:', db.prepare('SELECT id, handling_status FROM exception_handlings').all());

db.close();
