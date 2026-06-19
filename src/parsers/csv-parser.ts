import {
	HEALTHMD_HEALTH_DATA_SCHEMA,
	HEALTHMD_ROLLUP_SCHEMA,
	detectCsvSchema,
	schemaVersionOf,
} from "../healthmd-schema";
import { HealthDay, MoodEntry, TimeSeriesSample } from "../types";
import { createMoodSummary, normalizeMoodValence, stringArrayFromUnknown } from "../mood-utils";

interface CsvRow {
	date: string;
	category: string;
	metric: string;
	value: string;
	unit: string;
	timestamp?: string;
}

interface CsvLookup {
	category: string;
	metric: string;
}

function parseCsvLine(line: string): string[] {
	const fields: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		const next = line[i + 1];

		if (char === '"') {
			if (inQuotes && next === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
			continue;
		}

		if (char === "," && !inQuotes) {
			fields.push(current);
			current = "";
			continue;
		}

		current += char;
	}

	fields.push(current);
	return fields;
}

function parseRows(content: string): CsvRow[] {
	const lines = content.split(/\r?\n/).filter((l) => l.trim());
	if (lines.length < 2) return [];

	// Skip header row. Health.md daily CSV exports currently use:
	// Date,Category,Metric,Value,Unit,Timestamp
	// Older exports may omit Timestamp; keep accepting both. Schema v1 roll-up
	// CSVs use a different Period/Metric header and are intentionally ignored by
	// the daily visualization parser.
	const header = parseCsvLine(lines[0]).map(normalizeLabel);
	if (header[0] !== "date" || header[1] !== "category" || header[2] !== "metric" || header[3] !== "value" || header[4] !== "unit") {
		return [];
	}

	const rows: CsvRow[] = [];
	for (let i = 1; i < lines.length; i++) {
		const parts = parseCsvLine(lines[i]);
		if (parts.length >= 5) {
			rows.push({
				date: parts[0].trim(),
				category: parts[1].trim(),
				metric: parts[2].trim(),
				value: parts[3].trim(),
				unit: parts[4].trim(),
				timestamp: parts[5]?.trim(),
			});
		}
	}
	return rows;
}

function normalizeLabel(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function rowMatches(row: CsvRow, lookup: CsvLookup): boolean {
	return (
		normalizeLabel(row.category) === normalizeLabel(lookup.category) &&
		normalizeLabel(row.metric) === normalizeLabel(lookup.metric)
	);
}

function findRow(rows: CsvRow[], lookups: CsvLookup[]): CsvRow | undefined {
	for (const lookup of lookups) {
		const row = rows.find((candidate) => rowMatches(candidate, lookup));
		if (row) return row;
	}
	return undefined;
}

function findRows(rows: CsvRow[], lookups: CsvLookup[]): CsvRow[] {
	const matches: CsvRow[] = [];
	for (const row of rows) {
		if (lookups.some((lookup) => rowMatches(row, lookup))) {
			matches.push(row);
		}
	}
	return matches;
}

function parseNumber(value: string): number | undefined {
	const num = parseFloat(value.replace(/,/g, ""));
	return isNaN(num) ? undefined : num;
}

function getNumFromLookups(rows: CsvRow[], lookups: CsvLookup[]): number | undefined {
	const row = findRow(rows, lookups);
	if (!row) return undefined;
	return parseNumber(row.value);
}

function getStringFromLookups(rows: CsvRow[], lookups: CsvLookup[]): string | undefined {
	const row = findRow(rows, lookups);
	return row?.value;
}

function getNum(rows: CsvRow[], category: string, metric: string): number | undefined {
	return getNumFromLookups(rows, [{ category, metric }]);
}

function getString(rows: CsvRow[], category: string, metric: string): string | undefined {
	return getStringFromLookups(rows, [{ category, metric }]);
}

function lookup(category: string, metric: string): CsvLookup {
	return { category, metric };
}

function normalizeDistanceKm(row: CsvRow | undefined): number | undefined {
	if (!row) return undefined;
	const value = parseNumber(row.value);
	if (value === undefined) return undefined;

	const unit = normalizeLabel(row.unit);
	if (unit === "km" || unit.includes("kilometer")) return value;
	if (unit === "mi" || unit.includes("mile")) return value * 1.609344;
	if (unit === "m" || unit.includes("meter") || value > 100) return value / 1000;
	return value;
}

function normalizePercent(value: number | undefined): number | undefined {
	if (value === undefined) return undefined;
	// HealthKit JSON stores SpO2 as a 0-1 fraction while CSV exports often store
	// 0-100 percentages. Some Android granular CSV rows use fraction-shaped values
	// with a percent unit, so accept either scale and normalize for visualizations.
	return value > 0 && value <= 1 ? value * 100 : value;
}

function average(values: number[]): number | undefined {
	if (!values.length) return undefined;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatLocalDateTime(ms: number): string {
	const d = new Date(ms);
	const yyyy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	const hh = String(d.getHours()).padStart(2, "0");
	const min = String(d.getMinutes()).padStart(2, "0");
	const sec = String(d.getSeconds()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}T${hh}:${min}:${sec}`;
}

function timestampFromClock(date: string, rawClock: string): string | undefined {
	const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(rawClock.trim());
	if (!match) return undefined;
	const h = Number(match[1]);
	const m = Number(match[2]);
	const s = Number(match[3] ?? 0);
	if (h > 23 || m > 59 || s > 59) return undefined;
	return `${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function normalizeTimestamp(date: string, raw: string | undefined): string | undefined {
	const value = raw?.trim();
	if (!value) return undefined;
	if (isFinite(Date.parse(value))) return value;
	return timestampFromClock(date, value);
}

function samplesFromRows(
	rows: CsvRow[],
	lookups: CsvLookup[],
	transformValue: (value: number) => number | undefined = (value) => value
): TimeSeriesSample[] {
	const samples: TimeSeriesSample[] = [];
	for (const row of findRows(rows, lookups)) {
		const parsedValue = parseNumber(row.value);
		const timestamp = normalizeTimestamp(row.date, row.timestamp);
		if (parsedValue === undefined || !timestamp) continue;
		const value = transformValue(parsedValue);
		if (value === undefined) continue;
		samples.push({ timestamp, value });
	}
	return samples.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function isMoodRow(row: CsvRow): boolean {
	const category = normalizeLabel(row.category);
	const metric = normalizeLabel(row.metric);
	return (
		category === "mood" ||
		category === "state of mind" ||
		category === "mental wellbeing" ||
		category === "mental well-being" ||
		category.includes("mood") ||
		category.includes("state of mind") ||
		metric.includes("mood") ||
		metric.includes("state of mind")
	);
}

function csvMoodKind(metric: string): string | undefined {
	if (metric.includes("daily")) return "dailyMood";
	if (metric.includes("momentary") || metric.includes("emotion")) return "momentaryEmotion";
	return undefined;
}

function moodEntryFromRow(row: CsvRow): MoodEntry | null {
	const metric = normalizeLabel(row.metric);
	const value = row.value.trim();
	if (!value) return null;

	const timestamp = normalizeTimestamp(row.date, row.timestamp) ?? `${row.date}T12:00:00`;
	const isScore = metric.includes("score") || metric.includes("rating");
	const isLabel = metric.includes("label") || metric.includes("emotion") || metric.includes("feeling") || metric.includes("classification");
	const labels = isLabel ? stringArrayFromUnknown(value) : [];
	const associations = metric.includes("association") || metric.includes("context") || metric.includes("factor")
		? stringArrayFromUnknown(value)
		: [];
	const label = labels[0] ?? (parseNumber(value) === undefined ? value : undefined);
	const valence = normalizeMoodValence(value, isScore ? "score" : isLabel ? "label" : "valence") ??
		normalizeMoodValence(label, "label");
	const score = isScore ? parseNumber(value) : undefined;

	if (valence === undefined && !label && !labels.length && !associations.length) return null;
	return {
		timestamp,
		startDate: timestamp,
		kind: csvMoodKind(metric),
		valence,
		score,
		label,
		labels: labels.length ? labels : undefined,
		associations: associations.length ? associations : undefined,
	};
}

function parseMoodEntries(rows: CsvRow[]): MoodEntry[] {
	const entries: MoodEntry[] = [];
	const pendingByTimestamp = new Map<string, MoodEntry>();
	for (const row of rows) {
		if (!isMoodRow(row)) continue;
		const entry = moodEntryFromRow(row);
		if (!entry) continue;
		const timestamp = entry.timestamp ?? entry.startDate ?? row.date;
		const existing = pendingByTimestamp.get(timestamp);
		if (!existing) {
			pendingByTimestamp.set(timestamp, entry);
			continue;
		}
		pendingByTimestamp.set(timestamp, {
			...existing,
			...entry,
			valence: existing.valence ?? entry.valence,
			score: existing.score ?? entry.score,
			label: existing.label ?? entry.label,
			labels: [...(existing.labels ?? []), ...(entry.labels ?? [])].filter((item, index, all) => all.indexOf(item) === index),
			associations: [...(existing.associations ?? []), ...(entry.associations ?? [])].filter((item, index, all) => all.indexOf(item) === index),
		});
	}
	entries.push(...pendingByTimestamp.values());
	return entries.sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
}

function normalizeSleepStage(stage: string): string {
	const normalized = normalizeLabel(stage)
		.replace(/^asleep[_\s-]*/, "")
		.replace(/^sleep[_\s-]*/, "");
	if (normalized === "light") return "core";
	if (normalized.includes("deep")) return "deep";
	if (normalized.includes("rem")) return "rem";
	if (normalized.includes("awake")) return "awake";
	if (normalized.includes("core")) return "core";
	return normalized || "core";
}

function parseStageDurationSeconds(value: string): number | undefined {
	const match = /\(([0-9]+(?:\.[0-9]+)?)\s*s(?:ec(?:onds?)?)?\)/i.exec(value);
	if (match) return Number(match[1]);
	return undefined;
}

function parseSleepStages(rows: CsvRow[]): NonNullable<HealthDay["sleep"]>["sleepStages"] {
	const stages: NonNullable<HealthDay["sleep"]>["sleepStages"] = [];

	for (const row of rows) {
		if (normalizeLabel(row.category) !== "sleep") continue;

		const metric = normalizeLabel(row.metric);
		if (metric === "sleep stage") {
			const durationSeconds = parseStageDurationSeconds(row.value);
			const startDate = normalizeTimestamp(row.date, row.timestamp);
			if (durationSeconds === undefined || !startDate) continue;

			const stageName = row.value.replace(/\s*\([^)]+\)\s*$/, "");
			const startMs = Date.parse(startDate);
			if (!isFinite(startMs)) continue;
			stages.push({
				stage: normalizeSleepStage(stageName),
				startDate,
				endDate: formatLocalDateTime(startMs + durationSeconds * 1000),
				durationSeconds,
			});
			continue;
		}

		// Older Android CSVs used rows like:
		// Date,Sleep,Stage deep,22:30 - 00:10,time range
		if (metric.startsWith("stage ")) {
			const rangeMatch = /^(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)$/.exec(row.value.trim());
			if (!rangeMatch) continue;
			const startDate = timestampFromClock(row.date, rangeMatch[1]);
			const endDateBase = timestampFromClock(row.date, rangeMatch[2]);
			if (!startDate || !endDateBase) continue;
			const startMs = Date.parse(startDate);
			let endMs = Date.parse(endDateBase);
			if (!isFinite(startMs) || !isFinite(endMs)) continue;
			if (endMs <= startMs) endMs += 86400000;
			stages.push({
				stage: normalizeSleepStage(row.metric.replace(/^stage\s+/i, "")),
				startDate,
				endDate: formatLocalDateTime(endMs),
				durationSeconds: Math.round((endMs - startMs) / 1000),
			});
		}
	}

	return stages.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function sumStageSeconds(
	stages: NonNullable<HealthDay["sleep"]>["sleepStages"],
	stageName: string
): number {
	return stages
		.filter((stage) => stage.stage === stageName)
		.reduce((sum, stage) => sum + stage.durationSeconds, 0);
}

function metricUnitKey(row: CsvRow): string | undefined {
	if (normalizeLabel(row.category) === "metadata") return undefined;
	const key = normalizeLabel(row.metric).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
	return key || undefined;
}

function unitMapFromRows(rows: CsvRow[]): Record<string, string> | undefined {
	const units: Record<string, string> = {};
	for (const row of rows) {
		const key = metricUnitKey(row);
		if (key && row.unit) units[key] = row.unit;
	}
	return Object.keys(units).length ? units : undefined;
}

function isMetadataRow(row: CsvRow): boolean {
	return normalizeLabel(row.category) === "metadata";
}

function buildDayFromRows(date: string, rows: CsvRow[], metadataRows: CsvRow[] = []): HealthDay | null {
	const rowsWithMetadata = [...metadataRows, ...rows];
	const schema = getString(rowsWithMetadata, "Metadata", "schema");
	if (schema === HEALTHMD_ROLLUP_SCHEMA) return null;
	if (schema && schema !== HEALTHMD_HEALTH_DATA_SCHEMA) return null;

	const schemaVersion = schemaVersionOf({ schema_version: getNum(rowsWithMetadata, "Metadata", "schema_version") });
	const unitSystem = getString(rowsWithMetadata, "Metadata", "unit_system") ?? (schema === HEALTHMD_HEALTH_DATA_SCHEMA && schemaVersion >= 1 ? "metric" : undefined);
	const units = unitMapFromRows(rows);
	const day: HealthDay = {
		type: "health-data",
		date,
		schema,
		schemaVersion: schemaVersion || undefined,
		schema_version: schemaVersion || undefined,
		units,
		unitSystem,
		unit_system: unitSystem,
	};

	// Activity. Keep existing lookups, and add aliases emitted by modern iOS and
	// Android exporters so CSV works regardless of exporter generation.
	const steps = getNum(rows, "Activity", "Steps");
	const activeCalories = getNum(rows, "Activity", "Active Calories");
	const exerciseMinutes = getNum(rows, "Activity", "Exercise Minutes");
	const distanceRow = findRow(rows, [lookup("Activity", "Walking Running Distance")]);
	const walkingRunningDistanceKm = normalizeDistanceKm(distanceRow);
	const basalEnergyBurned = getNumFromLookups(rows, [
		lookup("Activity", "Basal Energy Burned"),
		lookup("Activity", "Basal Energy"),
		lookup("Activity", "Basal Calories"),
	]);
	const flightsClimbed = getNumFromLookups(rows, [
		lookup("Activity", "Flights Climbed"),
		lookup("Activity", "Floors Climbed"),
	]);
	const vo2Max = getNumFromLookups(rows, [
		lookup("Activity", "VO2 Max"),
		lookup("Activity", "Cardio Fitness (VO2 Max)"),
		lookup("Mobility", "VO2 Max"),
	]);
	const standHours = getNum(rows, "Activity", "Stand Hours");
	if (
		steps !== undefined ||
		activeCalories !== undefined ||
		exerciseMinutes !== undefined ||
		walkingRunningDistanceKm !== undefined ||
		basalEnergyBurned !== undefined ||
		flightsClimbed !== undefined ||
		vo2Max !== undefined ||
		standHours !== undefined
	) {
		day.activity = {
			steps: steps ?? 0,
			walkingRunningDistanceKm: walkingRunningDistanceKm ?? 0,
			walkingRunningDistance: walkingRunningDistanceKm !== undefined ? walkingRunningDistanceKm * 1000 : undefined,
			activeCalories: activeCalories ?? 0,
			exerciseMinutes: exerciseMinutes ?? 0,
			vo2Max,
			basalEnergyBurned,
			standHours,
			flightsClimbed,
		};
	}

	// Heart
	const heartRateSamples = samplesFromRows(rows, [lookup("Heart", "Heart Rate Sample")]);
	const hrvSamples = samplesFromRows(rows, [lookup("Heart", "HRV Sample")]);
	const heartValues = heartRateSamples.map((sample) => sample.value);
	const restingHR = getNum(rows, "Heart", "Resting Heart Rate");
	const avgHR = getNum(rows, "Heart", "Average Heart Rate") ?? average(heartValues);
	const heartRateMin = getNumFromLookups(rows, [
		lookup("Heart", "Heart Rate Min"),
		lookup("Heart", "Min Heart Rate"),
	]) ?? (heartValues.length ? Math.min(...heartValues) : undefined);
	const heartRateMax = getNumFromLookups(rows, [
		lookup("Heart", "Heart Rate Max"),
		lookup("Heart", "Max Heart Rate"),
	]) ?? (heartValues.length ? Math.max(...heartValues) : undefined);
	if (
		restingHR !== undefined ||
		avgHR !== undefined ||
		heartRateMin !== undefined ||
		heartRateMax !== undefined ||
		heartRateSamples.length ||
		hrvSamples.length
	) {
		day.heart = {
			averageHeartRate: avgHR ?? restingHR ?? 0,
			heartRateMin: heartRateMin ?? avgHR ?? restingHR ?? 0,
			heartRateMax: heartRateMax ?? avgHR ?? restingHR ?? 0,
			heartRateSamples,
			hrvSamples,
			restingHeartRate: restingHR,
			walkingHeartRateAverage: getNum(rows, "Heart", "Walking Heart Rate Average"),
			hrv: getNum(rows, "Heart", "HRV") ?? average(hrvSamples.map((sample) => sample.value)),
		};
	}

	// Sleep
	const sleepStages = parseSleepStages(rows);
	const sleepTotal = getNum(rows, "Sleep", "Total Duration") ??
		sleepStages
			.filter((stage) => stage.stage !== "awake")
			.reduce((sum, stage) => sum + stage.durationSeconds, 0);
	const deepSleep = getNum(rows, "Sleep", "Deep Sleep") ?? sumStageSeconds(sleepStages, "deep");
	const remSleep = getNum(rows, "Sleep", "REM Sleep") ?? sumStageSeconds(sleepStages, "rem");
	const coreSleep = getNumFromLookups(rows, [
		lookup("Sleep", "Core Sleep"),
		lookup("Sleep", "Light Sleep"),
	]) ?? sumStageSeconds(sleepStages, "core");
	const awakeTime = getNum(rows, "Sleep", "Awake Time") ?? sumStageSeconds(sleepStages, "awake");
	if (sleepTotal > 0 || sleepStages.length) {
		day.sleep = {
			sleepStages,
			totalDuration: sleepTotal,
			deepSleep,
			remSleep,
			coreSleep,
			awakeTime,
			bedtime: getString(rows, "Sleep", "Bedtime") ?? sleepStages[0]?.startDate ?? "",
			bedtimeISO: sleepStages[0]?.startDate,
			wakeTime: getString(rows, "Sleep", "Wake Time") ?? sleepStages[sleepStages.length - 1]?.endDate ?? "",
			wakeTimeISO: sleepStages[sleepStages.length - 1]?.endDate,
		};
	}

	// Vitals
	const respiratorySamples = samplesFromRows(rows, [lookup("Vitals", "Respiratory Rate Sample")]);
	const respiratoryValues = respiratorySamples.map((sample) => sample.value);
	const respRateAvg = getNumFromLookups(rows, [
		lookup("Vitals", "Respiratory Rate"),
		lookup("Vitals", "Respiratory Rate Avg"),
	]) ?? average(respiratoryValues);
	const bloodOxygenSamples = samplesFromRows(
		rows,
		[
			lookup("Vitals", "Blood Oxygen Sample"),
			lookup("Vitals", "SpO2 Sample"),
			lookup("Vitals", "SpO₂ Sample"),
		],
		normalizePercent
	).map((sample) => ({ ...sample, percent: sample.value }));
	const bloodOxygenValues = bloodOxygenSamples.map((sample) => sample.value);
	const bloodOxAvg = normalizePercent(getNumFromLookups(rows, [
		lookup("Vitals", "Blood Oxygen"),
		lookup("Vitals", "Blood Oxygen Avg"),
		lookup("Vitals", "SpO2"),
		lookup("Vitals", "SpO2 Avg"),
		lookup("Vitals", "SpO₂"),
		lookup("Vitals", "SpO₂ Avg"),
	])) ?? average(bloodOxygenValues);
	const bloodOxMin = normalizePercent(getNumFromLookups(rows, [
		lookup("Vitals", "Blood Oxygen Min"),
		lookup("Vitals", "SpO2 Min"),
		lookup("Vitals", "SpO₂ Min"),
	])) ?? (bloodOxygenValues.length ? Math.min(...bloodOxygenValues) : undefined);
	const bloodOxMax = normalizePercent(getNumFromLookups(rows, [
		lookup("Vitals", "Blood Oxygen Max"),
		lookup("Vitals", "SpO2 Max"),
		lookup("Vitals", "SpO₂ Max"),
	])) ?? (bloodOxygenValues.length ? Math.max(...bloodOxygenValues) : undefined);
	if (
		respRateAvg !== undefined ||
		respiratorySamples.length ||
		bloodOxAvg !== undefined ||
		bloodOxygenSamples.length
	) {
		day.vitals = {
			respiratoryRate: respRateAvg,
			respiratoryRateAvg: respRateAvg,
			respiratoryRateMin: getNum(rows, "Vitals", "Respiratory Rate Min") ??
				(respiratoryValues.length ? Math.min(...respiratoryValues) : undefined),
			respiratoryRateMax: getNum(rows, "Vitals", "Respiratory Rate Max") ??
				(respiratoryValues.length ? Math.max(...respiratoryValues) : undefined),
			respiratoryRateSamples: respiratorySamples.length ? respiratorySamples : undefined,
			bloodOxygenPercent: bloodOxAvg,
			bloodOxygenAvg: bloodOxAvg,
			bloodOxygenMin: bloodOxMin,
			bloodOxygenMax: bloodOxMax,
			bloodOxygenSamples: bloodOxygenSamples.length ? bloodOxygenSamples : undefined,
		};
	}

	// Mobility
	const walkSpeed = getNum(rows, "Mobility", "Walking Speed");
	if (walkSpeed !== undefined) {
		day.mobility = {
			walkingSpeed: walkSpeed,
			walkingAsymmetryPercentage:
				getNum(rows, "Mobility", "Walking Asymmetry Percentage") ??
				getNum(rows, "Mobility", "Walking Asymmetry Percent") ??
				getNum(rows, "Mobility", "Walking Asymmetry") ??
				0,
			walkingStepLength: getNum(rows, "Mobility", "Walking Step Length"),
			walkingDoubleSupportPercentage:
				getNum(rows, "Mobility", "Walking Double Support Percentage") ??
				getNum(rows, "Mobility", "Walking Double Support Percent"),
		};
	}

	// Mood / State of Mind
	const moodSummary = createMoodSummary(parseMoodEntries(rows));
	if (moodSummary) {
		day.mood = moodSummary;
	}

	// Hearing
	const headphone = getNumFromLookups(rows, [
		lookup("Hearing", "Headphone Audio Level"),
		lookup("Hearing", "Headphone Audio"),
	]);
	if (headphone !== undefined) {
		day.hearing = { headphoneAudioLevel: headphone };
	}

	return day;
}

/**
 * Parse a CSV file. A single CSV may contain multiple dates,
 * so this returns an array of HealthDay objects.
 */
export function parseCSV(content: string): HealthDay[] {
	const detected = detectCsvSchema(content);
	if (detected.kind === "rollup-summary" || detected.kind === "data-dictionary" || detected.kind === "unknown") return [];

	const rows = parseRows(content);
	if (!rows.length) return [];

	// Group data rows by date. Metadata rows can have either the day date or an
	// empty date; apply them to every daily group instead of indexing them as a
	// blank daily record.
	const metadataRows = rows.filter(isMetadataRow);
	const byDate = new Map<string, CsvRow[]>();
	for (const row of rows) {
		if (isMetadataRow(row) || !row.date) continue;
		const existing = byDate.get(row.date);
		if (existing) {
			existing.push(row);
		} else {
			byDate.set(row.date, [row]);
		}
	}

	const days: HealthDay[] = [];
	for (const [date, dateRows] of byDate) {
		const day = buildDayFromRows(date, dateRows, metadataRows);
		if (day) days.push(day);
	}
	return days;
}
