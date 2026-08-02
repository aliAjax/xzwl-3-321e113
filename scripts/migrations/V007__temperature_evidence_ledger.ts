import type { Database } from 'better-sqlite3';

export const id = 'V007__temperature_evidence_ledger';
export const description = '新增只追加的温度证据账本表 temperature_evidence';

function tableExists(db: Database, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(table) as { name: string } | undefined;
  return !!row;
}

export function up(db: Database): void {
  // 只追加、不覆盖：证据一旦写入不会被更新或删除。
  // 温度以摄氏度乘 100 后的整数保存；observedAt / received_at 均为 UTC。
  if (!tableExists(db, 'temperature_evidence')) {
    db.exec(`
      CREATE TABLE temperature_evidence (
        id VARCHAR(36) PRIMARY KEY,
        batch_id VARCHAR(64) NOT NULL,
        source VARCHAR(30) NOT NULL CHECK (source IN ('driver_offline', 'csv_import', 'historical_backfill')),
        reading_key VARCHAR(128) NOT NULL,
        content_hash VARCHAR(64) NOT NULL,
        raw_payload TEXT NOT NULL,
        temperature_centi INTEGER NOT NULL,
        observed_at DATETIME NOT NULL,
        received_at DATETIME NOT NULL,
        order_id VARCHAR(36) REFERENCES orders(id),
        task_id VARCHAR(36) REFERENCES delivery_tasks(id),
        node_id VARCHAR(36) REFERENCES delivery_nodes(id),
        node_type VARCHAR(30) CHECK (node_type IN ('warehouse_in', 'loading', 'departure', 'arrival', 'delivery', 'signature')),
        min_temp_centi INTEGER,
        max_temp_centi INTEGER,
        is_abnormal INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  const indexes = [
    // 幂等判定：同一 readingKey 首次写入建立唯一约束，重复内容视为幂等，内容不同触发冲突。
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_reading_key ON temperature_evidence(reading_key)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_order ON temperature_evidence(order_id)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_node ON temperature_evidence(node_id)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_batch ON temperature_evidence(batch_id)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_observed ON temperature_evidence(observed_at)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_abnormal ON temperature_evidence(is_abnormal)',
  ];

  indexes.forEach(sql => db.exec(sql));
}
