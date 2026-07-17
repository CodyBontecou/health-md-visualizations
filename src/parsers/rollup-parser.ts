import {
	HEALTHMD_ROLLUP_SCHEMA,
	HealthMdUnitMap,
	schemaVersionOf,
} from "../healthmd-schema";
import { isBlankCsvRecord, iterateCsvRecords } from "../csv-utils";
import {
	HealthRollupMetric,
	HealthRollupPeriod,
	HealthRollupSummary,
} from "../types";
import { parseFrontmatter } from "./markdown-parser";

const SUPPORTED_ROLLUP_PERIODS = new Set<HealthRollupPeriod>(["weekly", "monthly", "yearly"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return undefined;
}

function numberValue(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value.replace(/,/g, ""));
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function normalizedValue(value: unknown): unknown {
	if (typeof value !== "string") return value;
	const trimmed = value.trim();
	const number = numberValue(trimmed);
	if (number !== undefined) return number;
	if (trimmed.toLowerCase() === "true") return true;
	if (trimmed.toLowerCase() === "false") return false;
	return trimmed;
}

function normalizePeriod(value: unknown): HealthRollupPeriod | undefined {
	const period = stringValue(value)?.trim().toLowerCase();
	return period && SUPPORTED_ROLLUP_PERIODS.has(period as HealthRollupPeriod)
		? period as HealthRollupPeriod
		: undefined;
}

function firstString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
	for (const key of keys) {
		const value = stringValue(record[key]);
		if (value !== undefined && value !== "") return value;
	}
	return undefined;
}

function firstNumber(record: Record<string, unknown>, ...keys: string[]): number | undefined {
	for (const key of keys) {
		const value = numberValue(record[key]);
		if (value !== undefined) return value;
	}
	return undefined;
}

function stringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const result = value.flatMap((item) => {
		const string = stringValue(item);
		return string ? [string] : [];
	});
	return result.length ? result : undefined;
}

function unitMap(value: unknown): HealthMdUnitMap | undefined {
	if (!isRecord(value)) return undefined;
	const result: HealthMdUnitMap = {};
	for (const [key, raw] of Object.entries(value)) {
		const unit = stringValue(raw);
		if (unit !== undefined) result[key] = unit;
	}
	return Object.keys(result).length ? result : undefined;
}

function normalizeStatistics(value: unknown): Record<string, unknown> {
	const statistics: Record<string, unknown> = {};
	if (Array.isArray(value)) {
		for (const item of value) {
			if (!isRecord(item)) continue;
			const name = firstString(item, "name", "statistic");
			if (name) statistics[name] = normalizedValue(item.value ?? item.statistic_value);
		}
	} else if (isRecord(value)) {
		for (const [name, raw] of Object.entries(value)) statistics[name] = normalizedValue(raw);
	}
	return statistics;
}

function normalizeMetric(value: unknown, fallbackKey?: string): HealthRollupMetric | undefined {
	if (!isRecord(value)) return undefined;
	const canonicalKey = firstString(value, "canonical_key", "canonicalKey", "key") ?? fallbackKey;
	if (!canonicalKey) return undefined;
	const primaryValue = normalizedValue(value.primary_value ?? value.primaryValue ?? value.value);
	return {
		key: firstString(value, "key") ?? fallbackKey,
		canonicalKey,
		category: firstString(value, "category"),
		displayName: firstString(value, "display_name", "displayName", "metric"),
		primaryValue,
		value: primaryValue,
		unit: firstString(value, "unit"),
		rule: firstString(value, "rule"),
		daysCounted: firstNumber(value, "days_counted", "daysCounted", "metric_days_counted"),
		statistics: normalizeStatistics(value.statistics),
		notes: firstString(value, "notes"),
	};
}

function normalizeMetrics(record: Record<string, unknown>): Record<string, HealthRollupMetric> | undefined {
	const raw = record.rollup_metrics ?? record.metrics;
	const result: Record<string, HealthRollupMetric> = {};
	if (Array.isArray(raw)) {
		for (const item of raw) {
			const metric = normalizeMetric(item);
			if (metric) result[metric.canonicalKey] = metric;
		}
	} else if (isRecord(raw)) {
		for (const [key, value] of Object.entries(raw)) {
			const metric = normalizeMetric(value, key);
			if (metric) result[metric.canonicalKey] = metric;
		}
	}
	return Object.keys(result).length ? result : undefined;
}

function buildRollupSummary(record: Record<string, unknown>): HealthRollupSummary | null {
	const schema = firstString(record, "schema", "Schema");
	const type = firstString(record, "type", "Type");
	if (schema !== HEALTHMD_ROLLUP_SCHEMA && type !== "health_rollup") return null;

	const rollupPeriod = normalizePeriod(record.rollup_period ?? record.rollupPeriod ?? record.period ?? record.Period);
	const periodId = firstString(record, "period_id", "periodId", "Period ID", "periodID");
	if (!rollupPeriod || !periodId) return null;

	const schemaVersion = schemaVersionOf({
		schemaVersion: record.schemaVersion,
		schema_version: record.schema_version,
	});
	const sourceSchemaVersion = firstNumber(record, "source_schema_version", "sourceSchemaVersion");
	const rollupRulesVersion = firstNumber(record, "rollup_rules_version", "rollupRulesVersion");
	const sourceDates = stringArray(record.source_dates ?? record.sourceDates);
	const generatedAt = firstString(record, "generated_at", "generatedAt");

	return {
		type: "health_rollup",
		schema: HEALTHMD_ROLLUP_SCHEMA,
		schemaVersion: schemaVersion || undefined,
		schema_version: schemaVersion || undefined,
		rollupPeriod,
		rollup_period: rollupPeriod,
		periodId,
		period_id: periodId,
		startDate: firstString(record, "start_date", "startDate", "Start Date"),
		start_date: firstString(record, "start_date", "startDate", "Start Date"),
		endDate: firstString(record, "end_date", "endDate", "End Date"),
		end_date: firstString(record, "end_date", "endDate", "End Date"),
		daysExpected: firstNumber(record, "days_expected", "daysExpected", "Days Expected"),
		days_expected: firstNumber(record, "days_expected", "daysExpected", "Days Expected"),
		daysCounted: firstNumber(record, "days_counted", "daysCounted", "Days Counted"),
		days_counted: firstNumber(record, "days_counted", "daysCounted", "Days Counted"),
		coveragePercent: firstNumber(record, "coverage_percent", "coveragePercent", "Coverage Percent"),
		coverage_percent: firstNumber(record, "coverage_percent", "coveragePercent", "Coverage Percent"),
		sourceSchema: firstString(record, "source_schema", "sourceSchema"),
		source_schema: firstString(record, "source_schema", "sourceSchema"),
		sourceSchemaVersion,
		source_schema_version: sourceSchemaVersion,
		rollupRulesVersion,
		rollup_rules_version: rollupRulesVersion,
		generatedAt,
		generated_at: generatedAt,
		sourceDates,
		source_dates: sourceDates,
		units: unitMap(record.units),
		metrics: normalizeMetrics(record),
	};
}

export function parseRollupJSON(content: string): HealthRollupSummary | null {
	try {
		const parsed = JSON.parse(content) as unknown;
		return isRecord(parsed) ? buildRollupSummary(parsed) : null;
	} catch {
		return null;
	}
}

interface MarkdownTable {
	context: string;
	headers: string[];
	rows: string[][];
}

function parseMarkdownTables(body: string): MarkdownTable[] {
	const lines = body.split(/\r?\n/);
	const tables: MarkdownTable[] = [];
	let context = "";
	for (let i = 0; i < lines.length; i++) {
		const heading = /^#{1,6}\s+(.+)$/.exec(lines[i].trim());
		if (heading) {
			context = heading[1].trim();
			continue;
		}
		const headerLine = lines[i].trim();
		const separatorLine = lines[i + 1]?.trim() ?? "";
		if (!headerLine.startsWith("|") || !separatorLine.startsWith("|")) continue;
		const split = (line: string): string[] => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim().replace(/`/g, ""));
		const headers = split(headerLine);
		if (!split(separatorLine).every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
		const rows: string[][] = [];
		i += 2;
		while (i < lines.length && lines[i].trim().startsWith("|")) {
			rows.push(split(lines[i].trim()));
			i++;
		}
		i--;
		tables.push({ context, headers, rows });
	}
	return tables;
}

function metricsFromMarkdown(body: string): Record<string, HealthRollupMetric> | undefined {
	const metrics: Record<string, HealthRollupMetric> = {};
	for (const table of parseMarkdownTables(body)) {
		const headers = table.headers.map((header) => header.toLowerCase());
		const keyIndex = headers.indexOf("key");
		if (keyIndex < 0) continue;
		const statisticIndex = headers.indexOf("statistic");
		const valueIndex = headers.indexOf("value");
		if (valueIndex < 0) continue;

		if (statisticIndex >= 0) {
			for (const row of table.rows) {
				const key = row[keyIndex];
				const statistic = row[statisticIndex];
				if (!key || !statistic) continue;
				const metric = metrics[key] ?? { canonicalKey: key, statistics: {} };
				metric.statistics[statistic] = normalizedValue(row[valueIndex]);
				metrics[key] = metric;
			}
			continue;
		}

		const metricIndex = headers.indexOf("metric");
		const unitIndex = headers.indexOf("unit");
		const daysIndex = headers.indexOf("days");
		const ruleIndex = headers.indexOf("rule");
		for (const row of table.rows) {
			const key = row[keyIndex];
			if (!key) continue;
			const existing = metrics[key];
			metrics[key] = {
				key,
				canonicalKey: key,
				category: table.context.replace(/ statistics$/i, ""),
				displayName: metricIndex >= 0 ? row[metricIndex] : undefined,
				primaryValue: normalizedValue(row[valueIndex]),
				value: normalizedValue(row[valueIndex]),
				unit: unitIndex >= 0 ? row[unitIndex] : undefined,
				rule: ruleIndex >= 0 ? row[ruleIndex] : undefined,
				daysCounted: daysIndex >= 0 ? numberValue(row[daysIndex]?.split("/")[0]) : undefined,
				statistics: existing?.statistics ?? {},
			};
		}
	}
	return Object.keys(metrics).length ? metrics : undefined;
}

export function parseRollupMarkdown(
	content: string,
	cachedFrontmatter?: Record<string, unknown>
): HealthRollupSummary | null {
	const parsed = parseFrontmatter(content);
	const frontmatter = parsed.frontmatter ?? {};
	const record = cachedFrontmatter ? { ...frontmatter, ...cachedFrontmatter } : frontmatter;
	const summary = buildRollupSummary(record);
	if (!summary) return null;
	if (!summary.metrics) summary.metrics = metricsFromMarkdown(parsed.body);
	return summary;
}

function normalizeCsvLabel(value: string): string {
	return value.trim().replace(/[_\s]+/g, " ").toLowerCase();
}

function indexOfHeader(header: string[], ...names: string[]): number {
	const normalizedNames = names.map(normalizeCsvLabel);
	return header.findIndex((item) => normalizedNames.includes(item));
}

function csvValue(row: string[], index: number): string | undefined {
	if (index < 0) return undefined;
	const value = row[index]?.trim();
	return value ? value : undefined;
}

export function parseRollupCSV(content: string): HealthRollupSummary | null {
	const records = Array.from(iterateCsvRecords(content)).filter((row) => !isBlankCsvRecord(row));
	if (records.length < 2) return null;
	const header = records[0].map(normalizeCsvLabel);
	const periodIndex = indexOfHeader(header, "Period");
	const periodIdIndex = indexOfHeader(header, "Period ID", "period_id");
	if (periodIndex < 0 || periodIdIndex < 0) return null;

	const startDateIndex = indexOfHeader(header, "Start Date", "start_date");
	const endDateIndex = indexOfHeader(header, "End Date", "end_date");
	const daysExpectedIndex = indexOfHeader(header, "Days Expected", "days_expected");
	const daysCountedIndex = indexOfHeader(header, "Days Counted", "days_counted");
	const coveragePercentIndex = indexOfHeader(header, "Coverage Percent", "coverage_percent");
	const categoryIndex = indexOfHeader(header, "Category");
	const metricIndex = indexOfHeader(header, "Metric");
	const keyIndex = indexOfHeader(header, "Key");
	const canonicalKeyIndex = indexOfHeader(header, "Canonical Key", "canonicalKey");
	const primaryValueIndex = indexOfHeader(header, "Primary Value", "primary_value", "Value");
	const unitIndex = indexOfHeader(header, "Unit");
	const metricDaysCountedIndex = indexOfHeader(header, "Metric Days Counted", "metric_days_counted");
	const ruleIndex = indexOfHeader(header, "Rule");
	const statisticIndex = indexOfHeader(header, "Statistic");
	const statisticValueIndex = indexOfHeader(header, "Statistic Value", "statistic_value");
	const notesIndex = indexOfHeader(header, "Notes");
	const sourceSchemaIndex = indexOfHeader(header, "Source Schema", "source_schema");
	const sourceSchemaVersionIndex = indexOfHeader(header, "Source Schema Version", "source_schema_version");
	const schemaVersionIndex = indexOfHeader(header, "Schema Version", "schema_version");

	const firstRow = records[1];
	const rollupPeriod = normalizePeriod(csvValue(firstRow, periodIndex));
	const periodId = csvValue(firstRow, periodIdIndex);
	if (!rollupPeriod || !periodId) return null;

	const metrics: Record<string, HealthRollupMetric> = {};
	const units: HealthMdUnitMap = {};
	for (const row of records.slice(1)) {
		const metricKey = csvValue(row, canonicalKeyIndex) ?? csvValue(row, keyIndex) ?? csvValue(row, metricIndex);
		if (!metricKey) continue;
		const existing = metrics[metricKey] ?? {
			key: csvValue(row, keyIndex),
			canonicalKey: metricKey,
			category: csvValue(row, categoryIndex),
			displayName: csvValue(row, metricIndex),
			primaryValue: normalizedValue(csvValue(row, primaryValueIndex)),
			value: normalizedValue(csvValue(row, primaryValueIndex)),
			unit: csvValue(row, unitIndex),
			rule: csvValue(row, ruleIndex),
			daysCounted: numberValue(csvValue(row, metricDaysCountedIndex)),
			statistics: {},
			notes: csvValue(row, notesIndex),
		};
		const statistic = csvValue(row, statisticIndex);
		if (statistic && statistic !== "primary") {
			existing.statistics[statistic] = normalizedValue(csvValue(row, statisticValueIndex));
		}
		metrics[metricKey] = existing;
		if (existing.unit !== undefined) units[metricKey] = existing.unit;
	}

	const schemaVersion = numberValue(csvValue(firstRow, schemaVersionIndex));
	const sourceSchemaVersion = numberValue(csvValue(firstRow, sourceSchemaVersionIndex));
	return {
		type: "health_rollup",
		schema: HEALTHMD_ROLLUP_SCHEMA,
		schemaVersion,
		schema_version: schemaVersion,
		rollupPeriod,
		rollup_period: rollupPeriod,
		periodId,
		period_id: periodId,
		startDate: csvValue(firstRow, startDateIndex),
		start_date: csvValue(firstRow, startDateIndex),
		endDate: csvValue(firstRow, endDateIndex),
		end_date: csvValue(firstRow, endDateIndex),
		daysExpected: numberValue(csvValue(firstRow, daysExpectedIndex)),
		days_expected: numberValue(csvValue(firstRow, daysExpectedIndex)),
		daysCounted: numberValue(csvValue(firstRow, daysCountedIndex)),
		days_counted: numberValue(csvValue(firstRow, daysCountedIndex)),
		coveragePercent: numberValue(csvValue(firstRow, coveragePercentIndex)),
		coverage_percent: numberValue(csvValue(firstRow, coveragePercentIndex)),
		sourceSchema: csvValue(firstRow, sourceSchemaIndex),
		source_schema: csvValue(firstRow, sourceSchemaIndex),
		sourceSchemaVersion,
		source_schema_version: sourceSchemaVersion,
		units: Object.keys(units).length ? units : undefined,
		metrics: Object.keys(metrics).length ? metrics : undefined,
	};
}

export function parseRollupByFormat(
	content: string,
	format: "auto" | "json" | "csv" | "markdown" | "bases",
	cachedFrontmatter?: Record<string, unknown>
): HealthRollupSummary | null {
	switch (format) {
		case "json": return parseRollupJSON(content);
		case "csv": return parseRollupCSV(content);
		case "markdown":
		case "bases": return parseRollupMarkdown(content, cachedFrontmatter);
		case "auto": return null;
	}
}
