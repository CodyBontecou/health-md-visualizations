export const HEALTHMD_DATA_DICTIONARY_FILENAME = "_healthmd_data_dictionary.json";
export const HEALTHMD_HEALTH_DATA_SCHEMA = "healthmd.health_data";
export const HEALTHMD_ROLLUP_SCHEMA = "healthmd.rollup_summary";
/** Health.md's first public, versioned export schema. */
export const SUPPORTED_HEALTHMD_SCHEMA_VERSION = 1;

export type HealthMdDataFormat = "json" | "csv" | "markdown" | "bases" | "unknown";

export type HealthMdSchemaKind =
	| "legacy-health-day"
	| "health-data"
	| "rollup-summary"
	| "data-dictionary"
	| "unknown";

export interface DetectedSchema {
	kind: HealthMdSchemaKind;
	version: number;
	format: HealthMdDataFormat;
	schema?: string;
	isFutureVersion?: boolean;
	reason?: string;
}

export interface HealthMdUnitMap {
	[key: string]: string;
}

export interface HealthMetricDataDictionaryEntry {
	key?: unknown;
	canonicalKey?: unknown;
	displayName?: unknown;
	category?: unknown;
	unit?: unknown;
	aggregation?: unknown;
	dailyAggregation?: unknown;
	healthKitAggregation?: unknown;
	rollup?: unknown;
	schemaVersion?: unknown;
}

export interface NormalizedHealthMetricDataDictionaryEntry {
	key: string;
	canonicalKey: string;
	displayName?: string;
	category?: string;
	unit?: string;
	dailyAggregation?: string;
	healthKitAggregation?: string;
	rollup?: unknown;
	schemaVersion?: number;
}

export interface ParsedHealthMetricDataDictionary {
	entries: NormalizedHealthMetricDataDictionaryEntry[];
	aliases: FrontmatterAliasMap;
	unitsByCanonicalKey: Record<string, string>;
	dailyAggregationByCanonicalKey: Record<string, string>;
	healthKitAggregationByCanonicalKey: Record<string, string>;
	rollupByCanonicalKey: Record<string, unknown>;
	schemaVersion: number;
}

export type FrontmatterAliasMap = Record<string, string>;

export function schemaVersionOf(value: {
	schemaVersion?: unknown;
	schema_version?: unknown;
}): number {
	const raw = value.schemaVersion ?? value.schema_version;
	if (typeof raw === "number" && Number.isFinite(raw)) return raw;
	if (typeof raw === "string") {
		const parsed = Number(raw);
		if (Number.isFinite(parsed)) return parsed;
	}
	return 0;
}

export function schemaIsFutureVersion(version: number): boolean {
	return version > SUPPORTED_HEALTHMD_SCHEMA_VERSION;
}

export function isUnitMap(value: unknown): value is HealthMdUnitMap {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.values(value as Record<string, unknown>).every((item) => typeof item === "string")
	);
}

export function isHealthMetricDataDictionaryValue(value: unknown): boolean {
	if (!Array.isArray(value)) return false;
	return value.some((entry) => {
		if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
		const record = entry as HealthMetricDataDictionaryEntry;
		return typeof record.key === "string" && typeof record.canonicalKey === "string";
	});
}

function detectKnownSchema(format: HealthMdDataFormat, schema: string | undefined, version: number): DetectedSchema {
	if (schema === HEALTHMD_HEALTH_DATA_SCHEMA) {
		return {
			kind: "health-data",
			version,
			format,
			schema,
			isFutureVersion: schemaIsFutureVersion(version),
		};
	}
	if (schema === HEALTHMD_ROLLUP_SCHEMA) {
		return {
			kind: "rollup-summary",
			version,
			format,
			schema,
			isFutureVersion: schemaIsFutureVersion(version),
		};
	}
	return {
		kind: "unknown",
		version,
		format,
		schema,
		reason: schema ? `Unsupported Health.md schema: ${schema}` : "No recognizable Health.md schema metadata",
	};
}

export function detectJsonSchema(contentOrValue: string | unknown): DetectedSchema {
	try {
		const parsed = typeof contentOrValue === "string" ? JSON.parse(contentOrValue) as unknown : contentOrValue;
		if (isHealthMetricDataDictionaryValue(parsed)) {
			return { kind: "data-dictionary", version: schemaVersionOfDictionaryValue(parsed), format: "json" };
		}
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			return { kind: "unknown", version: 0, format: "json", reason: "JSON root is not an object" };
		}

		const record = parsed as Record<string, unknown>;
		const schema = typeof record.schema === "string" ? record.schema : undefined;
		const version = schemaVersionOf(record);
		if (schema) return detectKnownSchema("json", schema, version);

		if (record.type === "health-data" && typeof record.date === "string") {
			return { kind: "legacy-health-day", version: 0, format: "json" };
		}
		if (record.type === "health_rollup") {
			return { kind: "rollup-summary", version, format: "json", schema: HEALTHMD_ROLLUP_SCHEMA };
		}
		return { kind: "unknown", version, format: "json", reason: "JSON is not a Health.md daily export" };
	} catch {
		return { kind: "unknown", version: 0, format: "json", reason: "Invalid JSON" };
	}
}

export function detectFrontmatterSchema(frontmatter: Record<string, unknown> | undefined): DetectedSchema {
	if (!frontmatter) {
		return { kind: "unknown", version: 0, format: "markdown", reason: "No frontmatter" };
	}
	const schema = stringValue(frontmatter.schema ?? frontmatter.Schema);
	const version = schemaVersionOf({
		schemaVersion: frontmatter.schemaVersion,
		schema_version: frontmatter.schema_version,
	});
	if (schema) return detectKnownSchema("markdown", schema, version);

	const type = stringValue(frontmatter.type ?? frontmatter.Type);
	if (type === "health-data" || type === "health_data") {
		return { kind: "legacy-health-day", version: 0, format: "markdown" };
	}
	if (type === "health_rollup") {
		return { kind: "rollup-summary", version, format: "markdown", schema: HEALTHMD_ROLLUP_SCHEMA };
	}
	if (frontmatter.date !== undefined || frontmatter.Date !== undefined || frontmatter.day !== undefined || frontmatter.Day !== undefined) {
		return { kind: "legacy-health-day", version: 0, format: "markdown" };
	}
	return { kind: "unknown", version, format: "markdown", reason: "Frontmatter is not a Health.md daily export" };
}

export function detectCsvSchema(content: string): DetectedSchema {
	const lines = content.split(/\r?\n/).filter((line) => line.trim());
	if (!lines.length) return { kind: "unknown", version: 0, format: "csv", reason: "Empty CSV" };

	const header = parseCsvLine(lines[0]).map(normalizeCsvLabel);
	if (header[0] === "period" && header[1] === "period id") {
		return { kind: "rollup-summary", version: SUPPORTED_HEALTHMD_SCHEMA_VERSION, format: "csv", schema: HEALTHMD_ROLLUP_SCHEMA };
	}
	if (header[0] !== "date" || header[1] !== "category" || header[2] !== "metric" || header[3] !== "value" || header[4] !== "unit") {
		return { kind: "unknown", version: 0, format: "csv", reason: "CSV header is not a Health.md daily export" };
	}

	let schema: string | undefined;
	let version = 0;
	for (let i = 1; i < Math.min(lines.length, 40); i++) {
		const parts = parseCsvLine(lines[i]);
		if (normalizeCsvLabel(parts[1] ?? "") !== "metadata") continue;
		const metric = normalizeCsvLabel(parts[2] ?? "");
		const value = (parts[3] ?? "").trim();
		if (metric === "schema") schema = value;
		else if (metric === "schema version" || metric === "schema_version") {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) version = parsed;
		}
	}

	if (schema) return detectKnownSchema("csv", schema, version);
	return { kind: "legacy-health-day", version: 0, format: "csv" };
}

export function parseHealthMetricDataDictionary(content: string): FrontmatterAliasMap {
	return parseHealthMetricDataDictionaryDetails(content).aliases;
}

export function parseHealthMetricDataDictionaryDetails(content: string): ParsedHealthMetricDataDictionary {
	const empty: ParsedHealthMetricDataDictionary = {
		entries: [],
		aliases: {},
		unitsByCanonicalKey: {},
		dailyAggregationByCanonicalKey: {},
		healthKitAggregationByCanonicalKey: {},
		rollupByCanonicalKey: {},
		schemaVersion: 0,
	};

	try {
		const parsed = JSON.parse(content) as unknown;
		if (!Array.isArray(parsed)) return empty;

		const result: ParsedHealthMetricDataDictionary = {
			entries: [],
			aliases: {},
			unitsByCanonicalKey: {},
			dailyAggregationByCanonicalKey: {},
			healthKitAggregationByCanonicalKey: {},
			rollupByCanonicalKey: {},
			schemaVersion: schemaVersionOfDictionaryValue(parsed),
		};

		for (const entry of parsed) {
			if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
			const {
				key,
				canonicalKey,
				displayName,
				category,
				unit,
				aggregation,
				dailyAggregation,
				healthKitAggregation,
				rollup,
				schemaVersion,
			} = entry as HealthMetricDataDictionaryEntry;
			if (typeof canonicalKey !== "string" || !canonicalKey) continue;
			const exportedKey = typeof key === "string" && key ? key : canonicalKey;
			const normalizedEntry: NormalizedHealthMetricDataDictionaryEntry = {
				key: exportedKey,
				canonicalKey,
			};
			if (typeof displayName === "string") normalizedEntry.displayName = displayName;
			if (typeof category === "string") normalizedEntry.category = category;
			if (typeof unit === "string") normalizedEntry.unit = unit;
			const aggregationValue = dailyAggregation ?? aggregation;
			if (typeof aggregationValue === "string") normalizedEntry.dailyAggregation = aggregationValue;
			if (typeof healthKitAggregation === "string") normalizedEntry.healthKitAggregation = healthKitAggregation;
			if (rollup !== undefined) normalizedEntry.rollup = rollup;
			const entrySchemaVersion = schemaVersionOf({ schemaVersion });
			if (entrySchemaVersion > 0) normalizedEntry.schemaVersion = entrySchemaVersion;
			result.entries.push(normalizedEntry);

			if (exportedKey !== canonicalKey) {
				result.aliases[exportedKey] = canonicalKey;
			}
			if (normalizedEntry.unit) {
				result.unitsByCanonicalKey[canonicalKey] = normalizedEntry.unit;
			}
			if (normalizedEntry.dailyAggregation) {
				result.dailyAggregationByCanonicalKey[canonicalKey] = normalizedEntry.dailyAggregation;
			}
			if (normalizedEntry.healthKitAggregation) {
				result.healthKitAggregationByCanonicalKey[canonicalKey] = normalizedEntry.healthKitAggregation;
			}
			if (rollup !== undefined) {
				result.rollupByCanonicalKey[canonicalKey] = rollup;
			}
		}
		return result;
	} catch {
		return empty;
	}
}

function schemaVersionOfDictionaryValue(value: unknown): number {
	if (!Array.isArray(value)) return 0;
	let maxVersion = 0;
	for (const entry of value) {
		if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
		const version = schemaVersionOf({ schemaVersion: (entry as HealthMetricDataDictionaryEntry).schemaVersion });
		if (version > maxVersion) maxVersion = version;
	}
	return maxVersion;
}

function stringValue(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return undefined;
}

function normalizeCsvLabel(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
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
