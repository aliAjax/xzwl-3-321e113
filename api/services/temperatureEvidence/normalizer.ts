import crypto from 'crypto';
import type { TemperatureEvidenceSource } from '../../../shared/types.js';

export interface NormalizedTemperaturePayload {
  nodeId: string;
  taskId: string;
  orderId: string;
  normalizedTempC: number;
  observedAt: string;
  locationText: string;
  operatorName: string;
}

export interface ParsedTemperature {
  valueCelsius: number;
  normalizedTempC: number;
}

export interface ObservedAtParseOptions {
  requireTimezone: boolean;
  defaultOffsetMinutes?: number;
}

export const DEFAULT_CSV_OFFSET_MINUTES = 8 * 60;

export function celsiusToStorage(tempC: number): number {
  if (!Number.isFinite(tempC)) {
    throw new Error(`无效的温度值: ${String(tempC)}`);
  }
  return Math.round(tempC * 100);
}

export function storageToCelsius(stored: number): number {
  return stored / 100;
}

export function parseTemperatureString(raw: string): ParsedTemperature {
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new Error('温度值不能为空');
  }
  const numericStr = trimmed.replace(/[^\d.\-eE]/g, '');
  if (numericStr === '' || numericStr === '-' || numericStr === '.') {
    throw new Error(`无效的温度值: ${raw}`);
  }
  const value = Number(numericStr);
  if (!Number.isFinite(value)) {
    throw new Error(`无效的温度值: ${raw}`);
  }
  return {
    valueCelsius: value,
    normalizedTempC: celsiusToStorage(value),
  };
}

export function hasTimezoneInfo(dateStr: string): boolean {
  const trimmed = dateStr.trim();
  if (/Z$/.test(trimmed)) return true;
  if (/[+-]\d{2}:?\d{2}$/.test(trimmed)) return true;
  return false;
}

function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizeDateString(str: string): string {
  let s = str.trim();
  s = s.replace(/年/g, '-').replace(/月/g, '-').replace(/日/g, '');
  s = s.replace(/\//g, '-');
  s = s.replace(/\s+/g, ' ');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    s = `${s}T00:00:00`;
  } else if (/^\d{4}-\d{2}-\d{2}\s\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    s = s.replace(' ', 'T');
    if (/T\d{1,2}:\d{2}$/.test(s)) {
      s = `${s}:00`;
    }
  }
  return s;
}

export function parseObservedAt(raw: string, options: ObservedAtParseOptions): Date {
  const str = raw.trim();
  if (str === '') {
    throw new Error('observedAt 不能为空');
  }

  const hasTz = hasTimezoneInfo(str);

  if (options.requireTimezone && !hasTz) {
    throw new Error('司机上报数据必须包含时区信息（如 Z 或 +08:00）');
  }

  let parseTarget: string;
  if (!hasTz && options.defaultOffsetMinutes !== undefined) {
    const normalized = normalizeDateString(str);
    if (hasTimezoneInfo(normalized)) {
      parseTarget = normalized;
    } else {
      parseTarget = `${normalized}${formatOffset(options.defaultOffsetMinutes)}`;
    }
  } else {
    parseTarget = normalizeDateString(str);
  }

  const parsed = new Date(parseTarget);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`无效的时间格式: ${raw}`);
  }
  return parsed;
}

export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const pairs = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(obj[key])}`);
    return `{${pairs.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function computePayloadHash(payload: NormalizedTemperaturePayload): string {
  return crypto.createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex');
}

export function generateReadingKey(
  source: TemperatureEvidenceSource,
  uniquePart: string
): string {
  return `${source}:${uniquePart}`;
}

export function isAbnormalTemperature(
  tempC: number,
  minTemp: number,
  maxTemp: number
): boolean {
  return tempC < minTemp || tempC > maxTemp;
}
