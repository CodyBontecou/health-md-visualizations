/** Reviewed WHOOP v1 facts. Optional identity/timing is only used by flat-format projections. */
export interface WhoopRecord {
	id?: string;
	start_time?: string;
	end_time?: string | null;
	timezone_offset?: string;
	score_state?: string;
	/** A single-record scalar projection, not a reconstructed provider event. */
	projection?: true;
}

export interface WhoopCycle extends WhoopRecord {
	strain_score?: number;
	energy_kilojoules?: number;
	average_heart_rate_bpm?: number;
	max_heart_rate_bpm?: number;
}

export interface WhoopRecovery extends WhoopRecord {
	cycle_id?: string;
	sleep_id?: string;
	user_calibrating?: boolean;
	recovery_score_percent?: number;
	resting_heart_rate_bpm?: number;
	hrv_rmssd_ms?: number;
	spo2_percent?: number;
	skin_temperature_celsius?: number;
}

export interface WhoopSleep extends WhoopRecord {
	cycle_id?: string;
	is_nap?: boolean;
	total_sleep_milliseconds?: number;
	total_in_bed_milliseconds?: number;
	awake_milliseconds?: number;
	light_sleep_milliseconds?: number;
	slow_wave_sleep_milliseconds?: number;
	rem_sleep_milliseconds?: number;
	no_data_milliseconds?: number;
	sleep_cycle_count?: number;
	disturbance_count?: number;
	baseline_sleep_need_milliseconds?: number;
	sleep_debt_need_milliseconds?: number;
	recent_strain_need_milliseconds?: number;
	recent_nap_adjustment_milliseconds?: number;
	respiratory_rate_breaths_per_minute?: number;
	sleep_performance_percent?: number;
	sleep_consistency_percent?: number;
	sleep_efficiency_percent?: number;
}

export const WHOOP_ZONE_KEYS = [
	"zone_zero_milliseconds", "zone_one_milliseconds", "zone_two_milliseconds",
	"zone_three_milliseconds", "zone_four_milliseconds", "zone_five_milliseconds",
] as const;

export interface WhoopWorkout extends WhoopRecord {
	sport_name?: string;
	strain_score?: number;
	average_heart_rate_bpm?: number;
	max_heart_rate_bpm?: number;
	energy_kilojoules?: number;
	distance_meters?: number;
	altitude_gain_meters?: number;
	altitude_change_meters?: number;
	percent_recorded?: number;
	zone_durations?: Partial<Record<typeof WHOOP_ZONE_KEYS[number], number>>;
}

export interface WhoopBody {
	source_kind?: "current_profile_snapshot";
	observed_at?: string;
	height_meters?: number;
	weight_kilograms?: number;
	max_heart_rate_bpm?: number;
}

export type WhoopCaptureStatus = "complete" | "partial" | "not_requested";
export interface WhoopResource {
	resource: "cycles" | "recovery" | "sleep" | "workouts" | "body";
	status: "success" | "failure" | "cancelled" | "skipped" | "unsupported";
	record_count: number;
}

/** Consumer model kept separate from both the original provider namespace and canonical summaries. */
export interface WhoopDayData {
	source: "typed" | "csv" | "frontmatter";
	captureStatus?: WhoopCaptureStatus;
	fetchedAt?: string;
	cycles: WhoopCycle[];
	recoveries: WhoopRecovery[];
	sleep: WhoopSleep[];
	workouts: WhoopWorkout[];
	body?: WhoopBody;
	resources: WhoopResource[];
	/** Consumer-safe diagnostics; never copy arbitrary upstream error text. */
	notes: string[];
}
