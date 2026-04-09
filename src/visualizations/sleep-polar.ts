import { HealthDay, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { setupCanvas, SLEEP_COLORS } from "../canvas-utils";

export const renderSleepPolar: RenderFn = (
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	W: number,
	H: number,
	_config: VizConfig,
	theme: ResolvedTheme,
	statsEl: HTMLElement
): void => {
	const canvas = ctx.canvas;
	const nights = data.filter(
		(d) => d.sleep?.sleepStages && d.sleep.sleepStages.length > 0
	);
	if (!nights.length) {
		ctx.fillStyle = theme.muted;
		ctx.font = "12px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText("No sleep data", W / 2, H / 2);
		return;
	}

	// Clear and fill background
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);

	const cols = 3;
	const rows = Math.ceil(nights.length / cols);
	const cellW = Math.floor((W - (cols - 1) * 6) / cols);
	const cellH = Math.floor((H - (rows - 1) * 6) / rows);
	const cellSize = Math.min(cellW, cellH);

	nights.forEach((night, idx) => {
		const row = Math.floor(idx / cols);
		const col = idx % cols;
		const offsetX = col * (cellSize + 6);
		const offsetY = row * (cellSize + 6);
		const cx = offsetX + cellSize / 2;
		const cy = offsetY + cellSize / 2;
		const r = cellSize / 2 - 10;

		// Background circle
		ctx.fillStyle = theme.isDark ? "#0d0d18" : "#f0f0f5";
		ctx.beginPath();
		ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
		ctx.fill();

		const stages = night.sleep!.sleepStages;
		const firstStart = new Date(stages[0].startDate).getTime();
		const lastEnd = new Date(
			stages[stages.length - 1].endDate
		).getTime();
		const totalSpan = lastEnd - firstStart;

		stages.forEach((stage) => {
			const start = new Date(stage.startDate).getTime();
			const end = new Date(stage.endDate).getTime();
			const a1 =
				((start - firstStart) / totalSpan) * Math.PI * 2 - Math.PI / 2;
			const a2 =
				((end - firstStart) / totalSpan) * Math.PI * 2 - Math.PI / 2;
			ctx.beginPath();
			ctx.moveTo(cx, cy);
			ctx.arc(cx, cy, r - 1, a1, a2);
			ctx.closePath();
			ctx.fillStyle = SLEEP_COLORS[stage.stage] || "#333";
			ctx.globalAlpha = 0.85;
			ctx.fill();
			ctx.globalAlpha = 1;
		});

		// Center dot
		ctx.fillStyle = theme.bg;
		ctx.beginPath();
		ctx.arc(cx, cy, 5, 0, Math.PI * 2);
		ctx.fill();

		// Date label
		const d = new Date(night.date + "T00:00:00");
		ctx.fillStyle = theme.muted;
		ctx.font = `${Math.max(7, cellSize * 0.09)}px sans-serif`;
		ctx.textAlign = "center";
		ctx.fillText(
			d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
			cx,
			offsetY + cellSize - 1
		);
	});

	// Resize canvas to actual content height
	const actualRows = Math.ceil(nights.length / cols);
	const actualH = actualRows * (cellSize + 6) - 6;
	if (actualH < H) {
		const dpr = window.devicePixelRatio || 1;
		canvas.height = actualH * dpr;
		canvas.style.height = actualH + "px";
	}
};
