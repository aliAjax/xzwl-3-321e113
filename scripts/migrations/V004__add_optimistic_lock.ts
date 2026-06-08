import type { Database } from 'better-sqlite3';

export const id = 'V004__add_optimistic_lock';
export const description = '给delivery_nodes添加乐观锁version字段';

function columnExists(db: Database, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some(col => col.name === column);
}

export function up(db: Database): void {
  if (!columnExists(db, 'delivery_nodes', 'version')) {
    db.exec(`ALTER TABLE delivery_nodes ADD COLUMN version INTEGER DEFAULT 1`);
    db.exec(`UPDATE delivery_nodes SET version = 1 WHERE version IS NULL`);
  }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_nodes_version ON delivery_nodes(id, version)`);
}
