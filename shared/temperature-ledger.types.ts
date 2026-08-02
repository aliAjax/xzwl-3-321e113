import type { NodeType } from './types';

export type EvidenceSource = 'csv_import' | 'driver_offline' | 'historical_backfill';

export const EVIDENCE_SOURCE_PRIORITY: Record<EvidenceSource, number> = {
  driver_offline: 1,
  csv_import: 2,
  historical_backfill: 3,
};

export type EvidenceJudgment = 'normal' | 'abnormal';

export interface TemperatureEvidence {
  id: string;
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
  nodeType?: NodeType;
  orderNo?: string;
  locationText?: string;
  operatorName?: string;
  judgment: EvidenceJudgment;
  abnormalReasons: string[];
  minTemp?: number;
  maxTemp?: number;
  temperatureZone?: string;
  createdAt: string;
}

export interface TemperatureEvidenceInput {
  source: EvidenceSource;
  readingKey: string;
  rawPayload: Record<string, unknown>;
  temperatureCelsius: number;
  observedAt: string;
  nodeId?: string;
  taskId?: string;
  orderId?: string;
  nodeType?: NodeType;
  orderNo?: string;
  locationText?: string;
  operatorName?: string;
}

export interface NodeEvidenceInput {
  source: EvidenceSource;
  readingKey: string;
  rawPayload: Record<string, unknown>;
  nodeId: string;
  taskId?: string;
  orderId?: string;
  nodeType?: NodeType;
  orderNo?: string;
  temperatureCelsius?: number;
  observedAt?: string;
  locationText?: string;
  operatorName?: string;
  exceptionDescription?: string;
  clientSubmitId?: string;
  version?: number;
}

export type NodeEvidenceOutcome =
  | { status: 'created' | 'idempotent'; evidence: TemperatureEvidence; judgment: EvidenceJudgment; abnormalReasons: string[] }
  | { status: 'conflict'; existingEvidence: TemperatureEvidence; submittedStandardizedHash: string; message: string; conflictType: 'reading_key' }
  | { status: 'concurrent_update'; message: string; currentNode: unknown };

export interface EvidenceBatchCreateResult {
  batchId: string;
  total: number;
  success: number;
  idempotent: number;
  conflict: number;
  failed: number;
  results: EvidenceBatchItemResult[];
}

export interface EvidenceBatchItemResult {
  readingKey: string;
  status: 'created' | 'idempotent' | 'conflict' | 'failed';
  evidenceId?: string;
  message: string;
  conflictEvidence?: TemperatureEvidence;
}

export interface EvidenceTimelineEntry {
  evidence: TemperatureEvidence;
  temperatureCelsius: number;
  sourceLabel: string;
  isAbnormal: boolean;
}

export interface EvidenceTimeline {
  nodeId?: string;
  taskId?: string;
  orderId?: string;
  entries: EvidenceTimelineEntry[];
  hasAbnormal: boolean;
  latestNormal?: EvidenceTimelineEntry;
  abnormalCount: number;
}

export interface DriverOfflineReading {
  readingKey: string;
  nodeId: string;
  taskId: string;
  orderId?: string;
  nodeType: NodeType;
  temperature: number;
  observedAt: string;
  locationText?: string;
  operatorName?: string;
  clientSubmitId?: string;
}

export interface HistoricalBackfillReading {
  readingKey: string;
  orderNo: string;
  nodeType: NodeType;
  temperature: number;
  observedAt: string;
  locationText?: string;
  operatorName?: string;
}

export class LedgerConflictError extends Error {
  readonly existingEvidence: TemperatureEvidence;
  readonly submittedPayloadHash: string;

  constructor(existingEvidence: TemperatureEvidence, submittedPayloadHash: string) {
    super(`readingKey ${existingEvidence.readingKey} 已存在但载荷不同 (409)`);
    this.name = 'LedgerConflictError';
    this.existingEvidence = existingEvidence;
    this.submittedPayloadHash = submittedPayloadHash;
  }
}

export class LedgerValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'LedgerValidationError';
    this.field = field;
  }
}
