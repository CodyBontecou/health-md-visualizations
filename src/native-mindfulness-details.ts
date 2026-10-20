import type { HealthDay } from './types';
import { canonicalSourceInstant, exactSourceClockAgrees } from './native-source-clock';
import { nativeSourceRecordsAgree } from './native-detail-markdown';

/** Native mood observations and mindfulness sessions keep distinct source identities. */
export interface NativeMindfulnessDetail {
 metric: 'state_of_mind' | 'mindfulness_session';
 sample: Record<string, unknown>;
}
function object(value: unknown): value is Record<string, unknown> {
 return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function strings(value: unknown): boolean {
 return value === undefined || (Array.isArray(value) && value.every(item => typeof item === 'string'));
}
export function mindfulnessRecordTimestamp(record: NativeMindfulnessDetail): string {
 return String(record.sample[record.metric === 'state_of_mind' ? 'timestamp' : 'startTimeISO']);
}
export function nativeMindfulnessDetails(value: unknown, profile: string | undefined): NativeMindfulnessDetail[] | null {
 if (!Array.isArray(value) || (profile !== 'apple-v11' && profile !== 'android-sleep-v6')) return null;
 const records: NativeMindfulnessDetail[] = [], identities = new Set<string>();
 for (const item of value) {
  if (!object(item) || !object(item.sample)) return null;
  const apple = profile === 'apple-v11', sample = item.sample;
  if (item.metric !== (apple ? 'state_of_mind' : 'mindfulness_session')) return null;
  const start = sample[apple ? 'timestamp' : 'startTimeISO'], end = sample[apple ? 'endDate' : 'endTimeISO'];
  const first = canonicalSourceInstant(start), last = canonicalSourceInstant(end);
  if (first === null || last === null || last < first || (!apple && last === first)) return null;
  if (apple) {
   if (typeof sample.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sample.id) ||
       typeof sample.valence !== 'number' || !Number.isFinite(sample.valence) || sample.valence < -1 || sample.valence > 1 ||
       !['Momentary Emotion', 'Daily Mood', 'Unknown'].includes(String(sample.kind)) ||
       !strings(sample.labels) || !strings(sample.associations)) return null;
   if (sample.valencePercent !== undefined && (typeof sample.valencePercent !== 'number' ||
       !Number.isSafeInteger(sample.valencePercent) || sample.valencePercent !== Math.trunc(((sample.valence + 1) / 2) * 100))) return null;
   if (identities.has(sample.id.toLowerCase())) return null;
   identities.add(sample.id.toLowerCase());
  } else if (sample.exactStartTime === undefined || sample.exactEndTime === undefined ||
             !exactSourceClockAgrees(start, sample.exactStartTime) || !exactSourceClockAgrees(end, sample.exactEndTime)) return null;
  records.push({metric: apple ? 'state_of_mind' : 'mindfulness_session', sample: {...sample}});
 }
 return records;
}
export function mindfulnessDetailsFromJSON(root: Record<string, unknown>, profile: string | undefined): NativeMindfulnessDetail[] | null {
 if (!object(root.mindfulness)) return [];
 const field = profile === 'apple-v11' ? 'stateOfMindEntries' : 'sessions';
 const foreign = profile === 'apple-v11' ? 'sessions' : 'stateOfMindEntries';
 if (root.mindfulness[foreign] !== undefined) return null;
 const samples = root.mindfulness[field];
 if (samples === undefined) return [];
 if (!Array.isArray(samples)) return null;
 return nativeMindfulnessDetails(samples.map(sample => ({metric: profile === 'apple-v11' ? 'state_of_mind' : 'mindfulness_session', sample})), profile);
}
/** Two complete representations inside one note may repeat facts but cannot override them. */
export function nativeMindfulnessDetailsAgree(a: NativeMindfulnessDetail[], b: NativeMindfulnessDetail[]): boolean {
 return nativeSourceRecordsAgree(a, b);
}
export function attachNativeMindfulnessDetails(day: HealthDay, records: NativeMindfulnessDetail[]): void {
 if (!records.length) return;
 day.nativeMindfulnessDetails = records;
 const moods = records.filter(record => record.metric === 'state_of_mind').map(({sample}) => ({...sample,
  timestamp: String(sample.timestamp), endDate: String(sample.endDate), kind: String(sample.kind), valence: Number(sample.valence)}));
 const sessions = records.filter(record => record.metric === 'mindfulness_session').map(({sample}) => ({...sample,
  startTime: String(sample.startTimeISO), endTime: String(sample.endTimeISO)}));
 day.mindfulness = {...day.mindfulness, ...(moods.length ? {stateOfMindEntries: moods} : {}), ...(sessions.length ? {sessions} : {})};
}
