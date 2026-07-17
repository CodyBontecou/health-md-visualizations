import type { HealthMdUnitMap } from "./healthmd-schema";
import type { HealthDay, HealthMetricScalar } from "./types";
import {
	BODY_METRICS,
	CYCLE_METRICS,
	CYCLING_METRICS,
	GLUCOSE_METRICS,
	HEARING_METRICS,
	IDENTITY_JSON_SECTIONS,
	JSON_SECTION_METRIC_MAP,
	MINERAL_METRICS,
	NUTRITION_MACRO_METRICS,
	RUNNING_METRICS,
	VITAMIN_METRICS,
	isMetricScalar,
} from "./metric-catalog";

const RESERVED_FLAT_KEYS = new Set([
	"schema", "schema_version", "schemaVersion", "type", "date", "unit_system", "unitSystem", "units",
	"time_context", "timeContext", "raw_capture_status", "rawCapture", "raw_record_count", "raw_query_failure_count",
	"raw_integrity_warning_count", "healthkit_record_archive", "diagnostics", "workouts", "workout_details",
	"medication_details", "medication_dose_events", "medications", "state_of_mind_entries", "mood_entries",
]);

const BUILTIN_KEYS = new Set<string>([
	...BODY_METRICS, ...RUNNING_METRICS, ...CYCLING_METRICS, ...HEARING_METRICS, ...GLUCOSE_METRICS,
	...NUTRITION_MACRO_METRICS, ...VITAMIN_METRICS, ...MINERAL_METRICS, ...CYCLE_METRICS,
	"blood_pressure_systolic", "blood_pressure_systolic_avg", "blood_pressure_systolic_min", "blood_pressure_systolic_max",
	"blood_pressure_diastolic", "blood_pressure_diastolic_avg", "blood_pressure_diastolic_min", "blood_pressure_diastolic_max",
	"vo2_max", "vo2_max_age_seconds", "vo2_max_carried_forward", "vo2_max_source_start", "vo2_max_source_end", "vo2_max_source_uuid",
	"steps", "active_calories", "exercise_minutes", "walking_running_km", "average_heart_rate", "heart_rate_min", "heart_rate_max",
	"resting_heart_rate", "walking_heart_rate", "hrv_ms", "blood_oxygen", "blood_oxygen_avg", "blood_oxygen_min", "blood_oxygen_max",
	"respiratory_rate", "respiratory_rate_avg", "respiratory_rate_min", "respiratory_rate_max", "sleep_total_hours", "sleep_bedtime", "sleep_wake",
	"headphone_audio_db", "environmental_sound_db", "medication_count", "active_medication_count", "archived_medication_count",
	"medication_dose_count", "medication_taken_count", "medication_skipped_count",
]);
for (const sectionMap of Object.values(JSON_SECTION_METRIC_MAP)) {
	for (const key of Object.values(sectionMap)) BUILTIN_KEYS.add(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function scalarFromUnknown(value: unknown): HealthMetricScalar | undefined {
	if (isMetricScalar(value)) {
		if (typeof value !== "string") return value;
		const trimmed = value.trim();
		if (!trimmed) return undefined;
		const normalized = trimmed.toLowerCase();
		if (normalized === "true") return true;
		if (normalized === "false") return false;
		const number = Number(trimmed.replace(/,/g, ""));
		return Number.isFinite(number) ? number : trimmed;
	}
	return undefined;
}

function normalizeSectionValue(section: string, canonicalKey: string, value: HealthMetricScalar): HealthMetricScalar {
	if (typeof value !== "number") return value;
	if (section === "sleep" && canonicalKey.endsWith("_hours")) return value / 3600;
	if (section === "mobility" && canonicalKey === "step_length_cm") return value * 100;
	return value;
}

/** Extract only documented daily-summary sections. Arbitrary root objects and the lossless archive are never traversed. */
export function canonicalMetricsFromSummaryRoot(root: Record<string, unknown>): Record<string, HealthMetricScalar> {
	const metrics: Record<string, HealthMetricScalar> = {};
	for (const [section, mapping] of Object.entries(JSON_SECTION_METRIC_MAP)) {
		const rawSection = root[section];
		if (!isRecord(rawSection)) continue;
		for (const [sourceKey, canonicalKey] of Object.entries(mapping)) {
			const scalar = scalarFromUnknown(rawSection[sourceKey]);
			if (scalar !== undefined) metrics[canonicalKey] = normalizeSectionValue(section, canonicalKey, scalar);
		}
	}
	for (const section of IDENTITY_JSON_SECTIONS) {
		const rawSection = root[section];
		if (!isRecord(rawSection)) continue;
		for (const [key, value] of Object.entries(rawSection)) {
			if (section === "symptoms" && !key.startsWith("symptom_")) continue;
			const scalar = scalarFromUnknown(value);
			if (scalar !== undefined) metrics[key] = scalar;
		}
	}
	return metrics;
}

/** Extract scalar canonical frontmatter/Bases values from an explicit allowlist or declared unit map. */
export function isKnownCanonicalMetricKey(key: string, units?: HealthMdUnitMap): boolean {
	return BUILTIN_KEYS.has(key) || key.startsWith("symptom_") || (units !== undefined && key in units);
}

export function canonicalMetricsFromFlatRecord(
	record: Record<string, unknown>,
	units?: HealthMdUnitMap
): Record<string, HealthMetricScalar> {
	const metrics: Record<string, HealthMetricScalar> = {};
	for (const [key, value] of Object.entries(record)) {
		if (RESERVED_FLAT_KEYS.has(key)) continue;
		const allowed = isKnownCanonicalMetricKey(key, units);
		if (!allowed) continue;
		const scalar = scalarFromUnknown(value);
		if (scalar !== undefined) metrics[key] = scalar;
	}
	return metrics;
}

/** Add stable canonical aliases for legacy typed sections without changing their original shape. */
export function canonicalMetricsFromTypedDay(day: HealthDay): Record<string, HealthMetricScalar> {
	const result = canonicalMetricsFromSummaryRoot(day as unknown as Record<string, unknown>);
	const add = (key: string, value: unknown): void => {
		const scalar = scalarFromUnknown(value);
		if (scalar !== undefined && result[key] === undefined) result[key] = scalar;
	};
	add("steps", day.activity?.steps);
	add("active_calories", day.activity?.activeCalories);
	add("exercise_minutes", day.activity?.exerciseMinutes);
	add("walking_running_km", day.activity?.walkingRunningDistanceKm);
	add("vo2_max", day.activity?.vo2Max);
	add("vo2_max_age_seconds", day.activity?.vo2MaxAgeSeconds);
	add("vo2_max_carried_forward", day.activity?.vo2MaxCarriedForward);
	add("vo2_max_source_start", day.activity?.vo2MaxSourceStartDate);
	add("vo2_max_source_end", day.activity?.vo2MaxSourceEndDate);
	add("average_heart_rate", day.heart?.averageHeartRate);
	add("heart_rate_min", day.heart?.heartRateMin);
	add("heart_rate_max", day.heart?.heartRateMax);
	add("resting_heart_rate", day.heart?.restingHeartRate);
	add("walking_heart_rate", day.heart?.walkingHeartRateAverage);
	add("hrv_ms", day.heart?.hrv);
	add("blood_oxygen_avg", day.vitals?.bloodOxygenAvg ?? day.vitals?.bloodOxygenPercent);
	add("blood_oxygen_min", day.vitals?.bloodOxygenMin);
	add("blood_oxygen_max", day.vitals?.bloodOxygenMax);
	add("respiratory_rate_avg", day.vitals?.respiratoryRateAvg ?? day.vitals?.respiratoryRate);
	add("respiratory_rate_min", day.vitals?.respiratoryRateMin);
	add("respiratory_rate_max", day.vitals?.respiratoryRateMax);
	add("walking_speed", day.mobility?.walkingSpeed);
	add("walking_asymmetry_percent", day.mobility?.walkingAsymmetryPercentage);
	add("double_support_percent", day.mobility?.walkingDoubleSupportPercentage);
	add("step_length_cm", day.mobility?.walkingStepLength === undefined ? undefined : day.mobility.walkingStepLength * 100);
	add("headphone_audio_db", day.hearing?.headphoneAudioLevel);
	add("environmental_sound_db", day.hearing?.environmentalSoundLevel);
	add("medication_count", day.medicationCount ?? day.medication_count);
	add("active_medication_count", day.activeMedicationCount ?? day.active_medication_count);
	add("archived_medication_count", day.archivedMedicationCount ?? day.archived_medication_count);
	add("medication_dose_count", day.medicationDoseCount ?? day.medication_dose_count);
	add("medication_taken_count", day.medicationTakenCount ?? day.medication_taken_count);
	add("medication_skipped_count", day.medicationSkippedCount ?? day.medication_skipped_count);
	return result;
}

export function attachCanonicalMetrics(day: HealthDay, extras?: Record<string, HealthMetricScalar>): void {
	const typed = canonicalMetricsFromTypedDay(day);
	// Format-specific typed sections have already normalized units/ratios and
	// therefore take precedence over generic scalar row extraction.
	const merged = { ...(extras ?? {}), ...typed };
	if (Object.keys(merged).length) day.canonicalMetrics = merged;
}
