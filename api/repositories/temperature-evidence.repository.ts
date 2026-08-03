import db from '../db';
import { v4 as uuidv4 } from 'uuid';
import type { Database } from 'better-sqlite3';
import type { TemperatureEvidence, TemperatureEvidenceSource } from '../../shared/types';

interface TemperatureEvidenceRow {
  id: string;
  batch_id: string;
  source: string;
  reading_key: string;
  node_id: string;
  raw_payload: string;
  payload_hash: string;
  temperature_celsius_x100: number;
  observed_at: string;
  received_at: string;
  created_at: string;
}

export interface TemperatureEvidenceAppendData {
  batchId: string;
  source: TemperatureEvidenceSource;
  readingKey: string;
  nodeId: string;
  rawPayload: string;
  payloadHash: string;
  temperatureCelsiusX100: number;
  observedAt: string;
  receivedAt: string;
}

function isTemperatureEvidenceSource(value: string): value is TemperatureEvidenceSource {
  return value === 'driver_offline' || value === 'csv_import' || value === 'historical_backfill';
}

function mapRow(row: TemperatureEvidenceRow): TemperatureEvidence {
  if (!isTemperatureEvidenceSource(row.source)) {
    throw new Error(`温度证据来源非法: ${row.source}`);
  }
  return {
    id: row.id,
    batchId: row.batch_id,
    source: row.source,
    readingKey: row.reading_key,
    nodeId: row.node_id,
    rawPayload: row.raw_payload,
    payloadHash: row.payload_hash,
    temperatureCelsiusX100: row.temperature_celsius_x100,
    observedAt: row.observed_at,
    receivedAt: row.received_at,
    createdAt: row.created_at,
  };
}

/**
 * 温度证据账本仓库：只追加、不覆盖。
 * 刻意不提供 update/delete 方法，保证证据不可变、可审计。
 * db 为实例字段，与其他仓库一致，便于测试注入内存数据库。
 */
class TemperatureEvidenceRepository {
  private readonly tableName = 'temperature_evidence';
  private db: Database = db;

  append(data: TemperatureEvidenceAppendData): TemperatureEvidence {
    const id = uuidv4();
    this.db
      .prepare(
        `INSERT INTO ${this.tableName}
          (id, batch_id, source, reading_key, node_id, raw_payload, payload_hash,
           temperature_celsius_x100, observed_at, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.batchId,
        data.source,
        data.readingKey,
        data.nodeId,
        data.rawPayload,
        data.payloadHash,
        data.temperatureCelsiusX100,
        data.observedAt,
        data.receivedAt
      );

    const created = this.findById(id);
    if (!created) {
      throw new Error('温度证据写入后读取失败');
    }
    return created;
  }

  findById(id: string): TemperatureEvidence | undefined {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
      .get(id) as TemperatureEvidenceRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  findByReadingKey(readingKey: string): TemperatureEvidence | undefined {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE reading_key = ? LIMIT 1`)
      .get(readingKey) as TemperatureEvidenceRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  findByNodeId(nodeId: string): TemperatureEvidence[] {
    const rows = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE node_id = ?`)
      .all(nodeId) as TemperatureEvidenceRow[];
    return rows.map(mapRow);
  }

  findByBatchId(batchId: string): TemperatureEvidence[] {
    const rows = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE batch_id = ?`)
      .all(batchId) as TemperatureEvidenceRow[];
    return rows.map(mapRow);
  }
}

export const temperatureEvidenceRepository = new TemperatureEvidenceRepository();
