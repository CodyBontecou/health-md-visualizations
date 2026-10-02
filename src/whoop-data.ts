import type { HealthDay } from "./types";
import type { WhoopBody, WhoopCaptureStatus, WhoopCycle, WhoopDayData, WhoopRecovery, WhoopRecord, WhoopResource, WhoopSleep, WhoopWorkout } from "./whoop-types";
import { WHOOP_ZONE_KEYS } from "./whoop-types";

function object(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function text(value: unknown, limit = 256): string | undefined {
	return typeof value === "string" && value.trim().length > 0 && value.length <= limit ? value.trim() : undefined;
}
function timestamp(value: unknown): string | undefined {
	const raw = text(value);
	return raw && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(raw) && Number.isFinite(Date.parse(raw)) ? raw : undefined;
}
function number(value: unknown, min = 0, max = Number.MAX_VALUE, integer = false): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isSafeInteger(value)) ? value : undefined;
}
const duration = (value: unknown): number | undefined => number(value, 0, Number.MAX_SAFE_INTEGER, true);
const percent = (value: unknown): number | undefined => number(value, 0, 100);
const bpm = (value: unknown): number | undefined => {
	const result = number(value, 0, 300);
	return result !== undefined && result > 0 ? result : undefined;
};
function defined(values: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}
function common(raw: Record<string, unknown>): Record<string, unknown> {
	return defined({
		id: text(raw.id), start_time: timestamp(raw.start_time),
		end_time: raw.end_time === null ? null : timestamp(raw.end_time),
		timezone_offset: text(raw.timezone_offset, 6), score_state: text(raw.score_state, 64),
	});
}
function cycle(raw: Record<string, unknown>): WhoopCycle {
	return { ...common(raw), ...defined({
		strain_score: number(raw.strain_score, 0, 21), energy_kilojoules: number(raw.energy_kilojoules),
		average_heart_rate_bpm: bpm(raw.average_heart_rate_bpm), max_heart_rate_bpm: bpm(raw.max_heart_rate_bpm),
	}) };
}
function recovery(raw: Record<string, unknown>): WhoopRecovery {
	return { ...defined({
		score_state: text(raw.score_state, 64),
		cycle_id: text(raw.cycle_id), sleep_id: text(raw.sleep_id),
		user_calibrating: typeof raw.user_calibrating === "boolean" ? raw.user_calibrating : undefined,
		recovery_score_percent: percent(raw.recovery_score_percent), resting_heart_rate_bpm: bpm(raw.resting_heart_rate_bpm),
		hrv_rmssd_ms: number(raw.hrv_rmssd_ms),
		spo2_percent: bpm(raw.spo2_percent) === undefined ? undefined : percent(raw.spo2_percent),
		skin_temperature_celsius: number(raw.skin_temperature_celsius, -100, 100),
	}) };
}
const SLEEP_DURATION_KEYS = [
	"total_sleep_milliseconds", "total_in_bed_milliseconds", "awake_milliseconds", "light_sleep_milliseconds",
	"slow_wave_sleep_milliseconds", "rem_sleep_milliseconds", "no_data_milliseconds", "sleep_cycle_count",
	"disturbance_count", "baseline_sleep_need_milliseconds", "sleep_debt_need_milliseconds", "recent_strain_need_milliseconds",
] as const;
function sleep(raw: Record<string, unknown>): WhoopSleep {
	const result: WhoopSleep = { ...common(raw), ...defined({
		cycle_id: text(raw.cycle_id), is_nap: typeof raw.is_nap === "boolean" ? raw.is_nap : undefined,
		recent_nap_adjustment_milliseconds: number(raw.recent_nap_adjustment_milliseconds, -Number.MAX_SAFE_INTEGER, 0, true),
		respiratory_rate_breaths_per_minute: number(raw.respiratory_rate_breaths_per_minute, 0, 100),
		sleep_performance_percent: percent(raw.sleep_performance_percent),
		sleep_consistency_percent: percent(raw.sleep_consistency_percent), sleep_efficiency_percent: percent(raw.sleep_efficiency_percent),
	}) };
	for (const key of SLEEP_DURATION_KEYS) {
		const value = duration(raw[key]);
		if (value !== undefined) result[key] = value;
	}
	// Check a reported total when all stages are available; never infer stage transitions.
	const stages = [result.light_sleep_milliseconds, result.slow_wave_sleep_milliseconds, result.rem_sleep_milliseconds];
	if (stages.every((value) => value !== undefined)) {
		const total = stages.reduce((sum, value) => sum + value, 0);
		if (Number.isSafeInteger(total)) result.total_sleep_milliseconds = total;
	}
	return result;
}
function workout(raw: Record<string, unknown>): WhoopWorkout {
	const result: WhoopWorkout = { ...common(raw), ...defined({
		sport_name: text(raw.sport_name, 128), strain_score: number(raw.strain_score, 0, 21),
		average_heart_rate_bpm: bpm(raw.average_heart_rate_bpm), max_heart_rate_bpm: bpm(raw.max_heart_rate_bpm),
		energy_kilojoules: number(raw.energy_kilojoules), distance_meters: number(raw.distance_meters),
		altitude_gain_meters: number(raw.altitude_gain_meters, -Number.MAX_VALUE),
		altitude_change_meters: number(raw.altitude_change_meters, -Number.MAX_VALUE), percent_recorded: percent(raw.percent_recorded),
	}) };
	const zones = object(raw.zone_durations);
	if (zones) {
		const values = defined(Object.fromEntries(WHOOP_ZONE_KEYS.map((key) => [key, duration(zones[key])])));
		if (Object.keys(values).length) result.zone_durations = values;
	}
	return result;
}
function body(raw: Record<string, unknown>): WhoopBody {
	return defined({
		source_kind: raw.source_kind === "current_profile_snapshot" ? raw.source_kind : undefined,
		observed_at: timestamp(raw.observed_at), height_meters: number(raw.height_meters, Number.MIN_VALUE, 3),
		weight_kilograms: number(raw.weight_kilograms, Number.MIN_VALUE, 1000), max_heart_rate_bpm: bpm(raw.max_heart_rate_bpm),
	});
}
const CAPTURE_STATUSES = new Set(["complete", "partial", "not_requested"]);
function capture(value: unknown): WhoopCaptureStatus | undefined {
	return typeof value === "string" && CAPTURE_STATUSES.has(value) ? value as WhoopCaptureStatus : undefined;
}
function empty(source: WhoopDayData["source"], status?: WhoopCaptureStatus): WhoopDayData {
	return { source, captureStatus: status, cycles: [], recoveries: [], sleep: [], workouts: [], resources: [], notes: [] };
}
function resource(value: unknown): WhoopResource | undefined {
	const raw = object(value);
	if (!raw || !["cycles", "recovery", "sleep", "workouts", "body"].includes(String(raw.resource)) ||
		!["success", "failure", "cancelled", "skipped", "unsupported"].includes(String(raw.status)) || duration(raw.record_count) === undefined) return undefined;
	return { resource: raw.resource, status: raw.status, record_count: raw.record_count } as WhoopResource;
}
const MAPPERS = { cycles: cycle, recoveries: recovery, sleep, workouts: workout };
type Collection = keyof typeof MAPPERS;
function validRecord(key: Collection, raw: Record<string, unknown>): boolean {
	if (key === "recoveries") return text(raw.cycle_id) !== undefined;
	if (!text(raw.id) || !timestamp(raw.start_time)) return false;
	if (key === "cycles") return true;
	if (!timestamp(raw.end_time) || Date.parse(String(raw.end_time)) < Date.parse(String(raw.start_time))) return false;
	return key === "sleep" ? !!text(raw.cycle_id) && typeof raw.is_nap === "boolean" : !!text(raw.sport_name, 128);
}
function setRecords(result: WhoopDayData, key: Collection, values: unknown[]): void {
	const mapped: Array<WhoopRecord & { cycle_id?: string }> = [];
	for (const value of values.slice(0, 10_000)) {
		const raw = object(value);
		if (!raw || !validRecord(key, raw)) {
			result.notes.push(`Invalid WHOOP ${key} record omitted.`);
			continue;
		}
		mapped.push(MAPPERS[key](raw));
	}
	mapped.sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? "") || (a.id ?? a.cycle_id ?? "").localeCompare(b.id ?? b.cycle_id ?? ""));
	Object.assign(result, { [key]: mapped });
	if (values.length > 10_000) result.notes.push("WHOOP record display limit reached.");
}
function finalize(result: WhoopDayData): WhoopDayData {
	if (result.captureStatus === "not_requested") return empty(result.source, "not_requested");
	for (const row of result.resources) {
		const count = row.resource === "body" ? Number(!!result.body) : row.resource === "recovery" ? result.recoveries.length : result[row.resource].length;
		if (row.record_count !== count) result.notes.push(`WHOOP ${row.resource} record count does not match retained data.`);
	}
	result.notes = [...new Set(result.notes)];
	return result;
}

/** Accept only the reviewed independently-versioned typed model; unknown versions remain in providers. */
export function parseWhoopSection(value: unknown): WhoopDayData | undefined {
	const raw = object(value);
	if (!raw || raw.schema !== "healthmd.provider.whoop_daily" || raw.schema_version !== 1 || !capture(raw.capture_status)) return undefined;
	const result = empty("typed", capture(raw.capture_status));
	if (result.captureStatus === "not_requested") return result;
	result.fetchedAt = timestamp(raw.fetched_at);
	for (const key of Object.keys(MAPPERS) as Collection[]) {
		if (Array.isArray(raw[key])) setRecords(result, key, raw[key]);
		else result.notes.push(`WHOOP ${key} collection unavailable.`);
	}
	if (Array.isArray(raw.resources)) result.resources = raw.resources.map(resource).filter((row): row is WhoopResource => !!row);
	const profile = object(raw.body);
	if (profile?.source_kind === "current_profile_snapshot") result.body = body(profile);
	if (Array.isArray(raw.warnings) && raw.warnings.length) result.notes.push("WHOOP producer reported capture warnings.");
	return finalize(result);
}

// Explicit labels from the production v8 flat projection; never guess unprefixed canonical aliases.
const FLAT_FIELDS: Array<[string, Collection | "body", string, string, string]> = [
	["whoop_cycle_strain_score", "cycles", "strain_score", "WHOOP Cycle", "Cycle Strain Score"],
	["whoop_cycle_energy_kilojoules", "cycles", "energy_kilojoules", "WHOOP Cycle", "Cycle Energy"],
	["whoop_cycle_average_heart_rate_bpm", "cycles", "average_heart_rate_bpm", "WHOOP Cycle", "Cycle Average Heart Rate"],
	["whoop_cycle_max_heart_rate_bpm", "cycles", "max_heart_rate_bpm", "WHOOP Cycle", "Cycle Maximum Heart Rate"],
	["whoop_recovery_score_percent", "recoveries", "recovery_score_percent", "WHOOP Recovery", "Recovery Score"],
	["whoop_resting_heart_rate_bpm", "recoveries", "resting_heart_rate_bpm", "WHOOP Recovery", "Resting Heart Rate"],
	["whoop_hrv_rmssd_ms", "recoveries", "hrv_rmssd_ms", "WHOOP Recovery", "HRV (RMSSD)"],
	["whoop_spo2_percent", "recoveries", "spo2_percent", "WHOOP Recovery", "SpO₂"],
	["whoop_skin_temperature_celsius", "recoveries", "skin_temperature_celsius", "WHOOP Recovery", "Skin Temperature"],
	...(["total_sleep", "total_in_bed", "awake", "light_sleep", "slow_wave_sleep", "rem_sleep", "recent_nap_adjustment"] as const).map((name): [string, Collection, string, string, string] => [
		`whoop_${name}_milliseconds`, "sleep", `${name}_milliseconds`, "WHOOP Sleep",
		({ total_sleep: "Total Sleep", total_in_bed: "Total In Bed", awake: "Awake Duration", light_sleep: "Light Sleep Duration", slow_wave_sleep: "Slow Wave Sleep Duration", rem_sleep: "REM Sleep Duration", recent_nap_adjustment: "Recent Nap Adjustment" })[name],
	]),
	["whoop_respiratory_rate_breaths_per_minute", "sleep", "respiratory_rate_breaths_per_minute", "WHOOP Sleep", "Respiratory Rate"],
	...(["performance", "consistency", "efficiency"] as const).map((name): [string, Collection, string, string, string] => [
		`whoop_sleep_${name}_percent`, "sleep", `sleep_${name}_percent`, "WHOOP Sleep", `Sleep ${name[0].toUpperCase()}${name.slice(1)}`,
	]),
	["whoop_workout_sport_name", "workouts", "sport_name", "WHOOP Workout", "Workout Sport"],
	["whoop_workout_strain_score", "workouts", "strain_score", "WHOOP Workout", "Workout Strain Score"],
	["whoop_workout_average_heart_rate_bpm", "workouts", "average_heart_rate_bpm", "WHOOP Workout", "Workout Average Heart Rate"],
	["whoop_workout_max_heart_rate_bpm", "workouts", "max_heart_rate_bpm", "WHOOP Workout", "Workout Maximum Heart Rate"],
	["whoop_workout_energy_kilojoules", "workouts", "energy_kilojoules", "WHOOP Workout", "Workout Energy"],
	["whoop_workout_distance_meters", "workouts", "distance_meters", "WHOOP Workout", "Workout Distance"],
	["whoop_body_height_meters", "body", "height_meters", "WHOOP Body", "Body Height Snapshot"],
	["whoop_body_weight_kilograms", "body", "weight_kilograms", "WHOOP Body", "Body Weight Snapshot"],
	["whoop_body_max_heart_rate_bpm", "body", "max_heart_rate_bpm", "WHOOP Body", "Maximum Heart Rate Snapshot"],
];
export function parseWhoopFlat(raw: Record<string, unknown>, source: "csv" | "frontmatter" = "frontmatter"): WhoopDayData | undefined {
	const status = capture(raw.whoop_capture_status);
	const result = empty(source, status);
	const groups: Record<string, Record<string, unknown>> = {};
	for (const [key, group, field] of FLAT_FIELDS) {
		const value = raw[key];
		if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) continue;
		(groups[group] ??= {})[field] = field === "sport_name" ? value : typeof value === "string" ? Number(value) : value;
	}
	for (const key of Object.keys(MAPPERS) as Collection[]) {
		if (!groups[key]) continue;
		const mapped = MAPPERS[key](groups[key]);
		if (Object.keys(mapped).length) Object.assign(result, { [key]: [{ ...mapped, projection: true }] });
	}
	if (groups.body) result.body = body(groups.body);
	if (!status && !Object.keys(groups).length) return undefined;
	if (result.cycles.length || result.recoveries.length || result.sleep.length || result.workouts.length || result.body) {
		result.notes.push("Single-record scalar projection; event identity and timing may be unavailable.");
	}
	return finalize(result);
}

export interface WhoopCsvRow { category: string; metric: string; value: string }
export function parseWhoopCsv(rows: WhoopCsvRow[]): WhoopDayData | undefined {
	const label = (value: string): string => value.trim().toLowerCase();
	const providerRows = rows.filter((row) => label(row.category).startsWith("whoop "));
	if (!providerRows.length) return undefined;
	const flat: Record<string, unknown> = {};
	for (const [key, , , category, metric] of FLAT_FIELDS) {
		const row = providerRows.find((item) => label(item.category) === label(category) && label(item.metric) === label(metric));
		if (row) flat[key] = row.value;
	}
	flat.whoop_capture_status = providerRows.find((row) => label(row.category) === "whoop capture" && label(row.metric) === "capture status")?.value;
	const result = parseWhoopFlat(flat, "csv") ?? empty("csv");
	const structured: Array<[Collection, string, string]> = [
		["cycles", "whoop cycle", "cycle record"], ["recoveries", "whoop recovery", "recovery record"],
		["sleep", "whoop sleep", "sleep record"], ["workouts", "whoop workout", "workout record"],
	];
	function decode(row: WhoopCsvRow): unknown {
		try { return JSON.parse(row.value); }
		catch { result.notes.push("Malformed WHOOP CSV record omitted."); return undefined; }
	}
	let hasStructured = false;
	for (const [key, category, metric] of structured) {
		const matches = providerRows.filter((row) => label(row.category) === category && label(row.metric) === metric);
		if (matches.length) { setRecords(result, key, matches.map(decode)); hasStructured = true; }
	}
	result.resources = providerRows.filter((row) => label(row.category) === "whoop capture" && label(row.metric) === "resource result").map((row) => resource(decode(row))).filter((row): row is WhoopResource => !!row);
	const profile = providerRows.find((row) => label(row.category) === "whoop body" && label(row.metric) === "body snapshot");
	const profileValue = profile ? object(decode(profile)) : undefined;
	if (profileValue?.source_kind === "current_profile_snapshot") result.body = body(profileValue);
	if (hasStructured && ![...result.cycles, ...result.recoveries, ...result.sleep, ...result.workouts].some((record) => record.projection)) {
		result.notes = result.notes.filter((note) => !note.startsWith("Single-record scalar"));
	}
	return finalize(result);
}

/** A supported typed section is authoritative, even when complete-empty or not requested. */
export function whoopForDay(day: HealthDay): WhoopDayData | undefined {
	return day.whoop ?? parseWhoopSection(day.providers?.whoop);
}

export function mergeWhoop(preferred?: WhoopDayData, fallback?: WhoopDayData): WhoopDayData | undefined {
	if (!preferred) return fallback;
	if (!fallback) return preferred;
	const rank = { typed: 3, csv: 2, frontmatter: 1 };
	if (rank[fallback.source] !== rank[preferred.source]) return rank[fallback.source] > rank[preferred.source] ? fallback : preferred;
	// not_requested has no fetch timestamp. Conservatively honor an explicit opt-out
	// rather than resurrecting values from an indistinguishably dated duplicate.
	if (preferred.captureStatus === "not_requested") return preferred;
	if (fallback.captureStatus === "not_requested") return fallback;
	if (preferred.fetchedAt && fallback.fetchedAt && Date.parse(fallback.fetchedAt) > Date.parse(preferred.fetchedAt)) return fallback;
	return preferred; // Never union different captures or revive an authoritative empty collection.
}
