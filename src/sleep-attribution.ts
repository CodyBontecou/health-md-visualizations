import type { HealthDay, HealthMdTimeContext } from "./types";
import { schemaVersionOf } from "./healthmd-schema";

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

/** Same-date inputs with different ownership/profile promises must never be combined. */
type SleepAuthorityRecord = Pick<HealthDay, "schema_profile" | "timeContext" | "time_context">;

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
