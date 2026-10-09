import type { HealthDay } from './types';
import { canonicalSourceInstant, exactSourceClockAgrees } from './native-source-clock';

export interface NativeActivityDetail {
 metric: 'steps_interval' | 'activity_intensity_interval';
 unit: 'steps' | 'seconds';
 sample: Record<string, unknown>;
}
function object(value: unknown): value is Record<string, unknown> {
 return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exactPublicClock(value: unknown): string | null {
 if (!object(value) || typeof value.epochSecond !== 'number' || !Number.isSafeInteger(value.epochSecond) ||
     typeof value.nano !== 'number' || !Number.isInteger(value.nano) || value.nano < 0 || value.nano >= 1e9) return null;
 try {
  const whole = new Date(value.epochSecond * 1000).toISOString().slice(0, 19);
  const fraction = value.nano ? '.' + String(value.nano).padStart(9, '0').replace(/0+$/, '') : '';
  const clock = whole + fraction + 'Z';
  return exactSourceClockAgrees(clock, value) ? clock : null;
 } catch { return null; }
}
export function activityRecordTimestamp(detail: NativeActivityDetail): string {
 return String(detail.sample[detail.metric === 'steps_interval' ? 'timestamp' : 'startTimeISO']);
}
export function nativeActivityDetails(value: unknown, profile: string | undefined): NativeActivityDetail[] | null {
 if (profile !== 'android-sleep-v6' || !Array.isArray(value)) return null;
 const result: NativeActivityDetail[] = [];
 for (const item of value) {
  if (!object(item) || !object(item.sample)) return null;
  const sample = item.sample;
  const steps = item.metric === 'steps_interval';
  if ((!steps && item.metric !== 'activity_intensity_interval') || item.unit !== (steps ? 'steps' : 'seconds')) return null;
  const start = sample[steps ? 'timestamp' : 'startTimeISO'];
  const end = exactPublicClock(sample.exactEndTime);
  const startInstant = canonicalSourceInstant(start), endInstant = canonicalSourceInstant(end);
  if (startInstant === null || endInstant === null || endInstant < startInstant ||
      !exactSourceClockAgrees(start, sample[steps ? 'exactTime' : 'exactStartTime']) ||
      sample[steps ? 'exactTime' : 'exactStartTime'] === undefined) return null;
  if (steps) {
   if (typeof sample.value !== 'number' || !Number.isSafeInteger(sample.value) || sample.value < 0) return null;
  } else if (sample.endTimeISO !== end || typeof sample.intensity !== 'string' || !sample.intensity.trim() ||
      typeof sample.duration !== 'number' || !Number.isSafeInteger(sample.duration) || sample.duration < 0) return null;
  result.push({metric: steps ? 'steps_interval' : 'activity_intensity_interval', unit: steps ? 'steps' : 'seconds', sample: {...sample}});
 }
 return result;
}
export function activityDetailsFromJSON(root: Record<string, unknown>, profile: string | undefined): NativeActivityDetail[] | null {
 if (!object(root.activity)) return [];
 if (profile !== 'android-sleep-v6') return root.activity.stepSamples !== undefined || root.activity.activityIntensity !== undefined ? null : [];
 const records: unknown[] = [];
 for (const [field, metric, unit] of [['stepSamples', 'steps_interval', 'steps'], ['activityIntensity', 'activity_intensity_interval', 'seconds']]) {
  const samples = root.activity[field];
  if (samples === undefined) continue;
  if (!Array.isArray(samples)) return null;
  records.push(...samples.map(sample => ({metric, unit, sample})));
 }
 return nativeActivityDetails(records, profile);
}
export function attachNativeActivityDetails(day: HealthDay, records: NativeActivityDetail[]): void {
 if (!records.length) return;
 day.nativeActivityDetails = records;
 day.activity = {...day.activity,
  stepSamples: records.filter(record => record.metric === 'steps_interval').map(record => record.sample),
  activityIntensity: records.filter(record => record.metric === 'activity_intensity_interval').map(record => record.sample)};
}
