import type { HealthDay, SleepSession, SleepStage } from './types';

function record(value: unknown): Record<string, unknown> | null {
 return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
/** Compare source instants without truncating their fractional seconds. */
function instant(value: unknown): bigint | null {
 if (typeof value !== 'string') return null;
 const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
 if (!match) return null;
 const milliseconds = Date.parse(`${match[1]}Z`);
 if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0,19) !== match[1]) return null;
 return BigInt(milliseconds) * BigInt(1000000) + BigInt((match[2] ?? '').padEnd(9,'0'));
}
export function sleepInterval(start: unknown, end: unknown): number | null {
 const a = instant(start), b = instant(end);
 return a !== null && b !== null && b >= a ? Number(b-a)/1e9 : null;
}
export function nativeSleepStages(value: unknown): SleepStage[] | null {
 if (!Array.isArray(value)) return null;
 const result: SleepStage[] = [];
 for (const item of value) {
  const source = record(item);
  if (!source || typeof source.stage !== 'string' || !source.stage || typeof source.startDate !== 'string' || typeof source.endDate !== 'string'
   || sleepInterval(source.startDate,source.endDate) === null || typeof source.durationSeconds !== 'number'
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
   || sleepInterval(source.startTimeISO,source.endTimeISO) === null) return null;
  result.push({...source,startTimeISO:source.startTimeISO,endTimeISO:source.endTimeISO});
 }
 return result;
}
export function successorSleepDetails(profile: HealthDay['schema_profile'] | undefined): boolean {
 return profile === 'apple-v11' || profile === 'android-sleep-v6';
}
