import {
	App,
	MarkdownPostProcessorContext,
	MarkdownRenderChild,
	Notice,
	TFile,
	normalizePath,
} from "obsidian";
import type HealthMdPlugin from "./main";
import { DataPointClickAction, HealthDay, HitRegion, HitRegistry, VizConfig } from "./types";
import { setupCanvas, resolveTheme, formatDuration } from "./canvas-utils";
import { doseStatusKind } from "./medication-utils";
import { HTML_VISUALIZATIONS, VISUALIZATIONS } from "./visualizations";
import {
	parseFrontmatterVariableReference,
	resolveDynamicDateVariable,
} from "./date-variables";

function noHealthDataMessage(plugin: HealthMdPlugin): string {
	const summary = plugin.dataLoader.getLastLoadSummary?.();
	const suffix = summary ? ` ${summary}` : "";
	return `No health data found in ${plugin.settings.dataFolder}/. Supported formats: JSON, CSV, or Markdown/Bases with YAML frontmatter.${suffix}`;
}

function parseConfig(source: string): VizConfig {
	const config: VizConfig = { type: "" };
	for (const line of source.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const colonIdx = trimmed.indexOf(":");
		if (colonIdx === -1) continue;
		const key = trimmed.slice(0, colonIdx).trim();
		const val = trimmed.slice(colonIdx + 1).trim();
		const num = Number(val);
		config[key] = isNaN(num) ? val : num;
	}
	return config;
}

const DATE_VARIABLE_KEYS = ["from", "to", "date"] as const;
type DateVariableKey = typeof DATE_VARIABLE_KEYS[number];

function frontmatterDateValueToString(
	value: unknown,
	key: DateVariableKey
): string | null {
	if (value instanceof Date) {
		const ms = value.getTime();
		if (Number.isNaN(ms)) return null;
		const iso = value.toISOString();
		const isMidnightUtc =
			value.getUTCHours() === 0 &&
			value.getUTCMinutes() === 0 &&
			value.getUTCSeconds() === 0 &&
			value.getUTCMilliseconds() === 0;
		if (key === "date" || isMidnightUtc) return iso.slice(0, 10);
		return iso.replace(/\.\d{3}Z$/, "Z");
	}
	if (typeof value === "string") return value.trim();
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return null;
}

function parseSimpleFrontmatter(source: string): Record<string, unknown> | null {
	const match = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
	if (!match) return null;

	const frontmatter: Record<string, unknown> = {};
	for (const line of match[1].split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#") || /^\s/.test(line)) continue;

		const colonIdx = line.indexOf(":");
		if (colonIdx === -1) continue;

		const key = line.slice(0, colonIdx).trim();
		if (!key) continue;

		let value = line.slice(colonIdx + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		frontmatter[key] = value;
	}
	return frontmatter;
}

async function getFrontmatterForContext(
	plugin: HealthMdPlugin,
	ctx: MarkdownPostProcessorContext
): Promise<unknown> {
	const contextFrontmatter = ctx.frontmatter as unknown;
	const cachedFrontmatter =
		plugin.app.metadataCache.getCache(ctx.sourcePath)?.frontmatter;
	const cached = contextFrontmatter ?? cachedFrontmatter;

	let parsed: Record<string, unknown> | null = null;
	if (ctx.sourcePath) {
		const sourceFile = plugin.app.vault.getAbstractFileByPath(
			normalizePath(ctx.sourcePath)
		);
		if (sourceFile instanceof TFile) {
			try {
				parsed = parseSimpleFrontmatter(await plugin.app.vault.read(sourceFile));
			} catch (error) {
				console.warn("Health.md: failed to read note frontmatter", error);
			}
		}
	}

	if (parsed && isRecord(cached)) return { ...parsed, ...cached };
	return cached ?? parsed;
}

function resolveDateVariables(
	config: VizConfig,
	frontmatter: unknown
): { config: VizConfig } | { error: string } {
	const resolved: VizConfig = { ...config };
	for (const key of DATE_VARIABLE_KEYS) {
		const raw = config[key];
		if (typeof raw !== "string") continue;

		const dynamic = resolveDynamicDateVariable(raw);
		if (dynamic.matched) {
			if ("error" in dynamic) return { error: dynamic.error };
			if (key === "date") {
				const parsed = parseBoundary(dynamic.value, key);
				if ("error" in parsed) return { error: parsed.error };
				resolved[key] = parsed.date;
				continue;
			}
			resolved[key] = dynamic.value;
			continue;
		}

		const variable = parseFrontmatterVariableReference(raw);
		if (!variable) continue;

		if (
			!isRecord(frontmatter) ||
			!Object.prototype.hasOwnProperty.call(frontmatter, variable)
		) {
			return {
				error: `Missing frontmatter variable "${variable}" for "${key}". Add "${variable}" to this note's frontmatter or use a literal date.`,
			};
		}

		const value = frontmatter[variable];
		const dateValue = frontmatterDateValueToString(value, key);
		if (!dateValue) {
			return {
				error: `Frontmatter variable "${variable}" for "${key}" must be a date or datetime string.`,
			};
		}
		if (key === "date") {
			const parsed = parseBoundary(dateValue, key);
			if ("error" in parsed) return { error: parsed.error };
			resolved[key] = parsed.date;
			continue;
		}
		resolved[key] = dateValue;
	}
	return { config: resolved };
}

// Accepts:
//   YYYY-MM-DD
//   YYYY-MM-DDTHH:MM
//   YYYY-MM-DDTHH:MM:SS
// with an optional trailing Z, ±HH:MM, or ±HHMM timezone.
const DATE_OR_DATETIME =
	/^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function toISODate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

interface ParsedBoundary {
	date: string;       // YYYY-MM-DD portion (used for day-level filtering)
	ms?: number;        // epoch ms — only set when input had a time component
	label: string;      // original input for messages
}

function parseBoundary(
	raw: string | number,
	field: string
): ParsedBoundary | { error: string } {
	const v = String(raw);
	const m = DATE_OR_DATETIME.exec(v);
	if (!m) {
		return {
			error: `Invalid "${field}" value: ${v}. Use YYYY-MM-DD or YYYY-MM-DDTHH:MM[:SS].`,
		};
	}
	const date = m[1];
	if (!m[2]) return { date, label: v };
	const ms = Date.parse(v);
	if (Number.isNaN(ms)) {
		return { error: `Invalid "${field}" datetime: ${v}.` };
	}
	return { date, ms, label: v };
}

interface DateRange {
	fromDate?: string;
	toDate?: string;
	fromMs?: number;
	toMs?: number;
	fromLabel?: string;
	toLabel?: string;
	error?: string;
}

function resolveDateRange(config: VizConfig): DateRange {
	const fromRaw = config.from;
	const toRaw = config.to;
	const lastRaw = config.last;

	const range: DateRange = {};

	if (fromRaw !== undefined) {
		const parsed = parseBoundary(fromRaw, "from");
		if ("error" in parsed) return { error: parsed.error };
		range.fromDate = parsed.date;
		range.fromMs = parsed.ms;
		range.fromLabel = parsed.label;
	}
	if (toRaw !== undefined) {
		const parsed = parseBoundary(toRaw, "to");
		if ("error" in parsed) return { error: parsed.error };
		range.toDate = parsed.date;
		range.toMs = parsed.ms;
		range.toLabel = parsed.label;
	}

	if (lastRaw !== undefined) {
		const n = typeof lastRaw === "number" ? lastRaw : Number(lastRaw);
		if (!Number.isFinite(n) || n <= 0) {
			return { error: `Invalid "last": ${lastRaw}. Use a positive number of days.` };
		}
		// Anchor on the to-date if provided, otherwise today (calendar-day window).
		const anchor = range.toDate
			? new Date(range.toDate + "T00:00:00")
			: new Date();
		const start = new Date(anchor);
		start.setDate(start.getDate() - (Math.floor(n) - 1));
		range.fromDate = toISODate(start);
		range.fromMs = undefined;
		range.fromLabel = range.fromDate;
		if (!range.toDate) {
			range.toDate = toISODate(anchor);
			range.toLabel = range.toDate;
		}
	}

	if (range.fromDate && range.toDate) {
		if (
			range.fromDate > range.toDate ||
			(range.fromDate === range.toDate &&
				range.fromMs !== undefined &&
				range.toMs !== undefined &&
				range.fromMs > range.toMs)
		) {
			return {
				error: `"from" (${range.fromLabel}) is after "to" (${range.toLabel}).`,
			};
		}
	}

	return range;
}

function sliceTimestamped<T extends { timestamp: string }>(
	arr: T[] | undefined,
	fromMs: number | undefined,
	toMs: number | undefined
): T[] | undefined {
	if (!arr) return arr;
	return arr.filter((s) => {
		const ms = Date.parse(s.timestamp);
		if (Number.isNaN(ms)) return true;
		if (fromMs !== undefined && ms < fromMs) return false;
		if (toMs !== undefined && ms > toMs) return false;
		return true;
	});
}

function avg(nums: number[]): number {
	let sum = 0;
	for (const n of nums) sum += n;
	return sum / nums.length;
}

function sampleValues<T extends { value: number }>(arr: T[]): number[] {
	const out: number[] = [];
	for (const s of arr) {
		if (Number.isFinite(s.value)) out.push(s.value);
	}
	return out;
}

function recomputeHeart(
	original: NonNullable<HealthDay["heart"]>,
	sliced: NonNullable<HealthDay["heart"]>
): NonNullable<HealthDay["heart"]> {
	const next = { ...sliced };
	const hadHrSamples =
		!!original.heartRateSamples && original.heartRateSamples.length > 0;
	if (hadHrSamples) {
		const values = sampleValues(sliced.heartRateSamples ?? []);
		if (values.length) {
			next.averageHeartRate = avg(values);
			next.heartRateMin = Math.min(...values);
			next.heartRateMax = Math.max(...values);
		} else {
			next.averageHeartRate = 0;
			next.heartRateMin = 0;
			next.heartRateMax = 0;
		}
	}
	const hadHrvSamples =
		!!original.hrvSamples && original.hrvSamples.length > 0;
	if (hadHrvSamples) {
		const values = sampleValues(sliced.hrvSamples ?? []);
		next.hrv = values.length ? avg(values) : undefined;
	}
	return next;
}

function recomputeVitals(
	original: NonNullable<HealthDay["vitals"]>,
	sliced: NonNullable<HealthDay["vitals"]>
): NonNullable<HealthDay["vitals"]> {
	const next = { ...sliced };
	const hadOxSamples =
		!!original.bloodOxygenSamples && original.bloodOxygenSamples.length > 0;
	if (hadOxSamples) {
		const values = sampleValues(sliced.bloodOxygenSamples ?? []);
		if (values.length) {
			const a = avg(values);
			next.bloodOxygenAvg = a;
			next.bloodOxygenMin = Math.min(...values);
			next.bloodOxygenMax = Math.max(...values);
			next.bloodOxygenPercent = a;
		} else {
			next.bloodOxygenAvg = undefined;
			next.bloodOxygenMin = undefined;
			next.bloodOxygenMax = undefined;
			next.bloodOxygenPercent = undefined;
		}
	}
	const hadRespSamples =
		!!original.respiratoryRateSamples &&
		original.respiratoryRateSamples.length > 0;
	if (hadRespSamples) {
		const values = sampleValues(sliced.respiratoryRateSamples ?? []);
		if (values.length) {
			const a = avg(values);
			next.respiratoryRateAvg = a;
			next.respiratoryRateMin = Math.min(...values);
			next.respiratoryRateMax = Math.max(...values);
			next.respiratoryRate = a;
		} else {
			next.respiratoryRateAvg = undefined;
			next.respiratoryRateMin = undefined;
			next.respiratoryRateMax = undefined;
			next.respiratoryRate = undefined;
		}
	}
	return next;
}

function recomputeSleep(
	original: NonNullable<HealthDay["sleep"]>,
	sliced: NonNullable<HealthDay["sleep"]>
): NonNullable<HealthDay["sleep"]> {
	if (!original.sleepStages || original.sleepStages.length === 0) {
		// No stages to derive aggregates from — leave the original aggregates intact.
		return sliced;
	}
	let deep = 0;
	let rem = 0;
	let core = 0;
	let awake = 0;
	let hasAwake = false;
	let firstStartMs = Infinity;
	let lastEndMs = -Infinity;
	let bedtime = "";
	let wakeTime = "";

	for (const s of sliced.sleepStages) {
		const stage = s.stage.toLowerCase();
		const dur = s.durationSeconds || 0;
		if (stage === "deep") deep += dur;
		else if (stage === "rem") rem += dur;
		else if (stage === "core" || stage === "light") core += dur;
		else if (stage === "awake") {
			awake += dur;
			hasAwake = true;
		}
		const startMs = Date.parse(s.startDate);
		if (Number.isFinite(startMs) && startMs < firstStartMs) {
			firstStartMs = startMs;
			bedtime = s.startDate;
		}
		const endMs = Date.parse(s.endDate);
		if (Number.isFinite(endMs) && endMs > lastEndMs) {
			lastEndMs = endMs;
			wakeTime = s.endDate;
		}
	}

	const total = deep + rem + core;
	const next: NonNullable<HealthDay["sleep"]> = {
		...sliced,
		totalDuration: total,
		totalDurationFormatted: formatDuration(total),
		deepSleep: deep,
		deepSleepFormatted: formatDuration(deep),
		remSleep: rem,
		remSleepFormatted: formatDuration(rem),
		coreSleep: core,
		coreSleepFormatted: formatDuration(core),
		bedtime: bedtime || sliced.bedtime,
		wakeTime: wakeTime || sliced.wakeTime,
	};
	if (hasAwake) {
		next.awakeTime = awake;
		next.awakeTimeFormatted = formatDuration(awake);
	}
	return next;
}

function sliceBoundaryDay(
	d: HealthDay,
	fromMs: number | undefined,
	toMs: number | undefined
): HealthDay {
	const next: HealthDay = { ...d };
	if (d.heart) {
		const sliced = {
			...d.heart,
			heartRateSamples:
				sliceTimestamped(d.heart.heartRateSamples, fromMs, toMs) ?? [],
			hrvSamples: sliceTimestamped(d.heart.hrvSamples, fromMs, toMs),
		};
		next.heart = recomputeHeart(d.heart, sliced);
	}
	if (d.vitals) {
		const sliced = {
			...d.vitals,
			bloodOxygenSamples: sliceTimestamped(
				d.vitals.bloodOxygenSamples,
				fromMs,
				toMs
			),
			respiratoryRateSamples: sliceTimestamped(
				d.vitals.respiratoryRateSamples,
				fromMs,
				toMs
			),
		};
		next.vitals = recomputeVitals(d.vitals, sliced);
	}
	if (d.sleep) {
		const sliced = {
			...d.sleep,
			sleepStages: d.sleep.sleepStages.filter((s) => {
				const ms = Date.parse(s.startDate);
				if (Number.isNaN(ms)) return true;
				if (fromMs !== undefined && ms < fromMs) return false;
				if (toMs !== undefined && ms > toMs) return false;
				return true;
			}),
		};
		next.sleep = recomputeSleep(d.sleep, sliced);
	}
	if (d.workouts) {
		next.workouts = d.workouts.filter((w) => {
			if (!w.startTime) return true;
			const ms = Date.parse(w.startTime);
			if (Number.isNaN(ms)) return true;
			if (fromMs !== undefined && ms < fromMs) return false;
			if (toMs !== undefined && ms > toMs) return false;
			return true;
		});
	}
	const medicationEvents = d.medicationDoseEvents ?? d.medication_dose_events;
	if (medicationEvents) {
		const slicedEvents = medicationEvents.filter((event) => {
			const timestamp = event.scheduledDate ?? event.scheduled_date ?? event.startDate ?? event.start_date ?? event.endDate ?? event.end_date;
			if (!timestamp) return true;
			const ms = Date.parse(timestamp);
			if (Number.isNaN(ms)) return true;
			if (fromMs !== undefined && ms < fromMs) return false;
			if (toMs !== undefined && ms > toMs) return false;
			return true;
		});
		next.medicationDoseEvents = slicedEvents;
		next.medication_dose_events = slicedEvents;
		next.medicationDoseCount = slicedEvents.length;
		next.medication_dose_count = slicedEvents.length;
		next.medicationTakenCount = slicedEvents.filter((event) => doseStatusKind(event.status) === "taken").length;
		next.medication_taken_count = next.medicationTakenCount;
		next.medicationSkippedCount = slicedEvents.filter((event) => doseStatusKind(event.status) === "skipped").length;
		next.medication_skipped_count = next.medicationSkippedCount;
	}
	return next;
}

function filterByDateRange(
	data: HealthDay[],
	range: DateRange
): HealthDay[] {
	if (!range.fromDate && !range.toDate) return data;
	const result: HealthDay[] = [];
	for (const d of data) {
		if (range.fromDate && d.date < range.fromDate) continue;
		if (range.toDate && d.date > range.toDate) continue;

		const sliceFrom =
			range.fromMs !== undefined && d.date === range.fromDate
				? range.fromMs
				: undefined;
		const sliceTo =
			range.toMs !== undefined && d.date === range.toDate
				? range.toMs
				: undefined;

		if (sliceFrom !== undefined || sliceTo !== undefined) {
			result.push(sliceBoundaryDay(d, sliceFrom, sliceTo));
		} else {
			result.push(d);
		}
	}
	return result;
}

function describeRange(range: DateRange): string {
	if (range.fromLabel && range.toLabel)
		return `${range.fromLabel} to ${range.toLabel}`;
	if (range.fromLabel) return `from ${range.fromLabel}`;
	if (range.toLabel) return `up to ${range.toLabel}`;
	return "";
}

function hitTest(r: HitRegion, x: number, y: number): boolean {
	if (r.shape === "rect") {
		return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
	}
	if (r.shape === "circle") {
		const dx = x - r.cx;
		const dy = y - r.cy;
		return dx * dx + dy * dy <= r.r * r.r;
	}
	// sector
	const dx = x - r.cx;
	const dy = y - r.cy;
	const dist = Math.sqrt(dx * dx + dy * dy);
	if (dist < r.r0 || dist > r.r1) return false;
	if (r.a1 - r.a0 >= Math.PI * 2 - 0.001) return true;
	let angle = Math.atan2(dy, dx);
	let a0 = r.a0;
	let a1 = r.a1;
	while (a1 <= a0) a1 += Math.PI * 2;
	while (angle < a0) angle += Math.PI * 2;
	return angle <= a1;
}

function findRegion(
	regions: HitRegion[],
	x: number,
	y: number
): HitRegion | null {
	for (let i = regions.length - 1; i >= 0; i--) {
		if (hitTest(regions[i], x, y)) return regions[i];
	}
	return null;
}

function renderTooltipContent(
	tooltipEl: HTMLElement,
	region: HitRegion
): void {
	tooltipEl.empty();
	tooltipEl.createDiv({
		cls: "health-md-tooltip-title",
		text: region.title,
	});
	const body = tooltipEl.createDiv({ cls: "health-md-tooltip-details" });
	region.details.forEach(({ label, value }) => {
		const row = body.createDiv({ cls: "health-md-tooltip-row" });
		row.createSpan({ cls: "health-md-tooltip-label", text: label });
		row.createSpan({ cls: "health-md-tooltip-value", text: value });
	});
}

interface DailyNotesOptions {
	folder?: string;
	format?: string;
}

interface DailyNotesPlugin {
	enabled?: boolean;
	instance?: {
		options?: DailyNotesOptions;
	};
}

interface AppWithInternalPlugins extends App {
	internalPlugins?: {
		getPluginById?: (id: string) => DailyNotesPlugin | undefined;
		plugins?: Record<string, DailyNotesPlugin | undefined>;
	};
}

interface RegionNavigationTarget {
	dates: string[];
	sourcePaths: string[];
	/**
	 * Aggregate regions (for example weekday averages) may represent many dates.
	 * In those cases navigation should still land somewhere useful; prefer the
	 * latest matching date in the rendered range when it has a single source file.
	 */
	preferredDate?: string;
	preferredSourcePaths?: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_FORMAT_TOKEN = /YYYY|MMMM|dddd|MMM|ddd|YY|MM|DD|dd|M|D|d/g;
const WEEKDAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface IsoDateParts {
	year: number;
	month: number;
	day: number;
	date: Date;
}

function parseIsoDateParts(value: string): IsoDateParts | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return null;
	}
	return { year, month, day, date };
}

function padDatePart(value: number): string {
	return String(value).padStart(2, "0");
}

function formatDailyNoteDate(date: IsoDateParts, format: string): string {
	const literals: string[] = [];
	const formatWithPlaceholders = format.replace(/\[([^\]]*)\]/g, (_match: string, literal: string): string => {
		const placeholder = `@@${literals.length}@@`;
		literals.push(literal);
		return placeholder;
	});
	const formatted = formatWithPlaceholders.replace(DATE_FORMAT_TOKEN, (token): string => {
		const weekday = date.date.getUTCDay();
		switch (token) {
			case "YYYY":
				return String(date.year);
			case "YY":
				return padDatePart(date.year % 100);
			case "MMMM":
				return date.date.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
			case "MMM":
				return date.date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
			case "MM":
				return padDatePart(date.month);
			case "M":
				return String(date.month);
			case "DD":
				return padDatePart(date.day);
			case "D":
				return String(date.day);
			case "dddd":
				return date.date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
			case "ddd":
				return date.date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
			case "dd":
				return WEEKDAY_SHORT[weekday];
			case "d":
				return String(weekday);
			default:
				return token;
		}
	});
	return formatted.replace(/@@(\d+)@@/g, (_match: string, index: string): string => literals[Number(index)] ?? "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function normalizeDataPointClickAction(value: unknown): DataPointClickAction | null {
	if (typeof value !== "string") return null;
	switch (value.trim().toLowerCase()) {
		case "pin":
		case "tooltip":
		case "pin-tooltip":
			return "pin";
		case "source":
		case "source-file":
		case "data-file":
		case "open-source":
		case "open-source-file":
			return "source";
		case "daily":
		case "daily-note":
		case "open-daily":
		case "open-daily-note":
			return "daily";
		default:
			return null;
	}
}

function collectPayloadNavigation(
	payload: unknown,
	dates: Set<string>,
	sourcePaths: Set<string>
): void {
	if (typeof payload === "string") {
		if (ISO_DATE.test(payload)) dates.add(payload);
		return;
	}

	if (Array.isArray(payload)) {
		payload.forEach((item) => collectPayloadNavigation(item, dates, sourcePaths));
		return;
	}

	if (!isRecord(payload)) return;

	const date = payload.date;
	if (typeof date === "string" && ISO_DATE.test(date)) dates.add(date);

	const paths = payload.sourcePaths;
	if (Array.isArray(paths)) {
		paths.forEach((path) => {
			if (typeof path === "string" && path) sourcePaths.add(path);
		});
	}

	// Some chart regions wrap the HealthDay in a parent object so they can keep
	// point-specific payload details (for example a sleep stage or workout sample).
	if ("day" in payload) {
		collectPayloadNavigation(payload.day, dates, sourcePaths);
	}
}

function sortedStrings(values: Iterable<string>): string[] {
	return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function getSourcePathsForDate(
	date: string | undefined,
	dataByDate: Map<string, HealthDay>
): string[] {
	if (!date) return [];
	return sortedStrings(dataByDate.get(date)?.sourcePaths ?? []);
}

function getRegionNavigationTarget(
	region: HitRegion,
	dataByDate: Map<string, HealthDay>
): RegionNavigationTarget {
	const dates = new Set<string>();
	const sourcePaths = new Set<string>();
	collectPayloadNavigation(region.payload, dates, sourcePaths);

	for (const date of dates) {
		dataByDate.get(date)?.sourcePaths?.forEach((path) => sourcePaths.add(path));
	}

	const sortedDates = sortedStrings(dates);
	const preferredDate = sortedDates[sortedDates.length - 1];
	const preferredSourcePaths = getSourcePathsForDate(preferredDate, dataByDate);

	return {
		dates: sortedDates,
		sourcePaths: sortedStrings(sourcePaths),
		preferredDate,
		preferredSourcePaths,
	};
}

function getDailyNotesOptions(app: App): Required<DailyNotesOptions> {
	const internalPlugins = (app as AppWithInternalPlugins).internalPlugins;
	const dailyNotes =
		internalPlugins?.getPluginById?.("daily-notes") ??
		internalPlugins?.plugins?.["daily-notes"];
	const options = dailyNotes?.enabled ? dailyNotes.instance?.options : undefined;
	return {
		folder: options?.folder ?? "",
		format: options?.format ?? "YYYY-MM-DD",
	};
}

function getDailyNotePath(app: App, date: string): string | null {
	const dailyDate = parseIsoDateParts(date);
	if (!dailyDate) return null;

	const { folder, format } = getDailyNotesOptions(app);
	let notePath = formatDailyNoteDate(dailyDate, format || "YYYY-MM-DD");
	if (!notePath.toLowerCase().endsWith(".md")) notePath += ".md";
	return normalizePath(folder ? `${folder}/${notePath}` : notePath);
}

async function openFileByPath(app: App, path: string): Promise<boolean> {
	const normalized = normalizePath(path);
	const file = app.vault.getAbstractFileByPath(normalized);
	if (!(file instanceof TFile)) {
		new Notice(`Health.md: file not found in this vault: ${normalized}`);
		return false;
	}

	// Source paths are vault-relative TFile paths. Opening them through the
	// workspace keeps navigation inside the current Obsidian window instead of
	// delegating to the OS/browser for files that live in the vault.
	const leaf = app.workspace.getLeaf(false);
	await leaf.openFile(file, { active: true });
	app.workspace.setActiveLeaf(leaf, { focus: true });
	return true;
}

async function openSourceFile(
	plugin: HealthMdPlugin,
	target: RegionNavigationTarget
): Promise<boolean> {
	if (!target.sourcePaths.length) {
		new Notice("Health.md: no source file found for this data point.");
		return false;
	}
	if (target.sourcePaths.length > 1) {
		if (target.preferredDate && target.preferredSourcePaths?.length === 1) {
			return openFileByPath(plugin.app, target.preferredSourcePaths[0]);
		}

		new Notice(
			target.dates.length > 1
				? `Health.md: this aggregate maps to ${target.dates.length} dates and ${target.sourcePaths.length} source files; click a single-day point to open one file.`
				: `Health.md: this point maps to ${target.sourcePaths.length} source files; click a single-day point to open one file.`
		);
		return false;
	}
	return openFileByPath(plugin.app, target.sourcePaths[0]);
}

async function openDailyNote(
	plugin: HealthMdPlugin,
	target: RegionNavigationTarget
): Promise<boolean> {
	if (!target.dates.length) {
		new Notice("Health.md: no date found for this data point.");
		return false;
	}
	const date = target.dates.length > 1 ? target.preferredDate : target.dates[0];
	if (!date) {
		new Notice(
			`Health.md: this point represents ${target.dates.length} dates; click a single-day point to open a Daily Note.`
		);
		return false;
	}

	const path = getDailyNotePath(plugin.app, date);
	if (!path) {
		new Notice(`Health.md: invalid date for Daily Note: ${date}`);
		return false;
	}
	return openFileByPath(plugin.app, path);
}

class VizRenderChild extends MarkdownRenderChild {
	private observer: ResizeObserver | null = null;
	private unregisterDraw: (() => void) | null = null;

	setObserver(obs: ResizeObserver): void {
		this.observer = obs;
	}

	setUnregisterDraw(fn: () => void): void {
		this.unregisterDraw = fn;
	}

	onunload(): void {
		this.observer?.disconnect();
		this.unregisterDraw?.();
	}
}

export async function renderCodeBlock(
	plugin: HealthMdPlugin,
	source: string,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext
): Promise<void> {
	const parsedConfig = parseConfig(source);
	if (!parsedConfig.type) {
		el.createEl("p", {
			text: 'Missing type. Example: type: heart-terrain',
			cls: "health-md-error",
		});
		return;
	}

	const frontmatter = await getFrontmatterForContext(plugin, ctx);
	const configResolution = resolveDateVariables(parsedConfig, frontmatter);
	if ("error" in configResolution) {
		el.createEl("p", { text: configResolution.error, cls: "health-md-error" });
		return;
	}
	const config = configResolution.config;

	const range = resolveDateRange(config);
	if (range.error) {
		el.createEl("p", { text: range.error, cls: "health-md-error" });
		return;
	}

	// HTML-only visualizations (no canvas)
	const htmlRenderFn = HTML_VISUALIZATIONS[config.type];
	if (htmlRenderFn) {
		const allData = await plugin.dataLoader.load();
		if (!allData.length) {
			el.createEl("p", {
				text: noHealthDataMessage(plugin),
			});
			return;
		}
		const data = filterByDateRange(allData, range);
		if (!data.length) {
			el.createEl("p", {
				text: `No health data in range (${describeRange(range)}).`,
			});
			return;
		}
		const container = el.createDiv({ cls: "health-md-container" });
		function drawHtml(): void {
			container.empty();
			htmlRenderFn(data, container, config, resolveTheme(plugin.settings, config));
		}
		drawHtml();
		const htmlChild = new VizRenderChild(container);
		htmlChild.setUnregisterDraw(plugin.registerDraw(drawHtml));
		ctx.addChild(htmlChild);
		return;
	}

	const renderFn = VISUALIZATIONS[config.type];
	if (!renderFn) {
		el.createEl("p", {
			text: `Unknown chart type: ${config.type}`,
			cls: "health-md-error",
		});
		return;
	}

	const allData = await plugin.dataLoader.load();
	if (!allData.length) {
		el.createEl("p", {
			text: noHealthDataMessage(plugin),
		});
		return;
	}
	const data = filterByDateRange(allData, range);
	if (!data.length) {
		el.createEl("p", {
			text: `No health data in range (${describeRange(range)}).`,
		});
		return;
	}

	const clickAction =
		normalizeDataPointClickAction(config.clickAction ?? config.onClick) ??
		normalizeDataPointClickAction(plugin.settings.dataPointClickAction) ??
		"pin";
	const dataByDate = new Map(data.map((day) => [day.date, day]));

	const defaultWidth = config.width ?? plugin.settings.defaultWidth;
	const height = config.height ?? plugin.settings.defaultHeight;

	const container = el.createDiv({ cls: "health-md-container" });
	const canvas = container.createEl("canvas");
	const tooltipEl = container.createDiv({ cls: "health-md-tooltip is-hidden" });
	const statsEl = container.createDiv({ cls: "health-md-stats" });

	const regions: HitRegion[] = [];
	const hits: HitRegistry = { add: (r) => regions.push(r) };
	let pinned: HitRegion | null = null;

	function showTooltip(): void {
		tooltipEl.removeClass("is-hidden");
	}

	function hideTooltip(): void {
		tooltipEl.addClass("is-hidden");
	}

	function placeTooltip(x: number, y: number): void {
		showTooltip();
		const tw = tooltipEl.offsetWidth;
		const th = tooltipEl.offsetHeight;
		const cw = container.clientWidth;
		const ch = container.clientHeight;
		let tx = x + 14;
		let ty = y + 14;
		if (tx + tw > cw) tx = x - 14 - tw;
		if (ty + th > ch) ty = y - 14 - th;
		if (tx < 0) tx = 0;
		if (ty < 0) ty = 0;
		tooltipEl.style.left = `${tx}px`;
		tooltipEl.style.top = `${ty}px`;
	}

	canvas.addEventListener("mousemove", (e) => {
		if (pinned) return;
		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		const region = findRegion(regions, x, y);
		if (region) {
			canvas.addClass("health-md-canvas-pointer");
			renderTooltipContent(tooltipEl, region);
			placeTooltip(x, y);
		} else {
			canvas.removeClass("health-md-canvas-pointer");
			hideTooltip();
		}
	});

	canvas.addEventListener("mouseleave", () => {
		if (pinned) return;
		canvas.removeClass("health-md-canvas-pointer");
		hideTooltip();
	});

	function pinTooltip(region: HitRegion, x: number, y: number): void {
		pinned = region;
		renderTooltipContent(tooltipEl, region);
		placeTooltip(x, y);
	}

	canvas.addEventListener("click", (e) => {
		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		const region = findRegion(regions, x, y);
		if (region) {
			if (clickAction === "pin") {
				pinTooltip(region, x, y);
				return;
			}

			pinned = null;
			hideTooltip();
			const target = getRegionNavigationTarget(region, dataByDate);
			void (clickAction === "source"
				? openSourceFile(plugin, target)
				: openDailyNote(plugin, target)
			)
				.then((opened) => {
					if (!opened) pinTooltip(region, x, y);
				})
				.catch((error: unknown) => {
					console.error("Health.md: failed to open data point target", error);
					new Notice("Health.md: failed to open data point target.");
					pinTooltip(region, x, y);
				});
		} else if (pinned) {
			pinned = null;
			hideTooltip();
		}
	});

	const renderChild = new VizRenderChild(container);
	ctx.addChild(renderChild);

	function draw(): void {
		const width = Math.min(
			container.clientWidth || defaultWidth,
			defaultWidth
		);
		statsEl.empty();
		regions.length = 0;
		pinned = null;
		hideTooltip();
		canvas.removeClass("health-md-canvas-pointer");
		const canvasCtx = setupCanvas(canvas, width, height);
		renderFn(canvasCtx, data, width, height, config, resolveTheme(plugin.settings, config), statsEl, hits);
	}

	draw();

	const observer = new ResizeObserver(() => draw());
	observer.observe(container);
	renderChild.setObserver(observer);
	renderChild.setUnregisterDraw(plugin.registerDraw(draw));
}
