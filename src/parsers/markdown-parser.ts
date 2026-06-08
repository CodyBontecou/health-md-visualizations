import { HealthDay } from "../types";

/**
 * Minimal YAML frontmatter parser.
 * Handles scalar values (strings, numbers, booleans) and simple arrays.
 * Does not handle nested objects or multi-line values.
 */
function parseFrontmatter(content: string): Record<string, unknown> | null {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return null;

	const yaml = match[1];
	const result: Record<string, unknown> = {};

	for (const line of yaml.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		const colonIdx = trimmed.indexOf(":");
		if (colonIdx === -1) continue;

		const key = trimmed.slice(0, colonIdx).trim();
		let val = trimmed.slice(colonIdx + 1).trim();

		if (!val) continue;

		// Array: [item1, item2]
		if (val.startsWith("[") && val.endsWith("]")) {
			const inner = val.slice(1, -1);
			result[key] = inner
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			continue;
		}

		// Quoted string
		if (
			(val.startsWith('"') && val.endsWith('"')) ||
			(val.startsWith("'") && val.endsWith("'"))
		) {
			result[key] = val.slice(1, -1);
			continue;
		}

		// Boolean
		if (val === "true") { result[key] = true; continue; }
		if (val === "false") { result[key] = false; continue; }

		// Number
		const num = Number(val);
		if (!isNaN(num) && val !== "") {
			result[key] = num;
			continue;
		}

		// Plain string
		result[key] = val;
	}

	return result;
}

function getNum(fm: Record<string, unknown>, key: string): number | undefined {
	const v = fm[key];
	if (typeof v === "number") return v;
	if (typeof v === "string") {
		const n = parseFloat(v);
		return isNaN(n) ? undefined : n;
	}
	return undefined;
}

function getStr(fm: Record<string, unknown>, key: string): string | undefined {
	const v = fm[key];
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") {
		return String(v);
	}
	if (Array.isArray(v)) {
		return v
			.map((item) => {
				if (
					typeof item === "string" ||
					typeof item === "number" ||
					typeof item === "boolean" ||
					typeof item === "bigint"
				) {
					return String(item);
				}
				return JSON.stringify(item);
			})
			.join(", ");
	}
	if (v !== undefined && v !== null) {
		return JSON.stringify(v);
	}
	return undefined;
}

function getFirstNum(fm: Record<string, unknown>, ...keys: string[]): number | undefined {
	for (const key of keys) {
		const value = getNum(fm, key);
		if (value !== undefined) return value;
	}
	return undefined;
}

function getFirstStr(fm: Record<string, unknown>, ...keys: string[]): string | undefined {
	for (const key of keys) {
		const value = getStr(fm, key);
		if (value !== undefined) return value;
	}
	return undefined;
}

function toPercentScale(value: number | undefined): number | undefined {
	if (value === undefined) return undefined;
	return value > 0 && value <= 1 ? value * 100 : value;
}

/**
 * Parse a Markdown or Bases file into a HealthDay.
 * Supports both:
 * - Bases format: flat YAML keys like sleep_total_hours, steps
 * - Markdown format: frontmatter with date/type fields
 */
export function parseMarkdown(content: string): HealthDay | null {
	const fm = parseFrontmatter(content);
	if (!fm) return null;

	// Must have a date
	const date = getStr(fm, "date");
	if (!date) return null;

	const day: HealthDay = {
		type: "health-data",
		date,
	};

	// --- Activity ---
	// Bases keys: steps, active_calories, exercise_minutes, walking_running_km, vo2_max, etc.
	// Also check JSON-style keys that might appear in frontmatter
	const steps =
		getNum(fm, "steps") ??
		getNum(fm, "activity_steps");
	if (steps !== undefined) {
		day.activity = {
			steps,
			walkingRunningDistanceKm:
				getNum(fm, "walking_running_km") ??
				getNum(fm, "walking_running_distance_km") ??
				0,
			activeCalories:
				getNum(fm, "active_calories") ??
				getNum(fm, "activity_active_calories") ??
				0,
			exerciseMinutes:
				getNum(fm, "exercise_minutes") ??
				getNum(fm, "activity_exercise_minutes") ??
				0,
			vo2Max:
				getNum(fm, "vo2_max") ??
				getNum(fm, "vo2max"),
			basalEnergyBurned: getFirstNum(
				fm,
				"basal_energy_burned",
				"basal_calories",
				"basal_energy",
				"basalEnergyBurned"
			),
			standHours: getNum(fm, "stand_hours"),
			flightsClimbed: getNum(fm, "flights_climbed"),
		};
	}

	// --- Heart ---
	const restingHR =
		getNum(fm, "resting_heart_rate") ??
		getNum(fm, "heart_resting_heart_rate");
	const avgHR =
		getNum(fm, "average_heart_rate") ??
		getNum(fm, "heart_average_heart_rate");
	const hrvVal =
		getNum(fm, "hrv_ms") ??
		getNum(fm, "hrv") ??
		getNum(fm, "heart_hrv");
	if (restingHR !== undefined || avgHR !== undefined) {
		day.heart = {
			averageHeartRate: avgHR ?? restingHR ?? 0,
			heartRateMin:
				getNum(fm, "heart_rate_min") ??
				getNum(fm, "heart_min") ??
				0,
			heartRateMax:
				getNum(fm, "heart_rate_max") ??
				getNum(fm, "heart_max") ??
				0,
			heartRateSamples: [],
			restingHeartRate: restingHR,
			walkingHeartRateAverage:
				getNum(fm, "walking_heart_rate") ??
				getNum(fm, "walking_heart_rate_average"),
			hrv: hrvVal,
		};
	}

	// --- Sleep ---
	// Bases commonly uses *_hours; JSON-style frontmatter commonly uses seconds.
	// Accept several aliases so sleep-schedule can find timing fields exported by
	// different daily-note/Bases templates.
	const sleepHours = getFirstNum(
		fm,
		"sleep_total_hours",
		"sleepTotalHours",
		"sleep_hours"
	);
	const sleepSeconds = getFirstNum(
		fm,
		"sleep_total_duration",
		"sleepTotalDuration",
		"sleep_total_seconds",
		"sleepTotalSeconds",
		"totalDuration",
		"total_duration"
	);
	const sleepTotal = sleepHours !== undefined
		? sleepHours * 3600
		: sleepSeconds;
	if (sleepTotal !== undefined) {
		const deepH = getFirstNum(fm, "sleep_deep_hours", "sleepDeepHours", "deep_sleep_hours");
		const remH = getFirstNum(fm, "sleep_rem_hours", "sleepRemHours", "rem_sleep_hours");
		const coreH = getFirstNum(
			fm,
			"sleep_core_hours",
			"sleepCoreHours",
			"core_sleep_hours",
			"sleep_light_hours",
			"sleepLightHours",
			"light_sleep_hours"
		);
		const awakeH = getFirstNum(fm, "sleep_awake_hours", "sleepAwakeHours", "awake_time_hours");
		day.sleep = {
			sleepStages: [],
			totalDuration: sleepTotal,
			deepSleep: deepH !== undefined
				? deepH * 3600
				: (getFirstNum(fm, "sleep_deep", "sleepDeep", "deepSleep", "deep_sleep") ?? 0),
			remSleep: remH !== undefined
				? remH * 3600
				: (getFirstNum(fm, "sleep_rem", "sleepRem", "remSleep", "rem_sleep") ?? 0),
			coreSleep: coreH !== undefined
				? coreH * 3600
				: (getFirstNum(
					fm,
					"sleep_core",
					"sleepCore",
					"coreSleep",
					"core_sleep",
					"sleep_light",
					"sleepLight",
					"lightSleep",
					"light_sleep"
				) ?? 0),
			awakeTime: awakeH !== undefined
				? awakeH * 3600
				: getFirstNum(fm, "sleep_awake", "sleepAwake", "awakeTime", "awake_time"),
			bedtime:
				getFirstStr(
					fm,
					"sleep_bedtime",
					"sleepBedtime",
					"bedtime",
					"bedTime",
					"sleep_start",
					"sleep_start_time",
					"sleep_session_start"
				) ?? "",
			bedtimeISO:
				getFirstStr(
					fm,
					"sleep_bedtime_iso",
					"sleepBedtimeISO",
					"bedtimeISO",
					"bed_time_iso",
					"sleep_start_iso",
					"sleep_session_start_iso"
				),
			wakeTime:
				getFirstStr(
					fm,
					"sleep_wake",
					"sleepWake",
					"sleep_wake_time",
					"wake_time",
					"wakeTime",
					"wake",
					"sleep_end",
					"sleep_end_time",
					"sleep_session_end"
				) ?? "",
			wakeTimeISO:
				getFirstStr(
					fm,
					"sleep_wake_iso",
					"sleepWakeISO",
					"sleep_wake_time_iso",
					"wake_time_iso",
					"wakeTimeISO",
					"wake_iso",
					"sleep_end_iso",
					"sleep_session_end_iso"
				),
		};
	}

	// --- Vitals ---
	const respRate = getFirstNum(
		fm,
		"respiratory_rate",
		"respiratory_rate_avg",
		"vitals_respiratory_rate"
	);
	const respiratoryRateMin = getFirstNum(fm, "respiratory_rate_min", "respiratoryRateMin");
	const respiratoryRateMax = getFirstNum(fm, "respiratory_rate_max", "respiratoryRateMax");
	const bloodOx = toPercentScale(getFirstNum(
		fm,
		"blood_oxygen",
		"blood_oxygen_avg",
		"vitals_blood_oxygen"
	));
	const bloodOxygenMin = toPercentScale(getFirstNum(fm, "blood_oxygen_min", "bloodOxygenMin"));
	const bloodOxygenMax = toPercentScale(getFirstNum(fm, "blood_oxygen_max", "bloodOxygenMax"));
	if (
		respRate !== undefined ||
		respiratoryRateMin !== undefined ||
		respiratoryRateMax !== undefined ||
		bloodOx !== undefined ||
		bloodOxygenMin !== undefined ||
		bloodOxygenMax !== undefined
	) {
		day.vitals = {
			respiratoryRate: respRate,
			respiratoryRateAvg: respRate,
			respiratoryRateMin,
			respiratoryRateMax,
			bloodOxygenPercent: bloodOx,
			bloodOxygenAvg: bloodOx,
			bloodOxygenMin,
			bloodOxygenMax,
		};
	}

	// --- Mobility ---
	const walkSpeed =
		getNum(fm, "walking_speed") ??
		getNum(fm, "mobility_walking_speed");
	if (walkSpeed !== undefined) {
		day.mobility = {
			walkingSpeed: walkSpeed,
			walkingAsymmetryPercentage:
				getNum(fm, "walking_asymmetry_percentage") ??
				getNum(fm, "walking_asymmetry_percent") ??
				getNum(fm, "walking_asymmetry") ??
				0,
			walkingStepLength: getNum(fm, "walking_step_length"),
			walkingDoubleSupportPercentage: getNum(fm, "walking_double_support_percentage"),
		};
	}

	// --- Hearing ---
	const headphone =
		getNum(fm, "headphone_audio_level") ??
		getNum(fm, "hearing_headphone_audio_level");
	if (headphone !== undefined) {
		day.hearing = { headphoneAudioLevel: headphone };
	}

	// Only return if we found at least some health data beyond just a date
	const hasData =
		day.activity || day.heart || day.sleep || day.vitals || day.mobility;
	return hasData ? day : null;
}
