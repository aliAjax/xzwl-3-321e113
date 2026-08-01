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

export function canonicalizePayload(payload: Record<string, unknown>): string {
  const sorted = sortKeys(payload);
  return JSON.stringify(sorted);
}

export function computePayloadHash(payload: Record<string, unknown>): string {
  const canonical = canonicalizePayload(payload);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
