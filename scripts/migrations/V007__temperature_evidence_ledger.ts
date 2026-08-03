import type { Database } from 'better-sqlite3';
import crypto from 'crypto';

export const id = 'V007__temperature_evidence_ledger';
export const description = '创建温度证据账本表并回填历史温度数据';

const MIGRATION_BATCH_ID = 'migration-v007-backfill';

function tableExists(db: Database, tableName: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(tableName) as { name: string } | undefined;
  return !!row;
}

function celsiusToStorage(tempC: number): number {
  return Math.round(tempC * 100);
}

function canonicalJson(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const pairs: string[] = [];
  for (const key of keys) {
    const v = obj[key];
    if (v === null || v === undefined) {
      pairs.push(`${JSON.stringify(key)}:null`);
    } else if (typeof v === 'object') {
      pairs.push(`${JSON.stringify(key)}:${canonicalJson(v as Record<string, unknown>)}`);
    } else {
      pairs.push(`${JSON.stringify(key)}:${JSON.stringify(v)}`);
    }
  }
  return `{${pairs.join(',')}}`;
}

function computeHash(payload: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex');
}

interface BackfillNodeRow {
  id: string;
  task_id: string;
  temperature: number | string;
  recorded_at: string | null;
  created_at: string;
  updated_at: string | null;
  location_text: string | null;
  operator_name: string | null;
  exception_description: string | null;
  order_id: string;
  min_temp: number | string;
  max_temp: number | string;
}

export function up(db: Database): void {
  if (!tableExists(db, 'temperature_evidence_ledger')) {
    db.exec(`
      CREATE TABLE temperature_evidence_ledger (
        id VARCHAR(36) PRIMARY KEY,
        batch_id VARCHAR(64) NOT NULL,
        source VARCHAR(20) NOT NULL CHECK (source IN ('csv_import', 'driver_offline', 'historical_backfill')),
        reading_key VARCHAR(128) NOT NULL,
        node_id VARCHAR(36),
        task_id VARCHAR(36) NOT NULL,
        order_id VARCHAR(36) NOT NULL,
        original_payload TEXT NOT NULL,
        normalized_temp_c INTEGER NOT NULL,
        observed_at DATETIME NOT NULL,
        received_at DATETIME NOT NULL,
        location_text VARCHAR(200),
        operator_name VARCHAR(100),
        payload_hash VARCHAR(64) NOT NULL,
        is_abnormal INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(reading_key)
      )
    `);
  }

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_evidence_batch ON temperature_evidence_ledger(batch_id)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_source ON temperature_evidence_ledger(source)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_node ON temperature_evidence_ledger(node_id)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_task ON temperature_evidence_ledger(task_id)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_order ON temperature_evidence_ledger(order_id)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_observed ON temperature_evidence_ledger(observed_at)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_received ON temperature_evidence_ledger(received_at)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_abnormal ON temperature_evidence_ledger(is_abnormal)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_node_observed ON temperature_evidence_ledger(node_id, observed_at)',
  ];
  indexes.forEach((sql) => db.exec(sql));

  const existingCountRow = db
    .prepare(`SELECT COUNT(*) as count FROM temperature_evidence_ledger WHERE batch_id = ?`)
    .get(MIGRATION_BATCH_ID) as { count: number };

  if (existingCountRow.count > 0) {
    console.log(`  ⊘ 历史回填已执行（${existingCountRow.count} 条），跳过回填`);
    return;
  }

  const nodes = db
    .prepare(`
      SELECT n.id, n.task_id, n.temperature, n.recorded_at, n.created_at,
             n.updated_at, n.location_text, n.operator_name, n.exception_description,
             t.order_id, o.min_temp, o.max_temp
      FROM delivery_nodes n
      LEFT JOIN delivery_tasks t ON n.task_id = t.id
      LEFT JOIN orders o ON t.order_id = o.id
      WHERE n.temperature IS NOT NULL
    `)
    .all() as BackfillNodeRow[];

  if (nodes.length === 0) {
    console.log('  ⊘ 无历史温度数据需要回填');
    return;
  }

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO temperature_evidence_ledger (
      id, batch_id, source, reading_key, node_id, task_id, order_id,
      original_payload, normalized_temp_c, observed_at, received_at,
      location_text, operator_name, payload_hash, is_abnormal, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let backfilled = 0;
  for (const node of nodes) {
    const tempRaw = typeof node.temperature === 'string' ? parseFloat(node.temperature) : node.temperature;
    if (Number.isNaN(tempRaw)) continue;

    const normalizedTempC = celsiusToStorage(tempRaw);
    const observedAt = node.recorded_at || node.created_at;
    const receivedAt = node.updated_at || node.created_at;

    const minTemp = typeof node.min_temp === 'string' ? parseFloat(node.min_temp) : node.min_temp;
    const maxTemp = typeof node.max_temp === 'string' ? parseFloat(node.max_temp) : node.max_temp;
    const isAbnormal = !Number.isNaN(minTemp) && !Number.isNaN(maxTemp)
      ? (tempRaw < minTemp || tempRaw > maxTemp)
      : false;

    const originalPayload: Record<string, unknown> = {
      nodeId: node.id,
      taskId: node.task_id,
      temperature: tempRaw,
      recordedAt: node.recorded_at,
      locationText: node.location_text,
      operatorName: node.operator_name,
      exceptionDescription: node.exception_description,
      migratedFrom: 'delivery_nodes',
    };

    const normalizedPayload: Record<string, unknown> = {
      nodeId: node.id,
      taskId: node.task_id,
      orderId: node.order_id,
      normalizedTempC,
      observedAt,
      locationText: node.location_text || '',
      operatorName: node.operator_name || '',
    };

    const payloadHash = computeHash(normalizedPayload);
    const readingKey = `backfill:${node.id}`;
    const evidenceId = crypto.randomUUID();
    const now = new Date().toISOString();

    const result = insertStmt.run(
      evidenceId,
      MIGRATION_BATCH_ID,
      'historical_backfill',
      readingKey,
      node.id,
      node.task_id,
      node.order_id,
      JSON.stringify(originalPayload),
      normalizedTempC,
      observedAt,
      receivedAt,
      node.location_text || '',
      node.operator_name || '',
      payloadHash,
      isAbnormal ? 1 : 0,
      now
    );

    if (result.changes > 0) {
      backfilled++;
    }
  }

  console.log(`  ✓ 回填了 ${backfilled} 条历史温度证据`);
}
