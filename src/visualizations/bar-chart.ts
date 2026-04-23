import { HealthDay, HitRegistry, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { hexToRgba, formatDate } from "../canvas-utils";
import { renderStatBoxes } from "../dom-utils";

type Metric =
	| "steps"
	| "activeCalories"
	| "exerciseMinutes"
	| "distance"
	| "sleepHours"
	| "flightsClimbed";

interface MetricMeta {
	label: string;
	unit: string;
	color: (t: ResolvedTheme) => string;
	extract(day: HealthDay): number;
	formatTotal(sum: number): string;
	formatValue(v: number): string;
	aggregate: "sum" | "avg";
}

const METRICS: Record<Metric, MetricMeta> = {
	steps: {
		label: "Steps",
		unit: "steps",
		color: (t) => t.colors.accent,
		extract: (d) => d.activity?.steps ?? 0,
		formatTotal: (sum) => sum.toLocaleString(),
		formatValue: (v) => Math.round(v).toLocaleString(),
		aggregate: "sum",
	},
	activeCalories: {
		label: "Active Energy",
		unit: "CAL",
		color: (t) => t.colors.accent,
		extract: (d) => d.activity?.activeCalories ?? 0,
		formatTotal: (sum) => Math.round(sum).toLocaleString(),
		formatValue: (v) => `${Math.round(v)}`,
		aggregate: "sum",
	},
	exerciseMinutes: {
		label: "Exercise",
		unit: "min",
		color: (t) => t.colors.accent,
		extract: (d) => d.activity?.exerciseMinutes ?? 0,
		formatTotal: (sum) => `${Math.round(sum)}`,
		formatValue: (v) => `${Math.round(v)}`,
		aggregate: "sum",
	},
	distance: {
		label: "Distance",
		unit: "km",
		color: (t) => t.colors.secondary,
		extract: (d) => d.activity?.walkingRunningDistanceKm ?? 0,
		formatTotal: (sum) => sum.toFixed(1),
		formatValue: (v) => v.toFixed(2),
		aggregate: "sum",
	},
	sleepHours: {
		label: "Sleep",
		unit: "h",
		color: (t) => t.colors.sleep.rem,
		extract: (d) => (d.sleep?.totalDuration ?? 0) / 3600,
		formatTotal: (sum) => sum.toFixed(1),
		formatValue: (v) => {
			const h = Math.floor(v);
			const m = Math.round((v - h) * 60);
			return `${h}h ${m}m`;
		},
		aggregate: "avg",
	},
	flightsClimbed: {
		label: "Flights Climbed",
		unit: "flights",
		color: (t) => t.colors.accent,
		extract: (d) => d.activity?.flightsClimbed ?? 0,
		formatTotal: (sum) => `${Math.round(sum)}`,
		formatValue: (v) => `${Math.round(v)}`,
		aggregate: "sum",
	},
};

const WEEKDAY_INITIAL = ["S", "M", "T", "W", "T", "F", "S"];

export const renderBarChart: RenderFn = (
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

	const days = data;
	if (!days.length) {
		ctx.fillStyle = theme.muted;
		ctx.font = "12px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText("No data in range", W / 2, H / 2);
		return;
	}

	const values = days.map((d) => meta.extract(d));
	const n = values.length;
	const max = Math.max(...values, 0);
	const nonZero = values.filter((v) => v > 0);
	const total = values.reduce((s, v) => s + v, 0);
	const average = nonZero.length ? total / nonZero.length : 0;
	const goal = config.goal != null ? Number(config.goal) : undefined;
	const showAverage = config.showAverage === undefined || config.showAverage === "true" || config.showAverage === 1 || config.showAverage === "1";

	// Single y-axis scale used by bars and all reference lines.
	const chartEffectiveMax = goal && goal > max ? goal : max;
	const denom = chartEffectiveMax > 0 ? chartEffectiveMax : 1;

	// KPI area at top
	const kpiH = 46;
	const axisH = 18;
	const padT = 8;
	const padB = axisH + 8;
	const padL = 16;
	const padR = 36;
	const plotTop = padT + kpiH;
	const plotH = H - plotTop - padB;

	// KPI: headline = total (sum metrics) or average (sleep); subtitle = date range
	const headline = meta.aggregate === "sum" ? meta.formatTotal(total) : meta.formatValue(average);
	const subtitle = `${formatDate(days[0].date)} – ${formatDate(days[n - 1].date)}`;

	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = theme.fg;
	ctx.font = "600 22px sans-serif";
	const headlineMetrics = ctx.measureText(headline);
	ctx.fillText(headline, padL, padT + 22);
	ctx.fillStyle = theme.muted;
	ctx.font = "11px sans-serif";
	ctx.fillText(` ${meta.unit}`, padL + headlineMetrics.width + 2, padT + 22);
	ctx.fillText(subtitle, padL, padT + 40);

	// Chart plot area
	const accent = meta.color(theme);

	// Right-aligned y-axis label — reflects the actual top of the scale.
	if (chartEffectiveMax > 0) {
		ctx.fillStyle = theme.muted;
		ctx.font = "10px sans-serif";
		ctx.textAlign = "right";
		ctx.textBaseline = "top";
		ctx.fillText(meta.formatValue(chartEffectiveMax), W - 4, plotTop);
	}

	// Average dashed line
	if (showAverage && average > 0 && chartEffectiveMax > 0) {
		const y = plotTop + plotH - (average / denom) * plotH;
		ctx.save();
		ctx.strokeStyle = hexToRgba(theme.fg, 0.4);
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
		ctx.fillText(`avg ${meta.formatValue(average)}`, W - padR - 4, y - 2);
	}

	// Goal dashed line — always drawn when goal participates in the y-axis scale.
	if (goal && chartEffectiveMax > 0) {
		const y = plotTop + plotH - (goal / denom) * plotH;
		ctx.save();
		ctx.strokeStyle = hexToRgba(accent, 0.8);
		ctx.lineWidth = 1;
		ctx.setLineDash([2, 3]);
		ctx.beginPath();
		ctx.moveTo(padL, y);
		ctx.lineTo(W - padR, y);
		ctx.stroke();
		ctx.restore();
		ctx.fillStyle = accent;
		ctx.font = "9px sans-serif";
		ctx.textAlign = "left";
		ctx.textBaseline = "bottom";
		ctx.fillText(`goal ${meta.formatValue(goal)}`, padL + 2, y - 2);
	}

	const chartW = W - padL - padR;
	const slot = chartW / n;
	const barW = Math.max(3, Math.min(slot * 0.72, 28));
	const cornerR = Math.min(barW / 2, 6);
	const highlightIdx = n - 1; // latest day

	for (let i = 0; i < n; i++) {
		const v = values[i];
		const x = padL + i * slot + (slot - barW) / 2;
		const isHighlight = i === highlightIdx;
		const h = (v / denom) * plotH;
		const y = plotTop + plotH - h;

		// Empty-day marker (thin track)
		if (h <= 0.5) {
			ctx.fillStyle = hexToRgba(accent, 0.12);
			ctx.beginPath();
			ctx.roundRect(x, plotTop + plotH - 2, barW, 2, 1);
			ctx.fill();
		} else {
			ctx.fillStyle = isHighlight ? accent : hexToRgba(accent, 0.35);
			ctx.beginPath();
			ctx.roundRect(x, y, barW, h, [cornerR, cornerR, 0, 0]);
			ctx.fill();
		}

		hits.add({
			shape: "rect",
			x: padL + i * slot,
			y: plotTop,
			w: slot,
			h: plotH + axisH,
			title: formatDate(days[i].date),
			details: [
				{ label: meta.label, value: `${meta.formatValue(v)} ${meta.unit}` },
			],
			payload: days[i],
		});
	}

	// X-axis labels
	ctx.fillStyle = theme.muted;
	ctx.font = "10px sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	if (n <= 7) {
		for (let i = 0; i < n; i++) {
			const d = new Date(days[i].date + "T00:00:00");
			const ch = WEEKDAY_INITIAL[d.getDay()];
			const cx = padL + i * slot + slot / 2;
			ctx.fillStyle = i === highlightIdx ? theme.fg : theme.muted;
			ctx.fillText(ch, cx, plotTop + plotH + 4);
		}
	} else {
		const labelStep = Math.max(1, Math.ceil(n / 6));
		for (let i = 0; i < n; i++) {
			if (i % labelStep !== 0 && i !== n - 1) continue;
			const d = new Date(days[i].date + "T00:00:00");
			const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
			const cx = padL + i * slot + slot / 2;
			ctx.fillStyle = i === highlightIdx ? theme.fg : theme.muted;
			ctx.fillText(label, cx, plotTop + plotH + 4);
		}
	}

	// Stats strip
	const bestIdx = values.reduce(
		(best, v, i) => (v > values[best] ? i : best),
		0
	);
	const best = values[bestIdx];
	const bestLabel = new Date(days[bestIdx].date + "T00:00:00").toLocaleDateString(
		"en-US",
		{ month: "short", day: "numeric" }
	);
	renderStatBoxes(statsEl, [
		{
			value:
				meta.aggregate === "sum"
					? meta.formatTotal(total)
					: meta.formatValue(total),
			label: `Total ${meta.unit}`,
		},
		{ value: meta.formatValue(average), label: "Daily avg" },
		{ value: meta.formatValue(best), label: `Best (${bestLabel})` },
	]);
};
