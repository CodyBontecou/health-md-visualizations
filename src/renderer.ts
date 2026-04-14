import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import type HealthMdPlugin from "./main";
import { HealthDay, HitRegion, HitRegistry, VizConfig } from "./types";
import { setupCanvas, resolveTheme, formatDuration } from "./canvas-utils";
import { VISUALIZATIONS } from "./visualizations";
import { renderIntroStats } from "./visualizations/intro-stats";

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
	field: "from" | "to"
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

class VizRenderChild extends MarkdownRenderChild {
	private observer: ResizeObserver | null = null;

	setObserver(obs: ResizeObserver): void {
		this.observer = obs;
	}

	onunload(): void {
		this.observer?.disconnect();
	}
}

export async function renderCodeBlock(
	plugin: HealthMdPlugin,
	source: string,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext
): Promise<void> {
	const config = parseConfig(source);
	if (!config.type) {
		el.createEl("p", {
			text: 'Missing type. Example: type: heart-terrain',
			cls: "health-md-error",
		});
		return;
	}

	const range = resolveDateRange(config);
	if (range.error) {
		el.createEl("p", { text: range.error, cls: "health-md-error" });
		return;
	}

	// Intro stats is HTML-only, no canvas
	if (config.type === "intro-stats") {
		const allData = await plugin.dataLoader.load();
		if (!allData.length) {
			el.createEl("p", {
				text: `No health data found in ${plugin.settings.dataFolder}/`,
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
		const theme = resolveTheme(plugin.settings);
		const container = el.createDiv({ cls: "health-md-container" });
		renderIntroStats(data, container, config, theme);
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
			text: `No health data found in ${plugin.settings.dataFolder}/`,
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

	const defaultWidth = config.width ?? plugin.settings.defaultWidth;
	const height = (config.height ?? plugin.settings.defaultHeight) as number;
	const theme = resolveTheme(plugin.settings);

	const container = el.createDiv({ cls: "health-md-container" });
	const canvas = container.createEl("canvas");
	const tooltipEl = container.createDiv({ cls: "health-md-tooltip" });
	tooltipEl.style.display = "none";
	const statsEl = container.createDiv({ cls: "health-md-stats" });

	const regions: HitRegion[] = [];
	const hits: HitRegistry = { add: (r) => regions.push(r) };
	let pinned: HitRegion | null = null;

	function placeTooltip(x: number, y: number): void {
		tooltipEl.style.display = "";
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
			canvas.style.cursor = "pointer";
			renderTooltipContent(tooltipEl, region);
			placeTooltip(x, y);
		} else {
			canvas.style.cursor = "";
			tooltipEl.style.display = "none";
		}
	});

	canvas.addEventListener("mouseleave", () => {
		if (pinned) return;
		canvas.style.cursor = "";
		tooltipEl.style.display = "none";
	});

	canvas.addEventListener("click", (e) => {
		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		const region = findRegion(regions, x, y);
		if (region) {
			pinned = region;
			renderTooltipContent(tooltipEl, region);
			placeTooltip(x, y);
		} else if (pinned) {
			pinned = null;
			tooltipEl.style.display = "none";
		}
	});

	const renderChild = new VizRenderChild(container);
	ctx.addChild(renderChild);

	function draw(): void {
		const width = Math.min(
			container.clientWidth || defaultWidth,
			defaultWidth
		) as number;
		statsEl.empty();
		regions.length = 0;
		pinned = null;
		tooltipEl.style.display = "none";
		const canvasCtx = setupCanvas(canvas, width, height);
		renderFn(canvasCtx, data, width, height, config, theme, statsEl, hits);
	}

	draw();

	const observer = new ResizeObserver(() => draw());
	observer.observe(container);
	renderChild.setObserver(observer);
}
