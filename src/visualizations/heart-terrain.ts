import { HealthDay, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { lerp, hsl } from "../canvas-utils";

export const renderHeartTerrain: RenderFn = (
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	W: number,
	H: number,
	_config: VizConfig,
	theme: ResolvedTheme,
	statsEl: HTMLElement
): void => {
	const BUCKETS = 96;
	const days = data.filter((d) => d.heart?.heartRateSamples);
	const grid: Array<{ date: string; col: (number | null)[] }> = [];
	let minBPM = 999,
		maxBPM = 0;

	days.forEach((day) => {
		const col: (number[] | null)[] = new Array(BUCKETS).fill(null);
		day.heart!.heartRateSamples.forEach((s) => {
			const dt = new Date(s.timestamp);
			const mins = dt.getHours() * 60 + dt.getMinutes();
			const bucket = Math.floor(mins / 15);
			if (bucket >= 0 && bucket < BUCKETS) {
				if (!col[bucket]) col[bucket] = [];
				(col[bucket] as number[]).push(s.value);
			}
		});
		const averaged = col.map((b) =>
			b ? (b as number[]).reduce((a, c) => a + c, 0) / (b as number[]).length : null
		);
		averaged.forEach((v) => {
			if (v) {
				minBPM = Math.min(minBPM, v);
				maxBPM = Math.max(maxBPM, v);
			}
		});
		grid.push({ date: day.date, col: averaged });
	});

	const colW = W / grid.length;
	const rowH = H / BUCKETS;

	grid.forEach((day, x) => {
		day.col.forEach((bpm, y) => {
			if (bpm === null) return;
			const t = (bpm - minBPM) / (maxBPM - minBPM);
			const h = lerp(220, 0, t);
			const s = lerp(60, 100, t);
			const l = lerp(theme.isDark ? 12 : 30, theme.isDark ? 55 : 65, t);
			ctx.fillStyle = hsl(h, s, l);
			ctx.fillRect(x * colW, y * rowH, colW + 1, rowH + 1);
		});
	});

	const minHR = Math.min(...days.map((d) => d.heart!.heartRateMin || 999));
	const maxHR = Math.max(...days.map((d) => d.heart!.heartRateMax || 0));
	const avgHR = Math.round(
		days.reduce((s, d) => s + (d.heart!.averageHeartRate || 0), 0) /
			days.length
	);

	statsEl.innerHTML = `
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:#4488ff">${minHR}</div><div class="health-md-stat-label">Lowest</div></div>
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:#cc6666">${avgHR}</div><div class="health-md-stat-label">Average</div></div>
		<div class="health-md-stat-box"><div class="health-md-stat-value" style="color:#ff4444">${maxHR}</div><div class="health-md-stat-label">Highest</div></div>
	`;
};
