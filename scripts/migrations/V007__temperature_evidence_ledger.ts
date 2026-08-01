import type { Database } from 'better-sqlite3';

export const id = 'V007__temperature_evidence_ledger';
export const description = '温度证据账本表（只追加、不覆盖），承接CSV导入、司机离线上报和历史回填';

/**
 * 向前迁移：仅新增 temperature_evidence 表与索引，不修改、不重置任何现有业务数据。
 * delivery_nodes.temperature 保留，继续兼容旧接口。
 */
export function up(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS temperature_evidence (
      id VARCHAR(36) PRIMARY KEY,
      batch_id VARCHAR(64) NOT NULL,
      source VARCHAR(30) NOT NULL CHECK (source IN ('driver_offline', 'csv_import', 'historical_backfill')),
      reading_key VARCHAR(128) NOT NULL,
      node_id VARCHAR(36) NOT NULL REFERENCES delivery_nodes(id),
      raw_payload TEXT NOT NULL,
      payload_hash VARCHAR(64) NOT NULL,
      temperature_celsius_x100 INTEGER NOT NULL,
      observed_at DATETIME NOT NULL,
      received_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const indexes = [
    // reading_key 全局唯一：从数据库层面禁止同键覆盖，
    // 相同 readingKey + 相同标准化载荷由服务层判定为幂等成功，载荷不同返回 409
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_temperature_evidence_reading_key ON temperature_evidence(reading_key)',
    'CREATE INDEX IF NOT EXISTS idx_temperature_evidence_node ON temperature_evidence(node_id)',
    'CREATE INDEX IF NOT EXISTS idx_temperature_evidence_batch ON temperature_evidence(batch_id)',
    'CREATE INDEX IF NOT EXISTS idx_temperature_evidence_observed_at ON temperature_evidence(observed_at)',
  ];

  indexes.forEach(sql => db.exec(sql));
}
