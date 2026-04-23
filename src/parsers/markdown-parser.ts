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
			basalEnergyBurned: getNum(fm, "basal_energy_burned"),
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
	// Bases uses hours; JSON uses seconds. Detect which.
	const sleepHours = getNum(fm, "sleep_total_hours");
	const sleepSeconds = getNum(fm, "sleep_total_duration");
	const sleepTotal = sleepHours !== undefined
		? sleepHours * 3600
		: sleepSeconds;
	if (sleepTotal !== undefined) {
		const deepH = getNum(fm, "sleep_deep_hours");
		const remH = getNum(fm, "sleep_rem_hours");
		const coreH = getNum(fm, "sleep_core_hours");
		const awakeH = getNum(fm, "sleep_awake_hours");
		day.sleep = {
			sleepStages: [],
			totalDuration: sleepTotal,
			deepSleep: deepH !== undefined ? deepH * 3600 : (getNum(fm, "sleep_deep") ?? 0),
			remSleep: remH !== undefined ? remH * 3600 : (getNum(fm, "sleep_rem") ?? 0),
			coreSleep: coreH !== undefined ? coreH * 3600 : (getNum(fm, "sleep_core") ?? 0),
			awakeTime: awakeH !== undefined ? awakeH * 3600 : getNum(fm, "sleep_awake"),
			bedtime:
				getStr(fm, "sleep_bedtime") ??
				getStr(fm, "bedtime") ??
				"",
			wakeTime:
				getStr(fm, "sleep_wake") ??
				getStr(fm, "wake_time") ??
				"",
		};
	}

	// --- Vitals ---
	const respRate =
		getNum(fm, "respiratory_rate") ??
		getNum(fm, "vitals_respiratory_rate");
	const bloodOx =
		getNum(fm, "blood_oxygen") ??
		getNum(fm, "blood_oxygen_avg") ??
		getNum(fm, "vitals_blood_oxygen");
	if (respRate !== undefined || bloodOx !== undefined) {
		day.vitals = {
			respiratoryRate: respRate,
			bloodOxygenPercent: bloodOx,
			bloodOxygenAvg: bloodOx,
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
