import type { HealthDay, TimeSeriesSample } from './types';
import { sleepInterval, successorSleepDetails } from './native-sleep-details';

export interface NativeQuantityDetail {
 metric: string;
 unit: string;
 sample: TimeSeriesSample & Record<string, unknown>;
}
export const quantityDefinitions = [
 {metric:'heart_rate',category:'heart',field:'heartRateSamples',unit:'bpm',heading:'heart rate sample details'},
 {metric:'hrv_sdnn',category:'heart',field:'hrvSamples',unit:'ms',heading:'hrv sdnn sample details'},
 {metric:'hrv_rmssd',category:'heart',field:'hrvSamples',unit:'ms',heading:'hrv rmssd sample details'},
 {metric:'blood_oxygen',category:'vitals',field:'bloodOxygenSamples',unit:'ratio_0_1',heading:'blood oxygen sample details'},
 {metric:'blood_glucose',category:'vitals',field:'bloodGlucoseSamples',unit:'mg/dL',heading:'blood glucose sample details'},
 {metric:'respiratory_rate',category:'vitals',field:'respiratoryRateSamples',unit:'breaths/min',heading:'respiratory rate sample details'},
];
function record(value: unknown): value is Record<string, unknown> {
 return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function sourceTimestampAgrees(source: Record<string, unknown>): boolean {
 if (typeof source.timestamp !== 'string' || sleepInterval(source.timestamp,source.timestamp) !== 0) return false;
 if (source.exactTime !== undefined) {
   if (!record(source.exactTime)) return false;
   const {epochSecond,nano} = source.exactTime;
   if (typeof epochSecond !== 'number' || !Number.isSafeInteger(epochSecond) ||
    typeof nano !== 'number' || !Number.isInteger(nano) || nano < 0 || nano >= 1e9) return false;
   const [whole,fraction=''] = source.timestamp.slice(0,-1).split('.');
   const actual = BigInt(Date.parse(`${whole}Z`)) * BigInt(1000000) + BigInt(fraction.padEnd(9,'0'));
   if (actual !== BigInt(epochSecond) * BigInt(1000000000) + BigInt(nano)) return false;
  }
 return true;
}

export function nativeQuantityDetails(value: unknown, profile: string | undefined): NativeQuantityDetail[] | null {
 if (!successorSleepDetails(profile) || !Array.isArray(value)) return null;
 const details: NativeQuantityDetail[] = [];
 for (const item of value) {
  if (!record(item) || !record(item.sample)) return null;
  const definition = quantityDefinitions.find(entry => entry.metric === item.metric);
  if (!definition || item.unit !== definition.unit ||
   (item.metric === 'hrv_sdnn' && profile !== 'apple-v11') ||
   (item.metric === 'hrv_rmssd' && profile !== 'android-sleep-v6')) return null;
  const source = item.sample;
  if (typeof source.timestamp !== 'string' || sleepInterval(source.timestamp,source.timestamp) !== 0 ||
   typeof source.value !== 'number' || !Number.isFinite(source.value) ||
   (definition.unit === 'ratio_0_1' && (source.value < 0 || source.value > 1))) return null;
  // Keep exact source clocks/identity/metadata as facts, never reconstruct them
  // from a human table or infer a daily summary from a selected sample.
  if (!sourceTimestampAgrees(source)) return null;
  details.push({metric:definition.metric,unit:definition.unit,sample:{...source,timestamp:source.timestamp,value:source.value}});
 }
 return details;
}
export function quantityDetailsFromJSON(root: Record<string, unknown>, profile: string | undefined): NativeQuantityDetail[] | null {
 const details: unknown[] = [];
 for (const definition of quantityDefinitions) {
  if ((definition.metric === 'hrv_sdnn' && profile !== 'apple-v11') ||
   (definition.metric === 'hrv_rmssd' && profile !== 'android-sleep-v6')) continue;
  const category = root[definition.category];
  if (!record(category) || category[definition.field] === undefined) continue;
  const samples = category[definition.field];
  if (!Array.isArray(samples)) return null;
  details.push(...samples.map((sample: unknown) => ({metric:definition.metric,unit:definition.unit,sample})));
 }
 return nativeQuantityDetails(details,profile);
}
export function attachNativeQuantityDetails(day: HealthDay, details: NativeQuantityDetail[]): void {
 if (!details.length) return;
 day.nativeQuantityDetails = details;
 for (const definition of quantityDefinitions) {
  const samples = details.filter(value => value.metric === definition.metric).map(value => value.sample);
  if (!samples.length) continue;
  if (definition.category === 'heart') {
   day.heart = {...day.heart,heartRateSamples:day.heart?.heartRateSamples ?? []};
   if (definition.field === 'heartRateSamples') day.heart.heartRateSamples = samples;
   else day.heart.hrvSamples = samples;
  } else {
   day.vitals = {...day.vitals};
   if (definition.field === 'bloodOxygenSamples') day.vitals.bloodOxygenSamples = samples.map(sample => ({...sample,value:sample.value*100,percent:sample.value*100}));
   else if (definition.field === 'bloodGlucoseSamples') day.vitals.bloodGlucoseSamples = samples;
   else day.vitals.respiratoryRateSamples = samples;
  }
 }
}
