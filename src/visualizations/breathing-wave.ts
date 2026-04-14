import { HealthDay, HitRegistry, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { formatDate, hexToRgba } from "../canvas-utils";

function getRespiratoryValues(day: HealthDay): number[] {
	if (day.vitals?.respiratoryRateSamples?.length) {
		return day.vitals.respiratoryRateSamples.map((s) => s.value);
	}
	const avg = day.vitals?.respiratoryRate ?? day.vitals?.respiratoryRateAvg;
	if (avg !== undefined) {
		const min = day.vitals?.respiratoryRateMin;
		const max = day.vitals?.respiratoryRateMax;
		if (min !== undefined && max !== undefined && min !== max) {
			return [min, avg, max];
		}
		return [avg];
	}
	return [];
}

export const renderBreathingWave: RenderFn = (
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

	const days = data.filter((d) => getRespiratoryValues(d).length > 0);
	if (!days.length) {
		ctx.fillStyle = theme.muted;
		ctx.font = "12px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText("No respiratory data", W / 2, H / 2);
		return;
	}

	const allVals: number[] = [];
	days.forEach((day) => allVals.push(...getRespiratoryValues(day)));
	const minR = Math.min(...allVals);
	const maxR = Math.max(...allVals);

	// Filled area
	const grad = ctx.createLinearGradient(0, 0, 0, H);
	grad.addColorStop(0, hexToRgba(theme.colors.accent, 0.35));
	grad.addColorStop(1, hexToRgba(theme.colors.accent, 0.0));
	ctx.beginPath();
	ctx.moveTo(0, H);
	allVals.forEach((v, i) => {
		const x = (i / allVals.length) * W;
		const t = (v - minR) / (maxR - minR || 1);
		ctx.lineTo(x, H - 16 - t * (H - 32));
	});
	ctx.lineTo(W, H);
	ctx.closePath();
	ctx.fillStyle = grad;
	ctx.fill();

	// Line stroke
	ctx.beginPath();
	allVals.forEach((v, i) => {
		const x = (i / allVals.length) * W;
		const t = (v - minR) / (maxR - minR || 1);
		const y = H - 16 - t * (H - 32);
		i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
	});
	ctx.strokeStyle = theme.colors.accent;
	ctx.lineWidth = 1.5;
	ctx.stroke();

	let sampleIdx = 0;
	days.forEach((day) => {
		const vals = getRespiratoryValues(day);
		const startIdx = sampleIdx;
		sampleIdx += vals.length;
		const x0 = (startIdx / allVals.length) * W;
		const x1 = (sampleIdx / allVals.length) * W;
		const dayAvg = vals.reduce((a, b) => a + b, 0) / vals.length;
		const dayMin = Math.min(...vals);
		const dayMax = Math.max(...vals);
		hits.add({
			shape: "rect",
			x: x0,
			y: 0,
			w: x1 - x0,
			h: H,
			title: formatDate(day.date),
			details: [
				{ label: "Avg", value: `${dayAvg.toFixed(1)} br/min` },
				{ label: "Min", value: `${dayMin.toFixed(1)}` },
				{ label: "Max", value: `${dayMax.toFixed(1)}` },
				{ label: "Samples", value: `${vals.length}` },
			],
			payload: day,
		});
	});

	const avg = (allVals.reduce((a, b) => a + b, 0) / allVals.length).toFixed(
		1
	);
	statsEl.innerHTML = `
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:${theme.colors.accent}">${avg}</div><div class="health-md-stat-label">Avg br/min</div></div>
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:${theme.muted}">${minR.toFixed(1)}</div><div class="health-md-stat-label">Min</div></div>
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:${theme.colors.accent}">${maxR.toFixed(1)}</div><div class="health-md-stat-label">Max</div></div>
	`;
};
