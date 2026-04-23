import { HealthDay, HitRegistry, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { lerp, hsl, formatDate } from "../canvas-utils";
import { renderStatBoxes } from "../dom-utils";

function getBloodOxygenValues(day: HealthDay): number[] {
	if (day.vitals?.bloodOxygenSamples?.length) {
		return day.vitals.bloodOxygenSamples.map((s) => s.value || s.percent || 0);
	}
	const avg = day.vitals?.bloodOxygenAvg ?? day.vitals?.bloodOxygenPercent;
	if (avg !== undefined) {
		const min = day.vitals?.bloodOxygenMin;
		const max = day.vitals?.bloodOxygenMax;
		if (min !== undefined && max !== undefined && min !== max) {
			return [min, avg, max];
		}
		return [avg];
	}
	return [];
}

export const renderOxygenRiver: RenderFn = (
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	W: number,
	H: number,
	_config: VizConfig,
	theme: ResolvedTheme,
	statsEl: HTMLElement,
	hits: HitRegistry
): void => {
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);

	const days = data.filter((d) => getBloodOxygenValues(d).length > 0);
	if (!days.length) {
		ctx.fillStyle = theme.muted;
		ctx.font = "12px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText("No SpO2 data", W / 2, H / 2);
		return;
	}

	const allSamples: Array<{ x: number; value: number }> = [];
	days.forEach((day, di) => {
		getBloodOxygenValues(day).forEach((v, i, arr) => {
			allSamples.push({
				x: di + (arr.length > 1 ? (i / (arr.length - 1)) * 0.8 : 0.4),
				value: v,
			});
		});
	});

	const minO2 = Math.min(...allSamples.map((s) => s.value));
	const maxO2 = Math.max(...allSamples.map((s) => s.value));

	allSamples.forEach((s) => {
		const x = (s.x / days.length) * W;
		const t = (s.value - minO2) / (maxO2 - minO2 || 1);
		const y = H * 0.5 + (1 - t) * H * 0.35 - t * H * 0.35;
		const rSize = lerp(7, 3, t);
		const h = lerp(0, 210, t);
		ctx.fillStyle = hsl(h, lerp(80, 70, t), lerp(40, 50, t));
		ctx.globalAlpha = 0.55;
		ctx.beginPath();
		ctx.arc(x, y, rSize, 0, Math.PI * 2);
		ctx.fill();
	});
	ctx.globalAlpha = 1;

	const colW = W / days.length;
	days.forEach((day, di) => {
		const vals = getBloodOxygenValues(day);
		const dayMin = Math.min(...vals);
		const dayMax = Math.max(...vals);
		const dayAvg = vals.reduce((a, b) => a + b, 0) / vals.length;
		hits.add({
			shape: "rect",
			x: di * colW,
			y: 0,
			w: colW,
			h: H,
			title: formatDate(day.date),
			details: [
				{ label: "Avg SpO₂", value: `${dayAvg.toFixed(1)}%` },
				{ label: "Min", value: `${dayMin.toFixed(1)}%` },
				{ label: "Max", value: `${dayMax.toFixed(1)}%` },
				{ label: "Samples", value: `${vals.length}` },
			],
			payload: day,
		});
	});

	const avgO2 =
		allSamples.reduce((s, v) => s + v.value, 0) / allSamples.length;
	renderStatBoxes(statsEl, [
		{ value: `${avgO2.toFixed(1)}%`, label: "Avg SpO2", color: "#4488ff" },
		{ value: `${minO2.toFixed(1)}%`, label: "Min", color: "#6688cc" },
		{ value: `${maxO2.toFixed(1)}%`, label: "Max", color: "#88aaee" },
	]);
};
