import { HealthDay, HitRegistry, RenderFn, ResolvedTheme, VizConfig } from "../types";
import { formatDate, formatDuration, hexToRgba } from "../canvas-utils";
import { renderInlineStats } from "../dom-utils";
import { formatMoodValence, moodLabelForValence } from "../mood-utils";
import {
	clamp,
	collectMoodDays,
	configFlag,
	dayExerciseMinutes,
	moodHex,
	shortDate,
	yForValence,
} from "../mood-viz-utils";

export const renderMoodTrend: RenderFn = (
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	W: number,
	H: number,
	config: VizConfig,
	theme: ResolvedTheme,
	statsEl: HTMLElement,
	hits: HitRegistry
): void => {
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);

	const points = collectMoodDays(data).map((day) => ({
		day: day.day,
		date: day.date,
		valence: day.averageValence,
		label: day.primaryLabel,
		entries: day.entries.length,
	}));
	const moodPoints = points.filter((point) => point.valence !== undefined);

	if (!points.length || !moodPoints.length) {
		ctx.fillStyle = theme.muted;
		ctx.font = "12px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText("No mood data in range", W / 2, H / 2);
		statsEl.empty();
		return;
	}

	const showContext = configFlag(config.showContext, true);
	const padL = 54;
	const padR = 16;
	const padT = showContext ? 72 : 56;
	const padB = 34;
	const plotW = W - padL - padR;
	const plotH = H - padT - padB;
	const slot = plotW / Math.max(points.length, 1);

	const values = moodPoints.map((point) => point.valence!).filter(Number.isFinite);
	const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
	const firstDate = points[0].date;
	const lastDate = points[points.length - 1].date;

	// Header
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = theme.fg;
	ctx.font = "600 22px sans-serif";
	ctx.fillText(moodLabelForValence(avg), padL, 24);
	ctx.fillStyle = theme.muted;
	ctx.font = "11px sans-serif";
	ctx.fillText(`${formatMoodValence(avg)} avg • ${formatDate(firstDate)} – ${formatDate(lastDate)}`, padL, 41);

	// Grid and y-axis.
	const ticks = [
		{ value: 1, label: "pleasant" },
		{ value: 0, label: "neutral" },
		{ value: -1, label: "unpleasant" },
	];
	ctx.lineWidth = 1;
	for (const tick of ticks) {
		const y = yForValence(tick.value, padT, plotH);
		ctx.strokeStyle = tick.value === 0 ? hexToRgba(theme.fg, 0.18) : hexToRgba(theme.fg, 0.08);
		ctx.beginPath();
		ctx.moveTo(padL, y);
		ctx.lineTo(W - padR, y);
		ctx.stroke();
		ctx.fillStyle = theme.muted;
		ctx.font = "9px sans-serif";
		ctx.textAlign = "right";
		ctx.textBaseline = "middle";
		ctx.fillText(tick.label, padL - 6, y);
	}

	if (showContext) {
		// Faint context columns: sleep duration and workout/exercise minutes behind mood.
		const maxExercise = Math.max(30, ...points.map((point) => dayExerciseMinutes(point.day)));
		points.forEach((point, i) => {
			const cx = padL + i * slot + slot / 2;
			const colW = Math.max(2, Math.min(18, slot * 0.42));
			const sleepHours = (point.day.sleep?.totalDuration ?? 0) / 3600;
			if (sleepHours > 0) {
				const sleepH = clamp(sleepHours / 10, 0, 1) * plotH;
				ctx.fillStyle = hexToRgba(theme.colors.sleep.core, 0.16);
				ctx.beginPath();
				ctx.roundRect(cx - colW / 2, padT + plotH - sleepH, colW, sleepH, [3, 3, 0, 0]);
				ctx.fill();
			}
			const exercise = dayExerciseMinutes(point.day);
			if (exercise > 0) {
				const exerciseH = clamp(exercise / maxExercise, 0, 1) * plotH;
				ctx.fillStyle = hexToRgba(theme.colors.secondary, 0.14);
				ctx.beginPath();
				ctx.roundRect(cx - colW / 4, padT + plotH - exerciseH, colW / 2, exerciseH, [2, 2, 0, 0]);
				ctx.fill();
			}
		});

		ctx.font = "9px sans-serif";
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";
		let lx = padL;
		for (const item of [
			{ label: "sleep", color: theme.colors.sleep.core },
			{ label: "exercise", color: theme.colors.secondary },
		]) {
			ctx.fillStyle = hexToRgba(item.color, 0.45);
			ctx.fillRect(lx, padT - 16, 9, 6);
			ctx.fillStyle = theme.muted;
			ctx.fillText(item.label, lx + 12, padT - 12);
			lx += 62;
		}
	}

	// Mood trend line, split across missing days.
	ctx.save();
	ctx.lineWidth = 2;
	ctx.strokeStyle = hexToRgba(theme.colors.accent, 0.7);
	ctx.beginPath();
	let activeSegment = false;
	points.forEach((point, i) => {
		if (point.valence === undefined) {
			activeSegment = false;
			return;
		}
		const x = padL + i * slot + slot / 2;
		const y = yForValence(point.valence, padT, plotH);
		if (!activeSegment) {
			ctx.moveTo(x, y);
			activeSegment = true;
		} else {
			ctx.lineTo(x, y);
		}
	});
	ctx.stroke();
	ctx.restore();

	points.forEach((point, i) => {
		const cx = padL + i * slot + slot / 2;
		const hitX = padL + i * slot;
		const moodY = point.valence !== undefined ? yForValence(point.valence, padT, plotH) : yForValence(0, padT, plotH);
		const color = moodHex(point.valence, theme);
		if (point.valence === undefined) {
			ctx.fillStyle = hexToRgba(theme.fg, 0.16);
			ctx.beginPath();
			ctx.arc(cx, moodY, 2.2, 0, Math.PI * 2);
			ctx.fill();
		} else {
			const r = point.entries > 1 ? 6 : 5;
			ctx.fillStyle = hexToRgba(color, 0.18);
			ctx.beginPath();
			ctx.arc(cx, moodY, r + 5, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.arc(cx, moodY, r, 0, Math.PI * 2);
			ctx.fill();
			ctx.strokeStyle = theme.bg;
			ctx.lineWidth = 1.5;
			ctx.stroke();
		}

		if (points.length <= 14 || i % Math.ceil(points.length / 6) === 0 || i === points.length - 1) {
			ctx.fillStyle = point.valence !== undefined ? theme.fg : theme.muted;
			ctx.font = "9px sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "top";
			ctx.fillText(shortDate(point.date), cx, padT + plotH + 8);
		}

		const sleepSeconds = point.day.sleep?.totalDuration;
		const exerciseMinutes = dayExerciseMinutes(point.day);
		const details = [
			...(point.valence !== undefined ? [{ label: "Mood", value: `${moodLabelForValence(point.valence)} (${formatMoodValence(point.valence)})` }] : []),
			...(point.label ? [{ label: "Label", value: point.label }] : []),
			...(point.entries ? [{ label: "Entries", value: String(point.entries) }] : []),
			...(sleepSeconds ? [{ label: "Sleep", value: formatDuration(sleepSeconds) }] : []),
			...(exerciseMinutes ? [{ label: "Exercise", value: `${Math.round(exerciseMinutes)} min` }] : []),
			...(point.day.workouts?.length ? [{ label: "Workouts", value: String(point.day.workouts.length) }] : []),
		];
		hits.add({
			shape: "rect",
			x: hitX,
			y: padT,
			w: slot,
			h: plotH + padB,
			title: formatDate(point.date),
			details,
			payload: point.day,
		});
	});

	const totalEntries = moodPoints.reduce((sum, point) => sum + point.entries, 0);
	const avgSleepSeconds = moodPoints.reduce((sum, point) => sum + (point.day.sleep?.totalDuration ?? 0), 0) / moodPoints.length;
	const avgExercise = moodPoints.reduce((sum, point) => sum + dayExerciseMinutes(point.day), 0) / moodPoints.length;
	renderInlineStats(statsEl, [
		[
			{ text: "Avg mood " },
			{ text: `${moodLabelForValence(avg)} ${formatMoodValence(avg)}`, strong: true },
		],
		[
			{ text: "Mood entries " },
			{ text: String(totalEntries), strong: true },
		],
		...(avgSleepSeconds > 0 ? [[
			{ text: "Avg sleep " },
			{ text: formatDuration(avgSleepSeconds), strong: true },
		]] : []),
		...(avgExercise > 0 ? [[
			{ text: "Avg exercise " },
			{ text: `${Math.round(avgExercise)}m`, strong: true },
		]] : []),
	]);
};
