import type { Database } from 'better-sqlite3';

export const id = 'V003__add_client_submit_id';
export const description = '给delivery_nodes添加client_submit_id和updated_at字段';

function columnExists(db: Database, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some(col => col.name === column);
}

export function up(db: Database): void {
  if (!columnExists(db, 'delivery_nodes', 'client_submit_id')) {
    db.exec(`ALTER TABLE delivery_nodes ADD COLUMN client_submit_id VARCHAR(64)`);
  }

  if (!columnExists(db, 'delivery_nodes', 'updated_at')) {
    db.exec(`ALTER TABLE delivery_nodes ADD COLUMN updated_at DATETIME`);
    db.exec(`UPDATE delivery_nodes SET updated_at = created_at WHERE updated_at IS NULL`);
  }

  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_client_submit_id ON delivery_nodes(client_submit_id) WHERE client_submit_id IS NOT NULL`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_nodes_updated ON delivery_nodes(updated_at)`);
}
