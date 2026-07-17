import { formatDate, hexToRgba } from "../canvas-utils";
import { renderStatBoxes } from "../dom-utils";
import {
	BODY_METRICS,
	CYCLING_METRICS,
	HEARING_METRICS,
	RUNNING_METRICS,
} from "../metric-catalog";
import {
	formatMetricValue,
	resolveMetricDefinition,
	resolveMetricScalar,
	resolveNumericMetric,
	type ResolvedMetricDefinition,
} from "../metric-resolver";
import type {
	HealthDay,
	HitRegionDetail,
	HitRegistry,
	RenderFn,
	ResolvedTheme,
	VisualizationContext,
	VizConfig,
} from "../types";

interface DailyMetricPoint {
	day: HealthDay;
	value: number;
	index: number;
	ms: number;
}

interface PanelOptions {
	metric: string;
	color: string;
	x: number;
	y: number;
	w: number;
	h: number;
	showDates: boolean;
	reference?: number;
	referenceLabel?: string;
	extraDetails?: (day: HealthDay, value: number) => HitRegionDetail[];
}

const PANEL_COLORS = ["#5b8ff9", "#61d9a5", "#f6bd16", "#7262fd", "#78d3f8"];
const DAY_MS = 24 * 60 * 60 * 1000;

function sortedDays(data: HealthDay[]): HealthDay[] {
	return [...data].sort((a, b) => a.date.localeCompare(b.date));
}

function dateMs(day: HealthDay, index: number): number {
	const parsed = Date.parse(`${day.date}T00:00:00`);
	return Number.isFinite(parsed) ? parsed : index * DAY_MS;
}

function metricPoints(
	days: HealthDay[],
	metric: string,
	context?: VisualizationContext
): Array<DailyMetricPoint | undefined> {
	return days.map((day, index) => {
		const value = resolveNumericMetric(day, metric, context?.dictionary);
		return value === undefined
			? undefined
			: { day, value, index, ms: dateMs(day, index) };
	});
}

function observedPoints(points: Array<DailyMetricPoint | undefined>): DailyMetricPoint[] {
	return points.filter((point): point is DailyMetricPoint => point !== undefined);
}

function colorForMetric(
	definition: ResolvedMetricDefinition,
	index: number,
	theme: ResolvedTheme
): string {
	if (definition.color) return definition.color;
	if (index === 0) return theme.colors.accent;
	if (index === 1) return theme.colors.secondary;
	return PANEL_COLORS[index % PANEL_COLORS.length];
}

function drawMessage(
	ctx: CanvasRenderingContext2D,
	statsEl: HTMLElement,
	W: number,
	H: number,
	theme: ResolvedTheme,
	message: string
): void {
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	ctx.fillStyle = theme.muted;
	ctx.font = "12px sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(message, W / 2, H / 2);
	statsEl.empty();
}

function resizeCanvasForPanels(
	ctx: CanvasRenderingContext2D,
	W: number,
	H: number,
	panelCount: number,
	theme: ResolvedTheme
): number {
	const minimum = panelCount > 1 ? 46 + panelCount * 72 + (panelCount - 1) * 34 : H;
	if (H >= minimum) return H;
	const dpr = activeWindow.devicePixelRatio || 1;
	ctx.canvas.width = W * dpr;
	ctx.canvas.height = minimum * dpr;
	ctx.canvas.style.width = `${W}px`;
	ctx.canvas.style.height = `${minimum}px`;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.scale(dpr, dpr);
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, minimum);
	return minimum;
}

function expandedDomain(values: number[]): { min: number; max: number } {
	let min = Math.min(...values);
	let max = Math.max(...values);
	if (min === max) {
		const expansion = Math.max(Math.abs(min) * 0.08, 1);
		min -= expansion;
		max += expansion;
	} else {
		const padding = (max - min) * 0.1;
		min -= padding;
		max += padding;
	}
	return { min, max };
}

function hasCalendarGap(previous: DailyMetricPoint, current: DailyMetricPoint): boolean {
	return current.index !== previous.index + 1 || current.ms - previous.ms > DAY_MS * 1.5;
}

function drawDateLabels(
	ctx: CanvasRenderingContext2D,
	days: HealthDay[],
	xForIndex: (index: number) => number,
	y: number,
	theme: ResolvedTheme
): void {
	if (!days.length) return;
	ctx.fillStyle = theme.muted;
	ctx.font = "8px sans-serif";
	ctx.textBaseline = "top";
	const count = Math.min(5, days.length);
	for (let labelIndex = 0; labelIndex < count; labelIndex++) {
		const index = count === 1
			? 0
			: Math.round((labelIndex / (count - 1)) * (days.length - 1));
		const date = new Date(`${days[index].date}T00:00:00`);
		const label = Number.isNaN(date.getTime())
			? days[index].date
			: date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
		ctx.textAlign = labelIndex === 0 ? "left" : labelIndex === count - 1 ? "right" : "center";
		ctx.fillText(label, xForIndex(index), y);
	}
}

function drawMetricPanel(
	ctx: CanvasRenderingContext2D,
	days: HealthDay[],
	context: VisualizationContext | undefined,
	theme: ResolvedTheme,
	hits: HitRegistry,
	options: PanelOptions
): DailyMetricPoint[] {
	const definition = resolveMetricDefinition(options.metric, context?.dictionary, days);
	const slots = metricPoints(days, definition.key, context);
	const points = observedPoints(slots);

	ctx.fillStyle = theme.fg;
	ctx.font = "600 11px sans-serif";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillText(definition.label, options.x, options.y - 18);
	if (definition.unit) {
		ctx.fillStyle = theme.muted;
		ctx.font = "9px sans-serif";
		ctx.textAlign = "right";
		ctx.fillText(definition.unit, options.x + options.w, options.y - 17);
	}

	if (!points.length) {
		ctx.fillStyle = theme.muted;
		ctx.font = "10px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText("No data in range", options.x + options.w / 2, options.y + options.h / 2);
		return points;
	}

	const scaleValues = points.map((point) => point.value);
	if (options.reference !== undefined) scaleValues.push(options.reference);
	const domain = expandedDomain(scaleValues);
	const xForIndex = (index: number): number =>
		options.x + (index / Math.max(1, days.length - 1)) * options.w;
	const yFor = (value: number): number =>
		options.y + (1 - (value - domain.min) / (domain.max - domain.min)) * options.h;

	ctx.strokeStyle = hexToRgba(theme.fg, 0.08);
	ctx.lineWidth = 1;
	for (let grid = 0; grid <= 2; grid++) {
		const y = options.y + (grid / 2) * options.h;
		ctx.beginPath();
		ctx.moveTo(options.x, y);
		ctx.lineTo(options.x + options.w, y);
		ctx.stroke();
	}

	if (options.reference !== undefined) {
		const y = yFor(options.reference);
		ctx.save();
		ctx.strokeStyle = hexToRgba(theme.fg, 0.5);
		ctx.lineWidth = 1;
		ctx.setLineDash([5, 4]);
		ctx.beginPath();
		ctx.moveTo(options.x, y);
		ctx.lineTo(options.x + options.w, y);
		ctx.stroke();
		ctx.restore();
		ctx.fillStyle = theme.muted;
		ctx.font = "8px sans-serif";
		ctx.textAlign = "right";
		ctx.textBaseline = "bottom";
		ctx.fillText(
			`${options.referenceLabel ?? "Reference"} ${formatMetricValue(options.reference, definition)}`,
			options.x + options.w,
			Math.max(options.y + 9, y - 2)
		);
	}

	ctx.strokeStyle = options.color;
	ctx.lineWidth = 1.75;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	ctx.beginPath();
	let previous: DailyMetricPoint | undefined;
	for (const point of slots) {
		if (!point) {
			previous = undefined;
			continue;
		}
		const x = xForIndex(point.index);
		const y = yFor(point.value);
		if (!previous || hasCalendarGap(previous, point)) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
		previous = point;
	}
	ctx.stroke();

	for (const point of points) {
		const x = xForIndex(point.index);
		const y = yFor(point.value);
		ctx.fillStyle = options.color;
		ctx.beginPath();
		ctx.arc(x, y, 2.8, 0, Math.PI * 2);
		ctx.fill();
		hits.add({
			shape: "circle",
			cx: x,
			cy: y,
			r: 8,
			title: formatDate(point.day.date),
			details: [
				{ label: definition.label, value: formatMetricValue(point.value, definition) },
				...(options.extraDetails?.(point.day, point.value) ?? []),
			],
			payload: point.day,
		});
	}

	if (options.showDates) {
		drawDateLabels(ctx, days, xForIndex, options.y + options.h + 5, theme);
	}
	return points;
}

function parseMetricList(config: VizConfig, defaults: readonly string[]): string[] {
	if (typeof config.metrics !== "string") return [...defaults];
	const metrics = config.metrics.split(",").map((metric) => metric.trim()).filter(Boolean);
	return metrics.length ? Array.from(new Set(metrics)) : [...defaults];
}

function latestPoint(points: DailyMetricPoint[]): DailyMetricPoint | undefined {
	return points[points.length - 1];
}

function renderSmallMultiples(
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	W: number,
	H: number,
	config: VizConfig,
	theme: ResolvedTheme,
	statsEl: HTMLElement,
	hits: HitRegistry,
	context: VisualizationContext | undefined,
	defaults: readonly string[],
	title: string,
	reference?: number,
	extraDetails?: (metric: string, day: HealthDay, value: number) => HitRegionDetail[]
): void {
	const days = sortedDays(data);
	const metrics = parseMetricList(config, defaults);
	if (!metrics.length) {
		drawMessage(ctx, statsEl, W, H, theme, "No metrics configured");
		return;
	}

	H = resizeCanvasForPanels(ctx, W, H, metrics.length, theme);
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	const padL = 38;
	const padR = 16;
	const padT = 48;
	const padB = 22;
	const gap = metrics.length > 1 ? 34 : 18;
	const panelH = Math.max(40, (H - padT - padB - gap * (metrics.length - 1)) / metrics.length);
	const panelW = Math.max(1, W - padL - padR);

	ctx.fillStyle = theme.fg;
	ctx.font = "700 13px sans-serif";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillText(title, padL, 10);

	const allPoints = metrics.map((metric, index) => {
		const definition = resolveMetricDefinition(metric, context?.dictionary, days);
		return {
			definition,
			points: drawMetricPanel(ctx, days, context, theme, hits, {
				metric: definition.key,
				color: colorForMetric(definition, index, theme),
				x: padL,
				y: padT + index * (panelH + gap),
				w: panelW,
				h: panelH,
				showDates: index === metrics.length - 1,
				reference,
				referenceLabel: reference === undefined ? undefined : "Reference",
				extraDetails: extraDetails
					? (day, value) => extraDetails(definition.key, day, value)
					: undefined,
			}),
		};
	});

	const boxes = allPoints.map(({ definition, points }, index) => {
		const latest = latestPoint(points);
		return {
			value: latest ? formatMetricValue(latest.value, definition) : "—",
			label: `${definition.label} latest`,
			color: colorForMetric(definition, index, theme),
		};
	});
	renderStatBoxes(statsEl, boxes);
}

function optionalFiniteNumber(value: string | number | undefined): number | undefined {
	if (value === undefined || value === "") return undefined;
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function rollingSeries(
	points: Array<DailyMetricPoint | undefined>,
	window: number
): Array<number | undefined> {
	return points.map((_point, index) => {
		if (index < window - 1) return undefined;
		const slice = points.slice(index - window + 1, index + 1);
		if (slice.some((point) => point === undefined)) return undefined;
		return slice.reduce((sum, point) => sum + (point?.value ?? 0), 0) / window;
	});
}

export const renderMetricTrend: RenderFn = (
	ctx,
	data,
	W,
	H,
	config,
	theme,
	statsEl,
	hits,
	context
): void => {
	const metric = typeof config.metric === "string" && config.metric.trim()
		? config.metric.trim()
		: "steps";
	const rollingRaw = config.rollingAverage;
	const rollingAverage = optionalFiniteNumber(rollingRaw);
	if (rollingRaw !== undefined && (rollingAverage === undefined || !Number.isInteger(rollingAverage) || rollingAverage <= 0)) {
		drawMessage(ctx, statsEl, W, H, theme, "rollingAverage must be a positive integer");
		return;
	}
	const goal = optionalFiniteNumber(config.goal);
	if (config.goal !== undefined && goal === undefined) {
		drawMessage(ctx, statsEl, W, H, theme, "goal must be numeric");
		return;
	}

	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	const days = sortedDays(data);
	const definition = resolveMetricDefinition(metric, context?.dictionary, days);
	const slots = metricPoints(days, definition.key, context);
	const points = observedPoints(slots);
	if (!points.length) {
		drawMessage(ctx, statsEl, W, H, theme, `No ${definition.label.toLowerCase()} data in range`);
		return;
	}

	const padL = 42;
	const padR = 18;
	const padT = 42;
	const padB = 28;
	const plotW = Math.max(1, W - padL - padR);
	const plotH = Math.max(1, H - padT - padB);
	const rolling = rollingAverage === undefined ? [] : rollingSeries(slots, rollingAverage);
	const scaleValues = [
		...points.map((point) => point.value),
		...rolling.filter((value): value is number => value !== undefined),
		...(goal === undefined ? [] : [goal]),
	];
	const domain = expandedDomain(scaleValues);
	const xFor = (index: number): number => padL + (index / Math.max(1, days.length - 1)) * plotW;
	const yFor = (value: number): number => padT + (1 - (value - domain.min) / (domain.max - domain.min)) * plotH;
	const color = colorForMetric(definition, 0, theme);

	ctx.fillStyle = theme.fg;
	ctx.font = "700 13px sans-serif";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillText(definition.label, padL, 10);
	if (definition.unit) {
		ctx.fillStyle = theme.muted;
		ctx.font = "9px sans-serif";
		ctx.textAlign = "right";
		ctx.fillText(definition.unit, W - padR, 12);
	}

	ctx.strokeStyle = hexToRgba(theme.fg, 0.08);
	ctx.lineWidth = 1;
	for (let grid = 0; grid <= 3; grid++) {
		const ratio = grid / 3;
		const y = padT + ratio * plotH;
		const value = domain.max - ratio * (domain.max - domain.min);
		ctx.beginPath();
		ctx.moveTo(padL, y);
		ctx.lineTo(W - padR, y);
		ctx.stroke();
		ctx.fillStyle = theme.muted;
		ctx.font = "8px sans-serif";
		ctx.textAlign = "right";
		ctx.textBaseline = "middle";
		ctx.fillText(formatMetricValue(value, { ...definition, unit: undefined }), padL - 5, y);
	}

	if (goal !== undefined) {
		const y = yFor(goal);
		ctx.save();
		ctx.strokeStyle = hexToRgba(theme.fg, 0.55);
		ctx.setLineDash([5, 4]);
		ctx.beginPath();
		ctx.moveTo(padL, y);
		ctx.lineTo(W - padR, y);
		ctx.stroke();
		ctx.restore();
		ctx.fillStyle = theme.muted;
		ctx.font = "8px sans-serif";
		ctx.textAlign = "right";
		ctx.textBaseline = "bottom";
		ctx.fillText(`Goal ${formatMetricValue(goal, definition)}`, W - padR, Math.max(padT + 9, y - 2));
	}

	ctx.strokeStyle = color;
	ctx.lineWidth = 2;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	ctx.beginPath();
	let previous: DailyMetricPoint | undefined;
	for (const point of slots) {
		if (!point) {
			previous = undefined;
			continue;
		}
		const x = xFor(point.index);
		const y = yFor(point.value);
		if (!previous || hasCalendarGap(previous, point)) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
		previous = point;
	}
	ctx.stroke();

	if (rollingAverage !== undefined) {
		ctx.save();
		ctx.strokeStyle = theme.colors.secondary;
		ctx.lineWidth = 1.5;
		ctx.setLineDash([4, 3]);
		ctx.beginPath();
		let connected = false;
		rolling.forEach((value, index) => {
			if (value === undefined) {
				connected = false;
				return;
			}
			const x = xFor(index);
			const y = yFor(value);
			if (!connected) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
			connected = true;
		});
		ctx.stroke();
		ctx.restore();
		ctx.fillStyle = theme.colors.secondary;
		ctx.font = "8px sans-serif";
		ctx.textAlign = "left";
		ctx.textBaseline = "bottom";
		ctx.fillText(`${rollingAverage}-day average`, padL, padT - 5);
	}

	for (const point of points) {
		const x = xFor(point.index);
		const y = yFor(point.value);
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.arc(x, y, 3.2, 0, Math.PI * 2);
		ctx.fill();
		hits.add({
			shape: "circle",
			cx: x,
			cy: y,
			r: 9,
			title: formatDate(point.day.date),
			details: [{ label: definition.label, value: formatMetricValue(point.value, definition) }],
			payload: point.day,
		});
	}
	drawDateLabels(ctx, days, xFor, H - 17, theme);

	const values = points.map((point) => point.value);
	const average = values.reduce((sum, value) => sum + value, 0) / values.length;
	const latest = points[points.length - 1];
	renderStatBoxes(statsEl, [
		{ value: formatMetricValue(latest.value, definition), label: "Latest", color },
		{ value: formatMetricValue(average, definition), label: "Average" },
		{ value: formatMetricValue(Math.min(...values), definition), label: "Minimum" },
		{ value: formatMetricValue(Math.max(...values), definition), label: "Maximum" },
		{ value: String(values.length), label: "Days sampled" },
		...(goal === undefined ? [] : [{ value: formatMetricValue(goal, definition), label: "Goal" }]),
	]);
};

export const renderBodyComposition: RenderFn = (
	ctx, data, W, H, config, theme, statsEl, hits, context
): void => {
	renderSmallMultiples(
		ctx, data, W, H, config, theme, statsEl, hits, context,
		BODY_METRICS, "Body composition"
	);
};

export const renderRunningForm: RenderFn = (
	ctx, data, W, H, config, theme, statsEl, hits, context
): void => {
	renderSmallMultiples(
		ctx, data, W, H, config, theme, statsEl, hits, context,
		RUNNING_METRICS, "Running form"
	);
};

export const renderCyclingPerformance: RenderFn = (
	ctx, data, W, H, config, theme, statsEl, hits, context
): void => {
	renderSmallMultiples(
		ctx, data, W, H, config, theme, statsEl, hits, context,
		CYCLING_METRICS, "Cycling performance", undefined,
		(metric, day, value) => {
			if (metric !== "cycling_power_w") return [];
			const ftp = resolveNumericMetric(day, "cycling_ftp_w", context?.dictionary);
			if (ftp === undefined || ftp <= 0) return [];
			const ftpDefinition = resolveMetricDefinition("cycling_ftp_w", context?.dictionary, data);
			return [
				{ label: ftpDefinition.label, value: formatMetricValue(ftp, ftpDefinition) },
				{ label: "Power / FTP", value: `${((value / ftp) * 100).toFixed(0)}%` },
			];
		}
	);
};

export const renderHearingExposure: RenderFn = (
	ctx, data, W, H, config, theme, statsEl, hits, context
): void => {
	const reference = optionalFiniteNumber(config.reference);
	if (config.reference !== undefined && reference === undefined) {
		drawMessage(ctx, statsEl, W, H, theme, "reference must be numeric");
		return;
	}
	renderSmallMultiples(
		ctx, data, W, H, config, theme, statsEl, hits, context,
		HEARING_METRICS, "Hearing exposure", reference
	);
};

function scalarBoolean(value: unknown): boolean | undefined {
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value === 1 ? true : value === 0 ? false : undefined;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "true" || normalized === "yes" || normalized === "1") return true;
		if (normalized === "false" || normalized === "no" || normalized === "0") return false;
	}
	return undefined;
}

function formatMeasurementAge(seconds: number): string {
	if (seconds < 60) return `${Math.round(seconds)} sec`;
	if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
	if (seconds < 86400) return `${(seconds / 3600).toFixed(seconds < 36000 ? 1 : 0)} hr`;
	return `${(seconds / 86400).toFixed(seconds < 864000 ? 1 : 0)} days`;
}

function formatSourceTime(value: string): string {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return value;
	return parsed.toLocaleString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

export const renderCardioFitnessFreshness: RenderFn = (
	ctx,
	data,
	W,
	H,
	_config,
	theme,
	statsEl,
	hits,
	context
): void => {
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	const days = sortedDays(data);
	const definition = resolveMetricDefinition("vo2_max", context?.dictionary, days);
	const slots = metricPoints(days, definition.key, context);
	const points = observedPoints(slots);
	if (!points.length) {
		drawMessage(ctx, statsEl, W, H, theme, "No cardio fitness data in range");
		return;
	}

	const padL = 44;
	const padR = 18;
	const padT = 52;
	const padB = 30;
	const plotW = Math.max(1, W - padL - padR);
	const plotH = Math.max(1, H - padT - padB);
	const domain = expandedDomain(points.map((point) => point.value));
	const xFor = (index: number): number => padL + (index / Math.max(1, days.length - 1)) * plotW;
	const yFor = (value: number): number => padT + (1 - (value - domain.min) / (domain.max - domain.min)) * plotH;
	const color = definition.color ?? theme.colors.heart;
	const provenanceState = (day: HealthDay): "measured" | "carried" | "unknown" => {
		const carried = scalarBoolean(resolveMetricScalar(day, "vo2_max_carried_forward", context?.dictionary));
		if (carried === true) return "carried";
		if (carried === false) return "measured";
		return "unknown";
	};

	ctx.fillStyle = theme.fg;
	ctx.font = "700 13px sans-serif";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillText(definition.label, padL, 10);
	ctx.fillStyle = theme.muted;
	ctx.font = "8px sans-serif";
	ctx.fillText("Solid: measured   Hollow: carried   Diamond: provenance unavailable", padL, 28);
	if (definition.unit) {
		ctx.textAlign = "right";
		ctx.fillText(definition.unit, W - padR, 12);
	}

	ctx.strokeStyle = hexToRgba(theme.fg, 0.08);
	ctx.lineWidth = 1;
	for (let grid = 0; grid <= 3; grid++) {
		const ratio = grid / 3;
		const y = padT + ratio * plotH;
		ctx.beginPath();
		ctx.moveTo(padL, y);
		ctx.lineTo(W - padR, y);
		ctx.stroke();
		ctx.fillStyle = theme.muted;
		ctx.font = "8px sans-serif";
		ctx.textAlign = "right";
		ctx.textBaseline = "middle";
		ctx.fillText(
			formatMetricValue(domain.max - ratio * (domain.max - domain.min), { ...definition, unit: undefined }),
			padL - 5,
			y
		);
	}

	let previous: DailyMetricPoint | undefined;
	for (const point of slots) {
		if (!point || !previous || hasCalendarGap(previous, point)) {
			previous = point;
			continue;
		}
		ctx.save();
		ctx.strokeStyle = color;
		ctx.lineWidth = 1.75;
		const states = [provenanceState(previous.day), provenanceState(point.day)];
		if (states.includes("unknown")) ctx.setLineDash([1, 3]);
		else if (states.includes("carried")) ctx.setLineDash([4, 3]);
		ctx.beginPath();
		ctx.moveTo(xFor(previous.index), yFor(previous.value));
		ctx.lineTo(xFor(point.index), yFor(point.value));
		ctx.stroke();
		ctx.restore();
		previous = point;
	}

	for (const point of points) {
		const x = xFor(point.index);
		const y = yFor(point.value);
		const state = provenanceState(point.day);
		if (state === "unknown") {
			ctx.fillStyle = theme.bg;
			ctx.strokeStyle = theme.muted;
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(x, y - 4.5);
			ctx.lineTo(x + 4.5, y);
			ctx.lineTo(x, y + 4.5);
			ctx.lineTo(x - 4.5, y);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
		} else {
			ctx.beginPath();
			ctx.arc(x, y, state === "carried" ? 4 : 3.2, 0, Math.PI * 2);
			ctx.fillStyle = state === "carried" ? theme.bg : color;
			ctx.fill();
			ctx.strokeStyle = color;
			ctx.lineWidth = state === "carried" ? 1.75 : 1;
			ctx.stroke();
		}

		const carriedScalar = resolveMetricScalar(point.day, "vo2_max_carried_forward", context?.dictionary);
		const age = resolveNumericMetric(point.day, "vo2_max_age_seconds", context?.dictionary);
		const source = resolveMetricScalar(point.day, "vo2_max_source_start", context?.dictionary);
		const sourceText = typeof source === "string" && source.trim() ? source.trim() : undefined;
		const hasProvenance = carriedScalar !== undefined || age !== undefined || sourceText !== undefined;
		const details: HitRegionDetail[] = [
			{ label: definition.label, value: formatMetricValue(point.value, definition) },
			hasProvenance
				? { label: "Status", value: state === "carried" ? "Carried forward" : state === "measured" ? "Measured" : "Provenance unavailable" }
				: { label: "Provenance", value: "Provenance unavailable" },
			...(age === undefined ? [] : [{ label: "Measurement age", value: formatMeasurementAge(age) }]),
			...(sourceText === undefined ? [] : [{ label: "Source time", value: formatSourceTime(sourceText) }]),
		];
		hits.add({
			shape: "circle",
			cx: x,
			cy: y,
			r: 9,
			title: formatDate(point.day.date),
			details,
			// Only navigation-safe summary fields are exposed; provenance source UUIDs
			// and any raw archive payloads are deliberately excluded.
			payload: { date: point.day.date, sourcePaths: point.day.sourcePaths },
		});
	}
	drawDateLabels(ctx, days, xFor, H - 18, theme);

	const carriedCount = points.filter((point) => provenanceState(point.day) === "carried").length;
	const latest = points[points.length - 1];
	const latestAge = resolveNumericMetric(latest.day, "vo2_max_age_seconds", context?.dictionary);
	renderStatBoxes(statsEl, [
		{ value: formatMetricValue(latest.value, definition), label: "Latest", color },
		{ value: String(points.length), label: "Days shown" },
		{ value: String(carriedCount), label: "Carried-forward days" },
		...(latestAge === undefined ? [] : [{ value: formatMeasurementAge(latestAge), label: "Latest measurement age" }]),
	]);
};
