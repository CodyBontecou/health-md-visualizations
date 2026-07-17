import type { HealthMetricScalar } from "./types";

export interface MetricDefinition {
	key: string;
	label: string;
	category: string;
	unit?: string;
	color?: string;
	precision?: number;
}

export const BODY_METRICS = ["weight_kg", "bmi", "body_fat_percent", "lean_body_mass_kg", "waist_circumference_cm"] as const;
export const RUNNING_METRICS = ["running_speed", "running_power_w", "running_stride_length_m", "running_ground_contact_ms", "running_vertical_oscillation_cm"] as const;
export const CYCLING_METRICS = ["cycling_power_w", "cycling_ftp_w", "cycling_cadence_rpm", "cycling_speed", "cycling_km"] as const;
export const HEARING_METRICS = ["headphone_audio_db", "environmental_sound_db"] as const;
export const BLOOD_PRESSURE_METRICS = [
	"blood_pressure_systolic_min", "blood_pressure_systolic_avg", "blood_pressure_systolic_max",
	"blood_pressure_diastolic_min", "blood_pressure_diastolic_avg", "blood_pressure_diastolic_max",
] as const;
export const GLUCOSE_METRICS = ["blood_glucose_min", "blood_glucose_avg", "blood_glucose_max"] as const;
export const NUTRITION_MACRO_METRICS = [
	"dietary_calories", "protein_g", "carbohydrates_g", "fat_g", "fiber_g", "sugar_g", "sodium_mg", "water_l", "caffeine_mg",
] as const;
export const VITAMIN_METRICS = [
	"vitamin_a_ug", "thiamin_mg", "riboflavin_mg", "niacin_mg", "pantothenic_acid_mg", "vitamin_b6_mg", "biotin_ug", "folate_ug", "vitamin_b12_ug", "vitamin_c_mg", "vitamin_d_ug", "vitamin_e_mg", "vitamin_k_ug",
] as const;
export const MINERAL_METRICS = [
	"calcium_mg", "chloride_mg", "chromium_ug", "copper_mg", "iodine_ug", "iron_mg", "magnesium_mg", "manganese_mg", "molybdenum_ug", "phosphorus_mg", "potassium_mg", "selenium_ug", "zinc_mg",
] as const;
export const CYCLE_METRICS = ["menstrual_flow", "cervical_mucus", "ovulation_test", "intermenstrual_bleeding"] as const;

const SPECIAL_DEFINITIONS: Record<string, Omit<MetricDefinition, "key">> = {
	vo2_max: { label: "Cardio Fitness", category: "Activity", unit: "mL/kg/min", color: "#fa114f", precision: 1 },
	vo2_max_age_seconds: { label: "Measurement Age", category: "Activity", unit: "seconds", precision: 0 },
	vo2_max_carried_forward: { label: "Carried Forward", category: "Activity", unit: "boolean" },
	vo2_max_source_start: { label: "Measurement Time", category: "Activity", unit: "datetime" },
	weight_kg: { label: "Weight", category: "Body Measurements", unit: "kg", color: "#5b8ff9", precision: 1 },
	bmi: { label: "BMI", category: "Body Measurements", unit: "kg/m²", color: "#61d9a5", precision: 1 },
	body_fat_percent: { label: "Body Fat", category: "Body Measurements", unit: "percent", color: "#f6bd16", precision: 1 },
	lean_body_mass_kg: { label: "Lean Body Mass", category: "Body Measurements", unit: "kg", color: "#7262fd", precision: 1 },
	waist_circumference_cm: { label: "Waist Circumference", category: "Body Measurements", unit: "cm", color: "#78d3f8", precision: 1 },
	blood_glucose_avg: { label: "Average Blood Glucose", category: "Vitals", unit: "mg/dL", color: "#f08bb4", precision: 0 },
	blood_glucose_min: { label: "Minimum Blood Glucose", category: "Vitals", unit: "mg/dL", color: "#f08bb4", precision: 0 },
	blood_glucose_max: { label: "Maximum Blood Glucose", category: "Vitals", unit: "mg/dL", color: "#f08bb4", precision: 0 },
	blood_pressure_systolic_avg: { label: "Average Systolic", category: "Vitals", unit: "mmHg", color: "#fa114f", precision: 0 },
	blood_pressure_diastolic_avg: { label: "Average Diastolic", category: "Vitals", unit: "mmHg", color: "#5b8ff9", precision: 0 },
	running_speed: { label: "Running Speed", category: "Mobility", unit: "m/s", precision: 2 },
	running_power_w: { label: "Running Power", category: "Mobility", unit: "W", precision: 0 },
	running_stride_length_m: { label: "Running Stride Length", category: "Mobility", unit: "m", precision: 2 },
	running_ground_contact_ms: { label: "Ground Contact Time", category: "Mobility", unit: "ms", precision: 0 },
	running_vertical_oscillation_cm: { label: "Vertical Oscillation", category: "Mobility", unit: "cm", precision: 1 },
	cycling_power_w: { label: "Cycling Power", category: "Cycling", unit: "W", precision: 0 },
	cycling_ftp_w: { label: "Cycling FTP", category: "Cycling", unit: "W", precision: 0 },
	cycling_cadence_rpm: { label: "Cycling Cadence", category: "Cycling", unit: "rpm", precision: 0 },
	cycling_speed: { label: "Cycling Speed", category: "Cycling", unit: "m/s", precision: 2 },
	cycling_km: { label: "Cycling Distance", category: "Cycling", unit: "km", precision: 1 },
	headphone_audio_db: { label: "Headphone Audio", category: "Hearing", unit: "dB", color: "#7262fd", precision: 1 },
	environmental_sound_db: { label: "Environmental Sound", category: "Hearing", unit: "dB", color: "#61d9a5", precision: 1 },
	menstrual_flow: { label: "Menstrual Flow", category: "Reproductive Health" },
	cervical_mucus: { label: "Cervical Mucus", category: "Reproductive Health" },
	ovulation_test: { label: "Ovulation Test", category: "Reproductive Health" },
	intermenstrual_bleeding: { label: "Intermenstrual Bleeding", category: "Reproductive Health" },
};

function normalizeCsvText(value: string): string {
	return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const CSV_ALIASES: Record<string, string> = {
	"body|weight": "weight_kg", "body|body_mass_index": "bmi", "body|bmi": "bmi",
	"body|body_fat_percentage": "body_fat_percent", "body|lean_body_mass": "lean_body_mass_kg",
	"body|waist_circumference": "waist_circumference_cm", "activity|vo2_max_age": "vo2_max_age_seconds",
	"activity|walking_running_distance": "walking_running_km", "activity|wheelchair_distance": "wheelchair_km",
	"activity|downhill_snow_sports_distance": "downhill_snow_km",
	"mobility|walking_step_length": "step_length_cm",
	"sleep|total_duration": "sleep_total_hours", "sleep|deep_sleep": "sleep_deep_hours", "sleep|rem_sleep": "sleep_rem_hours",
	"sleep|core_sleep": "sleep_core_hours", "sleep|light_sleep": "sleep_core_hours", "sleep|awake_time": "sleep_awake_hours",
	"sleep|in_bed_time": "sleep_in_bed_hours",
	"mindfulness|average_mood_valence": "average_mood_valence",
	"mobility|running_speed": "running_speed", "mobility|running_power": "running_power_w",
	"mobility|running_stride_length": "running_stride_length_m", "mobility|running_ground_contact_time": "running_ground_contact_ms",
	"mobility|running_vertical_oscillation": "running_vertical_oscillation_cm",
	"cycling|cycling_distance": "cycling_km", "cycling|cycling_speed": "cycling_speed", "cycling|cycling_power": "cycling_power_w",
	"cycling|cycling_cadence": "cycling_cadence_rpm", "cycling|functional_threshold_power": "cycling_ftp_w",
	"hearing|headphone_audio_level": "headphone_audio_db", "hearing|environmental_sound_level": "environmental_sound_db",
	"reproductive_health|menstrual_flow": "menstrual_flow", "reproductive_health|cervical_mucus_quality": "cervical_mucus",
	"reproductive_health|ovulation_test_result": "ovulation_test", "reproductive_health|spotting": "intermenstrual_bleeding",
	"nutrition|dietary_energy": "dietary_calories", "nutrition|protein": "protein_g", "nutrition|carbohydrates": "carbohydrates_g",
	"nutrition|fat": "fat_g", "nutrition|saturated_fat": "saturated_fat_g", "nutrition|fiber": "fiber_g",
	"nutrition|sugar": "sugar_g", "nutrition|sodium": "sodium_mg", "nutrition|cholesterol": "cholesterol_mg",
	"nutrition|water": "water_l", "nutrition|caffeine": "caffeine_mg", "nutrition|monounsaturated_fat": "monounsaturated_fat_g",
	"nutrition|polyunsaturated_fat": "polyunsaturated_fat_g",
	"vitamins|vitamin_a": "vitamin_a_ug", "vitamins|vitamin_b6": "vitamin_b6_mg", "vitamins|vitamin_b12": "vitamin_b12_ug",
	"vitamins|vitamin_c": "vitamin_c_mg", "vitamins|vitamin_d": "vitamin_d_ug", "vitamins|vitamin_e": "vitamin_e_mg",
	"vitamins|vitamin_k": "vitamin_k_ug", "vitamins|thiamin_b1": "thiamin_mg", "vitamins|riboflavin_b2": "riboflavin_mg",
	"vitamins|niacin_b3": "niacin_mg", "vitamins|folate": "folate_ug", "vitamins|biotin": "biotin_ug",
	"vitamins|pantothenic_acid_b5": "pantothenic_acid_mg",
};

export function canonicalMetricKeyFromCsvLabel(category: string, metric: string, unit: string): string | undefined {
	const normalizedCategory = normalizeCsvText(category);
	const normalizedMetric = normalizeCsvText(metric);
	const alias = CSV_ALIASES[`${normalizedCategory}|${normalizedMetric}`];
	if (alias) return alias;
	if (normalizedCategory === "symptoms") return `symptom_${normalizedMetric}`;
	if (normalizedCategory === "vitamins" || normalizedCategory === "minerals") {
		const base = normalizedMetric.replace(/_b\d+$/, "");
		const suffix = unit.trim().toLowerCase() === "µg" || unit.trim().toLowerCase() === "mcg" ? "ug" : normalizeCsvText(unit);
		return suffix ? `${base}_${suffix}` : base;
	}
	return undefined;
}

export function humanizeMetricKey(key: string): string {
	return key
		.replace(/^symptom_/, "")
		.replace(/_(kg|mg|ug|iu|db|cm|km|ms|rpm|w|l|m)$/i, "")
		.split("_")
		.filter(Boolean)
		.map((word) => word.length <= 3 && ["bmi", "hrv", "ftp", "uv"].includes(word.toLowerCase())
			? word.toUpperCase()
			: word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function inferredUnit(key: string): string | undefined {
	if (key.startsWith("symptom_")) return "count";
	if (key.endsWith("_percent")) return "percent";
	if (key.endsWith("_ug")) return "µg";
	if (key.endsWith("_mg")) return "mg";
	if (key.endsWith("_kg")) return "kg";
	if (key.endsWith("_cm")) return "cm";
	if (key.endsWith("_km")) return "km";
	if (key.endsWith("_rpm")) return "rpm";
	if (key.endsWith("_db")) return "dB";
	if (key.endsWith("_iu")) return "IU";
	if (key.endsWith("_w")) return "W";
	if (key.endsWith("_l")) return "L";
	if (key.endsWith("_g")) return "g";
	return undefined;
}

export function builtinMetricDefinition(key: string): MetricDefinition {
	const special = SPECIAL_DEFINITIONS[key];
	if (special) return { key, ...special };
	let category = "Health";
	if (key.startsWith("symptom_")) category = "Symptoms";
	else if ((NUTRITION_MACRO_METRICS as readonly string[]).includes(key)) category = "Nutrition";
	else if ((VITAMIN_METRICS as readonly string[]).includes(key)) category = "Vitamins";
	else if ((MINERAL_METRICS as readonly string[]).includes(key)) category = "Minerals";
	else if (key.startsWith("blood_") || key.includes("temperature") || key.includes("respiratory")) category = "Vitals";
	return { key, label: humanizeMetricKey(key), category, unit: inferredUnit(key) };
}

export const JSON_SECTION_METRIC_MAP: Record<string, Record<string, string>> = {
	activity: {
		activeCalories: "active_calories", basalEnergyBurned: "basal_calories", cyclingDistanceKm: "cycling_km",
		downhillSnowSportsDistanceKm: "downhill_snow_km", exerciseMinutes: "exercise_minutes", flightsClimbed: "flights_climbed",
		moveMinutes: "move_minutes", physicalEffort: "physical_effort", pushCount: "wheelchair_pushes", standHours: "stand_hours",
		standTimeMinutes: "stand_time_minutes", steps: "steps", swimmingDistance: "swimming_m", swimmingStrokes: "swimming_strokes",
		vo2Max: "vo2_max", vo2MaxAgeSeconds: "vo2_max_age_seconds", vo2MaxCarriedForward: "vo2_max_carried_forward",
		vo2MaxSourceStartDate: "vo2_max_source_start", vo2MaxSourceEndDate: "vo2_max_source_end", vo2MaxSourceUUID: "vo2_max_source_uuid",
		walkingRunningDistanceKm: "walking_running_km", wheelchairDistanceKm: "wheelchair_km",
	},
	heart: {
		atrialFibrillationBurdenPercent: "afib_burden_percent", averageHeartRate: "average_heart_rate", heartRateMax: "heart_rate_max",
		heartRateMin: "heart_rate_min", heartRateRecovery: "heart_rate_recovery", hrv: "hrv_ms", restingHeartRate: "resting_heart_rate",
		walkingHeartRateAverage: "walking_heart_rate",
	},
	vitals: {
		basalBodyTemperature: "basal_body_temperature", bloodGlucose: "blood_glucose", bloodGlucoseAvg: "blood_glucose_avg",
		bloodGlucoseMin: "blood_glucose_min", bloodGlucoseMax: "blood_glucose_max", bloodOxygenPercent: "blood_oxygen",
		bloodOxygenAvg: "blood_oxygen_avg", bloodOxygenMin: "blood_oxygen_min", bloodOxygenMax: "blood_oxygen_max",
		bloodPressureSystolic: "blood_pressure_systolic", bloodPressureSystolicAvg: "blood_pressure_systolic_avg",
		bloodPressureSystolicMin: "blood_pressure_systolic_min", bloodPressureSystolicMax: "blood_pressure_systolic_max",
		bloodPressureDiastolic: "blood_pressure_diastolic", bloodPressureDiastolicAvg: "blood_pressure_diastolic_avg",
		bloodPressureDiastolicMin: "blood_pressure_diastolic_min", bloodPressureDiastolicMax: "blood_pressure_diastolic_max",
		bodyTemperature: "body_temperature", bodyTemperatureAvg: "body_temperature_avg", bodyTemperatureMin: "body_temperature_min",
		bodyTemperatureMax: "body_temperature_max", electrodermalActivity: "electrodermal_activity", fev1L: "fev1_l",
		forcedVitalCapacityL: "forced_vital_capacity_l", inhalerUsage: "inhaler_usage", peakExpiratoryFlow: "peak_expiratory_flow",
		respiratoryRate: "respiratory_rate", respiratoryRateAvg: "respiratory_rate_avg", respiratoryRateMin: "respiratory_rate_min",
		respiratoryRateMax: "respiratory_rate_max", wristTemperature: "wrist_temperature",
	},
	body: {
		bmi: "bmi", bodyFatPercent: "body_fat_percent", height: "height_m",
		leanBodyMass: "lean_body_mass_kg", waistCircumference: "waist_circumference_cm", weight: "weight_kg",
	},
	nutrition: {
		caffeine: "caffeine_mg", carbohydrates: "carbohydrates_g", cholesterol: "cholesterol_mg", dietaryEnergy: "dietary_calories",
		fat: "fat_g", fiber: "fiber_g", monounsaturatedFat: "monounsaturated_fat_g", polyunsaturatedFat: "polyunsaturated_fat_g",
		protein: "protein_g", saturatedFat: "saturated_fat_g", sodium: "sodium_mg", sugar: "sugar_g", water: "water_l",
	},
	mindfulness: {
		averageValencePercent: "average_mood_percent", averageValence: "average_mood_valence", dailyMoodCount: "daily_mood_count",
		mindfulMinutes: "mindful_minutes", mindfulSessions: "mindful_sessions", momentaryEmotionCount: "momentary_emotion_count",
		stateOfMindCount: "mood_entries",
	},
	mobility: {
		runningGroundContactMs: "running_ground_contact_ms", runningPowerW: "running_power_w", runningSpeed: "running_speed",
		runningStrideLengthM: "running_stride_length_m", runningVerticalOscillationCm: "running_vertical_oscillation_cm",
		sixMinuteWalkDistance: "six_min_walk_m", stairAscentSpeed: "stair_ascent_speed", stairDescentSpeed: "stair_descent_speed",
		walkingAsymmetryPercentage: "walking_asymmetry_percent", walkingDoubleSupportPercentage: "double_support_percent",
		walkingSpeed: "walking_speed", walkingSteadinessPercent: "walking_steadiness_percent", walkingStepLength: "step_length_cm",
	},
	sleep: {
		awakeTime: "sleep_awake_hours", bedtime: "sleep_bedtime", coreSleep: "sleep_core_hours", deepSleep: "sleep_deep_hours",
		inBedTime: "sleep_in_bed_hours", remSleep: "sleep_rem_hours", totalDuration: "sleep_total_hours", wakeTime: "sleep_wake",
	},
	hearing: { environmentalSoundLevel: "environmental_sound_db", headphoneAudioLevel: "headphone_audio_db" },
	cyclingPerformance: {
		cycling_cadence_rpm: "cycling_cadence_rpm", cycling_ftp_w: "cycling_ftp_w", cycling_km: "cycling_km",
		cycling_power_w: "cycling_power_w", cycling_speed: "cycling_speed",
	},
	reproductiveHealth: {
		cervical_mucus: "cervical_mucus", intermenstrual_bleeding: "intermenstrual_bleeding", menstrual_flow: "menstrual_flow",
		ovulation_test: "ovulation_test", sexual_activity: "sexual_activity",
	},
};

export const IDENTITY_JSON_SECTIONS = new Set(["vitamins", "minerals", "symptoms", "other"]);

export function isMetricScalar(value: unknown): value is HealthMetricScalar {
	return typeof value === "number" && Number.isFinite(value) || typeof value === "string" || typeof value === "boolean";
}
