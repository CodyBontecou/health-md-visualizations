import { HealthDay, HitRegistry, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { hexToRgba } from "../canvas-utils";
import { renderStatBoxes } from "../dom-utils";

type Metric =
	| "steps"
	| "activeCalories"
	| "exerciseMinutes"
	| "sleepHours"
	| "heartRate"
	| "hrv";

interface MetricMeta {
	label: string;
	unit: string;
	color: (t: ResolvedTheme) => string;
	extract(day: HealthDay): number | null;
	format(v: number): string;
}

const METRICS: Record<Metric, MetricMeta> = {
	steps: {
		label: "Steps",
		unit: "steps",
		color: (t) => t.colors.accent,
		extract: (d) => (d.activity?.steps ?? 0) > 0 ? d.activity!.steps : null,
		format: (v) => Math.round(v).toLocaleString(),
	},
	activeCalories: {
		label: "Active Calories",
		unit: "CAL",
		color: (t) => t.colors.accent,
		extract: (d) => (d.activity?.activeCalories ?? 0) > 0 ? d.activity!.activeCalories : null,
		format: (v) => `${Math.round(v)}`,
	},
	exerciseMinutes: {
		label: "Exercise",
		unit: "min",
		color: (t) => t.colors.accent,
		extract: (d) => (d.activity?.exerciseMinutes ?? 0) > 0 ? d.activity!.exerciseMinutes : null,
		format: (v) => `${Math.round(v)}`,
	},
	sleepHours: {
		label: "Sleep",
		unit: "h",
		color: (t) => t.colors.sleep.rem,
		extract: (d) => {
			const v = d.sleep?.totalDuration;
			return v != null && v > 0 ? v / 3600 : null;
		},
		format: (v) => {
			const h = Math.floor(v);
			const m = Math.round((v - h) * 60);
			return `${h}h ${m}m`;
		},
	},
	heartRate: {
		label: "Avg HR",
		unit: "bpm",
		color: (t) => t.colors.heart,
		extract: (d) => {
			const v = d.heart?.averageHeartRate;
			return v != null && v > 0 ? v : null;
		},
		format: (v) => `${Math.round(v)}`,
	},
	hrv: {
		label: "HRV",
		unit: "ms",
		color: (t) => t.colors.secondary,
		extract: (d) => {
			if (d.heart?.hrv != null) return d.heart.hrv;
			const s = d.heart?.hrvSamples;
			if (s && s.length) return s.reduce((acc, x) => acc + x.value, 0) / s.length;
			return null;
		},
		format: (v) => v.toFixed(1),
	},
};

export const renderWeekdayAverage: RenderFn = (
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	W: number,
	H: number,
	config: VizConfig,
	theme: ResolvedTheme,
	statsEl: HTMLElement,
	hits: HitRegistry
): void => {
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);

	const metricId = (config.metric as Metric) || "steps";
	const meta = METRICS[metricId];
	if (!meta) {
		ctx.fillStyle = theme.muted;
		ctx.font = "12px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText(`Unknown metric: ${metricId}`, W / 2, H / 2);
		return;
	}

	const weekStart = (String(config.weekStart || "monday").toLowerCase() === "sunday") ? "sunday" : "monday";

	if (data.length < 7) {
		ctx.fillStyle = theme.muted;
		ctx.font = "12px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText("Weekday averages need at least 7 days of data.", W / 2, H / 2);
		return;
	}

	// Bucket values by day-of-week (0=Sun..6=Sat), keeping sample count.
	const buckets: Array<{ values: number[]; dates: string[] }> = Array.from(
		{ length: 7 },
		() => ({ values: [], dates: [] })
	);
	data.forEach((day) => {
		const v = meta.extract(day);
		if (v == null) return;
		const dow = new Date(day.date + "T00:00:00").getDay();
		buckets[dow].values.push(v);
		buckets[dow].dates.push(day.date);
	});

	// Reorder for weekStart
	const orderIdx = weekStart === "sunday" ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
	const initials = orderIdx.map((d) => ["S", "M", "T", "W", "T", "F", "S"][d]);

	const avgs = orderIdx.map((dow) => {
		const b = buckets[dow];
		return b.values.length ? b.values.reduce((s, v) => s + v, 0) / b.values.length : null;
	});
	const counts = orderIdx.map((dow) => buckets[dow].values.length);

	const hasAny = avgs.some((a) => a != null);
	if (!hasAny) {
		ctx.fillStyle = theme.muted;
		ctx.font = "12px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText(`No ${meta.label.toLowerCase()} data`, W / 2, H / 2);
		return;
	}

	const maxAvg = Math.max(...avgs.map((a) => a ?? 0));
	const allValues = avgs.filter((a): a is number => a != null);
	const overallMean = allValues.reduce((s, v) => s + v, 0) / allValues.length;

	// Headline: "Average X across N weeks"
	const totalSamples = counts.reduce((s, c) => s + c, 0);
	const weeksApprox = Math.max(1, Math.round(totalSamples / 7));

	const padT = 14;
	const kpiH = 40;
	const axisH = 18;
	const padL = 16;
	const padR = 16;
	const valueLabelH = 14;

	const plotTop = padT + kpiH;
	const plotBottom = H - axisH - 6;
	const plotH = plotBottom - plotTop - valueLabelH;

	// KPI
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = theme.fg;
	ctx.font = "600 20px sans-serif";
	const headlineText = `${meta.format(overallMean)} ${meta.unit}`;
	ctx.fillText(headlineText, padL, padT + 20);
	ctx.fillStyle = theme.muted;
	ctx.font = "11px sans-serif";
	ctx.fillText(`Avg ${meta.label.toLowerCase()} across ${weeksApprox} week${weeksApprox === 1 ? "" : "s"}`, padL, padT + 38);

	const color = meta.color(theme);

	// Mean dashed line
	if (overallMean > 0 && maxAvg > 0) {
		const y = plotTop + valueLabelH + plotH - (overallMean / maxAvg) * plotH;
		ctx.save();
		ctx.strokeStyle = hexToRgba(theme.fg, 0.45);
		ctx.lineWidth = 1;
		ctx.setLineDash([4, 4]);
		ctx.beginPath();
		ctx.moveTo(padL, y);
		ctx.lineTo(W - padR, y);
		ctx.stroke();
		ctx.restore();
		ctx.fillStyle = theme.muted;
		ctx.font = "9px sans-serif";
		ctx.textAlign = "right";
		ctx.textBaseline = "bottom";
		ctx.fillText(`mean ${meta.format(overallMean)}`, W - padR - 2, y - 2);
	}

	// Find max bar index for highlight
	let maxIdx = 0;
	for (let i = 1; i < 7; i++) {
		if ((avgs[i] ?? 0) > (avgs[maxIdx] ?? 0)) maxIdx = i;
	}

	const chartW = W - padL - padR;
	const slot = chartW / 7;
	const barW = Math.min(46, slot * 0.7);
	const cornerR = Math.min(barW / 2, 8);

	for (let i = 0; i < 7; i++) {
		const v = avgs[i];
		const x = padL + i * slot + (slot - barW) / 2;
		const dow = orderIdx[i];
		const isWeekend = dow === 0 || dow === 6;
		const isMax = i === maxIdx && v != null;

		let fill = hexToRgba(color, 0.55);
		if (isWeekend) fill = hexToRgba(color, 0.4);
		if (isMax) fill = color;

		if (v != null && maxAvg > 0) {
			const h = (v / maxAvg) * plotH;
			const y = plotTop + valueLabelH + plotH - h;
			ctx.fillStyle = fill;
			ctx.beginPath();
			ctx.roundRect(x, y, barW, h, [cornerR, cornerR, 0, 0]);
			ctx.fill();

			// Label above bar
			ctx.fillStyle = isMax ? theme.fg : theme.muted;
			ctx.font = isMax ? "600 10px sans-serif" : "10px sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "bottom";
			ctx.fillText(meta.format(v), x + barW / 2, y - 3);
		} else {
			// Empty weekday track
			ctx.fillStyle = hexToRgba(color, 0.1);
			ctx.beginPath();
			ctx.roundRect(x, plotBottom - 3, barW, 3, 2);
			ctx.fill();
		}

		// Weekday label
		ctx.fillStyle = isWeekend ? theme.muted : theme.fg;
		ctx.font = "11px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		ctx.fillText(initials[i], x + barW / 2, plotBottom + 4);

		hits.add({
			shape: "rect",
			x: padL + i * slot,
			y: plotTop,
			w: slot,
			h: plotBottom - plotTop,
			title: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dow],
			details: v != null
				? [
					{ label: "Average", value: `${meta.format(v)} ${meta.unit}` },
					{ label: "Samples", value: `${counts[i]}` },
				]
				: [
					{ label: "Status", value: "No data" },
				],
			payload: buckets[dow].dates,
		});
	}

	// Stats strip
	const bestLabel = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][orderIdx[maxIdx]];
	const worstIdx = avgs.reduce<number>(
		(best, v, i) =>
			v != null && (avgs[best] == null || v < (avgs[best] ?? Infinity))
				? i
				: best,
		0
	);
	const worstLabel = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][orderIdx[worstIdx]];
	const bestValue = avgs[maxIdx];
	const worstValue = avgs[worstIdx];
	renderStatBoxes(statsEl, [
		{ value: meta.format(overallMean), label: "Overall mean" },
		{
			value: bestLabel,
			label: `Best (${bestValue != null ? meta.format(bestValue) : "—"})`,
		},
		{
			value: worstLabel,
			label: `Lowest (${worstValue != null ? meta.format(worstValue) : "—"})`,
		},
		{ value: String(totalSamples), label: "Days sampled" },
	]);
};
