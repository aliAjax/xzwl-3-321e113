import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import type { Database } from 'better-sqlite3';
import type {
  TemperatureEvidence,
  EvidenceSource,
  EvidenceJudgment,
} from '../../shared/temperature-ledger.types';

interface EvidenceRow {
  id: string;
  batch_id: string;
  source: EvidenceSource;
  reading_key: string;
  payload_hash: string;
  raw_payload: string;
  temperature_centi: number;
  observed_at: string;
  received_at: string;
  node_id: string | null;
  task_id: string | null;
  order_id: string | null;
  node_type: string | null;
  order_no: string | null;
  location_text: string | null;
  operator_name: string | null;
  judgment: EvidenceJudgment;
  abnormal_reasons_json: string;
  min_temp: number | null;
  max_temp: number | null;
  temperature_zone: string | null;
  created_at: string;
}

function rowToEvidence(row: EvidenceRow): TemperatureEvidence {
  let abnormalReasons: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.abnormal_reasons_json);
    if (Array.isArray(parsed) && parsed.every((item): item is string => typeof item === 'string')) {
      abnormalReasons = parsed;
    }
  } catch {
    abnormalReasons = [];
  }

  return {
    id: row.id,
    batchId: row.batch_id,
    source: row.source,
    readingKey: row.reading_key,
    payloadHash: row.payload_hash,
    rawPayload: row.raw_payload,
    temperatureCenti: row.temperature_centi,
    observedAt: row.observed_at,
    receivedAt: row.received_at,
    nodeId: row.node_id ?? undefined,
    taskId: row.task_id ?? undefined,
    orderId: row.order_id ?? undefined,
    nodeType: (row.node_type ?? undefined) as TemperatureEvidence['nodeType'],
    orderNo: row.order_no ?? undefined,
    locationText: row.location_text ?? undefined,
    operatorName: row.operator_name ?? undefined,
    judgment: row.judgment,
    abnormalReasons,
    minTemp: row.min_temp ?? undefined,
    maxTemp: row.max_temp ?? undefined,
    temperatureZone: row.temperature_zone ?? undefined,
    createdAt: row.created_at,
  };
}

export interface CreateEvidenceRecord {
  batchId: string;
  source: EvidenceSource;
  readingKey: string;
  payloadHash: string;
  rawPayload: string;
  temperatureCenti: number;
  observedAt: string;
  receivedAt: string;
  nodeId?: string;
  taskId?: string;
  orderId?: string;
  nodeType?: string;
  orderNo?: string;
  locationText?: string;
  operatorName?: string;
  judgment: EvidenceJudgment;
  abnormalReasons: string[];
  minTemp?: number;
  maxTemp?: number;
  temperatureZone?: string;
}

class TemperatureEvidenceRepository {
  private db: Database = db;

  findByReadingKey(readingKey: string): TemperatureEvidence | undefined {
    const row = this.db
      .prepare(`SELECT * FROM temperature_evidence WHERE reading_key = ? LIMIT 1`)
      .get(readingKey) as EvidenceRow | undefined;
    return row ? rowToEvidence(row) : undefined;
  }

  findById(id: string): TemperatureEvidence | undefined {
    const row = this.db
      .prepare(`SELECT * FROM temperature_evidence WHERE id = ? LIMIT 1`)
      .get(id) as EvidenceRow | undefined;
    return row ? rowToEvidence(row) : undefined;
  }

  findByNodeId(nodeId: string): TemperatureEvidence[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM temperature_evidence
         WHERE node_id = ?
         ORDER BY datetime(observed_at) ASC, source ASC, datetime(received_at) ASC, rowid ASC`
      )
      .all(nodeId) as EvidenceRow[];
    return rows.map(rowToEvidence);
  }

  findByTaskId(taskId: string): TemperatureEvidence[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM temperature_evidence
         WHERE task_id = ?
         ORDER BY datetime(observed_at) ASC, source ASC, datetime(received_at) ASC, rowid ASC`
      )
      .all(taskId) as EvidenceRow[];
    return rows.map(rowToEvidence);
  }

  findByOrderId(orderId: string): TemperatureEvidence[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM temperature_evidence
         WHERE order_id = ?
         ORDER BY datetime(observed_at) ASC, source ASC, datetime(received_at) ASC, rowid ASC`
      )
      .all(orderId) as EvidenceRow[];
    return rows.map(rowToEvidence);
  }

  findByBatchId(batchId: string): TemperatureEvidence[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM temperature_evidence WHERE batch_id = ? ORDER BY rowid ASC`
      )
      .all(batchId) as EvidenceRow[];
    return rows.map(rowToEvidence);
  }

  findAbnormalByNodeId(nodeId: string): TemperatureEvidence[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM temperature_evidence
         WHERE node_id = ? AND judgment = 'abnormal'
         ORDER BY datetime(observed_at) ASC, source ASC, datetime(received_at) ASC`
      )
      .all(nodeId) as EvidenceRow[];
    return rows.map(rowToEvidence);
  }

  append(record: CreateEvidenceRecord): TemperatureEvidence {
    const id = uuidv4();
    const createdAt = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO temperature_evidence (
          id, batch_id, source, reading_key, payload_hash, raw_payload,
          temperature_centi, observed_at, received_at,
          node_id, task_id, order_id, node_type, order_no,
          location_text, operator_name,
          judgment, abnormal_reasons_json,
          min_temp, max_temp, temperature_zone, created_at
        ) VALUES (
          @id, @batchId, @source, @readingKey, @payloadHash, @rawPayload,
          @temperatureCenti, @observedAt, @receivedAt,
          @nodeId, @taskId, @orderId, @nodeType, @orderNo,
          @locationText, @operatorName,
          @judgment, @abnormalReasonsJson,
          @minTemp, @maxTemp, @temperatureZone, @createdAt
        )`
      )
      .run({
        id,
        batchId: record.batchId,
        source: record.source,
        readingKey: record.readingKey,
        payloadHash: record.payloadHash,
        rawPayload: record.rawPayload,
        temperatureCenti: record.temperatureCenti,
        observedAt: record.observedAt,
        receivedAt: record.receivedAt,
        nodeId: record.nodeId ?? null,
        taskId: record.taskId ?? null,
        orderId: record.orderId ?? null,
        nodeType: record.nodeType ?? null,
        orderNo: record.orderNo ?? null,
        locationText: record.locationText ?? null,
        operatorName: record.operatorName ?? null,
        judgment: record.judgment,
        abnormalReasonsJson: JSON.stringify(record.abnormalReasons),
        minTemp: record.minTemp ?? null,
        maxTemp: record.maxTemp ?? null,
        temperatureZone: record.temperatureZone ?? null,
        createdAt,
      });

    const created = this.findById(id);
    if (!created) {
      throw new Error('证据写入后无法重新读取');
    }
    return created;
  }

  countByBatchId(batchId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM temperature_evidence WHERE batch_id = ?`)
      .get(batchId) as { count: number };
    return row.count;
  }
}

export const temperatureEvidenceRepository = new TemperatureEvidenceRepository();
