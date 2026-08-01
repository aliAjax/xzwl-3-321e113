import { LedgerValidationError } from '../../shared/temperature-ledger.types';
import type { EvidenceSource } from '../../shared/temperature-ledger.types';

export const TEMPERATURE_SCALE = 100;
export const DEFAULT_CSV_TIMEZONE_OFFSET_MINUTES = 8 * 60;

export function celsiusToCenti(celsius: number): number {
  if (!Number.isFinite(celsius)) {
    throw new LedgerValidationError('temperature', `温度值无效: ${String(celsius)}`);
  }
  return Math.round(celsius * TEMPERATURE_SCALE);
}

export function centiToCelsius(centi: number): number {
  return centi / TEMPERATURE_SCALE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasTimezoneDesignator(input: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(input.trim());
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function buildUtcString(year: number, month: number, day: number, hour: number, minute: number, second: number, offsetMinutes: number): string {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60 * 1000;
  const date = new Date(asUtc);
  return date.toISOString();
}

const NAIVE_DATETIME_PATTERNS: ReadonlyArray<RegExp> = [
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/,
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/,
  /^(\d{4})\/(\d{2})\/(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/,
  /^(\d{4})\/(\d{2})\/(\d{2})[ T](\d{2}):(\d{2})$/,
  /^(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2})[:：](\d{1,2})(?:[:：](\d{1,2}))?$/,
];

export function parseObservedAt(input: string, source: EvidenceSource): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new LedgerValidationError('observedAt', 'observedAt 不能为空');
  }

  const trimmed = input.trim();

  if (hasTimezoneDesignator(trimmed)) {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw new LedgerValidationError('observedAt', `observedAt 格式无效: ${trimmed}`);
    }
    return parsed.toISOString();
  }

  for (const pattern of NAIVE_DATETIME_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const [, y, m, d, h, min, s] = match;
      const year = parseInt(y, 10);
      const month = parseInt(m, 10);
      const day = parseInt(d, 10);
      const hour = parseInt(h, 10);
      const minute = parseInt(min, 10);
      const second = s !== undefined ? parseInt(s, 10) : 0;

      if (source === 'driver_offline') {
        throw new LedgerValidationError(
          'observedAt',
          '司机离线上报的 observedAt 必须带时区信息（例如 +08:00 或 Z）'
        );
      }

      const offsetMinutes = source === 'csv_import' || source === 'historical_backfill'
        ? DEFAULT_CSV_TIMEZONE_OFFSET_MINUTES
        : 0;

      return buildUtcString(year, month, day, hour, minute, second, offsetMinutes);
    }
  }

  if (source === 'driver_offline') {
    throw new LedgerValidationError(
      'observedAt',
      '司机离线上报的 observedAt 必须带时区信息且格式可解析'
    );
  }

  const fallback = new Date(trimmed);
  if (Number.isNaN(fallback.getTime())) {
    throw new LedgerValidationError('observedAt', `observedAt 格式无效: ${trimmed}`);
  }
  return new Date(fallback.getTime() - DEFAULT_CSV_TIMEZONE_OFFSET_MINUTES * 60 * 1000).toISOString();
}

export function normalizeReceivedAt(receivedAt?: string): string {
  if (receivedAt && receivedAt.trim() !== '') {
    const parsed = new Date(receivedAt.trim());
    if (Number.isNaN(parsed.getTime())) {
      throw new LedgerValidationError('receivedAt', `receivedAt 格式无效: ${receivedAt}`);
    }
    return parsed.toISOString();
  }
  return new Date().toISOString();
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function asString(value: unknown, field: string): string {
  if (!isNonEmptyString(value)) {
    throw new LedgerValidationError(field, `${field} 必须是非空字符串`);
  }
  return value.trim();
}

export function asNumber(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed !== '') {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  throw new LedgerValidationError(field, `${field} 必须是有效数字`);
}

export function asOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

export function assertRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new LedgerValidationError(field, `${field} 必须是对象`);
  }
  return value;
}

export function currentUtcIso(): string {
  return new Date().toISOString();
}

export function formatOffsetMinutes(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return `${sign}${pad2(hours)}:${pad2(mins)}`;
}
