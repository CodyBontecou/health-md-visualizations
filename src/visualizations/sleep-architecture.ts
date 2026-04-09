import { HealthDay, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { SLEEP_COLORS, SLEEP_GLOW } from "../canvas-utils";

export const renderSleepArchitecture: RenderFn = (
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	W: number,
	H: number,
	_config: VizConfig,
	theme: ResolvedTheme,
	_statsEl: HTMLElement
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

	const stripeHeight = 48;
	const gap = 6;
	const labelWidth = 80;
	const rightPad = 20;
	const topPad = 10;
	const totalHeight = topPad + nights.length * (stripeHeight + gap);

	// Resize canvas to fit all nights
	const dpr = window.devicePixelRatio || 1;
	canvas.width = W * dpr;
	canvas.height = totalHeight * dpr;
	canvas.style.width = W + "px";
	canvas.style.height = totalHeight + "px";
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.scale(dpr, dpr);

	const barWidth = W - labelWidth - rightPad;

	const nightMeta = nights.map((n) => {
		const stages = n.sleep!.sleepStages;
		const start = new Date(stages[0].startDate).getTime();
		const end = new Date(stages[stages.length - 1].endDate).getTime();
		return { start, end, span: end - start };
	});

	const maxSpan = Math.max(...nightMeta.map((m) => m.span));

	nights.forEach((night, i) => {
		const y = topPad + i * (stripeHeight + gap);
		const meta = nightMeta[i];

		// Date label
		const d = new Date(night.date + "T00:00:00");
		const label = d.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			weekday: "short",
		});
		ctx.fillStyle = theme.muted;
		ctx.font = "11px sans-serif";
		ctx.textAlign = "right";
		ctx.textBaseline = "middle";
		ctx.fillText(label, labelWidth - 12, y + stripeHeight / 2);

		// Background bar
		ctx.fillStyle = theme.isDark ? "#111118" : "#eeeef2";
		ctx.beginPath();
		ctx.roundRect(labelWidth, y, barWidth, stripeHeight, 4);
		ctx.fill();

		// Sleep stages
		night.sleep!.sleepStages.forEach((stage) => {
			const stageStart = new Date(stage.startDate).getTime();
			const stageEnd = new Date(stage.endDate).getTime();
			const x =
				labelWidth +
				((stageStart - meta.start) / maxSpan) * barWidth;
			const w = Math.max(
				1,
				((stageEnd - stageStart) / maxSpan) * barWidth
			);

			ctx.shadowColor = SLEEP_GLOW[stage.stage] || "#000";
			ctx.shadowBlur = 8;

			ctx.fillStyle = SLEEP_COLORS[stage.stage] || "#333";
			ctx.fillRect(x, y + 2, w, stripeHeight - 4);

			ctx.shadowBlur = 0;
		});
	});
};
