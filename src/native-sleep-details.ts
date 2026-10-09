import { canonicalSourceInstant, exactSourceClockAgrees } from "./native-source-clock";
import type { HealthDay, SleepSession, SleepStage } from './types';

function record(value: unknown): Record<string, unknown> | null {
 return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function sleepInterval(start: unknown, end: unknown): number | null {
 const a = canonicalSourceInstant(start), b = canonicalSourceInstant(end);
 return a !== null && b !== null && b >= a ? Number(b-a)/1e9 : null;
}
export function nativeSleepStages(value: unknown): SleepStage[] | null {
 if (!Array.isArray(value)) return null;
 const result: SleepStage[] = [];
 for (const item of value) {
  const source = record(item);
  if (!source || typeof source.stage !== 'string' || !source.stage || typeof source.startDate !== 'string' || typeof source.endDate !== 'string'
   || sleepInterval(source.startDate,source.endDate) === null
   || !exactSourceClockAgrees(source.startDate,source.exactStartTime) || !exactSourceClockAgrees(source.endDate,source.exactEndTime)
   || typeof source.durationSeconds !== 'number'
   || !Number.isFinite(source.durationSeconds) || source.durationSeconds < 0) return null;
  result.push({...source,stage:source.stage,startDate:source.startDate,endDate:source.endDate,durationSeconds:source.durationSeconds});
 }
 return result;
}
export function nativeSleepSessions(value: unknown): SleepSession[] | null {
 if (!Array.isArray(value)) return null;
 const result: SleepSession[] = [];
 for (const item of value) {
  const source=record(item);
  if (!source || typeof source.startTimeISO !== 'string' || typeof source.endTimeISO !== 'string'
   || sleepInterval(source.startTimeISO,source.endTimeISO) === null
   || !exactSourceClockAgrees(source.startTimeISO,source.exactStartTime) || !exactSourceClockAgrees(source.endTimeISO,source.exactEndTime)) return null;
  result.push({...source,startTimeISO:source.startTimeISO,endTimeISO:source.endTimeISO});
 }
 return result;
}
export function successorSleepDetails(profile: HealthDay['schema_profile'] | undefined): boolean {
 return profile === 'apple-v11' || profile === 'android-sleep-v6';
}
