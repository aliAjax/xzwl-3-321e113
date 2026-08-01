import type { Database } from 'better-sqlite3';
export const id = 'V002__add_driver_id_to_users';
export const description = '给users表添加driver_id字段并更新相关数据';

export function up(db: Database): void {
  const columns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const hasDriverId = columns.some(col => col.name === 'driver_id');

  if (!hasDriverId) {
    db.exec(`ALTER TABLE users ADD COLUMN driver_id VARCHAR(36) REFERENCES drivers(id)`);

    db.exec(`
      UPDATE users
      SET driver_id = 'drv-001'
      WHERE username = 'driver1'
        AND EXISTS (SELECT 1 FROM drivers WHERE id = 'drv-001')
    `);
  }
}
