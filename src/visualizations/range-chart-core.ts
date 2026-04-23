import { HealthDay, HitRegistry, ResolvedTheme } from "../types";
import { hexToRgba, formatDate } from "../canvas-utils";
import { renderStatBoxes } from "../dom-utils";

export interface RangeValue {
	min: number;
	max: number;
	avg: number;
}

export interface RangeWarnZone {
	lo?: number;
	hi?: number;
	color: string;
	note: string;
}

export interface RangeOverlayContext {
	ctx: CanvasRenderingContext2D;
	data: HealthDay[];
	yFor: (v: number) => number;
	yMin: number;
	yMax: number;
	padL: number;
	padR: number;
	W: number;
}

export interface RangeChartSpec {
	label: string;
	unit: string;
	capsuleColor: string;
	extract(day: HealthDay): RangeValue | null;
	yAxis(observed: { min: number; max: number }): { yMin: number; yMax: number; gridStep: number };
	formatAxisLabel(v: number): string;
	formatValue(v: number): string;
	stats: { lowColor: string; avgColor: string; highColor: string };
	warn?: RangeWarnZone;
	overlays?(opts: RangeOverlayContext): void;
	padL?: number;
	avgDotInnerLightFill?: string;
}

export function renderRangeChart(
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	W: number,
	H: number,
	theme: ResolvedTheme,
	statsEl: HTMLElement,
	hits: HitRegistry,
	spec: RangeChartSpec
): void {
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);

	const points = data.map((d) => {
		const v = spec.extract(d);
		return v ? { day: d, date: d.date, ...v } : null;
	});
	const present = points.filter((p): p is NonNullable<typeof p> => p !== null);
	if (!present.length) {
		ctx.fillStyle = theme.muted;
		ctx.font = "12px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText(`No ${spec.label.toLowerCase()} data`, W / 2, H / 2);
		return;
	}

	const padL = spec.padL ?? 36;
	const padR = 16, padT = 14, padB = 24;
	const plotW = W - padL - padR;
	const plotH = H - padT - padB;

	const observedMin = Math.min(...present.map((p) => p.min));
	const observedMax = Math.max(...present.map((p) => p.max));
	const { yMin, yMax, gridStep } = spec.yAxis({ min: observedMin, max: observedMax });
	const yRange = yMax - yMin || 1;

	const n = points.length;
	const xFor = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
	const yFor = (v: number) => padT + plotH - ((v - yMin) / yRange) * plotH;

	// Warning zone shading
	if (spec.warn) {
		ctx.fillStyle = hexToRgba(spec.warn.color, theme.isDark ? 0.12 : 0.08);
		if (spec.warn.lo != null) {
			const yThreshold = yFor(spec.warn.lo);
			ctx.fillRect(padL, yThreshold, plotW, padT + plotH - yThreshold);
		}
		if (spec.warn.hi != null) {
			const yThreshold = yFor(spec.warn.hi);
			ctx.fillRect(padL, padT, plotW, yThreshold - padT);
		}
	}

	// Gridlines + y-axis labels
	ctx.strokeStyle = hexToRgba(theme.fg, 0.07);
	ctx.lineWidth = 1;
	ctx.fillStyle = theme.muted;
	ctx.font = "9px sans-serif";
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	const startGrid = Math.ceil(yMin / gridStep) * gridStep;
	for (let v = startGrid; v <= yMax; v += gridStep) {
		const y = yFor(v);
		ctx.beginPath();
		ctx.moveTo(padL, y);
		ctx.lineTo(W - padR, y);
		ctx.stroke();
		ctx.fillText(spec.formatAxisLabel(v), padL - 4, y);
	}

	// Warn threshold dashed line + note
	if (spec.warn) {
		const thresholdV = spec.warn.lo ?? spec.warn.hi!;
		const y = yFor(thresholdV);
		ctx.save();
		ctx.strokeStyle = hexToRgba(spec.warn.color, 0.55);
		ctx.lineWidth = 1;
		ctx.setLineDash([4, 3]);
		ctx.beginPath();
		ctx.moveTo(padL, y);
		ctx.lineTo(W - padR, y);
		ctx.stroke();
		ctx.restore();
		ctx.fillStyle = spec.warn.color;
		ctx.font = "9px sans-serif";
		ctx.textAlign = "left";
		ctx.textBaseline = "bottom";
		ctx.fillText(spec.warn.note, padL + 4, y - 2);
	}

	// Optional custom overlays (e.g. resting-HR reference line)
	if (spec.overlays) {
		spec.overlays({ ctx, data, yFor, yMin, yMax, padL, padR, W });
	}

	// Capsules + avg dots
	const capW = Math.max(4, Math.min(10, (plotW / Math.max(1, n)) * 0.45));
	const capRadius = capW / 2;
	const avgDotInnerLight = spec.avgDotInnerLightFill ?? "#000";
	points.forEach((p, i) => {
		if (!p) return;
		const x = xFor(i);
		const yTop = yFor(p.max);
		const yBot = yFor(p.min);
		const h = Math.max(capW, yBot - yTop);

		const grad = ctx.createLinearGradient(0, yTop, 0, yTop + h);
		grad.addColorStop(0, hexToRgba(spec.capsuleColor, 1));
		grad.addColorStop(1, hexToRgba(spec.capsuleColor, 0.55));
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.roundRect(x - capW / 2, yTop, capW, h, capRadius);
		ctx.fill();

		const yAvg = yFor(p.avg);
		ctx.fillStyle = theme.isDark ? "#fff" : avgDotInnerLight;
		ctx.beginPath();
		ctx.arc(x, yAvg, Math.max(2, capW * 0.38), 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = spec.capsuleColor;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.arc(x, yAvg, Math.max(2, capW * 0.38), 0, Math.PI * 2);
		ctx.stroke();

		hits.add({
			shape: "rect",
			x: x - capW,
			y: yTop - 4,
			w: capW * 2,
			h: h + 8,
			title: formatDate(p.date),
			details: [
				{ label: "Avg", value: `${spec.formatValue(p.avg)} ${spec.unit}` },
				{ label: "Min", value: `${spec.formatValue(p.min)} ${spec.unit}` },
				{ label: "Max", value: `${spec.formatValue(p.max)} ${spec.unit}` },
			],
			payload: p.day,
		});
	});

	// X-axis date labels (sparse)
	const labelStep = Math.max(1, Math.floor(n / 6));
	ctx.fillStyle = theme.muted;
	ctx.font = "9px sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	for (let i = 0; i < n; i++) {
		if (i % labelStep !== 0 && i !== n - 1) continue;
		const iso = points[i]?.date ?? data[i]?.date;
		if (!iso) continue;
		const d = new Date(iso + "T00:00:00");
		const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
		ctx.fillText(label, xFor(i), H - padB + 6);
	}

	// Stats strip
	const overallMin = Math.min(...present.map((p) => p.min));
	const overallMax = Math.max(...present.map((p) => p.max));
	const overallAvg = present.reduce((s, p) => s + p.avg, 0) / present.length;
	renderStatBoxes(statsEl, [
		{
			value: spec.formatValue(overallMin),
			label: "Lowest",
			color: spec.stats.lowColor,
		},
		{
			value: spec.formatValue(overallAvg),
			label: `${spec.label} avg`,
			color: spec.stats.avgColor,
		},
		{
			value: spec.formatValue(overallMax),
			label: "Highest",
			color: spec.stats.highColor,
		},
	]);
}
