import { formatDate, hexToRgba } from "../canvas-utils";
import { renderInlineStats } from "../dom-utils";
import { resolveMetricDefinition, resolveNumericMetric } from "../metric-resolver";
import type { HealthDay, HitRegistry, RenderFn, ResolvedTheme, VisualizationContext } from "../types";

interface RangePoint {
	day: HealthDay;
	date: string;
	min: number;
	avg: number;
	max: number;
}

interface RangeSeries {
	label: string;
	color: string;
	points: Array<RangePoint | null>;
}

interface ReferenceLine {
	label: string;
	value: number;
}

function finiteConfigNumber(value: string | number | undefined): number | undefined {
	if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
	if (typeof value !== "string" || !value.trim()) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function rangePoint(
	day: HealthDay,
	prefix: string,
	context?: VisualizationContext
): RangePoint | null {
	const dictionary = context?.dictionary;
	const min = resolveNumericMetric(day, `${prefix}_min`, dictionary);
	const avg = resolveNumericMetric(day, `${prefix}_avg`, dictionary);
	const max = resolveNumericMetric(day, `${prefix}_max`, dictionary);
	if (min === undefined || avg === undefined || max === undefined) return null;
	return { day, date: day.date, min, avg, max };
}

function formatNumber(value: number): string {
	return value.toLocaleString(undefined, {
		maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 1,
	});
}

function niceStep(span: number): number {
	const rough = Math.max(span / 5, Number.EPSILON);
	const power = 10 ** Math.floor(Math.log10(rough));
	const normalized = rough / power;
	const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
	return multiplier * power;
}

function renderEmpty(ctx: CanvasRenderingContext2D, W: number, H: number, theme: ResolvedTheme, label: string): void {
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	ctx.fillStyle = theme.muted;
	ctx.font = "12px sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(`No ${label.toLowerCase()} data`, W / 2, H / 2);
}

function renderRangeSeries(
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	W: number,
	H: number,
	theme: ResolvedTheme,
	statsEl: HTMLElement,
	hits: HitRegistry,
	title: string,
	unit: string,
	series: RangeSeries[],
	references: ReferenceLine[] = []
): void {
	const present = series.flatMap((item) => item.points.filter((point): point is RangePoint => point !== null));
	if (!present.length) {
		statsEl.empty();
		renderEmpty(ctx, W, H, theme, title);
		return;
	}

	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	const padL = 48;
	const padR = 16;
	const padT = series.length > 1 ? 42 : 24;
	const padB = 28;
	const plotW = Math.max(1, W - padL - padR);
	const plotH = Math.max(1, H - padT - padB);
	const values = present.flatMap((point) => [point.min, point.avg, point.max]);
	values.push(...references.map((reference) => reference.value));
	const observedMin = Math.min(...values);
	const observedMax = Math.max(...values);
	const observedSpan = Math.max(observedMax - observedMin, Math.max(1, Math.abs(observedMax) * 0.08));
	const step = niceStep(observedSpan);
	const yMin = Math.floor((observedMin - observedSpan * 0.08) / step) * step;
	const yMaxCandidate = Math.ceil((observedMax + observedSpan * 0.08) / step) * step;
	const yMax = yMaxCandidate > yMin ? yMaxCandidate : yMin + step;
	const yFor = (value: number): number => padT + plotH - ((value - yMin) / (yMax - yMin)) * plotH;
	const count = Math.max(data.length, 1);
	const slotW = plotW / count;
	const xFor = (index: number): number => padL + slotW * index + slotW / 2;

	ctx.strokeStyle = hexToRgba(theme.fg, 0.08);
	ctx.fillStyle = theme.muted;
	ctx.font = "9px sans-serif";
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	for (let value = Math.ceil(yMin / step) * step; value <= yMax + step * 0.001; value += step) {
		const y = yFor(value);
		ctx.beginPath();
		ctx.moveTo(padL, y);
		ctx.lineTo(W - padR, y);
		ctx.stroke();
		ctx.fillText(formatNumber(value), padL - 5, y);
	}

	for (const reference of references) {
		const y = yFor(reference.value);
		ctx.save();
		ctx.strokeStyle = hexToRgba(theme.colors.secondary, 0.7);
		ctx.setLineDash([5, 4]);
		ctx.beginPath();
		ctx.moveTo(padL, y);
		ctx.lineTo(W - padR, y);
		ctx.stroke();
		ctx.restore();
		hits.add({
			shape: "rect",
			x: padL,
			y: y - 4,
			w: plotW,
			h: 8,
			title: reference.label,
			details: [{ label: "Value", value: `${formatNumber(reference.value)}${unit ? ` ${unit}` : ""}` }],
		});
	}

	if (series.length > 1) {
		ctx.font = "10px sans-serif";
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";
		series.forEach((item, index) => {
			const x = padL + index * 92;
			ctx.fillStyle = item.color;
			ctx.fillRect(x, 15, 12, 5);
			ctx.fillStyle = theme.muted;
			ctx.fillText(item.label, x + 17, 18);
		});
	}

	const bandWidth = Math.max(3, Math.min(9, slotW * (series.length > 1 ? 0.18 : 0.34)));
	series.forEach((item, seriesIndex) => {
		const offset = series.length === 1 ? 0 : (seriesIndex - (series.length - 1) / 2) * Math.max(7, bandWidth + 3);
		item.points.forEach((point, index) => {
			if (!point) return;
			const x = xFor(index) + offset;
			const low = Math.min(point.min, point.max);
			const high = Math.max(point.min, point.max);
			const yTop = yFor(high);
			const yBottom = yFor(low);
			const height = Math.max(bandWidth, yBottom - yTop);
			ctx.fillStyle = hexToRgba(item.color, 0.48);
			ctx.beginPath();
			ctx.roundRect(x - bandWidth / 2, yTop, bandWidth, height, bandWidth / 2);
			ctx.fill();
			ctx.fillStyle = item.color;
			ctx.beginPath();
			ctx.arc(x, yFor(point.avg), Math.max(2.5, bandWidth * 0.48), 0, Math.PI * 2);
			ctx.fill();
			hits.add({
				shape: "rect",
				x: x - Math.max(7, bandWidth),
				y: yTop - 5,
				w: Math.max(14, bandWidth * 2),
				h: height + 10,
				title: `${formatDate(point.date)} — ${item.label}`,
				details: [
					{ label: "Average", value: `${formatNumber(point.avg)}${unit ? ` ${unit}` : ""}` },
					{ label: "Minimum", value: `${formatNumber(point.min)}${unit ? ` ${unit}` : ""}` },
					{ label: "Maximum", value: `${formatNumber(point.max)}${unit ? ` ${unit}` : ""}` },
				],
				payload: point.day,
			});
		});
	});

	const labelStep = Math.max(1, Math.ceil(data.length / 6));
	ctx.fillStyle = theme.muted;
	ctx.font = "9px sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	data.forEach((day, index) => {
		if (index % labelStep !== 0 && index !== data.length - 1) return;
		const date = new Date(`${day.date}T00:00:00`);
		const label = Number.isNaN(date.getTime())
			? day.date
			: date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
		ctx.fillText(label, xFor(index), H - padB + 8);
	});

	const averages = present.map((point) => point.avg);
	renderInlineStats(statsEl, [
		[{ text: "Days with ranges " }, { text: String(new Set(present.map((point) => point.date)).size), strong: true }],
		[{ text: "Average " }, { text: `${formatNumber(averages.reduce((sum, value) => sum + value, 0) / averages.length)}${unit ? ` ${unit}` : ""}`, strong: true }],
	]);
}

export const renderBloodPressureBands: RenderFn = (
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
	const dictionary = context?.dictionary;
	const unit = resolveMetricDefinition("blood_pressure_systolic_avg", dictionary, data).unit ?? "";
	renderRangeSeries(ctx, data, W, H, theme, statsEl, hits, "Blood pressure", unit, [
		{
			label: "Systolic",
			color: theme.colors.heart,
			points: data.map((day) => rangePoint(day, "blood_pressure_systolic", context)),
		},
		{
			label: "Diastolic",
			color: theme.colors.accent,
			points: data.map((day) => rangePoint(day, "blood_pressure_diastolic", context)),
		},
	]);
};

export const renderGlucoseRange: RenderFn = (
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
	const dictionary = context?.dictionary;
	const unit = resolveMetricDefinition("blood_glucose_avg", dictionary, data).unit ?? "";
	const minReference = finiteConfigNumber(config.minReference);
	const maxReference = finiteConfigNumber(config.maxReference);
	const references: ReferenceLine[] = [];
	if (minReference !== undefined) references.push({ label: "Configured minimum", value: minReference });
	if (maxReference !== undefined) references.push({ label: "Configured maximum", value: maxReference });
	renderRangeSeries(ctx, data, W, H, theme, statsEl, hits, "Blood glucose", unit, [
		{
			label: "Blood glucose",
			color: theme.colors.accent,
			points: data.map((day) => rangePoint(day, "blood_glucose", context)),
		},
	], references);
};
