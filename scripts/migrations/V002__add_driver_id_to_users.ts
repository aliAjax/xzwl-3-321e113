import type { Database } from 'better-sqlite3';
import bcrypt from 'bcryptjs';

export const id = 'V002__add_driver_id_to_users';
export const description = '给users表添加driver_id字段并更新相关数据';

export function up(db: Database): void {
  const columns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const hasDriverId = columns.some(col => col.name === 'driver_id');

  if (!hasDriverId) {
    db.exec(`ALTER TABLE users ADD COLUMN driver_id VARCHAR(36) REFERENCES drivers(id)`);

    const driverExists = db.prepare("SELECT 1 FROM drivers WHERE id = ?").get('drv-001');
    if (driverExists) {
      db.exec(`
        UPDATE users
        SET driver_id = 'drv-001'
        WHERE username = 'driver1'
      `);

      const pwdHash = bcrypt.hashSync('driver123', 10);
      const existingDriverUser = db.prepare("SELECT id FROM users WHERE username = 'driver'").get() as { id: string } | undefined;

      if (!existingDriverUser) {
        db.prepare(`
          INSERT OR IGNORE INTO users (id, username, password_hash, role, name, phone, driver_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('u-driver-002', 'driver', pwdHash, 'driver', '李司机', '13800000002', 'drv-001');
      }
    }
  }
}
