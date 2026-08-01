export { temperatureEvidenceService } from './service.js';
export type { SubmitEvidenceOptions, ResolvedNodeContext } from './service.js';
export {
  celsiusToStorage,
  storageToCelsius,
  parseTemperatureString,
  parseObservedAt,
  hasTimezoneInfo,
  computePayloadHash,
  canonicalJson,
  generateReadingKey,
  isAbnormalTemperature,
  DEFAULT_CSV_OFFSET_MINUTES,
} from './normalizer.js';
export type {
  NormalizedTemperaturePayload,
  ParsedTemperature,
  ObservedAtParseOptions,
} from './normalizer.js';
