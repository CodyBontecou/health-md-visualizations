import { HealthDay, HitRegistry, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { hexToRgba, formatDate } from "../canvas-utils";
import { renderInlineStats } from "../dom-utils";

export const renderHrvTrend: RenderFn = (
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

	const days = data.filter(
		(d) => d.heart && (d.heart.hrv != null || (d.heart.hrvSamples && d.heart.hrvSamples.length > 0))
	);
	if (!days.length) return;

	const padL = 36, padR = 16, padT = 16, padB = 28;
	const plotW = W - padL - padR;
	const plotH = H - padT - padB;

	// Compute per-day HRV value (prefer aggregate, else avg of samples)
	const values = days.map((d) => {
		const heart = d.heart;
		if (!heart) return 0;
		if (heart.hrv != null) return heart.hrv;
		const samples = heart.hrvSamples ?? [];
		return samples.reduce((s, x) => s + x.value, 0) / samples.length;
	});

	const minVal = Math.min(...values);
	const maxVal = Math.max(...values);
	const range = maxVal - minVal || 1;

	const xFor = (i: number) => padL + (i / (days.length - 1 || 1)) * plotW;
	const yFor = (v: number) => padT + plotH - ((v - minVal) / range) * plotH;

	// Gridlines
	const gridCount = 4;
	ctx.strokeStyle = hexToRgba(theme.fg, 0.07);
	ctx.lineWidth = 1;
	for (let g = 0; g <= gridCount; g++) {
		const y = padT + (g / gridCount) * plotH;
		ctx.beginPath();
		ctx.moveTo(padL, y);
		ctx.lineTo(W - padR, y);
		ctx.stroke();
		const label = Math.round(maxVal - (g / gridCount) * range);
		ctx.fillStyle = theme.muted;
		ctx.font = "9px sans-serif";
		ctx.textAlign = "right";
		ctx.fillText(String(label), padL - 4, y + 3);
	}

	// Area fill under curve
	const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
	grad.addColorStop(0, hexToRgba(theme.colors.secondary, 0.35));
	grad.addColorStop(1, hexToRgba(theme.colors.secondary, 0.02));

	ctx.beginPath();
	ctx.moveTo(xFor(0), padT + plotH);
	ctx.lineTo(xFor(0), yFor(values[0]));
	for (let i = 1; i < days.length; i++) {
		const x0 = xFor(i - 1), y0 = yFor(values[i - 1]);
		const x1 = xFor(i), y1 = yFor(values[i]);
		const mx = (x0 + x1) / 2;
		ctx.bezierCurveTo(mx, y0, mx, y1, x1, y1);
	}
	ctx.lineTo(xFor(days.length - 1), padT + plotH);
	ctx.closePath();
	ctx.fillStyle = grad;
	ctx.fill();

	// Line
	ctx.beginPath();
	ctx.moveTo(xFor(0), yFor(values[0]));
	for (let i = 1; i < days.length; i++) {
		const x0 = xFor(i - 1), y0 = yFor(values[i - 1]);
		const x1 = xFor(i), y1 = yFor(values[i]);
		const mx = (x0 + x1) / 2;
		ctx.bezierCurveTo(mx, y0, mx, y1, x1, y1);
	}
	ctx.strokeStyle = hexToRgba(theme.colors.secondary, 0.9);
	ctx.lineWidth = 1.5;
	ctx.lineJoin = "round";
	ctx.stroke();

	// Dots + hit regions
	days.forEach((day, i) => {
		const x = xFor(i);
		const y = yFor(values[i]);
		ctx.beginPath();
		ctx.arc(x, y, 3.5, 0, Math.PI * 2);
		ctx.fillStyle = theme.colors.secondary;
		ctx.fill();

		hits.add({
			shape: "circle",
			cx: x,
			cy: y,
			r: 10,
			title: formatDate(day.date),
			details: [
				{ label: "HRV", value: `${values[i].toFixed(1)} ms` },
				...(day.heart?.restingHeartRate
					? [{ label: "Resting HR", value: `${day.heart.restingHeartRate} bpm` }]
					: []),
				...(day.heart?.averageHeartRate
					? [{ label: "Avg HR", value: `${Math.round(day.heart.averageHeartRate)} bpm` }]
					: []),
			],
			payload: day,
		});
	});

	// X-axis date labels (sparse)
	const labelStep = Math.max(1, Math.floor(days.length / 5));
	ctx.fillStyle = theme.muted;
	ctx.font = "8px sans-serif";
	ctx.textAlign = "center";
	days.forEach((day, i) => {
		if (i % labelStep !== 0 && i !== days.length - 1) return;
		const d = new Date(day.date + "T00:00:00");
		const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
		ctx.fillText(label, xFor(i), H - 6);
	});

	// Stats strip
	const avg = values.reduce((s, v) => s + v, 0) / values.length;
	renderInlineStats(statsEl, [
		[
			{ text: "Avg HRV " },
			{ text: `${avg.toFixed(1)} ms`, strong: true },
		],
		[
			{ text: "Min " },
			{ text: minVal.toFixed(1), strong: true },
		],
		[
			{ text: "Max " },
			{ text: maxVal.toFixed(1), strong: true },
		],
	]);
};
