import { createHash } from 'node:crypto';

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(record).sort();
    for (const key of keys) {
      sorted[key] = sortKeys(record[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function computeHash(value: unknown): string {
  return createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}

export function canonicalizePayload(payload: Record<string, unknown>): string {
  return canonicalize(payload);
}

export function computeRawPayloadHash(payload: Record<string, unknown>): string {
  return computeHash(payload);
}

export interface StandardizedEvidencePayload {
  source: string;
  readingKey: string;
  temperatureCenti: number;
  observedAt: string;
  nodeId: string | null;
  taskId: string | null;
  orderId: string | null;
  nodeType: string | null;
  orderNo: string | null;
}

export function buildStandardizedPayload(input: StandardizedEvidencePayload): Record<string, unknown> {
  return {
    source: input.source,
    readingKey: input.readingKey,
    temperatureCenti: input.temperatureCenti,
    observedAt: input.observedAt,
    nodeId: input.nodeId,
    taskId: input.taskId,
    orderId: input.orderId,
    nodeType: input.nodeType,
    orderNo: input.orderNo,
  };
}

export function computeStandardizedPayloadHash(input: StandardizedEvidencePayload): string {
  return computeHash(buildStandardizedPayload(input));
}
