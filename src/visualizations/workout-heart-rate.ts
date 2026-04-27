import { HealthDay, HitRegistry, RenderFn, ResolvedTheme, VizConfig } from "../types";
import { hexToRgba } from "../canvas-utils";
import { renderInlineStats, renderStatBoxes } from "../dom-utils";
import {
	drawEmptyState,
	elapsedSeconds,
	formatElapsed,
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
	const samples = workout.timeSeries?.heartRate ?? [];

	if (!samples.length) {
		// Fall back to daily aggregates when per-second samples aren't in the export.
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
		drawEmptyState(
			ctx,
			W,
			H,
			theme.bg,
			theme.muted,
			"No per-second heart rate samples — showing summary"
		);
		const boxes = [];
		if (lo != null) boxes.push({ value: String(lo), label: "Min", color: "#4488ff" });
		if (avg != null)
			boxes.push({ value: String(Math.round(avg)), label: "Avg", color: theme.colors.heart });
		if (hi != null) boxes.push({ value: String(hi), label: "Max", color: "#ff4444" });
		renderStatBoxes(statsEl, boxes);
		return;
	}

	// Background
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);

	// Convert samples to (elapsed seconds, BPM) — drop unparseable / invalid.
	type Pt = { t: number; v: number };
	const pts: Pt[] = [];
	let minBpm = Infinity;
	let maxBpm = -Infinity;
	let lastT = -Infinity;
	for (const s of samples) {
		const t = elapsedSeconds(workout.startTime, s.timestamp);
		const v = s.value;
		if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
		if (t < 0) continue;
		// Samples should be sorted; if a timestamp goes backwards, skip it.
		if (t < lastT) continue;
		lastT = t;
		pts.push({ t, v });
		if (v < minBpm) minBpm = v;
		if (v > maxBpm) maxBpm = v;
	}

	if (!pts.length) {
		drawEmptyState(ctx, W, H, theme.bg, theme.muted, "No usable heart rate samples");
		statsEl.empty();
		return;
	}

	const tMax = Math.max(workout.duration || 0, pts[pts.length - 1].t);
	const tMin = 0;

	// Y range: pad ±5 BPM around observed range, expand to enclose any visible zone.
	let yMin = Math.max(0, Math.floor(minBpm - 5));
	let yMax = Math.ceil(maxBpm + 5);

	const maxHr = resolveMaxHeartRate(config, theme);
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

	// Heart rate line — break across long gaps (>60s of missing data).
	ctx.strokeStyle = theme.colors.heart;
	ctx.lineWidth = 1.5;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	ctx.beginPath();
	let prevT = -Infinity;
	const GAP_THRESHOLD = 60;
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
		hits.add({
			shape: "rect",
			x,
			y: padT,
			w: STRIDE,
			h: plotH,
			title: "Heart rate",
			details,
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
	renderInlineStats(statsEl, rows);
};
