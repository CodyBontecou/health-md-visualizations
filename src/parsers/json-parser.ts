import {
	HEALTHMD_HEALTH_DATA_SCHEMA,
	HEALTHMD_RECORD_ARCHIVE_SCHEMA,
	HEALTHMD_ROLLUP_SCHEMA,
	SUPPORTED_HEALTHMD_RECORD_ARCHIVE_VERSION,
	isUnitMap,
	schemaVersionOf,
} from "../healthmd-schema";
import {
	countTopLevelJsonArrayProperty,
	parseJsonObjectExcluding,
	parseTopLevelJsonProperty,
} from "../json-utils";
import { normalizeMedicationFields } from "../medication-utils";
import { attachCanonicalMetrics } from "../summary-metric-normalizer";
import { getMoodDaySummary } from "../mood-utils";
import {
	HealthDay,
	HealthMdCaptureSummary,
	HealthMdQueryStatusCounts,
	HealthMdTimeContext,
	RawCaptureStatus,
} from "../types";

const OMITTED_ROOT_KEYS = new Set(["healthkit_record_archive"]);
const LARGE_ARCHIVE_FAST_PATH_MIN_LENGTH = 512 * 1024;
const ROOT_KEYS_AFTER_ARCHIVE = [
	"hearing", "heart", "medications", "mobility", "other", "raw_capture_status",
	"schema", "schema_version", "time_context", "type", "unit_system", "units", "vitals",
];
const CAPTURE_STATUSES = new Set<RawCaptureStatus>([
	"complete",
	"partial",
	"not_requested",
	"legacy_unavailable",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function compactArchiveMetadata(content: string, valueStart: number, valueEnd: number): string {
	const edges = `${content.slice(valueStart, Math.min(valueEnd, valueStart + 4096))}\n${content.slice(Math.max(valueStart, valueEnd - 4096), valueEnd)}`;
	const stringProperty = (key: string): string | undefined => {
		const match = edges.match(new RegExp(`${JSON.stringify(key)}\\s*:\\s*("(?:\\\\.|[^"\\\\])*")`));
		if (!match) return undefined;
		try { return JSON.parse(match[1]) as string; } catch { return undefined; }
	};
	const numberProperty = (key: string): number | undefined => {
		const match = edges.match(new RegExp(`${JSON.stringify(key)}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
		if (!match) return undefined;
		const value = Number(match[1]);
		return Number.isFinite(value) ? value : undefined;
	};
	const metadata: Record<string, unknown> = {
		capture_status: stringProperty("capture_status"),
		schema: stringProperty("schema"),
		schema_version: numberProperty("schema_version"),
	};
	for (const key of Object.keys(metadata)) if (metadata[key] === undefined) delete metadata[key];
	return JSON.stringify(metadata);
}

function parseLargeHealthDataEnvelope(content: string): { record: Record<string, unknown>; omittedValues: Record<string, string> } | null {
	if (content.length < LARGE_ARCHIVE_FAST_PATH_MIN_LENGTH) return null;
	const archiveKey = JSON.stringify("healthkit_record_archive");
	const keyStart = content.indexOf(archiveKey);
	if (keyStart < 0) return null;
	const beforeKey = content.slice(0, keyStart);
	if (!beforeKey.trimEnd().endsWith(",")) return null;
	let valueStart = keyStart + archiveKey.length;
	while (/\s/.test(content[valueStart])) valueStart++;
	if (content[valueStart++] !== ":") return null;
	while (/\s/.test(content[valueStart])) valueStart++;
	if (content[valueStart] !== "{") return null;

	const suffixStart = ROOT_KEYS_AFTER_ARCHIVE
		.map((key) => content.lastIndexOf(JSON.stringify(key)))
		.find((index) => index > valueStart) ?? -1;
	if (suffixStart < 0 || content.slice(valueStart, suffixStart).trimEnd().at(-1) !== ",") return null;

	try {
		const record = JSON.parse(`${beforeKey}${content.slice(suffixStart)}`) as unknown;
		if (!isRecord(record) || record.type !== "health-data") return null;
		return {
			record,
			omittedValues: {
				healthkit_record_archive: compactArchiveMetadata(content, valueStart, suffixStart),
			},
		};
	} catch {
		return null;
	}
}

function captureStatus(value: unknown): RawCaptureStatus | undefined {
	return typeof value === "string" && CAPTURE_STATUSES.has(value as RawCaptureStatus)
		? value as RawCaptureStatus
		: undefined;
}

function emptyQueryStatusCounts(): HealthMdQueryStatusCounts {
	return { success: 0, failure: 0, cancelled: 0, skipped: 0, unsupported: 0, other: 0 };
}

function queryStatusCounts(manifest: unknown): HealthMdQueryStatusCounts | undefined {
	if (!isRecord(manifest)) return undefined;
	const resultsContainer = isRecord(manifest.query_manifest) ? manifest.query_manifest : manifest;
	const results = Array.isArray(resultsContainer.results) ? resultsContainer.results : [];
	if (!results.length) return undefined;

	const counts = emptyQueryStatusCounts();
	for (const result of results) {
		const status = isRecord(result) ? stringValue(result.status)?.toLowerCase() : undefined;
		if (status && Object.prototype.hasOwnProperty.call(counts, status)) {
			counts[status as keyof HealthMdQueryStatusCounts]++;
		} else {
			counts.other++;
		}
	}
	return counts;
}

function diagnosticsPartialFailureCount(diagnostics: unknown): number | undefined {
	if (!isRecord(diagnostics) || !Array.isArray(diagnostics.partial_failures)) return undefined;
	return diagnostics.partial_failures.length;
}

function buildCaptureSummary(
	topLevelStatusValue: unknown,
	archiveRaw: string | undefined,
	diagnostics: unknown
): HealthMdCaptureSummary | undefined {
	const archiveSchema = archiveRaw
		? stringValue(parseTopLevelJsonProperty(archiveRaw, "schema"))
		: undefined;
	const archiveVersion = archiveRaw
		? numberValue(parseTopLevelJsonProperty(archiveRaw, "schema_version"))
		: undefined;
	const archiveStatus = archiveRaw
		? captureStatus(parseTopLevelJsonProperty(archiveRaw, "capture_status"))
		: undefined;
	const status = captureStatus(topLevelStatusValue) ?? archiveStatus;
	if (!status) return undefined;

	const queryManifest = archiveRaw
		? parseTopLevelJsonProperty(archiveRaw, "query_manifest")
		: undefined;
	const statusCounts = queryStatusCounts(queryManifest);
	const recordCount = archiveRaw
		? countTopLevelJsonArrayProperty(archiveRaw, "records")
		: undefined;
	const externalRecordCount = archiveRaw
		? countTopLevelJsonArrayProperty(archiveRaw, "external_records")
		: undefined;
	const warningCount = archiveRaw
		? countTopLevelJsonArrayProperty(archiveRaw, "integrity_warnings")
		: undefined;
	const partialFailureCount = diagnosticsPartialFailureCount(diagnostics);
	const validationIssues: string[] = [];

	if ((status === "complete" || status === "partial") && !archiveRaw) {
		validationIssues.push(`Capture status ${status} has no source-record archive.`);
	}
	if ((status === "not_requested" || status === "legacy_unavailable") && archiveRaw) {
		validationIssues.push(`Capture status ${status} unexpectedly includes a source-record archive.`);
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
	const nonSuccessQueryCount = statusCounts
		? statusCounts.failure + statusCounts.cancelled + statusCounts.skipped + statusCounts.unsupported + statusCounts.other
		: 0;
	if (status === "complete" && (nonSuccessQueryCount > 0 || (partialFailureCount ?? 0) > 0)) {
		validationIssues.push("Capture is marked complete despite a non-success query or partial failure.");
	}

	return {
		status,
		archiveSchema,
		archiveVersion,
		recordCount,
		externalRecordCount,
		queryFailureCount: statusCounts ? statusCounts.failure + statusCounts.cancelled : undefined,
		warningCount,
		partialFailureCount,
		queryStatusCounts: statusCounts,
		validationIssues: validationIssues.length ? validationIssues : undefined,
	};
}

function normalizedTimeContext(value: unknown): HealthMdTimeContext | undefined {
	if (!isRecord(value)) return undefined;
	const calendarTimezone = stringValue(value.calendar_timezone ?? value.calendarTimezone);
	const timestampTimezone = stringValue(value.timestamp_timezone ?? value.timestampTimezone);
	if (!calendarTimezone && !timestampTimezone) return undefined;
	return {
		calendarTimezone,
		timestampTimezone,
		calendar_timezone: calendarTimezone,
		timestamp_timezone: timestampTimezone,
	};
}

function normalizePercent(value: unknown): number | undefined {
	const number = numberValue(value);
	if (number === undefined) return undefined;
	return number > 0 && number <= 1 ? number * 100 : number;
}

function normalizePercentageSections(day: HealthDay, schemaVersion: number): void {
	if (day.vitals) {
		const source = day.vitals as unknown as Record<string, unknown>;
		const samples = Array.isArray(source.bloodOxygenSamples)
			? source.bloodOxygenSamples.flatMap((sample) => {
				if (!isRecord(sample)) return [];
				const percent = normalizePercent(sample.percent ?? sample.value);
				return percent === undefined ? [] : [{ ...sample, value: percent, percent }];
			})
			: undefined;
		const average = normalizePercent(source.bloodOxygenPercent ?? source.bloodOxygenAvg ?? source.bloodOxygen);
		const minimum = normalizePercent(source.bloodOxygenMinPercent ?? source.bloodOxygenMin);
		const maximum = normalizePercent(source.bloodOxygenMaxPercent ?? source.bloodOxygenMax);
		day.vitals = {
			...day.vitals,
			bloodOxygenPercent: average,
			bloodOxygenAvg: average,
			bloodOxygenMin: minimum,
			bloodOxygenMax: maximum,
			bloodOxygenSamples: samples as NonNullable<HealthDay["vitals"]>["bloodOxygenSamples"],
		};
	}

	// Versioned JSON v6+ stores these HealthKit percentages as 0...1 ratios.
	// Historical plugin fixtures often stored already-scaled percentages.
	if (schemaVersion >= 6 && day.mobility) {
		day.mobility = {
			...day.mobility,
			walkingAsymmetryPercentage: normalizePercent(day.mobility.walkingAsymmetryPercentage),
			walkingDoubleSupportPercentage: normalizePercent(day.mobility.walkingDoubleSupportPercentage),
		};
	}
}

function normalizedMedicationSource(root: Record<string, unknown>): Record<string, unknown> {
	const value = root.medications;
	// Historical v2 JSON used flat medication_count/medication_details fields.
	if (!isRecord(value)) return root;
	return {
		medication_count: value.medicationCount ?? value.medication_count,
		active_medication_count: value.activeMedicationCount ?? value.active_medication_count,
		archived_medication_count: value.archivedMedicationCount ?? value.archived_medication_count,
		medication_dose_count: value.doseEventCount ?? value.medicationDoseCount ?? value.medication_dose_count,
		medication_taken_count: value.takenDoseCount ?? value.medicationTakenCount ?? value.medication_taken_count,
		medication_skipped_count: value.skippedDoseCount ?? value.medicationSkippedCount ?? value.medication_skipped_count,
		medication_details: value.medications ?? value.medicationDetails ?? value.medication_details,
		medication_dose_events: value.doseEvents ?? value.medicationDoseEvents ?? value.medication_dose_events,
	};
}

export function parseJSON(content: string): HealthDay | null {
	try {
		const selective = parseLargeHealthDataEnvelope(content) ?? parseJsonObjectExcluding(content, OMITTED_ROOT_KEYS);
		if (!selective) return null;
		const parsed = selective.record;

		if (parsed.schema === HEALTHMD_ROLLUP_SCHEMA || parsed.type === "health_rollup") return null;
		if (parsed.type !== "health-data" || typeof parsed.date !== "string" || !parsed.date) return null;
		if (typeof parsed.schema === "string" && parsed.schema !== HEALTHMD_HEALTH_DATA_SCHEMA) return null;

		const diagnostics = parsed.diagnostics;
		const summaryRoot = { ...parsed };
		delete summaryRoot.diagnostics;
		delete summaryRoot.medications;
		const day = summaryRoot as unknown as HealthDay;
		const schemaVersion = schemaVersionOf(parsed);
		if (schemaVersion > 0) {
			day.schemaVersion = schemaVersion;
			day.schema_version = schemaVersion;
		}

		if (typeof parsed.unit_system === "string") {
			day.unitSystem = parsed.unit_system;
			day.unit_system = parsed.unit_system;
		} else if (day.schema === HEALTHMD_HEALTH_DATA_SCHEMA && schemaVersion >= 1) {
			day.unitSystem = "metric";
			day.unit_system = "metric";
		}
		if (isUnitMap(parsed.units)) day.units = parsed.units;

		const timeContext = normalizedTimeContext(parsed.time_context);
		if (timeContext) {
			day.timeContext = timeContext;
			day.time_context = timeContext;
		}

		const capture = buildCaptureSummary(
			parsed.raw_capture_status,
			selective.omittedValues.healthkit_record_archive,
			diagnostics
		);
		if (capture) {
			day.rawCapture = capture;
			day.raw_capture_status = capture.status;
		}

		Object.assign(day, normalizeMedicationFields(normalizedMedicationSource(parsed)));
		normalizePercentageSections(day, schemaVersion);
		attachCanonicalMetrics(day);

		const moodSummary = getMoodDaySummary(day);
		if (moodSummary.entries.length) {
			day.mood = {
				entries: moodSummary.entries,
				averageValence: moodSummary.averageValence,
				minValence: moodSummary.minValence,
				maxValence: moodSummary.maxValence,
				primaryLabel: moodSummary.primaryLabel,
			};
		}

		return day;
	} catch {
		return null;
	}
}
