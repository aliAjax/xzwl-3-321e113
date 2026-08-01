import type { Database } from 'better-sqlite3';

export const id = 'V007__temperature_evidence_ledger';
export const description = '创建温度证据账本表（只追加，不覆盖）';

function tableExists(db: Database, table: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(table) as { name: string } | undefined;
  return row !== undefined;
}

export function up(db: Database): void {
  if (!tableExists(db, 'temperature_evidence')) {
    db.exec(`
      CREATE TABLE temperature_evidence (
        id VARCHAR(36) PRIMARY KEY,
        batch_id VARCHAR(36) NOT NULL,
        source VARCHAR(20) NOT NULL CHECK (source IN ('csv_import', 'driver_offline', 'historical_backfill')),
        reading_key VARCHAR(200) NOT NULL,
        payload_hash VARCHAR(128) NOT NULL,
        raw_payload TEXT NOT NULL,
        temperature_centi INTEGER NOT NULL,
        observed_at DATETIME NOT NULL,
        received_at DATETIME NOT NULL,
        node_id VARCHAR(36),
        task_id VARCHAR(36),
        order_id VARCHAR(36),
        node_type VARCHAR(30),
        order_no VARCHAR(50),
        location_text VARCHAR(200),
        operator_name VARCHAR(100),
        judgment VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (judgment IN ('normal', 'abnormal')),
        abnormal_reasons_json TEXT NOT NULL DEFAULT '[]',
        min_temp DECIMAL(5,2),
        max_temp DECIMAL(5,2),
        temperature_zone VARCHAR(20),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  const indexes = [
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_reading_key ON temperature_evidence(reading_key)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_batch ON temperature_evidence(batch_id)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_source ON temperature_evidence(source)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_node ON temperature_evidence(node_id)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_task ON temperature_evidence(task_id)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_order ON temperature_evidence(order_id)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_observed ON temperature_evidence(observed_at)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_received ON temperature_evidence(received_at)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_judgment ON temperature_evidence(judgment)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_node_observed ON temperature_evidence(node_id, observed_at)',
  ];

  indexes.forEach(sql => db.exec(sql));
}
