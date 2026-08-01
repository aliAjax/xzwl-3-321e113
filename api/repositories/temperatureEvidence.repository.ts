import db from '../db/index.js';
import type { Database } from 'better-sqlite3';
import type {
  TemperatureEvidence,
  TemperatureEvidenceSource,
} from '../../shared/types.js';

export interface AppendEvidenceData {
  id: string;
  batchId: string;
  source: TemperatureEvidenceSource;
  readingKey: string;
  nodeId: string;
  taskId: string;
  orderId: string;
  originalPayload: string;
  normalizedTempC: number;
  observedAt: string;
  receivedAt: string;
  locationText: string;
  operatorName: string;
  payloadHash: string;
  isAbnormal: boolean;
}

interface EvidenceRow {
  id: string;
  batch_id: string;
  source: string;
  reading_key: string;
  node_id: string;
  task_id: string;
  order_id: string;
  original_payload: string;
  normalized_temp_c: number;
  observed_at: string;
  received_at: string;
  location_text: string;
  operator_name: string;
  payload_hash: string;
  is_abnormal: number;
  created_at: string;
}

function mapRow(row: EvidenceRow): TemperatureEvidence {
  return {
    id: row.id,
    batchId: row.batch_id,
    source: row.source as TemperatureEvidenceSource,
    readingKey: row.reading_key,
    nodeId: row.node_id,
    taskId: row.task_id,
    orderId: row.order_id,
    originalPayload: row.original_payload,
    normalizedTempC: row.normalized_temp_c,
    observedAt: row.observed_at,
    receivedAt: row.received_at,
    locationText: row.location_text,
    operatorName: row.operator_name,
    payloadHash: row.payload_hash,
    isAbnormal: row.is_abnormal === 1,
    createdAt: row.created_at,
  };
}

class TemperatureEvidenceRepository {
  private db: Database = db;

  append(data: AppendEvidenceData): TemperatureEvidence {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO temperature_evidence_ledger (
          id, batch_id, source, reading_key, node_id, task_id, order_id,
          original_payload, normalized_temp_c, observed_at, received_at,
          location_text, operator_name, payload_hash, is_abnormal, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.id,
        data.batchId,
        data.source,
        data.readingKey,
        data.nodeId,
        data.taskId,
        data.orderId,
        data.originalPayload,
        data.normalizedTempC,
        data.observedAt,
        data.receivedAt,
        data.locationText,
        data.operatorName,
        data.payloadHash,
        data.isAbnormal ? 1 : 0,
        now
      );

    return this.findById(data.id) as TemperatureEvidence;
  }

  findById(id: string): TemperatureEvidence | undefined {
    const row = this.db
      .prepare(`SELECT * FROM temperature_evidence_ledger WHERE id = ?`)
      .get(id) as EvidenceRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  findByReadingKey(readingKey: string): TemperatureEvidence | undefined {
    const row = this.db
      .prepare(`SELECT * FROM temperature_evidence_ledger WHERE reading_key = ?`)
      .get(readingKey) as EvidenceRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  findByNodeId(nodeId: string): TemperatureEvidence[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM temperature_evidence_ledger
         WHERE node_id = ?
         ORDER BY observed_at ASC, received_at ASC`
      )
      .all(nodeId) as EvidenceRow[];
    return rows.map(mapRow);
  }

  findByTaskId(taskId: string): TemperatureEvidence[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM temperature_evidence_ledger
         WHERE task_id = ?
         ORDER BY observed_at ASC, received_at ASC`
      )
      .all(taskId) as EvidenceRow[];
    return rows.map(mapRow);
  }

  findTimelineByTaskId(taskId: string): TemperatureEvidence[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM temperature_evidence_ledger
         WHERE task_id = ?
         ORDER BY
           observed_at ASC,
           CASE source
             WHEN 'driver_offline' THEN 1
             WHEN 'csv_import' THEN 2
             WHEN 'historical_backfill' THEN 3
             ELSE 9
           END ASC,
           received_at ASC`
      )
      .all(taskId) as EvidenceRow[];
    return rows.map(mapRow);
  }

  findByBatchId(batchId: string): TemperatureEvidence[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM temperature_evidence_ledger
         WHERE batch_id = ?
         ORDER BY observed_at ASC, received_at ASC`
      )
      .all(batchId) as EvidenceRow[];
    return rows.map(mapRow);
  }

  findAbnormalByNodeId(nodeId: string): TemperatureEvidence[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM temperature_evidence_ledger
         WHERE node_id = ? AND is_abnormal = 1
         ORDER BY observed_at ASC, received_at ASC`
      )
      .all(nodeId) as EvidenceRow[];
    return rows.map(mapRow);
  }

  findAbnormalByTaskId(taskId: string): TemperatureEvidence[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM temperature_evidence_ledger
         WHERE task_id = ? AND is_abnormal = 1
         ORDER BY observed_at ASC, received_at ASC`
      )
      .all(taskId) as EvidenceRow[];
    return rows.map(mapRow);
  }

  hasAbnormalEvidence(nodeId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM temperature_evidence_ledger
         WHERE node_id = ? AND is_abnormal = 1`
      )
      .get(nodeId) as { count: number };
    return row.count > 0;
  }

  countByBatchId(batchId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM temperature_evidence_ledger WHERE batch_id = ?`)
      .get(batchId) as { count: number };
    return row.count;
  }

  countAll(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM temperature_evidence_ledger`)
      .get() as { count: number };
    return row.count;
  }
}

export const temperatureEvidenceRepository = new TemperatureEvidenceRepository();
