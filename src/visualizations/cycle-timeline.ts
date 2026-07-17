import { formatDate, hexToRgba } from "../canvas-utils";
import { renderInlineStats } from "../dom-utils";
import { CYCLE_METRICS } from "../metric-catalog";
import {
	observedCanonicalKeys,
	resolveMetricDefinition,
	resolveMetricScalar,
	resolveNumericMetric,
} from "../metric-resolver";
import type {
	HealthDay,
	HealthMetricScalar,
	HitRegionDetail,
	RenderFn,
	ResolvedTheme,
	VisualizationContext,
} from "../types";

interface TimelineLane {
	key: string;
	label: string;
	kind: "category" | "symptoms" | "mood";
}

function configBoolean(value: string | number | undefined): boolean {
	if (typeof value === "number") return value !== 0;
	if (typeof value !== "string") return false;
	return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function safeText(value: unknown, fallback = "Recorded"): string {
	if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return fallback;
	const primitive = typeof value === "string" ? value : String(value);
	const text = Array.from(primitive, (character) => {
		const code = character.charCodeAt(0);
		return code < 32 || code === 127 ? " " : character;
	}).join("").replace(/\s+/g, " ").trim();
	return (text || fallback).slice(0, 80);
}

function categoryLabel(value: HealthMetricScalar): string {
	if (typeof value === "boolean") return value ? "Yes" : "No";
	if (typeof value === "number") {
		if (value === 0) return "No";
		return `Recorded (${value.toLocaleString(undefined, { maximumFractionDigits: 2 })})`;
	}
	const normalized = safeText(value)
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
	return safeText(normalized);
}

function hashText(value: string): number {
	let hash = 0;
	for (let index = 0; index < value.length; index++) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
	return Math.abs(hash);
}

function categoryColor(key: string, category: string, theme: ResolvedTheme): string {
	const hue = hashText(`${key}:${category}`) % 360;
	return `hsl(${hue},${theme.isDark ? 62 : 68}%,${theme.isDark ? 58 : 45}%)`;
}

function shortDate(iso: string): string {
	const date = new Date(`${iso}T00:00:00`);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function moodSummary(
	day: HealthDay,
	context?: VisualizationContext
): { label: string; detail: string; colorValue: number } | undefined {
	let valence = resolveNumericMetric(day, "average_mood_valence", context?.dictionary);
	if (valence === undefined) {
		const percent = resolveNumericMetric(day, "average_mood_percent", context?.dictionary);
		if (percent !== undefined) valence = percent / 50 - 1;
	}
	if (valence !== undefined) {
		const bounded = Math.max(-1, Math.min(1, valence));
		const label = bounded < -0.16 ? "Unpleasant" : bounded > 0.16 ? "Pleasant" : "Neutral";
		return {
			label,
			detail: `${Math.round((bounded + 1) * 50)}%`,
			colorValue: bounded,
		};
	}
	const primary = day.mood?.primaryLabel;
	if (!primary) return undefined;
	return { label: safeText(primary), detail: safeText(primary), colorValue: 0 };
}

function moodColor(value: number, theme: ResolvedTheme): string {
	if (value > 0.16) return theme.colors.accent;
	if (value < -0.16) return theme.colors.secondary;
	return theme.muted;
}

function symptomDetails(
	day: HealthDay,
	symptomKeys: string[],
	context?: VisualizationContext
): HitRegionDetail[] {
	const recorded = symptomKeys.flatMap((key): Array<{ label: string; count: number }> => {
		const count = resolveNumericMetric(day, key, context?.dictionary);
		if (count === undefined || count <= 0) return [];
		return [{
			label: safeText(resolveMetricDefinition(key, context?.dictionary, [day]).label),
			count,
		}];
	}).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
	const details = recorded.slice(0, 8).map((item) => ({
		label: item.label,
		value: `${item.count.toLocaleString()} record${item.count === 1 ? "" : "s"}`,
	}));
	if (recorded.length > details.length) {
		details.push({ label: "Additional symptoms", value: String(recorded.length - details.length) });
	}
	return details;
}

function emptyState(ctx: CanvasRenderingContext2D, W: number, H: number, theme: ResolvedTheme): void {
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	ctx.fillStyle = theme.muted;
	ctx.font = "12px sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText("No cycle summary data", W / 2, H / 2);
}

export const renderCycleTimeline: RenderFn = (
	ctx,
	data,
	W,
	H,
	config,
	theme,
	statsEl,
	hits,
	context
): void => {
	const days = [...data].sort((a, b) => a.date.localeCompare(b.date));
	const showSymptoms = configBoolean(config.showSymptoms);
	const showMood = configBoolean(config.showMood);
	const symptomKeys = observedCanonicalKeys(days).filter((key) => key.startsWith("symptom_"));
	const hasCoreData = days.some((day) => CYCLE_METRICS.some((key) => resolveMetricScalar(day, key, context?.dictionary) !== undefined));
	const hasSymptoms = showSymptoms && days.some((day) => symptomDetails(day, symptomKeys, context).length > 0);
	const hasMood = showMood && days.some((day) => moodSummary(day, context) !== undefined);
	if (!days.length || (!hasCoreData && !hasSymptoms && !hasMood)) {
		statsEl.empty();
		emptyState(ctx, W, H, theme);
		return;
	}

	const lanes: TimelineLane[] = CYCLE_METRICS.map((key) => ({
		key,
		label: resolveMetricDefinition(key, context?.dictionary, days).label,
		kind: "category",
	}));
	if (showSymptoms) lanes.push({ key: "symptoms", label: "Symptoms", kind: "symptoms" });
	if (showMood) lanes.push({ key: "mood", label: "Mood", kind: "mood" });

	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	const padL = Math.min(150, Math.max(104, W * 0.25));
	const padR = 14;
	const padT = 54;
	const padB = 38;
	const plotW = Math.max(1, W - padL - padR);
	const plotH = Math.max(1, H - padT - padB);
	const columnW = plotW / days.length;
	const laneH = plotH / lanes.length;

	ctx.fillStyle = theme.fg;
	ctx.font = "600 13px sans-serif";
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	ctx.fillText("Cycle timeline", 14, 21);
	ctx.fillStyle = theme.muted;
	ctx.font = "10px sans-serif";
	ctx.fillText("Daily categorical summaries", 14, 38);

	lanes.forEach((lane, laneIndex) => {
		const y = padT + laneIndex * laneH;
		ctx.fillStyle = laneIndex % 2 === 0 ? hexToRgba(theme.fg, 0.025) : hexToRgba(theme.fg, 0.012);
		ctx.fillRect(padL, y, plotW, laneH);
		ctx.strokeStyle = hexToRgba(theme.fg, 0.07);
		ctx.beginPath();
		ctx.moveTo(padL, y + laneH);
		ctx.lineTo(W - padR, y + laneH);
		ctx.stroke();
		ctx.fillStyle = theme.fg;
		ctx.font = "10px sans-serif";
		ctx.textAlign = "right";
		ctx.textBaseline = "middle";
		ctx.fillText(lane.label.slice(0, 24), padL - 8, y + laneH / 2);

		days.forEach((day, dayIndex) => {
			const x = padL + dayIndex * columnW;
			const insetX = Math.min(3, Math.max(1, columnW * 0.12));
			const insetY = Math.min(6, Math.max(2, laneH * 0.2));
			const markX = x + insetX;
			const markY = y + insetY;
			const markW = Math.max(1, columnW - insetX * 2);
			const markH = Math.max(2, laneH - insetY * 2);

			if (lane.kind === "category") {
				const value = resolveMetricScalar(day, lane.key, context?.dictionary);
				if (value === undefined) return;
				const category = categoryLabel(value);
				const color = categoryColor(lane.key, category, theme);
				ctx.fillStyle = hexToRgba(color, 0.82);
				ctx.beginPath();
				ctx.roundRect(markX, markY, markW, markH, Math.min(4, markH / 2));
				ctx.fill();
				hits.add({
					shape: "rect",
					x,
					y,
					w: columnW,
					h: laneH,
					title: `${lane.label} — ${formatDate(day.date)}`,
					details: [{ label: "Category", value: safeText(category) }],
					payload: day,
				});
				return;
			}

			if (lane.kind === "symptoms") {
				const details = symptomDetails(day, symptomKeys, context);
				if (!details.length) return;
				const color = categoryColor("symptoms", details[0].label, theme);
				ctx.fillStyle = hexToRgba(color, 0.76);
				ctx.beginPath();
				ctx.roundRect(markX, markY, markW, markH, Math.min(4, markH / 2));
				ctx.fill();
				hits.add({
					shape: "rect",
					x,
					y,
					w: columnW,
					h: laneH,
					title: `Symptom records — ${formatDate(day.date)}`,
					details,
					payload: day,
				});
				return;
			}

			const mood = moodSummary(day, context);
			if (!mood) return;
			ctx.fillStyle = hexToRgba(moodColor(mood.colorValue, theme), 0.78);
			ctx.beginPath();
			ctx.arc(markX + markW / 2, markY + markH / 2, Math.max(2, Math.min(markW, markH) * 0.36), 0, Math.PI * 2);
			ctx.fill();
			hits.add({
				shape: "rect",
				x,
				y,
				w: columnW,
				h: laneH,
				title: `Mood — ${formatDate(day.date)}`,
				details: [{ label: safeText(mood.label), value: safeText(mood.detail) }],
				payload: day,
			});
		});
	});

	const labelStep = Math.max(1, Math.ceil(days.length / 7));
	ctx.fillStyle = theme.muted;
	ctx.font = "9px sans-serif";
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	days.forEach((day, index) => {
		if (index % labelStep !== 0 && index !== days.length - 1) return;
		const x = padL + index * columnW + columnW / 2;
		ctx.save();
		ctx.translate(x, H - padB + 9);
		ctx.rotate(-Math.PI / 4);
		ctx.fillText(shortDate(day.date), 0, 0);
		ctx.restore();
	});

	const coreMarks = days.reduce((sum, day) => sum + CYCLE_METRICS.filter((key) => resolveMetricScalar(day, key, context?.dictionary) !== undefined).length, 0);
	renderInlineStats(statsEl, [
		[{ text: "Days " }, { text: String(days.length), strong: true }],
		[{ text: "Cycle entries " }, { text: String(coreMarks), strong: true }],
		[{ text: "Lanes " }, { text: String(lanes.length), strong: true }],
	]);
};
