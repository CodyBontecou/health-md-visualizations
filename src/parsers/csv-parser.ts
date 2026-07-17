import {
	HEALTHMD_HEALTH_DATA_SCHEMA,
	HEALTHMD_RECORD_ARCHIVE_SCHEMA,
	HEALTHMD_ROLLUP_SCHEMA,
	ParsedHealthMetricDataDictionary,
	SUPPORTED_HEALTHMD_RECORD_ARCHIVE_VERSION,
	detectCsvSchema,
	schemaVersionOf,
} from "../healthmd-schema";
import { isBlankCsvRecord, iterateCsvRecords } from "../csv-utils";
import { normalizeMedicationFields } from "../medication-utils";
import {
	HealthDay,
	HealthMdCaptureSummary,
	HealthMdQueryStatusCounts,
	HealthMetricScalar,
	MedicationDoseEvent,
	MedicationInventoryItem,
	MoodEntry,
	RawCaptureStatus,
	TimeSeriesSample,
	WorkoutEntry,
	WorkoutInterval,
} from "../types";
import { createMoodSummary, normalizeMoodValence, stringArrayFromUnknown } from "../mood-utils";
import { canonicalMetricKeyFromCsvLabel } from "../metric-catalog";
import {
	attachCanonicalMetrics,
	isKnownCanonicalMetricKey,
	scalarFromUnknown,
} from "../summary-metric-normalizer";

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

interface CsvCaptureCounts {
	recordCount: number;
	externalRecordCount: number;
	queryFailureCount: number;
	warningCount: number;
	partialFailureCount: number;
}

interface ParsedCsvRows {
	rows: CsvRow[];
	captureCountsByDate: Map<string, CsvCaptureCounts>;
}

function shouldRetainCsvPayload(category: string, metric: string): boolean {
	const normalizedCategory = normalizeLabel(category);
	const normalizedMetric = normalizeLabel(metric);
	if (normalizedCategory === "raw healthkit") {
		return normalizedMetric === "raw capture status" || normalizedMetric === "archive manifest";
	}
	if (normalizedCategory === "diagnostics") return false;
	return true;
}

function parseRows(content: string): ParsedCsvRows {
	const records = iterateCsvRecords(content, {
		cellCharacterLimit: (completedCells, columnIndex) => {
			if (columnIndex !== 3 || completedCells.length < 3) return undefined;
			return shouldRetainCsvPayload(completedCells[1], completedCells[2]) ? undefined : 0;
		},
	});
	let first = records.next();
	while (!first.done && isBlankCsvRecord(first.value)) first = records.next();
	if (first.done) return { rows: [], captureCountsByDate: new Map() };

	// Older daily exports may omit Timestamp. Roll-up CSVs have a different
	// Period/Metric header and are intentionally ignored here.
	const header = first.value.map(normalizeLabel);
	if (header[0] !== "date" || header[1] !== "category" || header[2] !== "metric" || header[3] !== "value" || header[4] !== "unit") {
		return { rows: [], captureCountsByDate: new Map() };
	}

	const rows: CsvRow[] = [];
	const captureCountsByDate = new Map<string, CsvCaptureCounts>();
	for (const parts of records) {
		if (isBlankCsvRecord(parts) || parts.length < 5) continue;
		const date = parts[0].trim();
		const category = parts[1].trim();
		const metric = parts[2].trim();
		const normalizedCategory = normalizeLabel(category);
		const normalizedMetric = normalizeLabel(metric);
		if (normalizedCategory === "raw healthkit" || normalizedCategory === "diagnostics") {
			const counts = captureCountsByDate.get(date) ?? {
				recordCount: 0,
				externalRecordCount: 0,
				queryFailureCount: 0,
				warningCount: 0,
				partialFailureCount: 0,
			};
			if (normalizedCategory === "raw healthkit" && normalizedMetric === "raw healthkit record") counts.recordCount++;
			else if (normalizedCategory === "raw healthkit" && normalizedMetric === "raw healthkit external record") counts.externalRecordCount++;
			else if (normalizedCategory === "raw healthkit" && normalizedMetric === "query failure") counts.queryFailureCount++;
			else if (normalizedCategory === "raw healthkit" && normalizedMetric === "integrity warning") counts.warningCount++;
			else if (normalizedCategory === "diagnostics" && normalizedMetric === "partial failure") counts.partialFailureCount++;
			captureCountsByDate.set(date, counts);

			// Only the status and compact manifest are needed after this pass.
			if (!shouldRetainCsvPayload(category, metric)) continue;
		}
		rows.push({
			date,
			category,
			metric,
			value: parts[3].trim(),
			unit: parts[4].trim(),
			timestamp: parts[5]?.trim(),
		});
	}
	return { rows, captureCountsByDate };
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
	const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i.exec(rawClock.trim());
	if (!match) return undefined;
	let h = Number(match[1]);
	const m = Number(match[2]);
	const s = Number(match[3] ?? 0);
	const meridiem = match[4]?.replace(/\./g, "").toLowerCase();
	if (meridiem) {
		if (h < 1 || h > 12) return undefined;
		if (meridiem === "pm" && h !== 12) h += 12;
		if (meridiem === "am" && h === 12) h = 0;
	}
	if (h > 23 || m > 59 || s > 59) return undefined;
	return `${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function normalizeTimestamp(date: string, raw: string | undefined): string | undefined {
	const value = raw?.trim();
	if (!value) return undefined;
	if (isFinite(Date.parse(value))) return value;
	return timestampFromClock(date, value);
}

function timestampFromMetric(date: string, metric: string): string | undefined {
	const match = /\bat\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?m\.?)?)\s*$/i.exec(metric.trim());
	return match ? timestampFromClock(date, match[1]) : undefined;
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

function isMoodCountMetric(metric: string, unit: string): boolean {
	const normalizedUnit = normalizeLabel(unit);
	return (normalizedUnit === "count" || normalizedUnit === "entries") &&
		(metric.includes("count") || metric.includes("entries"));
}

function isAverageMoodMetric(metric: string): boolean {
	return metric.includes("average") && (metric.includes("mood") || metric.includes("valence"));
}

function moodEntryFromRow(row: CsvRow): MoodEntry | null {
	const metric = normalizeLabel(row.metric);
	const value = row.value.trim();
	if (!value || isMoodCountMetric(metric, row.unit)) return null;

	const timestamp = normalizeTimestamp(row.date, row.timestamp) ?? timestampFromMetric(row.date, row.metric) ?? `${row.date}T12:00:00`;
	const isScore = metric.includes("score") || metric.includes("rating") || metric.includes("percent") || normalizeLabel(row.unit) === "percent";
	const isLabel = metric.includes("label") || metric.includes("feeling") || metric.includes("classification");
	const isAssociation = metric.includes("association") || metric.includes("context") || metric.includes("factor");
	const labels = isLabel ? stringArrayFromUnknown(value) : [];
	const associations = isAssociation ? stringArrayFromUnknown(value) : [];
	const label = labels[0] ?? (!isAssociation && parseNumber(value) === undefined ? value : undefined);
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

function mergeMoodEntry(existing: MoodEntry, entry: MoodEntry): MoodEntry {
	return {
		...existing,
		...entry,
		valence: existing.valence ?? entry.valence,
		score: existing.score ?? entry.score,
		label: existing.label ?? entry.label,
		labels: [...(existing.labels ?? []), ...(entry.labels ?? [])].filter((item, index, all) => all.indexOf(item) === index),
		associations: [...(existing.associations ?? []), ...(entry.associations ?? [])].filter((item, index, all) => all.indexOf(item) === index),
	};
}

function collectMoodEntries(rows: CsvRow[], includeAverageRows: boolean): MoodEntry[] {
	const pendingByTimestamp = new Map<string, MoodEntry>();
	for (const row of rows) {
		if (!isMoodRow(row)) continue;
		const metric = normalizeLabel(row.metric);
		if (!includeAverageRows && isAverageMoodMetric(metric)) continue;
		const entry = moodEntryFromRow(row);
		if (!entry) continue;
		const timestamp = entry.timestamp ?? entry.startDate ?? row.date;
		const existing = pendingByTimestamp.get(timestamp);
		pendingByTimestamp.set(timestamp, existing ? mergeMoodEntry(existing, entry) : entry);
	}
	return Array.from(pendingByTimestamp.values()).sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
}

function parseMoodEntries(rows: CsvRow[]): MoodEntry[] {
	const entriesWithoutAverageRows = collectMoodEntries(rows, false);
	return entriesWithoutAverageRows.length ? entriesWithoutAverageRows : collectMoodEntries(rows, true);
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

function metricUnitKey(
	row: CsvRow,
	dictionary?: ParsedHealthMetricDataDictionary
): string | undefined {
	const category = normalizeLabel(row.category);
	if (category === "metadata" || category === "raw healthkit" || category === "diagnostics") return undefined;
	const metric = normalizeLabel(row.metric);
	// Prefer explicit public CSV aliases before dictionary display names because
	// some display names intentionally represent multiple canonical unit keys.
	const builtinKey = canonicalMetricKeyFromCsvLabel(row.category, row.metric, row.unit);
	if (builtinKey) return builtinKey;
	const dictionaryEntry = dictionary?.entries.find((entry) => {
		const categoryMatches = !entry.category || normalizeLabel(entry.category) === category;
		return categoryMatches && [entry.displayName, entry.key, entry.canonicalKey]
			.some((candidate) => typeof candidate === "string" && normalizeLabel(candidate) === metric);
	});
	if (dictionaryEntry) return dictionaryEntry.canonicalKey;
	const key = metric.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
	return key || undefined;
}

function canonicalCsvUnit(
	key: string,
	sourceUnit: string,
	dictionary?: ParsedHealthMetricDataDictionary
): string {
	const dictionaryUnit = dictionary?.unitsByCanonicalKey[key];
	if (dictionaryUnit) return dictionaryUnit;
	const normalized = normalizeLabel(sourceUnit);
	if (key.endsWith("_hours") && (normalized === "seconds" || normalized === "second")) return "hours";
	if (key.endsWith("_km") && (normalized === "meters" || normalized === "meter" || normalized === "m")) return "km";
	if (key.endsWith("_cm") && (normalized === "meters" || normalized === "meter" || normalized === "m")) return "cm";
	return sourceUnit;
}

function unitMapFromRows(
	rows: CsvRow[],
	dictionary?: ParsedHealthMetricDataDictionary
): Record<string, string> | undefined {
	const units: Record<string, string> = {};
	for (const row of rows) {
		const key = metricUnitKey(row, dictionary);
		if (key && row.unit) units[key] = canonicalCsvUnit(key, row.unit, dictionary);
	}
	return Object.keys(units).length ? units : undefined;
}

function normalizeCanonicalCsvValue(
	key: string,
	value: HealthMetricScalar,
	unit: string
): HealthMetricScalar {
	if (typeof value !== "number") return value;
	const normalizedUnit = normalizeLabel(unit);
	if (key.endsWith("_hours") && (normalizedUnit === "seconds" || normalizedUnit === "second")) return value / 3600;
	if (key.endsWith("_km") && (normalizedUnit === "meters" || normalizedUnit === "meter" || normalizedUnit === "m")) return value / 1000;
	if (key.endsWith("_cm") && (normalizedUnit === "meters" || normalizedUnit === "meter" || normalizedUnit === "m")) return value * 100;
	return value;
}

function canonicalMetricsFromCsvRows(
	rows: CsvRow[],
	dictionary?: ParsedHealthMetricDataDictionary
): Record<string, HealthMetricScalar> {
	const result: Record<string, HealthMetricScalar> = {};
	const dictionaryKeys = new Set(dictionary?.entries.map((entry) => entry.canonicalKey) ?? []);
	for (const row of rows) {
		const category = normalizeLabel(row.category);
		const metric = normalizeLabel(row.metric);
		if (["metadata", "raw healthkit", "diagnostics"].includes(category)) continue;
		if (metric.includes(" sample") || metric.startsWith("sample ") || metric.startsWith("stage ")) continue;
		const key = metricUnitKey(row, dictionary);
		if (!key || (!isKnownCanonicalMetricKey(key) && !dictionaryKeys.has(key))) continue;
		const value = scalarFromUnknown(row.value);
		if (value !== undefined) result[key] = normalizeCanonicalCsvValue(key, value, row.unit);
	}
	return result;
}

function isMetadataRow(row: CsvRow): boolean {
	return normalizeLabel(row.category) === "metadata";
}

const CAPTURE_STATUSES = new Set<RawCaptureStatus>([
	"complete",
	"partial",
	"not_requested",
	"legacy_unavailable",
]);

function stringCaptureStatus(value: string | undefined): RawCaptureStatus | undefined {
	return value && CAPTURE_STATUSES.has(value as RawCaptureStatus)
		? value as RawCaptureStatus
		: undefined;
}

function emptyQueryStatusCounts(): HealthMdQueryStatusCounts {
	return { success: 0, failure: 0, cancelled: 0, skipped: 0, unsupported: 0, other: 0 };
}

function buildCaptureSummary(
	rows: CsvRow[],
	counts: CsvCaptureCounts | undefined
): HealthMdCaptureSummary | undefined {
	const status = stringCaptureStatus(getString(rows, "Raw HealthKit", "Raw Capture Status"));
	if (!status) return undefined;

	const manifestRow = findRow(rows, [lookup("Raw HealthKit", "Archive Manifest")]);
	let manifest: Record<string, unknown> | undefined;
	if (manifestRow?.value) {
		try {
			const parsed = JSON.parse(manifestRow.value) as unknown;
			if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
				manifest = parsed as Record<string, unknown>;
			}
		} catch {
			// Keep the daily summaries usable and report the malformed manifest below.
		}
	}

	const archiveSchema = typeof manifest?.schema === "string" ? manifest.schema : undefined;
	const archiveVersion = typeof manifest?.schema_version === "number" ? manifest.schema_version : undefined;
	const archiveStatus = stringCaptureStatus(typeof manifest?.capture_status === "string" ? manifest.capture_status : undefined);
	const queryContainer = manifest?.query_manifest;
	const queryResults = typeof queryContainer === "object" && queryContainer !== null && !Array.isArray(queryContainer) &&
		Array.isArray((queryContainer as Record<string, unknown>).results)
		? (queryContainer as Record<string, unknown>).results as unknown[]
		: [];
	const queryStatusCounts = queryResults.length ? emptyQueryStatusCounts() : undefined;
	for (const result of queryResults) {
		const rawStatus = typeof result === "object" && result !== null && !Array.isArray(result)
			? (result as Record<string, unknown>).status
			: undefined;
		const normalized = typeof rawStatus === "string" ? rawStatus.toLowerCase() : "";
		if (queryStatusCounts && Object.prototype.hasOwnProperty.call(queryStatusCounts, normalized)) {
			queryStatusCounts[normalized as keyof HealthMdQueryStatusCounts]++;
		} else if (queryStatusCounts) {
			queryStatusCounts.other++;
		}
	}

	const recordCount = counts?.recordCount ?? 0;
	const externalRecordCount = counts?.externalRecordCount ?? 0;
	const queryFailureCount = counts?.queryFailureCount ?? 0;
	const warningCount = counts?.warningCount ?? 0;
	const partialFailureCount = counts?.partialFailureCount ?? 0;
	const validationIssues: string[] = [];

	if ((status === "complete" || status === "partial") && !manifest) {
		validationIssues.push(`Capture status ${status} has no archive manifest.`);
	}
	if ((status === "not_requested" || status === "legacy_unavailable") && manifest) {
		validationIssues.push(`Capture status ${status} unexpectedly includes an archive manifest.`);
	}
	if (archiveStatus && archiveStatus !== status) {
		validationIssues.push(`Daily capture status ${status} does not match archive status ${archiveStatus}.`);
	}
	if (archiveSchema && archiveSchema !== HEALTHMD_RECORD_ARCHIVE_SCHEMA) {
		validationIssues.push(`Unsupported source-record archive schema: ${archiveSchema}.`);
	}
	if (archiveVersion !== undefined && archiveVersion > SUPPORTED_HEALTHMD_RECORD_ARCHIVE_VERSION) {
		validationIssues.push(`Source-record archive v${archiveVersion} is newer than supported v${SUPPORTED_HEALTHMD_RECORD_ARCHIVE_VERSION}.`);
	}
	const nonSuccessQueryCount = queryStatusCounts
		? queryStatusCounts.failure + queryStatusCounts.cancelled + queryStatusCounts.skipped + queryStatusCounts.unsupported + queryStatusCounts.other
		: queryFailureCount;
	if (status === "complete" && (nonSuccessQueryCount > 0 || partialFailureCount > 0)) {
		validationIssues.push("Capture is marked complete despite a non-success query or partial failure.");
	}
	if (manifestRow && !manifest) validationIssues.push("Archive manifest is malformed JSON.");

	return {
		status,
		archiveSchema,
		archiveVersion,
		recordCount,
		externalRecordCount,
		queryFailureCount,
		warningCount,
		partialFailureCount,
		queryStatusCounts,
		validationIssues: validationIssues.length ? validationIssues : undefined,
	};
}

function boolValue(value: string): boolean | undefined {
	const normalized = value.trim().toLowerCase();
	if (["true", "yes", "1"].includes(normalized)) return true;
	if (["false", "no", "0"].includes(normalized)) return false;
	return undefined;
}

function valueAfterMedicationName(value: string, name: string | undefined): string {
	if (!name) return value.trim();
	const prefix = `${name}:`;
	return value.startsWith(prefix) ? value.slice(prefix.length).trim() : value.trim();
}

function parseMedicationRows(rows: CsvRow[]): ReturnType<typeof normalizeMedicationFields> {
	const medicationRows = rows.filter((row) => normalizeLabel(row.category) === "medications");
	if (!medicationRows.length) return {};

	const details: MedicationInventoryItem[] = [];
	const doseEvents: MedicationDoseEvent[] = [];
	let currentMedication: MedicationInventoryItem | undefined;
	let currentDoseEvent: MedicationDoseEvent | undefined;

	for (const row of medicationRows) {
		const metric = normalizeLabel(row.metric);
		if (metric === "medication") {
			currentMedication = { name: row.value, displayName: row.value, display_name: row.value };
			details.push(currentMedication);
			continue;
		}
		if (metric === "dose event") {
			// The row timestamp is the event start, not an implied schedule time.
			currentDoseEvent = { startDate: row.timestamp, start_date: row.timestamp };
			doseEvents.push(currentDoseEvent);
			continue;
		}

		if (metric.startsWith("medication ") && currentMedication) {
			const value = valueAfterMedicationName(row.value, currentMedication.name);
			switch (metric) {
				case "medication concept identifier":
					currentMedication.conceptIdentifier = value;
					currentMedication.concept_identifier = value;
					break;
				case "medication display name":
					currentMedication.displayName = value;
					currentMedication.display_name = value;
					break;
				case "medication export name":
					currentMedication.name = value;
					break;
				case "medication general form":
					currentMedication.generalForm = value;
					currentMedication.general_form = value;
					break;
				case "medication archived":
					currentMedication.isArchived = boolValue(value);
					currentMedication.is_archived = currentMedication.isArchived;
					break;
				case "medication has schedule":
					currentMedication.hasSchedule = boolValue(value);
					currentMedication.has_schedule = currentMedication.hasSchedule;
					break;
				case "medication nickname":
					currentMedication.nickname = value;
					break;
				case "medication related coding": {
					const coding: Record<string, string> = {};
					for (const component of value.split(";")) {
						const separator = component.indexOf("=");
						if (separator > 0) coding[component.slice(0, separator).trim()] = component.slice(separator + 1).trim();
					}
					if (Object.keys(coding).length) {
						currentMedication.relatedCodings = [...(currentMedication.relatedCodings ?? []), coding];
						currentMedication.related_codings = currentMedication.relatedCodings;
					}
					break;
				}
				case "medication rxnorm code":
					currentMedication.rxnormCodes = [...(currentMedication.rxnormCodes ?? []), value];
					currentMedication.rxnorm_codes = currentMedication.rxnormCodes;
					break;
			}
			continue;
		}

		if (metric.startsWith("dose event ") && currentDoseEvent) {
			switch (metric) {
				case "dose event id": currentDoseEvent.id = row.value; break;
				case "dose event medication concept identifier":
					currentDoseEvent.medicationConceptIdentifier = row.value;
					currentDoseEvent.medication_concept_identifier = row.value;
					break;
				case "dose event medication name": currentDoseEvent.name = row.value; break;
				case "dose event start":
					currentDoseEvent.startDate = row.value;
					currentDoseEvent.start_date = row.value;
					break;
				case "dose event end":
					currentDoseEvent.endDate = row.value;
					currentDoseEvent.end_date = row.value;
					break;
				case "dose event status": currentDoseEvent.status = row.value; break;
				case "dose event status display":
					currentDoseEvent.statusDisplay = row.value;
					currentDoseEvent.status_display = row.value;
					break;
				case "dose event schedule type":
					currentDoseEvent.scheduleType = row.value;
					currentDoseEvent.schedule_type = row.value;
					break;
				case "dose event unit": currentDoseEvent.unit = row.value; break;
				case "dose event scheduled date":
					currentDoseEvent.scheduledDate = row.value;
					currentDoseEvent.scheduled_date = row.value;
					break;
				case "dose event dose quantity":
					currentDoseEvent.doseQuantity = parseNumber(row.value);
					currentDoseEvent.dose_quantity = currentDoseEvent.doseQuantity;
					break;
				case "dose event scheduled dose quantity":
					currentDoseEvent.scheduledDoseQuantity = parseNumber(row.value);
					currentDoseEvent.scheduled_dose_quantity = currentDoseEvent.scheduledDoseQuantity;
					break;
				default:
					if (metric.startsWith("dose event metadata ")) {
						const key = row.metric.trim().slice("Dose Event Metadata ".length).trim();
						const metadata = typeof currentDoseEvent.metadata === "object" && currentDoseEvent.metadata !== null && !Array.isArray(currentDoseEvent.metadata)
							? currentDoseEvent.metadata as Record<string, unknown>
							: {};
						metadata[key] = row.value;
						currentDoseEvent.metadata = metadata;
					}
					break;
			}
		}
	}

	return normalizeMedicationFields({
		medication_count: getNum(rows, "Medications", "Authorized Medications"),
		active_medication_count: getNum(rows, "Medications", "Active Medications"),
		archived_medication_count: getNum(rows, "Medications", "Archived Medications"),
		medication_dose_count: getNum(rows, "Medications", "Dose Events"),
		medication_taken_count: getNum(rows, "Medications", "Taken Doses"),
		medication_skipped_count: getNum(rows, "Medications", "Skipped Doses"),
		medication_details: details,
		medication_dose_events: doseEvents,
	});
}

function intervalFor(map: Map<number, WorkoutInterval>, index: number): WorkoutInterval {
	let interval = map.get(index);
	if (!interval) {
		interval = { index, duration: 0 };
		map.set(index, interval);
	}
	return interval;
}

function isoEndDate(start: string | undefined, duration: number): string | undefined {
	if (!start || !duration) return undefined;
	const startMs = Date.parse(start);
	return Number.isFinite(startMs) ? new Date(startMs + duration * 1000).toISOString() : undefined;
}

function parseWorkoutRows(rows: CsvRow[]): WorkoutEntry[] {
	const workouts: WorkoutEntry[] = [];
	let current: WorkoutEntry | undefined;
	let currentLaps = new Map<number, WorkoutInterval>();
	let currentSplits = new Map<number, WorkoutInterval>();

	const finishCurrent = (): void => {
		if (!current) return;
		current.laps = currentLaps.size ? Array.from(currentLaps.values()).sort((a, b) => a.index - b.index) : undefined;
		current.splits = currentSplits.size ? Array.from(currentSplits.values()).sort((a, b) => a.index - b.index) : undefined;
		current.endTimeISO = current.endTimeISO ?? isoEndDate(current.startTimeISO, current.duration);
		workouts.push(current);
	};

	for (const row of rows) {
		if (normalizeLabel(row.category) !== "workouts") continue;
		const metric = row.metric.trim();
		const normalizedMetric = normalizeLabel(metric);
		if (normalizedMetric === "workout activity type") {
			finishCurrent();
			current = {
				type: row.value || "Workout",
				activityType: row.value || undefined,
				duration: 0,
				startTime: row.timestamp,
				startTimeISO: row.timestamp,
			};
			currentLaps = new Map();
			currentSplits = new Map();
			continue;
		}
		if (!current) continue;
		if (normalizedMetric === "workout sport") {
			current.sport = row.value;
			continue;
		}

		const activityPrefix = current.activityType ? `${current.activityType} ` : "";
		const field = activityPrefix && metric.toLowerCase().startsWith(activityPrefix.toLowerCase())
			? metric.slice(activityPrefix.length)
			: metric;
		const normalizedField = normalizeLabel(field);
		const numeric = parseNumber(row.value);
		const lapMatch = /^lap (\d+) (distance|duration|pace)$/i.exec(field);
		const splitMatch = /^split (\d+) (pace|avg heart rate)$/i.exec(field);
		if (lapMatch) {
			const interval = intervalFor(currentLaps, Number(lapMatch[1]));
			if (lapMatch[2].toLowerCase() === "distance") interval.distance = numeric;
			else if (lapMatch[2].toLowerCase() === "duration") interval.duration = numeric ?? 0;
			else interval.paceFormatted = row.value;
			continue;
		}
		if (splitMatch) {
			const interval = intervalFor(currentSplits, Number(splitMatch[1]));
			if (splitMatch[2].toLowerCase() === "pace") interval.paceFormatted = row.value;
			else interval.avgHeartRate = numeric;
			continue;
		}

		switch (normalizedField) {
			case "start time": current.startTime = row.value; break;
			case "location":
				current.locationType = row.value.toLowerCase();
				current.isIndoor = normalizeLabel(row.value) === "indoor";
				break;
			case "duration": current.duration = numeric ?? 0; break;
			case "distance":
				current.distance = numeric;
				current.distanceMeters = numeric;
				current.distanceKm = numeric === undefined ? undefined : numeric / 1000;
				break;
			case "avg pace": current.avgPaceFormatted = row.value; break;
			case "avg speed": current.avgSpeedFormatted = row.value; break;
			case "calories": current.calories = numeric; break;
			case "avg heart rate": current.avgHeartRate = numeric; break;
			case "max heart rate": current.maxHeartRate = numeric; break;
			case "min heart rate": current.minHeartRate = numeric; break;
			case "avg cadence":
				if (normalizeLabel(row.unit) === "rpm") current.avgCyclingCadence = numeric;
				else current.avgRunningCadence = numeric;
				break;
			case "avg stride length": current.avgStrideLength = numeric; break;
			case "avg ground contact": current.avgGroundContactTime = numeric; break;
			case "avg vertical oscillation": current.avgVerticalOscillation = numeric; break;
			case "avg power": current.avgPower = numeric; break;
			case "max power": current.maxPower = numeric; break;
			case "elevation gain": current.elevationGainMeters = numeric; break;
			case "elevation loss": current.elevationLossMeters = numeric; break;
		}
	}
	finishCurrent();
	return workouts;
}

function buildDayFromRows(
	date: string,
	rows: CsvRow[],
	metadataRows: CsvRow[] = [],
	dictionary?: ParsedHealthMetricDataDictionary,
	captureCounts?: CsvCaptureCounts
): HealthDay | null {
	const rowsWithMetadata = [...metadataRows, ...rows];
	const schema = getString(rowsWithMetadata, "Metadata", "schema");
	if (schema === HEALTHMD_ROLLUP_SCHEMA) return null;
	if (schema && schema !== HEALTHMD_HEALTH_DATA_SCHEMA) return null;

	const schemaVersion = schemaVersionOf({ schema_version: getNum(rowsWithMetadata, "Metadata", "schema_version") });
	const unitSystem = getString(rowsWithMetadata, "Metadata", "unit_system") ?? (schema === HEALTHMD_HEALTH_DATA_SCHEMA && schemaVersion >= 1 ? "metric" : undefined);
	const units = unitMapFromRows(rows, dictionary);
	const calendarTimezone = getString(rowsWithMetadata, "Metadata", "time_context.calendar_timezone");
	const timestampTimezone = getString(rowsWithMetadata, "Metadata", "time_context.timestamp_timezone");
	const timeContext = calendarTimezone || timestampTimezone ? {
		calendarTimezone,
		timestampTimezone,
		calendar_timezone: calendarTimezone,
		timestamp_timezone: timestampTimezone,
	} : undefined;
	const capture = buildCaptureSummary(rowsWithMetadata, captureCounts);
	const day: HealthDay = {
		type: "health-data",
		date,
		schema,
		schemaVersion: schemaVersion || undefined,
		schema_version: schemaVersion || undefined,
		units,
		unitSystem,
		unit_system: unitSystem,
		timeContext,
		time_context: timeContext,
		rawCapture: capture,
		raw_capture_status: capture?.status,
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
			steps,
			walkingRunningDistanceKm,
			walkingRunningDistance: walkingRunningDistanceKm !== undefined ? walkingRunningDistanceKm * 1000 : undefined,
			activeCalories,
			exerciseMinutes,
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

	// Vitals. V7 CSV summary/sample rows already use the declared 0...100
	// percent scale; only historical CSVs need ratio compatibility.
	const normalizeBloodOxygenCsv = schemaVersion >= 7
		? (value: number): number => value
		: normalizePercent;
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
		normalizeBloodOxygenCsv
	).map((sample) => ({ ...sample, percent: sample.value }));
	const bloodOxygenValues = bloodOxygenSamples.map((sample) => sample.value);
	const bloodOxAvg = normalizeBloodOxygenCsv(getNumFromLookups(rows, [
		lookup("Vitals", "Blood Oxygen"),
		lookup("Vitals", "Blood Oxygen Avg"),
		lookup("Vitals", "SpO2"),
		lookup("Vitals", "SpO2 Avg"),
		lookup("Vitals", "SpO₂"),
		lookup("Vitals", "SpO₂ Avg"),
	])) ?? average(bloodOxygenValues);
	const bloodOxMin = normalizeBloodOxygenCsv(getNumFromLookups(rows, [
		lookup("Vitals", "Blood Oxygen Min"),
		lookup("Vitals", "SpO2 Min"),
		lookup("Vitals", "SpO₂ Min"),
	])) ?? (bloodOxygenValues.length ? Math.min(...bloodOxygenValues) : undefined);
	const bloodOxMax = normalizeBloodOxygenCsv(getNumFromLookups(rows, [
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
	// Daily CSV summary rows already use the public 0...100 percent scale.
	// Ratio normalization is reserved for JSON and granular SpO2 samples.
	const walkingAsymmetry =
		getNum(rows, "Mobility", "Walking Asymmetry Percentage") ??
		getNum(rows, "Mobility", "Walking Asymmetry Percent") ??
		getNum(rows, "Mobility", "Walking Asymmetry");
	const walkingDoubleSupport =
		getNum(rows, "Mobility", "Walking Double Support Percentage") ??
		getNum(rows, "Mobility", "Walking Double Support Percent");
	if (walkSpeed !== undefined || walkingAsymmetry !== undefined || walkingDoubleSupport !== undefined) {
		day.mobility = {
			walkingSpeed: walkSpeed,
			walkingAsymmetryPercentage: walkingAsymmetry,
			walkingStepLength: getNum(rows, "Mobility", "Walking Step Length"),
			walkingDoubleSupportPercentage: walkingDoubleSupport,
		};
	}

	const workouts = parseWorkoutRows(rows);
	if (workouts.length) day.workouts = workouts;

	Object.assign(day, parseMedicationRows(rows));

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
	const environmentalSound = getNumFromLookups(rows, [
		lookup("Hearing", "Environmental Sound Level"),
		lookup("Hearing", "Environmental Sound"),
	]);
	if (headphone !== undefined || environmentalSound !== undefined) {
		day.hearing = { headphoneAudioLevel: headphone, environmentalSoundLevel: environmentalSound };
	}

	attachCanonicalMetrics(day, canonicalMetricsFromCsvRows(rows, dictionary));
	return day;
}

/**
 * Parse a CSV file. A single CSV may contain multiple dates,
 * so this returns an array of HealthDay objects.
 */
export function parseCSV(
	content: string,
	dictionary?: ParsedHealthMetricDataDictionary
): HealthDay[] {
	const detected = detectCsvSchema(content);
	if (detected.kind === "rollup-summary" || detected.kind === "data-dictionary" || detected.kind === "unknown") return [];

	const parsedRows = parseRows(content);
	const rows = parsedRows.rows;
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
		const day = buildDayFromRows(
			date,
			dateRows,
			metadataRows,
			dictionary,
			parsedRows.captureCountsByDate.get(date)
		);
		if (day) days.push(day);
	}
	return days;
}
