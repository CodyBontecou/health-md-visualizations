import type { HealthDay, HealthMdTimeContext } from "./types";
import { schemaVersionOf } from "./healthmd-schema";
import { topLevelJsonObjectProperties } from "./json-utils";

function record(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown> : undefined;
}

function alias(value: Record<string, unknown>, snake: string, camel: string): string | undefined {
	const a = value[snake];
	const b = value[camel];
	if ((a !== undefined && typeof a !== "string") || (b !== undefined && typeof b !== "string")
		|| (a !== undefined && b !== undefined && a !== b)) throw new Error("Invalid sleep authority");
	return a ?? b;
}

function timezone(value: string | undefined): boolean {
	if (!value || value.length > 128 || /^[+-]/.test(value)) return false;
	try {
		new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
		return true;
	} catch { return false; }
}

/** A successor's profile, clock and three ownership fields are one atomic authority. */
export function readSleepAuthority(source: Record<string, unknown>): {
	context?: HealthMdTimeContext;
	profile?: string;
	androidSleep: boolean;
} | null {
	try {
		const profile = alias(source, "schema_profile", "schemaProfile");
		const version = schemaVersionOf(source);
		const androidSleep = profile === "android-sleep-v6";
		const successor = androidSleep || profile === "apple-v11" || version === 11;
		const raw = record(source.time_context ?? source.timeContext);
		if (source.time_context !== undefined && source.timeContext !== undefined) {
			const other = record(source.timeContext);
			if (!raw || !other) return null;
			for (const [snake, camel] of [["calendar_timezone", "calendarTimezone"], ["timestamp_timezone", "timestampTimezone"],
				["sleep_day_attribution", "sleepDayAttribution"], ["sleep_owner_day_rule", "sleepOwnerDayRule"], ["sleep_interval_clipping", "sleepIntervalClipping"]]) {
				if (alias(raw, snake, camel) !== alias(other, snake, camel)) return null;
			}
		}
		const context = raw ?? {};
		const calendar = alias(context, "calendar_timezone", "calendarTimezone");
		const timestamp = alias(context, "timestamp_timezone", "timestampTimezone");
		const attribution = alias(context, "sleep_day_attribution", "sleepDayAttribution");
		const owner = alias(context, "sleep_owner_day_rule", "sleepOwnerDayRule");
		const clipping = alias(context, "sleep_interval_clipping", "sleepIntervalClipping");
		if (successor) {
			if (source.schema !== "healthmd.health_data" || version !== (androidSleep ? 6 : 11) || profile !== (androidSleep ? "android-sleep-v6" : "apple-v11")
				|| (source.schemaVersion !== undefined && Number(source.schemaVersion) !== version)
				|| (source.schema_version !== undefined && Number(source.schema_version) !== version)
				|| attribution !== "morning_ends" || owner !== "session_end_date" || clipping !== "none"
				|| !timezone(calendar) || (timestamp !== "UTC" && (!androidSleep || timestamp !== calendar))) return null;
		} else if (attribution !== undefined || owner !== undefined || clipping !== undefined) return null;
		return {
			profile, androidSleep,
			context: calendar || timestamp ? {
				calendarTimezone: calendar, calendar_timezone: calendar,
				timestampTimezone: timestamp, timestamp_timezone: timestamp,
				...(successor ? {
					sleepDayAttribution: "morning_ends", sleep_day_attribution: "morning_ends",
					sleepOwnerDayRule: "session_end_date", sleep_owner_day_rule: "session_end_date",
					sleepIntervalClipping: "none", sleep_interval_clipping: "none",
				} : {}),
			} : undefined,
		};
	} catch { return null; }
}

/** Known profile meanings that may own a scoped capture inside a personal note. */
export function supportsScopedDailyCapture(json: string): boolean {
	const properties = topLevelJsonObjectProperties(json);
	if (!properties) return false;
	const keys = new Set(["schema", "schema_version", "schemaVersion", "schema_profile", "schemaProfile", "type", "time_context", "timeContext"]);
	const source: Record<string, unknown> = {};
	const seen = new Set<string>();
	try {
		for (const property of properties) {
			if (seen.has(property.key) || property.key === "healthkit_record_archive") return false;
			seen.add(property.key);
			if (!keys.has(property.key)) continue;
			if (property.valueEnd - property.valueStart > 4096) return false;
			source[property.key] = JSON.parse(json.slice(property.valueStart, property.valueEnd));
		}
	} catch { return false; }
	const authority = readSleepAuthority(source);
	if (!authority || source.schema !== "healthmd.health_data") return false;
	if (["apple-v11", "android-sleep-v6"].includes(authority.profile ?? "")) return true;
	// A later Night begins injection retains the existing Apple-v8 meaning in
	// its own scoped record. It cannot inherit facts from the personal note.
	return authority.profile === undefined && source.schema_version === 8
		&& (source.schemaVersion === undefined || source.schemaVersion === 8)
		&& timezone(authority.context?.calendar_timezone)
		&& authority.context?.timestamp_timezone === "UTC";
}

/** Same-date inputs with different ownership/profile promises must never be combined. */
type SleepAuthorityRecord = Pick<HealthDay, "schema_profile" | "timeContext" | "time_context">;

/** An individual note describes its capture without claiming the daily-file grammar. */
export function readIndividualCaptureAuthority(source: Record<string, unknown>): {
	authority: NonNullable<ReturnType<typeof readSleepAuthority>>;
	ownerDate?: string;
} | null | undefined {
	if (source.healthmd_capture_context_json === undefined) return undefined;
	// Daily exports may use arbitrary custom metric keys. Only a note's
	// individual-entry identity can activate this annotation grammar.
	if (source.type === "health-data" || (source.entry_kind === undefined && source.metric === undefined)) return undefined;
	try {
		if (typeof source.healthmd_capture_context_json !== "string"
			|| source.healthmd_capture_context_json.length > 1024
			|| typeof source.entry_kind !== "string"
			|| !["healthkit_record", "granular_compatibility", "daily_aggregate"].includes(source.entry_kind)
			|| typeof source.type !== "string" || !source.type
			|| typeof source.metric !== "string" || !source.metric || source.metric.length > 128
			|| ["schema", "schema_version", "schemaVersion", "schema_profile", "schemaProfile", "time_context", "timeContext"].some(key => source[key] !== undefined)) return null;
		const context = record(JSON.parse(source.healthmd_capture_context_json));
		const allowed = ["schema_profile", "calendar_timezone", "timestamp_timezone", "sleep_day_attribution",
			"sleep_owner_day_rule", "sleep_interval_clipping", "sleep_owner_date"];
		if (!context || Object.keys(context).some(key => !allowed.includes(key))
			|| context.schema_profile !== "apple-v11") return null;
		const authority = readSleepAuthority({ schema: "healthmd.health_data", schema_version: 11,
			schema_profile: context.schema_profile, time_context: context });
		if (!authority) return null;
		const sleep = source.type === "sleep";
		const owner = context.sleep_owner_date;
		if (sleep) {
			if (typeof owner !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(owner)
				|| !Number.isFinite(Date.parse(owner + "T00:00:00Z"))
				|| new Date(owner + "T00:00:00Z").toISOString().slice(0, 10) !== owner) return null;
		} else if (owner !== undefined) return null;
		return { authority, ...(sleep ? { ownerDate: owner as string } : {}) };
	} catch { return null; }
}

export function sleepAuthoritiesAgree(a: SleepAuthorityRecord, b: SleepAuthorityRecord): boolean {
	const context = (day: SleepAuthorityRecord): string => {
		const time = day.timeContext ?? day.time_context;
		const attribution = time?.sleep_day_attribution ?? "night_begins";
		return attribution === "morning_ends"
			? [attribution, day.schema_profile, time?.calendar_timezone, time?.timestamp_timezone].join("|")
			: attribution;
	};
	return context(a) === context(b);
}

/** Exact metadata-off declaration emitted by the versioned successor renderer. */
export function sleepDeclaration(body: string): Record<string, unknown> | null | undefined {
	if (!body.includes("Health.md sleep attribution:")) return undefined;
	const lines = body.split("\n").filter((line) => line.includes("Health.md sleep attribution:") || line.startsWith("> Profile:"));
	if (lines.length !== 2 || lines[0] !== "> Health.md sleep attribution: `morning_ends` (Morning ends); whole sessions by wake-up date.") return null;
	const match = /^> Profile: `(apple-v11|android-sleep-v6)`; calendar timezone: `([^`]+)`; timestamp timezone: `([^`]+)`; owner rule: `session_end_date`; clipping: `none`\.$/.exec(lines[1]);
	if (!match) return null;
	return {
		schema: "healthmd.health_data", schema_version: match[1] === "apple-v11" ? 11 : 6, schema_profile: match[1],
		time_context: { calendar_timezone: match[2], timestamp_timezone: match[3], sleep_day_attribution: "morning_ends",
			sleep_owner_day_rule: "session_end_date", sleep_interval_clipping: "none" },
	};
}

/** Exact, selected SDK summaries, independent of optional source stage detail. */
export function sleepSummaryFacts(body: string): Record<string, unknown> | null | undefined {
 const marker = "> Sleep summary facts:";
 const lines = body.split("\n").filter(line => line.includes(marker));
 if (!lines.length) return undefined;
 if (lines.length !== 1 || !lines[0].startsWith(marker + " `") || !lines[0].endsWith("`")) return null;
 try {
  const facts = record(JSON.parse(lines[0].slice((marker + " `").length, -1)));
  if (!facts) return null;
  const numeric = ["sleep_total_hours", "sleep_deep_hours", "sleep_rem_hours", "sleep_core_hours", "sleep_light_hours", "sleep_awake_hours", "sleep_in_bed_hours"];
  const clocks = ["sleep_bedtime", "sleep_wake"];
  for (const [key, value] of Object.entries(facts)) {
   if (numeric.includes(key)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
   } else if (clocks.includes(key)) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= 1440) return null;
   } else return null;
  }
  // Duplicate JSON properties must not silently override summary authority.
  const keys = [...lines[0].matchAll(/"((?:\\.|[^"\\])*)"\s*:/g)].map(match => JSON.parse('"' + match[1] + '"'));
  if (new Set(keys).size !== keys.length) return null;
  return facts;
 } catch { return null; }
}
