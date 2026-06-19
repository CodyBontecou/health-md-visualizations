import {
	HEALTHMD_ROLLUP_SCHEMA,
	SUPPORTED_HEALTHMD_ROLLUP_SCHEMA_VERSION,
	schemaVersionOf,
} from "../healthmd-schema";
import { HealthRollupPeriod, HealthRollupSummary } from "../types";
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
	const metrics = isRecord(record.rollup_metrics)
		? record.rollup_metrics
		: (isRecord(record.metrics) ? record.metrics : undefined);

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
		metrics,
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

export function parseRollupMarkdown(
	content: string,
	cachedFrontmatter?: Record<string, unknown>
): HealthRollupSummary | null {
	const parsed = parseFrontmatter(content);
	const frontmatter = parsed.frontmatter ?? {};
	const record = cachedFrontmatter ? { ...frontmatter, ...cachedFrontmatter } : frontmatter;
	return buildRollupSummary(record);
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

function parseCsvNumber(value: string | undefined): number | undefined {
	return value === undefined ? undefined : numberValue(value);
}

function parseMetricValue(value: string | undefined): unknown {
	const parsed = parseCsvNumber(value);
	return parsed ?? value;
}

export function parseRollupCSV(content: string): HealthRollupSummary | null {
	const lines = content.split(/\r?\n/).filter((line) => line.trim());
	if (lines.length < 2) return null;

	const header = parseCsvLine(lines[0]).map(normalizeCsvLabel);
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
	const ruleIndex = indexOfHeader(header, "Rule");
	const statisticIndex = indexOfHeader(header, "Statistic");
	const statisticValueIndex = indexOfHeader(header, "Statistic Value", "statistic_value");
	const sourceSchemaIndex = indexOfHeader(header, "Source Schema", "source_schema");
	const sourceSchemaVersionIndex = indexOfHeader(header, "Source Schema Version", "source_schema_version");
	const schemaVersionIndex = indexOfHeader(header, "Schema Version", "schema_version");

	const firstRow = parseCsvLine(lines[1]);
	const rollupPeriod = normalizePeriod(csvValue(firstRow, periodIndex));
	const periodId = csvValue(firstRow, periodIdIndex);
	if (!rollupPeriod || !periodId) return null;

	const metrics: Record<string, unknown> = {};
	for (let i = 1; i < lines.length; i++) {
		const row = parseCsvLine(lines[i]);
		const metricKey = csvValue(row, canonicalKeyIndex) ?? csvValue(row, keyIndex) ?? csvValue(row, metricIndex);
		if (!metricKey) continue;
		metrics[metricKey] = {
			category: csvValue(row, categoryIndex),
			metric: csvValue(row, metricIndex),
			key: csvValue(row, keyIndex),
			canonicalKey: csvValue(row, canonicalKeyIndex),
			value: parseMetricValue(csvValue(row, primaryValueIndex)),
			unit: csvValue(row, unitIndex),
			rule: csvValue(row, ruleIndex),
			statistic: csvValue(row, statisticIndex),
			statisticValue: parseMetricValue(csvValue(row, statisticValueIndex)),
		};
	}

	const schemaVersion = parseCsvNumber(csvValue(firstRow, schemaVersionIndex)) ?? SUPPORTED_HEALTHMD_ROLLUP_SCHEMA_VERSION;
	const sourceSchemaVersion = parseCsvNumber(csvValue(firstRow, sourceSchemaVersionIndex));

	return {
		type: "health_rollup",
		schema: HEALTHMD_ROLLUP_SCHEMA,
		schemaVersion: schemaVersion,
		schema_version: schemaVersion,
		rollupPeriod,
		rollup_period: rollupPeriod,
		periodId,
		period_id: periodId,
		startDate: csvValue(firstRow, startDateIndex),
		start_date: csvValue(firstRow, startDateIndex),
		endDate: csvValue(firstRow, endDateIndex),
		end_date: csvValue(firstRow, endDateIndex),
		daysExpected: parseCsvNumber(csvValue(firstRow, daysExpectedIndex)),
		days_expected: parseCsvNumber(csvValue(firstRow, daysExpectedIndex)),
		daysCounted: parseCsvNumber(csvValue(firstRow, daysCountedIndex)),
		days_counted: parseCsvNumber(csvValue(firstRow, daysCountedIndex)),
		coveragePercent: parseCsvNumber(csvValue(firstRow, coveragePercentIndex)),
		coverage_percent: parseCsvNumber(csvValue(firstRow, coveragePercentIndex)),
		sourceSchema: csvValue(firstRow, sourceSchemaIndex),
		source_schema: csvValue(firstRow, sourceSchemaIndex),
		sourceSchemaVersion,
		source_schema_version: sourceSchemaVersion,
		metrics: Object.keys(metrics).length ? metrics : undefined,
	};
}

export function parseRollupByFormat(
	content: string,
	format: "auto" | "json" | "csv" | "markdown" | "bases",
	cachedFrontmatter?: Record<string, unknown>
): HealthRollupSummary | null {
	switch (format) {
		case "json":
			return parseRollupJSON(content);
		case "csv":
			return parseRollupCSV(content);
		case "markdown":
		case "bases":
			return parseRollupMarkdown(content, cachedFrontmatter);
		case "auto":
			return null;
	}
}
