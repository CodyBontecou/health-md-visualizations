import type { HealthDay } from "./types";
import type { WhoopCycle, WhoopRecord, WhoopRecovery, WhoopSleep, WhoopWorkout } from "./whoop-types";
import { WHOOP_ZONE_KEYS } from "./whoop-types";
import { whoopForDay } from "./whoop-data";

export function whoopIsScored(record: WhoopRecord): boolean {
	return record.score_state === undefined || record.score_state === "SCORED";
}

export interface WhoopRecoveryPair {
	day: HealthDay;
	cycle: WhoopCycle;
	recovery: WhoopRecovery;
	strain: number;
	score: number;
	projection: boolean;
}

/** Join only the same provider cycle. A flat single-record projection has no identity to invent. */
export function whoopRecoveryPairs(data: HealthDay[]): WhoopRecoveryPair[] {
	return [...data].sort((a, b) => a.date.localeCompare(b.date)).flatMap((day) => {
		const provider = whoopForDay(day);
		if (!provider) return [];
		const byID = new Map<string, WhoopCycle>();
		for (const cycle of provider.cycles) if (cycle.id) byID.set(cycle.id, cycle);
		return provider.recoveries.flatMap((recovery) => {
			const projection = recovery.projection === true && provider.recoveries.length === 1 && provider.cycles.length === 1 && provider.cycles[0].projection === true;
			const cycle = projection ? provider.cycles[0] : recovery.cycle_id ? byID.get(recovery.cycle_id) : undefined;
			if (!cycle || !whoopIsScored(cycle) || !whoopIsScored(recovery) || cycle.strain_score === undefined || recovery.recovery_score_percent === undefined) return [];
			return [{ day, cycle, recovery, strain: cycle.strain_score, score: recovery.recovery_score_percent, projection }];
		});
	});
}

export interface WhoopSleepEntry { day: HealthDay; sleep: WhoopSleep }
export function whoopSleepEntries(data: HealthDay[], scope: string = "all"): WhoopSleepEntry[] {
	return data.flatMap((day) => (whoopForDay(day)?.sleep ?? []).map((sleep) => ({ day, sleep })))
		.filter(({ sleep }) => scope === "main" ? sleep.is_nap === false : scope === "naps" ? sleep.is_nap === true : true)
		.sort((a, b) => a.day.date.localeCompare(b.day.date) || (a.sleep.start_time ?? "").localeCompare(b.sleep.start_time ?? "") || (a.sleep.id ?? "").localeCompare(b.sleep.id ?? ""));
}

export const WHOOP_SLEEP_NEED_COMPONENTS = [
	{ key: "baseline_sleep_need_milliseconds", label: "Baseline", color: "#5b8ff9" },
	{ key: "sleep_debt_need_milliseconds", label: "Sleep debt", color: "#f6bd16" },
	{ key: "recent_strain_need_milliseconds", label: "Recent strain", color: "#e8684a" },
	{ key: "recent_nap_adjustment_milliseconds", label: "Nap adjustment", color: "#9270ca" },
] as const;

/** A display-only sum of reported components, never a fabricated provider score or missing-zero fill. */
export function whoopSleepNeed(sleep: WhoopSleep): number | undefined {
	if (!whoopIsScored(sleep)) return undefined;
	const values = WHOOP_SLEEP_NEED_COMPONENTS.map(({ key }) => sleep[key]);
	if (values.some((value) => value === undefined)) return undefined;
	const total = (values as number[]).reduce((sum, value) => sum + value, 0);
	return Number.isSafeInteger(total) && total >= 0 ? total : undefined;
}

export function whoopSleepLabel(sleep: WhoopSleep): string {
	return sleep.is_nap === true ? "Nap" : sleep.is_nap === false ? "Sleep" : "Sleep (nap status unavailable)";
}

export interface WhoopWorkoutEntry { day: HealthDay; workout: WhoopWorkout }
export function whoopWorkoutEntries(data: HealthDay[]): WhoopWorkoutEntry[] {
	return data.flatMap((day) => (whoopForDay(day)?.workouts ?? []).map((workout) => ({ day, workout })))
		.sort((a, b) => a.day.date.localeCompare(b.day.date) || (a.workout.start_time ?? "").localeCompare(b.workout.start_time ?? "") || (a.workout.id ?? "").localeCompare(b.workout.id ?? ""));
}

export function whoopWorkoutZones(workout: WhoopWorkout): Array<{ index: number; milliseconds: number }> {
	if (!whoopIsScored(workout)) return [];
	return WHOOP_ZONE_KEYS.flatMap((key, index) => workout.zone_durations?.[key] === undefined ? [] : [{ index, milliseconds: workout.zone_durations[key] }]);
}

export function whoopWorkoutElapsed(workout: WhoopWorkout): number | undefined {
	if (!workout.start_time || !workout.end_time) return undefined;
	const elapsed = Date.parse(workout.end_time) - Date.parse(workout.start_time);
	return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : undefined;
}

/** Missingness and partial capture stay visible without exposing provider errors or inferring absence = zero. */
export function whoopCoverage(data: HealthDay[]): string {
	const sections = data.map(whoopForDay).filter((value) => value !== undefined);
	const partial = sections.filter((value) => value.captureStatus === "partial").length;
	const disabled = sections.filter((value) => value.captureStatus === "not_requested").length;
	const failed = sections.reduce((sum, value) => sum + value.resources.filter((row) => row.status !== "success").length, 0);
	const notes = [...new Set(sections.flatMap((value) => value.notes))];
	return [partial ? `${partial} partial capture(s)` : "", disabled ? `${disabled} not requested` : "", failed ? `${failed} non-success resource(s)` : "", ...notes].filter(Boolean).join(" · ") || "WHOOP only · Missing values are not zero";
}
