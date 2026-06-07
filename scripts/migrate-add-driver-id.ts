import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../data/cold-chain.db');
const db = new Database(dbPath);

console.log('开始迁移：添加 users 表 driver_id 字段...');

try {
  const pragmaResult = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const hasDriverId = pragmaResult.some(col => col.name === 'driver_id');

  if (!hasDriverId) {
    db.exec(`
      ALTER TABLE users ADD COLUMN driver_id VARCHAR(36) REFERENCES drivers(id)
    `);
    console.log('✓ 已添加 driver_id 字段到 users 表');

    db.exec(`
      UPDATE users 
      SET driver_id = 'drv-001' 
      WHERE username = 'driver1'
    `);
    console.log('✓ 已更新 driver1 用户的 driver_id 关联');

    const pwdHash = bcrypt.hashSync('driver123', 10);
    const existingDriver = db.prepare("SELECT id FROM users WHERE username = 'driver'").get() as { id: string } | undefined;

    if (!existingDriver) {
      db.prepare(`
        INSERT OR REPLACE INTO users (id, username, password_hash, role, name, phone, driver_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('u-driver-002', 'driver', pwdHash, 'driver', '李司机', '13800000002', 'drv-001');
      console.log('✓ 已添加 driver 用户 (driver/driver123)');
    }
  } else {
    console.log('✓ driver_id 字段已存在，跳过添加');
  }

  console.log('迁移完成！');
} catch (error) {
  console.error('迁移失败:', error);
}

db.close();
