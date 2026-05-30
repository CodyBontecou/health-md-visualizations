import { HealthDay, HitRegistry, RenderFn, ResolvedTheme, TimeSeriesSample, VizConfig } from "../types";
import { hexToRgba } from "../canvas-utils";
import { renderInlineStats, renderStatBoxes } from "../dom-utils";
import {
	drawEmptyState,
	elapsedSeconds,
	formatElapsed,
	PickedWorkout,
	pickWorkout,
} from "../workout-utils";

interface Zone {
	label: string;
	loFrac: number;
	hiFrac: number;
	hue: number;
}

const ZONES: Zone[] = [
	{ label: "Z1", loFrac: 0.5, hiFrac: 0.6, hue: 210 },
	{ label: "Z2", loFrac: 0.6, hiFrac: 0.7, hue: 180 },
	{ label: "Z3", loFrac: 0.7, hiFrac: 0.8, hue: 120 },
	{ label: "Z4", loFrac: 0.8, hiFrac: 0.9, hue: 40 },
	{ label: "Z5", loFrac: 0.9, hiFrac: 1.0, hue: 0 },
];

function zoneFor(bpm: number, maxHr: number): Zone | null {
	const frac = bpm / maxHr;
	for (const z of ZONES) {
		if (frac >= z.loFrac && frac < z.hiFrac) return z;
	}
	if (frac >= 1) return ZONES[ZONES.length - 1];
	return null;
}

function resolveMaxHeartRate(
	config: VizConfig,
	theme: ResolvedTheme
): number | undefined {
	const cfg = config.maxHeartRate;
	if (typeof cfg === "number" && cfg > 0) return cfg;
	if (typeof cfg === "string") {
		const n = parseInt(cfg, 10);
		if (Number.isFinite(n) && n > 0) return n;
	}
	return theme.maxHeartRate;
}

interface SampleSource {
	samples: TimeSeriesSample[];
	source: "workout" | "daily";
}

interface Pt {
	t: number;
	v: number;
}

function resolveWorkoutEndMs(picked: PickedWorkout): number {
	const { workout } = picked;
	if (workout.endTimeISO) {
		const endMs = Date.parse(workout.endTimeISO);
		if (Number.isFinite(endMs)) return endMs;
	}
	const start = workout.startTimeISO ?? workout.startTime;
	const startMs = start ? Date.parse(start) : NaN;
	if (Number.isFinite(startMs) && Number.isFinite(workout.duration)) {
		return startMs + workout.duration * 1000;
	}
	return NaN;
}

function dailySamplesForWorkout(picked: PickedWorkout): TimeSeriesSample[] {
	const dailySamples = picked.day.heart?.heartRateSamples ?? [];
	if (!dailySamples.length) return [];

	const start = picked.workout.startTimeISO ?? picked.workout.startTime;
	const startMs = start ? Date.parse(start) : NaN;
	const endMs = resolveWorkoutEndMs(picked);
	if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
		return [];
	}

	// Daily samples are not explicitly attached to the workout, so allow a tiny
	// edge tolerance to catch samples recorded on the workout boundary.
	const edgeToleranceMs = 60_000;
	return dailySamples
		.filter((sample) => {
			const sampleMs = Date.parse(sample.timestamp);
			return (
				Number.isFinite(sampleMs) &&
				Number.isFinite(sample.value) &&
				sampleMs >= startMs - edgeToleranceMs &&
				sampleMs <= endMs + edgeToleranceMs
			);
		})
		.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

function heartRateSampleSources(picked: PickedWorkout): SampleSource[] {
	const sources: SampleSource[] = [];
	const workoutSamples = picked.workout.timeSeries?.heartRate ?? [];
	if (workoutSamples.length) {
		sources.push({ samples: workoutSamples, source: "workout" });
	}

	const dailySamples = dailySamplesForWorkout(picked);
	if (dailySamples.length) {
		sources.push({ samples: dailySamples, source: "daily" });
	}
	return sources;
}

function elapsedPoints(samples: TimeSeriesSample[], workoutStart: string | undefined): Pt[] {
	return samples
		.map((sample) => ({
			t: elapsedSeconds(workoutStart, sample.timestamp),
			v: sample.value,
		}))
		.filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v) && point.t >= 0)
		.sort((a, b) => a.t - b.t);
}

function medianGapSeconds(pts: Pt[]): number {
	const gaps: number[] = [];
	for (let i = 1; i < pts.length; i++) {
		const gap = pts[i].t - pts[i - 1].t;
		if (gap > 0) gaps.push(gap);
	}
	if (!gaps.length) return 0;
	gaps.sort((a, b) => a - b);
	return gaps[Math.floor(gaps.length / 2)];
}

function drawSummaryFallback(
	ctx: CanvasRenderingContext2D,
	W: number,
	H: number,
	theme: ResolvedTheme,
	stats: { lo?: number; avg?: number; hi?: number },
	maxHr: number | undefined
): void {
	const values = [stats.lo, stats.avg, stats.hi].filter(
		(value): value is number => typeof value === "number" && Number.isFinite(value)
	);
	if (!values.length) {
		drawEmptyState(ctx, W, H, theme.bg, theme.muted, "No heart rate data for this workout");
		return;
	}

	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);

	const padL = 44;
	const padR = 18;
	const padT = 46;
	const padB = 34;
	const plotW = W - padL - padR;
	const plotH = Math.max(24, H - padT - padB);
	const axisY = padT + plotH * 0.58;

	let xMin = Math.max(0, Math.floor(Math.min(...values) - 8));
	let xMax = Math.ceil(Math.max(...values) + 8);
	if (maxHr) {
		xMin = Math.min(xMin, Math.floor(maxHr * ZONES[0].loFrac));
		xMax = Math.max(xMax, Math.ceil(maxHr));
	}
	if (xMax - xMin < 20) xMax = xMin + 20;
	const xFor = (bpm: number): number => padL + ((bpm - xMin) / (xMax - xMin || 1)) * plotW;

	ctx.fillStyle = theme.fg;
	ctx.font = "600 13px sans-serif";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillText("Workout heart-rate summary", padL, 12);
	ctx.fillStyle = theme.muted;
	ctx.font = "11px sans-serif";
	ctx.fillText("Detailed heart-rate samples were not included in this export.", padL, 29);

	if (maxHr) {
		for (const z of ZONES) {
			const lo = maxHr * z.loFrac;
			const hi = maxHr * z.hiFrac;
			if (hi <= xMin || lo >= xMax) continue;
			const x0 = xFor(Math.max(lo, xMin));
			const x1 = xFor(Math.min(hi, xMax));
			ctx.fillStyle = `hsla(${z.hue},70%,${theme.isDark ? 40 : 70}%,0.12)`;
			ctx.fillRect(x0, padT, x1 - x0, plotH);
			ctx.fillStyle = `hsla(${z.hue},70%,${theme.isDark ? 70 : 40}%,0.58)`;
			ctx.font = "9px sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "top";
			ctx.fillText(z.label, (x0 + x1) / 2, padT + 4);
		}
	}

	ctx.strokeStyle = hexToRgba(theme.fg, 0.08);
	ctx.fillStyle = theme.muted;
	ctx.font = "9px sans-serif";
	ctx.lineWidth = 1;
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	const xRange = xMax - xMin;
	const xStep = xRange <= 40 ? 10 : xRange <= 100 ? 20 : 40;
	const tickStart = Math.ceil(xMin / xStep) * xStep;
	for (let bpm = tickStart; bpm <= xMax; bpm += xStep) {
		const x = xFor(bpm);
		ctx.beginPath();
		ctx.moveTo(x, padT);
		ctx.lineTo(x, padT + plotH);
		ctx.stroke();
		ctx.fillText(String(bpm), x, padT + plotH + 6);
	}

	ctx.strokeStyle = hexToRgba(theme.fg, 0.14);
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(padL, axisY);
	ctx.lineTo(padL + plotW, axisY);
	ctx.stroke();

	if (stats.lo != null && stats.hi != null) {
		ctx.strokeStyle = hexToRgba(theme.colors.heart, 0.72);
		ctx.lineWidth = 9;
		ctx.lineCap = "round";
		ctx.beginPath();
		ctx.moveTo(xFor(stats.lo), axisY);
		ctx.lineTo(xFor(stats.hi), axisY);
		ctx.stroke();
		ctx.lineCap = "butt";
	}

	const markers = [
		{ value: stats.lo, label: "MIN", color: "#4488ff", yOffset: 22 },
		{ value: stats.avg, label: "AVG", color: theme.colors.heart, yOffset: -28 },
		{ value: stats.hi, label: "MAX", color: "#ff4444", yOffset: 22 },
	];
	for (const marker of markers) {
		if (marker.value == null || !Number.isFinite(marker.value)) continue;
		const x = xFor(marker.value);
		ctx.fillStyle = marker.color;
		ctx.beginPath();
		ctx.arc(x, axisY, marker.label === "AVG" ? 6 : 4.5, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = marker.color;
		ctx.font = "700 11px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = marker.yOffset < 0 ? "bottom" : "top";
		ctx.fillText(`${Math.round(marker.value)} BPM`, x, axisY + marker.yOffset);
		ctx.fillStyle = theme.muted;
		ctx.font = "9px sans-serif";
		ctx.textBaseline = marker.yOffset < 0 ? "bottom" : "top";
		ctx.fillText(marker.label, x, axisY + marker.yOffset + (marker.yOffset < 0 ? -13 : 14));
	}
}

export const renderWorkoutHeartRate: RenderFn = (
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	W: number,
	H: number,
	config: VizConfig,
	theme: ResolvedTheme,
	statsEl: HTMLElement,
	hits: HitRegistry
): void => {
	const picked = pickWorkout(data, config);
	if (!picked) {
		drawEmptyState(ctx, W, H, theme.bg, theme.muted, "No workout found");
		statsEl.empty();
		return;
	}

	const { workout } = picked;
	const maxHr = resolveMaxHeartRate(config, theme);
	const workoutStart = workout.startTimeISO ?? workout.startTime;
	const sources = heartRateSampleSources(picked);
	let pts: Pt[] = [];
	let sampleSource: SampleSource["source"] | null = null;
	for (const source of sources) {
		const candidate = elapsedPoints(source.samples, workoutStart);
		if (candidate.length) {
			pts = candidate;
			sampleSource = source.source;
			break;
		}
	}

	if (!pts.length) {
		// Fall back to visible summary aggregates when the export does not contain
		// a usable sample series for this workout.
		const avg = workout.avgHeartRate;
		const lo = workout.minHeartRate;
		const hi = workout.maxHeartRate;
		if (avg == null && lo == null && hi == null) {
			drawEmptyState(
				ctx,
				W,
				H,
				theme.bg,
				theme.muted,
				"No heart rate data for this workout"
			);
			statsEl.empty();
			return;
		}
		drawSummaryFallback(ctx, W, H, theme, { lo, avg, hi }, maxHr);
		const boxes = [];
		if (lo != null) boxes.push({ value: String(lo), label: "Min", color: "#4488ff" });
		if (avg != null)
			boxes.push({ value: String(Math.round(avg)), label: "Avg", color: theme.colors.heart });
		if (hi != null) boxes.push({ value: String(hi), label: "Max", color: "#ff4444" });
		renderStatBoxes(statsEl, boxes);
		return;
	}

	let minBpm = Infinity;
	let maxBpm = -Infinity;
	for (const p of pts) {
		if (p.v < minBpm) minBpm = p.v;
		if (p.v > maxBpm) maxBpm = p.v;
	}

	// Background
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);

	const tMax = Math.max(workout.duration || 0, pts[pts.length - 1].t);
	const tMin = 0;

	// Y range: pad ±5 BPM around observed range, expand to enclose any visible zone.
	let yMin = Math.max(0, Math.floor(minBpm - 5));
	let yMax = Math.ceil(maxBpm + 5);

	if (maxHr) {
		// Expand y-axis to include Z2-Z5 boundaries so bands aren't clipped.
		yMin = Math.min(yMin, Math.floor(maxHr * ZONES[0].loFrac));
		yMax = Math.max(yMax, Math.ceil(maxHr));
	}
	if (yMax - yMin < 20) yMax = yMin + 20;

	const padL = 44;
	const padR = 14;
	const padT = 14;
	const padB = 22;
	const plotW = W - padL - padR;
	const plotH = H - padT - padB;

	const xFor = (t: number): number => padL + ((t - tMin) / (tMax - tMin || 1)) * plotW;
	const yFor = (v: number): number => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;

	// Zone bands (drawn first, behind line).
	if (maxHr) {
		for (const z of ZONES) {
			const lo = maxHr * z.loFrac;
			const hi = maxHr * z.hiFrac;
			if (hi <= yMin || lo >= yMax) continue;
			const yTop = yFor(Math.min(hi, yMax));
			const yBot = yFor(Math.max(lo, yMin));
			ctx.fillStyle = `hsla(${z.hue},70%,${theme.isDark ? 40 : 70}%,0.13)`;
			ctx.fillRect(padL, yTop, plotW, yBot - yTop);
			// Zone label on right edge of band
			ctx.fillStyle = `hsla(${z.hue},70%,${theme.isDark ? 70 : 40}%,0.6)`;
			ctx.font = "9px sans-serif";
			ctx.textAlign = "right";
			ctx.textBaseline = "middle";
			ctx.fillText(z.label, padL + plotW - 3, (yTop + yBot) / 2);
		}
	}

	// Y axis ticks (BPM) — round to nice values.
	ctx.strokeStyle = hexToRgba(theme.fg, 0.07);
	ctx.fillStyle = theme.muted;
	ctx.font = "9px sans-serif";
	ctx.lineWidth = 1;
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	const yRange = yMax - yMin;
	const yStep = yRange <= 40 ? 10 : yRange <= 100 ? 20 : 40;
	const yStart = Math.ceil(yMin / yStep) * yStep;
	for (let v = yStart; v <= yMax; v += yStep) {
		const y = yFor(v);
		ctx.beginPath();
		ctx.moveTo(padL, y);
		ctx.lineTo(padL + plotW, y);
		ctx.stroke();
		ctx.fillText(String(v), padL - 4, y);
	}

	// X axis ticks (elapsed time)
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	const tStep = tMax <= 600 ? 60 : tMax <= 1800 ? 300 : tMax <= 3600 ? 600 : 1800;
	for (let t = 0; t <= tMax; t += tStep) {
		const x = xFor(t);
		ctx.strokeStyle = hexToRgba(theme.fg, 0.05);
		ctx.beginPath();
		ctx.moveTo(x, padT);
		ctx.lineTo(x, padT + plotH);
		ctx.stroke();
		ctx.fillStyle = theme.muted;
		ctx.fillText(formatElapsed(t), x, padT + plotH + 4);
	}

	// Heart rate line — break across long gaps. Daily fallback samples are often
	// farther apart than workout-attached samples, so scale the gap threshold to
	// the observed cadence instead of treating every point as disconnected.
	ctx.strokeStyle = theme.colors.heart;
	ctx.lineWidth = 1.5;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	ctx.beginPath();
	let prevT = -Infinity;
	const medianGap = medianGapSeconds(pts);
	const GAP_THRESHOLD = Math.max(60, medianGap ? medianGap * 2.5 : 60);
	for (let i = 0; i < pts.length; i++) {
		const p = pts[i];
		const x = xFor(p.t);
		const y = yFor(p.v);
		if (p.t - prevT > GAP_THRESHOLD) {
			ctx.moveTo(x, y);
		} else {
			ctx.lineTo(x, y);
		}
		prevT = p.t;
	}
	ctx.stroke();

	if (pts.length <= 120 || sampleSource === "daily") {
		ctx.fillStyle = theme.colors.heart;
		for (const p of pts) {
			ctx.beginPath();
			ctx.arc(xFor(p.t), yFor(p.v), sampleSource === "daily" ? 2.5 : 2, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	// Hit regions: vertical stripes per ~4px wide column for snap-to-nearest tooltip.
	const STRIDE = 4;
	for (let x = padL; x < padL + plotW; x += STRIDE) {
		const tCenter = tMin + ((x + STRIDE / 2 - padL) / plotW) * (tMax - tMin);
		// Find nearest point by t (linear scan; samples are sorted).
		let bestIdx = 0;
		let bestDist = Infinity;
		for (let i = 0; i < pts.length; i++) {
			const d = Math.abs(pts[i].t - tCenter);
			if (d < bestDist) {
				bestDist = d;
				bestIdx = i;
			} else if (d > bestDist) {
				break;
			}
		}
		const p = pts[bestIdx];
		const details = [
			{ label: "Time", value: formatElapsed(p.t) },
			{ label: "BPM", value: String(Math.round(p.v)) },
		];
		if (maxHr) {
			const z = zoneFor(p.v, maxHr);
			details.push({ label: "Zone", value: z ? z.label : "below Z1" });
		}
		if (sampleSource === "daily") {
			details.push({ label: "Source", value: "daily samples" });
		}
		hits.add({
			shape: "rect",
			x,
			y: padT,
			w: STRIDE,
			h: plotH,
			title: "Heart rate",
			details,
			payload: picked.day,
		});
	}

	// Header stats: Average + range.
	const avg = pts.reduce((s, p) => s + p.v, 0) / pts.length;
	const lo = Math.round(minBpm);
	const hi = Math.round(maxBpm);
	const rows: { text: string; strong?: boolean }[][] = [
		[
			{ text: "Average " },
			{ text: `${Math.round(avg)} BPM`, strong: true },
		],
		[{ text: `Range: ${lo}–${hi} BPM` }],
	];
	if (maxHr) {
		rows.push([
			{ text: "Max HR " },
			{ text: `${maxHr} BPM`, strong: true },
		]);
	}
	if (sampleSource === "daily") {
		rows.push([{ text: "Source: daily heart-rate samples within workout time" }]);
	}
	renderInlineStats(statsEl, rows);
};
