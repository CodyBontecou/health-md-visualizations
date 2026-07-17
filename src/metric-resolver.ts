import type { ParsedHealthMetricDataDictionary } from "./healthmd-schema";
import { isUnitMap } from "./healthmd-schema";
import { builtinMetricDefinition, type MetricDefinition } from "./metric-catalog";
import { canonicalMetricsFromTypedDay } from "./summary-metric-normalizer";
import type { HealthDay, HealthMetricScalar } from "./types";

export interface ResolvedMetricDefinition extends MetricDefinition {
	dailyAggregation?: string;
}

export interface NumericMetricPoint {
	day: HealthDay;
	date: string;
	value: number;
}

export interface ScalarMetricPoint {
	day: HealthDay;
	date: string;
	value: HealthMetricScalar;
}

function canonicalKeyFor(input: string, dictionary?: ParsedHealthMetricDataDictionary): string {
	const normalized = input.trim();
	return dictionary?.aliases[normalized] ?? normalized;
}

export function resolveMetricScalar(
	day: HealthDay,
	key: string,
	dictionary?: ParsedHealthMetricDataDictionary
): HealthMetricScalar | undefined {
	const canonicalKey = canonicalKeyFor(key, dictionary);
	const direct = day.canonicalMetrics?.[canonicalKey];
	if (direct !== undefined) return direct;
	return canonicalMetricsFromTypedDay(day)[canonicalKey];
}

export function resolveNumericMetric(
	day: HealthDay,
	key: string,
	dictionary?: ParsedHealthMetricDataDictionary
): number | undefined {
	const value = resolveMetricScalar(day, key, dictionary);
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value.replace(/,/g, ""));
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

export function numericMetricSeries(
	days: HealthDay[],
	key: string,
	dictionary?: ParsedHealthMetricDataDictionary
): NumericMetricPoint[] {
	return days.flatMap((day): NumericMetricPoint[] => {
		const value = resolveNumericMetric(day, key, dictionary);
		return value === undefined ? [] : [{ day, date: day.date, value }];
	});
}

export function scalarMetricSeries(
	days: HealthDay[],
	key: string,
	dictionary?: ParsedHealthMetricDataDictionary
): ScalarMetricPoint[] {
	return days.flatMap((day): ScalarMetricPoint[] => {
		const value = resolveMetricScalar(day, key, dictionary);
		return value === undefined ? [] : [{ day, date: day.date, value }];
	});
}

export function resolveMetricDefinition(
	key: string,
	dictionary?: ParsedHealthMetricDataDictionary,
	days: HealthDay[] = []
): ResolvedMetricDefinition {
	const canonicalKey = canonicalKeyFor(key, dictionary);
	const builtin = builtinMetricDefinition(canonicalKey);
	const entry = dictionary?.entries.find((candidate) => candidate.canonicalKey === canonicalKey);
	let unit = entry?.unit || builtin.unit;
	if (!unit) {
		for (const day of days) {
			if (isUnitMap(day.units) && day.units[canonicalKey]) {
				unit = day.units[canonicalKey];
				break;
			}
		}
	}
	return {
		...builtin,
		key: canonicalKey,
		label: entry?.displayName || builtin.label,
		category: entry?.category || builtin.category,
		unit,
		dailyAggregation: entry?.dailyAggregation,
	};
}

export function formatMetricValue(value: HealthMetricScalar, definition: MetricDefinition): string {
	if (typeof value === "boolean") return value ? "Yes" : "No";
	if (typeof value === "string") return value;
	const precision = definition.precision ?? (Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2);
	const formatted = value.toLocaleString(undefined, { maximumFractionDigits: precision, minimumFractionDigits: 0 });
	return definition.unit && definition.unit !== "boolean" && definition.unit !== "datetime"
		? `${formatted} ${definition.unit}`
		: formatted;
}

export function observedCanonicalKeys(days: HealthDay[]): string[] {
	const keys = new Set<string>();
	for (const day of days) {
		for (const key of Object.keys(day.canonicalMetrics ?? {})) keys.add(key);
	}
	return Array.from(keys).sort();
}
