import { HealthDay, HitRegistry, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { formatDate, formatDuration } from "../canvas-utils";

type SleepStage = NonNullable<HealthDay["sleep"]>["sleepStages"][number];

function buildSyntheticStages(night: HealthDay): SleepStage[] {
	const sleep = night.sleep!;
	if (!sleep.bedtime || !sleep.wakeTime) return [];

	const isTimeOnly = (s: string) => /^\d{1,2}:\d{2}$/.test(s);
	let bedMs: number;
	let wakeMs: number;

	if (isTimeOnly(sleep.bedtime)) {
		bedMs = new Date(`${night.date}T${sleep.bedtime}:00`).getTime();
		wakeMs = new Date(`${night.date}T${sleep.wakeTime}:00`).getTime();
		if (wakeMs <= bedMs) wakeMs += 86400000;
	} else {
		bedMs = Date.parse(sleep.bedtime);
		wakeMs = Date.parse(sleep.wakeTime);
	}

	if (!isFinite(bedMs) || !isFinite(wakeMs) || wakeMs <= bedMs) return [];

	const stages: SleepStage[] = [];
	let cursor = bedMs;

	function addStage(stage: string, secs: number): void {
		if (secs <= 0) return;
		const startDate = new Date(cursor).toISOString();
		cursor += secs * 1000;
		stages.push({ stage, startDate, endDate: new Date(cursor).toISOString(), durationSeconds: Math.round(secs) });
	}

	const awake = sleep.awakeTime ?? 0;
	const core = sleep.coreSleep ?? 0;
	const deep = sleep.deepSleep ?? 0;
	const rem = sleep.remSleep ?? 0;

	addStage("awake", awake * 0.3);
	addStage("core", core * 0.45);
	addStage("deep", deep);
	addStage("rem", rem);
	addStage("core", core * 0.55);
	addStage("awake", awake * 0.7);

	return stages;
}

function getEffectiveStages(night: HealthDay): SleepStage[] {
	const stages = night.sleep?.sleepStages ?? [];
	if (stages.length > 0) return stages;
	return buildSyntheticStages(night);
}

export const renderSleepPolar: RenderFn = (
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	W: number,
	H: number,
	_config: VizConfig,
	theme: ResolvedTheme,
	statsEl: HTMLElement,
	hits: HitRegistry
): void => {
	const canvas = ctx.canvas;
	const nights = data.filter(
		(d) => d.sleep && (d.sleep.sleepStages.length > 0 || d.sleep.totalDuration > 0)
	);
	if (!nights.length) {
		ctx.fillStyle = theme.muted;
		ctx.font = "12px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText("No sleep data", W / 2, H / 2);
		return;
	}

	const cols = 3;
	const rows = Math.ceil(nights.length / cols);
	const cellW = Math.floor((W - (cols - 1) * 6) / cols);
	const cellH = Math.floor((H - (rows - 1) * 6) / rows);
	const cellSize = Math.min(cellW, cellH);

	// Resize the canvas to actual content height BEFORE drawing (resizing clears the canvas)
	const actualH = rows * (cellSize + 6) - 6;
	if (actualH < H) {
		const dpr = window.devicePixelRatio || 1;
		canvas.width = W * dpr;
		canvas.height = actualH * dpr;
		canvas.style.width = W + "px";
		canvas.style.height = actualH + "px";
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.scale(dpr, dpr);
	}

	// Fill background
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, actualH < H ? actualH : H);

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

		const stages = getEffectiveStages(night);
		if (!stages.length) return;
		const firstStart = new Date(stages[0].startDate).getTime();
		const lastEnd = new Date(stages[stages.length - 1].endDate).getTime();
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
			ctx.fillStyle = theme.colors.sleep[stage.stage as keyof typeof theme.colors.sleep] || "#333";
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

		const sleep = night.sleep!;
		hits.add({
			shape: "circle",
			cx,
			cy,
			r: r + 6,
			title: formatDate(night.date),
			details: [
				{ label: "Total", value: formatDuration(sleep.totalDuration) },
				{ label: "Deep", value: formatDuration(sleep.deepSleep) },
				{ label: "REM", value: formatDuration(sleep.remSleep) },
				{ label: "Core", value: formatDuration(sleep.coreSleep) },
				...(sleep.awakeTime
					? [{ label: "Awake", value: formatDuration(sleep.awakeTime) }]
					: []),
				{
					label: "Bedtime",
					value: /^\d{1,2}:\d{2}$/.test(sleep.bedtime)
						? sleep.bedtime
						: new Date(sleep.bedtime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
				},
				{
					label: "Wake",
					value: /^\d{1,2}:\d{2}$/.test(sleep.wakeTime)
						? sleep.wakeTime
						: new Date(sleep.wakeTime).toLocaleTimeString("en-US", {
						hour: "numeric",
						minute: "2-digit",
					}),
				},
			],
			payload: night,
		});
	});

};
