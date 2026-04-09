import { HealthDay, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { lerp, hsl } from "../canvas-utils";

export const renderOxygenRiver: RenderFn = (
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	W: number,
	H: number,
	_config: VizConfig,
	theme: ResolvedTheme,
	statsEl: HTMLElement
): void => {
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);

	const days = data.filter(
		(d) => d.vitals?.bloodOxygenSamples && d.vitals.bloodOxygenSamples.length > 0
	);
	if (!days.length) {
		ctx.fillStyle = theme.muted;
		ctx.font = "12px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText("No SpO2 data", W / 2, H / 2);
		return;
	}

	const allSamples: Array<{ x: number; value: number }> = [];
	days.forEach((day, di) => {
		day.vitals!.bloodOxygenSamples!.forEach((s) => {
			allSamples.push({
				x: di + Math.random() * 0.8,
				value: s.value || s.percent || 0,
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

	const avgO2 =
		allSamples.reduce((s, v) => s + v.value, 0) / allSamples.length;
	statsEl.innerHTML = `
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:#4488ff">${avgO2.toFixed(1)}%</div><div class="health-md-stat-label">Avg SpO2</div></div>
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:#6688cc">${minO2.toFixed(1)}%</div><div class="health-md-stat-label">Min</div></div>
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:#88aaee">${maxO2.toFixed(1)}%</div><div class="health-md-stat-label">Max</div></div>
	`;
};
