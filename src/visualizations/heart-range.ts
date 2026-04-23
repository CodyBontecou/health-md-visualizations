import { HealthDay, RenderFn } from "../types";
import { hexToRgba } from "../canvas-utils";
import { renderRangeChart, RangeChartSpec, RangeOverlayContext } from "./range-chart-core";

type HeartMetric = "heart-rate" | "resting" | "walking";

const CAP_COLOR = "#ff3b30";
const RESTING_COLOR = "#4488ff";

function extractForMetric(day: HealthDay, metric: HeartMetric) {
	if (!day.heart) return null;
	if (metric === "resting") {
		const v = day.heart.restingHeartRate;
		if (v == null || v <= 0) return null;
		return { min: v, max: v, avg: v };
	}
	if (metric === "walking") {
		const v = day.heart.walkingHeartRateAverage;
		if (v == null || v <= 0) return null;
		return { min: v, max: v, avg: v };
	}
	const min = day.heart.heartRateMin;
	const max = day.heart.heartRateMax;
	const avg = day.heart.averageHeartRate;
	if (avg == null || avg <= 0) return null;
	return { min: min > 0 ? min : avg, max: max > 0 ? max : avg, avg };
}

function labelFor(m: HeartMetric): string {
	if (m === "resting") return "Resting HR";
	if (m === "walking") return "Walking HR";
	return "Heart Rate";
}

function restingOverlay(this: void, { ctx, data, yFor, yMin, yMax, padL, padR, W }: RangeOverlayContext) {
	const vals = data
		.map((d) => d.heart?.restingHeartRate)
		.filter((v): v is number => v != null && v > 0);
	if (!vals.length) return;
	const rest = vals.reduce((s, x) => s + x, 0) / vals.length;
	if (rest < yMin || rest > yMax) return;
	const y = yFor(rest);
	ctx.save();
	ctx.strokeStyle = hexToRgba(RESTING_COLOR, 0.55);
	ctx.lineWidth = 1;
	ctx.setLineDash([4, 4]);
	ctx.beginPath();
	ctx.moveTo(padL, y);
	ctx.lineTo(W - padR, y);
	ctx.stroke();
	ctx.restore();
	ctx.fillStyle = RESTING_COLOR;
	ctx.font = "9px sans-serif";
	ctx.textAlign = "left";
	ctx.textBaseline = "bottom";
	ctx.fillText(`resting ~${Math.round(rest)}`, padL + 4, y - 2);
}

export const renderHeartRange: RenderFn = (ctx, data, W, H, config, theme, statsEl, hits): void => {
	const metric = (config.metric as HeartMetric) || "heart-rate";
	const spec: RangeChartSpec = {
		label: labelFor(metric),
		unit: "bpm",
		capsuleColor: CAP_COLOR,
		padL: 36,
		avgDotInnerLightFill: "#1a0000",
		extract: (d) => extractForMetric(d, metric),
		yAxis: ({ min, max }) => {
			const yMin = Math.max(0, Math.floor((min - 20) / 10) * 10);
			const yMax = Math.ceil((max + 20) / 10) * 10;
			const range = yMax - yMin || 1;
			return { yMin, yMax, gridStep: range > 120 ? 40 : 20 };
		},
		formatAxisLabel: (v) => String(v),
		formatValue: (v) => String(Math.round(v)),
		stats: { lowColor: RESTING_COLOR, avgColor: CAP_COLOR, highColor: CAP_COLOR },
		overlays: metric === "heart-rate" ? restingOverlay : undefined,
	};
	renderRangeChart(ctx, data, W, H, theme, statsEl, hits, spec);
};
