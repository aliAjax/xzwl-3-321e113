import { centiToCelsius } from './temperature-normalization';
import type {
  TemperatureEvidence,
  EvidenceBatchCreateResult,
  EvidenceBatchItemResult,
} from '../../shared/temperature-ledger.types';

export type TemperatureEvidenceApi = Omit<TemperatureEvidence, 'temperatureCenti' | 'rawPayload' | 'payloadHash'> & {
  temperatureCelsius: number;
};

export type EvidenceTimelineEntryApi = Omit<
  import('../../shared/temperature-ledger.types').EvidenceTimelineEntry,
  'evidence'
> & {
  evidence: TemperatureEvidenceApi;
};

export type EvidenceTimelineApi = Omit<
  import('../../shared/temperature-ledger.types').EvidenceTimeline,
  'entries' | 'latestNormal'
> & {
  entries: EvidenceTimelineEntryApi[];
  latestNormal?: EvidenceTimelineEntryApi;
};

export type EvidenceBatchItemResultApi = Omit<EvidenceBatchItemResult, 'conflictEvidence'> & {
  conflictEvidence?: TemperatureEvidenceApi;
};

export type EvidenceBatchCreateResultApi = Omit<EvidenceBatchCreateResult, 'results'> & {
  results: EvidenceBatchItemResultApi[];
};

export function serializeEvidence(evidence: TemperatureEvidence): TemperatureEvidenceApi {
  const { temperatureCenti, rawPayload, payloadHash, ...rest } = evidence;
  return {
    ...rest,
    temperatureCelsius: centiToCelsius(temperatureCenti),
  };
}

export function serializeBatchResult(
  result: EvidenceBatchCreateResult
): EvidenceBatchCreateResultApi {
  return {
    ...result,
    results: result.results.map((item): EvidenceBatchItemResultApi => {
      const { conflictEvidence, ...rest } = item;
      return conflictEvidence
        ? { ...rest, conflictEvidence: serializeEvidence(conflictEvidence) }
        : rest;
    }),
  };
}

export function serializeTimelineEntry(
  entry: import('../../shared/temperature-ledger.types').EvidenceTimelineEntry
): EvidenceTimelineEntryApi {
  return {
    ...entry,
    evidence: serializeEvidence(entry.evidence),
  };
}

export function serializeTimeline(
  timeline: import('../../shared/temperature-ledger.types').EvidenceTimeline
): EvidenceTimelineApi {
  return {
    nodeId: timeline.nodeId,
    taskId: timeline.taskId,
    orderId: timeline.orderId,
    entries: timeline.entries.map(serializeTimelineEntry),
    hasAbnormal: timeline.hasAbnormal,
    latestNormal: timeline.latestNormal ? serializeTimelineEntry(timeline.latestNormal) : undefined,
    abnormalCount: timeline.abnormalCount,
  };
}
