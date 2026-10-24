import { HealthDay, HitRegistry, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { formatDate, formatDuration } from "../canvas-utils";

type SleepStage = NonNullable<HealthDay["sleep"]>["sleepStages"][number];

/** Build approximate sleep stages from aggregate totals when no stage samples exist. */
function buildSyntheticStages(night: HealthDay): SleepStage[] {
	const sleep = night.sleep!;
	// Summary totals cannot place native stages on a source timeline.
	if (night.timeContext?.sleep_day_attribution === "morning_ends") return [];
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

	// Typical architecture: brief awake → core (first) → deep → rem → core (last) → brief awake
	const awake = sleep.awakeTime ?? 0;
	const core = sleep.coreSleep ?? sleep.lightSleep ?? 0;
	const nativeStage = sleep.lightSleep !== undefined ? "light" : "core";
	const deep = sleep.deepSleep ?? 0;
	const rem = sleep.remSleep ?? 0;

	addStage("awake", awake * 0.3);
	addStage(nativeStage, core * 0.45);
	addStage("deep", deep);
	addStage("rem", rem);
	addStage(nativeStage, core * 0.55);
	addStage("awake", awake * 0.7);

	return stages;
}

function getEffectiveStages(night: HealthDay): SleepStage[] {
	const stages = night.sleep?.sleepStages ?? [];
	if (stages.length > 0) return stages;
	return buildSyntheticStages(night);
}

export const renderSleepArchitecture: RenderFn = (
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	W: number,
	H: number,
	_config: VizConfig,
	theme: ResolvedTheme,
	_statsEl: HTMLElement,
	hits: HitRegistry
): void => {
	const canvas = ctx.canvas;
	const nights = data.filter(
		(d) => d.sleep && getEffectiveStages(d).length > 0
	);
	if (!nights.length) {
		ctx.fillStyle = theme.muted;
		ctx.font = "12px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText(data.some((day) => day.timeContext?.sleep_day_attribution === "morning_ends" && day.sleep)
			? "No recorded sleep stage timing" : "No sleep data", W / 2, H / 2);
		return;
	}

	const stripeHeight = 48;
	const gap = 6;
	const labelWidth = 80;
	const rightPad = 20;
	const topPad = 10;
	const totalHeight = topPad + nights.length * (stripeHeight + gap);

	// Resize canvas to fit all nights
	const dpr = activeWindow.devicePixelRatio || 1;
	canvas.width = W * dpr;
	canvas.height = totalHeight * dpr;
	canvas.style.width = W + "px";
	canvas.style.height = totalHeight + "px";
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.scale(dpr, dpr);

	const barWidth = W - labelWidth - rightPad;

	const nightMeta = nights.map((n) => {
		const stages = getEffectiveStages(n);
		const start = new Date(stages[0].startDate).getTime();
		const end = new Date(stages[stages.length - 1].endDate).getTime();
		return { start, end, span: end - start, stages };
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

		// Push night summary FIRST (so individual stages take priority on hit-test)
		const nightSleep = night.sleep!;
		hits.add({
			shape: "rect",
			x: labelWidth,
			y,
			w: barWidth,
			h: stripeHeight,
			title: formatDate(night.date),
			details: [
				...(nightSleep.totalDuration !== undefined ? [{ label: "Total", value: formatDuration(nightSleep.totalDuration) }] : []),
				...(nightSleep.deepSleep !== undefined ? [{ label: "Deep", value: formatDuration(nightSleep.deepSleep) }] : []),
				...(nightSleep.remSleep !== undefined ? [{ label: "REM", value: formatDuration(nightSleep.remSleep) }] : []),
				...(nightSleep.coreSleep !== undefined ? [{ label: "Core", value: formatDuration(nightSleep.coreSleep) }] : []),
				...(nightSleep.lightSleep !== undefined ? [{ label: "Light", value: formatDuration(nightSleep.lightSleep) }] : []),
			],
			payload: night,
		});

		// Sleep stages
		meta.stages.forEach((stage) => {
			const stageStart = new Date(stage.startDate).getTime();
			const stageEnd = new Date(stage.endDate).getTime();
			const x =
				labelWidth +
				((stageStart - meta.start) / maxSpan) * barWidth;
			const w = Math.max(
				1,
				((stageEnd - stageStart) / maxSpan) * barWidth
			);

			ctx.shadowColor = theme.colors.sleep[(stage.stage === "light" ? "core" : stage.stage) as keyof typeof theme.colors.sleep] || "#000";
			ctx.shadowBlur = 8;

			ctx.fillStyle = theme.colors.sleep[(stage.stage === "light" ? "core" : stage.stage) as keyof typeof theme.colors.sleep] || "#333";
			ctx.fillRect(x, y + 2, w, stripeHeight - 4);

			ctx.shadowBlur = 0;

			const fmtTime = (iso: string): string =>
				new Date(iso).toLocaleTimeString("en-US", {
					hour: "numeric",
					minute: "2-digit",
					...(night.timeContext?.sleep_day_attribution === "morning_ends" ? { timeZone: night.timeContext.calendar_timezone } : {}),
				});
			hits.add({
				shape: "rect",
				x,
				y: y + 2,
				w,
				h: stripeHeight - 4,
				title: `${stage.stage.toUpperCase()} — ${formatDate(night.date)}`,
				details: [
					{ label: "Start", value: fmtTime(stage.startDate) },
					{ label: "End", value: fmtTime(stage.endDate) },
					{
						label: "Duration",
						value: formatDuration(stage.durationSeconds),
					},
				],
				payload: { day: night, stage },
			});
		});
	});
};
