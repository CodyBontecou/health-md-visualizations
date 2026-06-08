import { HealthDay } from "../types";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord | undefined {
	return isRecord(value) ? value : undefined;
}

function asRecordArray(value: unknown): JsonRecord[] | undefined {
	if (!Array.isArray(value)) return undefined;
	return value.filter(isRecord);
}

function getNumber(record: JsonRecord, key: string): number | undefined {
	const value = record[key];
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function getString(record: JsonRecord, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function firstNumber(record: JsonRecord, ...keys: string[]): number | undefined {
	for (const key of keys) {
		const value = getNumber(record, key);
		if (value !== undefined) return value;
	}
	return undefined;
}

function firstString(record: JsonRecord, ...keys: string[]): string | undefined {
	for (const key of keys) {
		const value = getString(record, key);
		if (value !== undefined) return value;
	}
	return undefined;
}

function copyIfMissing(record: JsonRecord, targetKey: string, sourceKey: string): void {
	if (record[targetKey] === undefined && record[sourceKey] !== undefined) {
		record[targetKey] = record[sourceKey];
	}
}

function toPercentScale(value: number): number {
	// HealthKit JSON stores SpO₂ as a fraction (0.97), while the plugin's
	// visualizations use percent-scale values (97). Existing mock, CSV, and
	// Bases data may already be percent-scale, so only lift fraction-like values.
	return value > 0 && value <= 1 ? value * 100 : value;
}

function normalizeClockTimestamp(raw: string, fallbackDate: string): string {
	const value = raw.trim();
	if (!value) return raw;

	const timeOnly = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
	if (timeOnly) {
		const hour = timeOnly[1].padStart(2, "0");
		const minute = timeOnly[2];
		const second = timeOnly[3] ?? "00";
		return `${fallbackDate}T${hour}:${minute}:${second}`;
	}

	// Preserve ISO-like timestamps exactly. Obsidian/browser Date parsing handles
	// both timezone-qualified and local ISO strings, and preserving the original
	// avoids shifting no-timezone app exports to UTC.
	if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value;

	const parsed = Date.parse(value);
	if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
	return raw;
}

function normalizeTimeSeriesSamples(
	value: unknown,
	date: string,
	valueKeys: string[],
	valueNormalizer: (value: number) => number = (sampleValue) => sampleValue
): JsonRecord[] | undefined {
	const samples = asRecordArray(value);
	if (!samples) return undefined;

	for (const sample of samples) {
		const timestamp = firstString(sample, "timestamp", "time", "startTime", "startDate");
		if (timestamp !== undefined) {
			sample.timestamp = normalizeClockTimestamp(timestamp, date);
		}

		const sampleValue = firstNumber(sample, ...valueKeys);
		if (sampleValue !== undefined) {
			sample.value = valueNormalizer(sampleValue);
		}
	}
	return samples;
}

function normalizeSleepStages(value: unknown, date: string): JsonRecord[] | undefined {
	const stages = asRecordArray(value);
	if (!stages) return undefined;

	for (const stage of stages) {
		const stageName = getString(stage, "stage")?.toLowerCase();
		if (stageName === "light") {
			// Health Connect's light sleep bucket maps to Apple's/plugin's Core sleep.
			stage.stage = "core";
		}

		const start = firstString(stage, "startDate", "startTime", "timestamp", "time");
		const end = firstString(stage, "endDate", "endTime");
		if (start !== undefined) stage.startDate = normalizeClockTimestamp(start, date);
		if (end !== undefined) stage.endDate = normalizeClockTimestamp(end, date);

		const duration = firstNumber(stage, "durationSeconds", "duration", "durationSecs");
		if (duration !== undefined) {
			stage.durationSeconds = duration;
		} else if (typeof stage.startDate === "string" && typeof stage.endDate === "string") {
			const startMs = Date.parse(stage.startDate);
			let endMs = Date.parse(stage.endDate);
			if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
				if (endMs <= startMs) endMs += 86_400_000;
				if (endMs > startMs) {
					stage.endDate = new Date(endMs).toISOString();
					stage.durationSeconds = (endMs - startMs) / 1000;
				}
			}
		}
	}

	return stages;
}

function normalizeSleep(sleep: JsonRecord, date: string): void {
	copyIfMissing(sleep, "sleepStages", "stages");
	copyIfMissing(sleep, "coreSleep", "lightSleep");
	copyIfMissing(sleep, "coreSleepFormatted", "lightSleepFormatted");

	const stages = normalizeSleepStages(sleep.sleepStages, date);
	if (stages) sleep.sleepStages = stages;
}

function normalizeActivity(day: JsonRecord): void {
	const activity = asRecord(day.activity);
	if (!activity) return;

	const mobility = asRecord(day.mobility);
	if (getNumber(activity, "vo2Max") === undefined && mobility) {
		const vo2Max = getNumber(mobility, "vo2Max");
		if (vo2Max !== undefined) activity.vo2Max = vo2Max;
	}
	copyIfMissing(activity, "pushCount", "wheelchairPushes");
}

function normalizeHeart(heart: JsonRecord, date: string): void {
	const heartRateSamples = normalizeTimeSeriesSamples(
		heart.heartRateSamples,
		date,
		["value", "bpm"]
	);
	if (heartRateSamples) heart.heartRateSamples = heartRateSamples;

	const hrvSamples = normalizeTimeSeriesSamples(heart.hrvSamples, date, ["value", "ms"]);
	if (hrvSamples) heart.hrvSamples = hrvSamples;
}

function normalizeVitals(vitals: JsonRecord, date: string): void {
	const respiratoryRate = firstNumber(vitals, "respiratoryRateAvg", "respiratoryRate");
	if (respiratoryRate !== undefined) {
		vitals.respiratoryRateAvg = respiratoryRate;
		vitals.respiratoryRate = respiratoryRate;
	}

	const bloodOxygenAvg = firstNumber(
		vitals,
		"bloodOxygenAvg",
		"bloodOxygen",
		"bloodOxygenPercent"
	);
	if (bloodOxygenAvg !== undefined) {
		const percent = toPercentScale(bloodOxygenAvg);
		vitals.bloodOxygenAvg = percent;
		vitals.bloodOxygen = percent;
		vitals.bloodOxygenPercent = percent;
	}

	const bloodOxygenMin = firstNumber(vitals, "bloodOxygenMin", "bloodOxygenMinPercent");
	if (bloodOxygenMin !== undefined) {
		const percent = toPercentScale(bloodOxygenMin);
		vitals.bloodOxygenMin = percent;
		vitals.bloodOxygenMinPercent = percent;
	}

	const bloodOxygenMax = firstNumber(vitals, "bloodOxygenMax", "bloodOxygenMaxPercent");
	if (bloodOxygenMax !== undefined) {
		const percent = toPercentScale(bloodOxygenMax);
		vitals.bloodOxygenMax = percent;
		vitals.bloodOxygenMaxPercent = percent;
	}

	const bloodOxygenSamples = normalizeTimeSeriesSamples(
		vitals.bloodOxygenSamples,
		date,
		["value", "percent"],
		toPercentScale
	);
	if (bloodOxygenSamples) vitals.bloodOxygenSamples = bloodOxygenSamples;

	const respiratoryRateSamples = normalizeTimeSeriesSamples(
		vitals.respiratoryRateSamples,
		date,
		["value", "breathsPerMin"]
	);
	if (respiratoryRateSamples) vitals.respiratoryRateSamples = respiratoryRateSamples;

	const bloodGlucoseSamples = normalizeTimeSeriesSamples(
		vitals.bloodGlucoseSamples,
		date,
		["value", "mgPerDl"]
	);
	if (bloodGlucoseSamples) vitals.bloodGlucoseSamples = bloodGlucoseSamples;
}

function normalizeMindfulness(mindfulness: JsonRecord): void {
	copyIfMissing(mindfulness, "mindfulMinutes", "mindfulnessMinutes");
}

function normalizeHealthDay(day: HealthDay & JsonRecord): HealthDay {
	const date = typeof day.date === "string" ? day.date : String(day.date);
	day.date = date;

	const sleep = asRecord(day.sleep);
	if (sleep) normalizeSleep(sleep, date);

	normalizeActivity(day);

	const heart = asRecord(day.heart);
	if (heart) normalizeHeart(heart, date);

	const vitals = asRecord(day.vitals);
	if (vitals) normalizeVitals(vitals, date);

	const mindfulness = asRecord(day.mindfulness);
	if (mindfulness) normalizeMindfulness(mindfulness);

	return day;
}

export function parseJSON(content: string): HealthDay | null {
	try {
		const parsed = JSON.parse(content) as { type?: unknown; date?: unknown } & JsonRecord;
		if (parsed.type === "health-data" && parsed.date) {
			return normalizeHealthDay(parsed as HealthDay & JsonRecord);
		}
		return null;
	} catch {
		return null;
	}
}
