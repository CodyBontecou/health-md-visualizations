import type { HealthDay } from './types';
import { sleepInterval, successorSleepDetails } from './native-sleep-details';
import { sourceTimestampAgrees } from './native-quantity-details';

export interface NativeCorrelationDetail {
 metric: 'blood_pressure';
 unit: 'mmHg';
 sample: Record<string, unknown> & {timestamp: string; systolic: number; diastolic: number};
}
function record(value: unknown): value is Record<string, unknown> {
 return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function nativeCorrelationDetails(value: unknown, profile: string | undefined): NativeCorrelationDetail[] | null {
 if (!successorSleepDetails(profile) || !Array.isArray(value)) return null;
 const details: NativeCorrelationDetail[] = [];
 for (const item of value) {
  if (!record(item) || item.metric !== 'blood_pressure' || item.unit !== 'mmHg' || !record(item.sample)) return null;
  const source = item.sample;
  if (!sourceTimestampAgrees(source) || typeof source.timestamp !== 'string' ||
   typeof source.systolic !== 'number' || !Number.isFinite(source.systolic) ||
   typeof source.diastolic !== 'number' || !Number.isFinite(source.diastolic) ||
   (source.unit !== undefined && source.unit !== 'mmHg')) return null;
  if (profile === 'apple-v11' || source.endDate !== undefined) {
   if (typeof source.endDate !== 'string' || sleepInterval(source.timestamp, source.endDate) === null) return null;
  }
  details.push({metric:'blood_pressure',unit:'mmHg',sample:{...source,timestamp:source.timestamp,systolic:source.systolic,diastolic:source.diastolic}});
 }
 return details;
}
export function correlationsFromJSON(root: Record<string, unknown>, profile: string | undefined): NativeCorrelationDetail[] | null {
 const vitals = root.vitals;
 if (!record(vitals) || vitals.bloodPressureSamples === undefined) return nativeCorrelationDetails([],profile);
 if (!Array.isArray(vitals.bloodPressureSamples)) return null;
 return nativeCorrelationDetails(vitals.bloodPressureSamples.map((sample: unknown) => ({metric:'blood_pressure',unit:'mmHg',sample})),profile);
}
export function attachNativeCorrelationDetails(day: HealthDay, details: NativeCorrelationDetail[]): void {
 if (!details.length) return;
 day.nativeCorrelationDetails = details;
 day.vitals = {...day.vitals,bloodPressureSamples:details.map(detail=>detail.sample)};
}
