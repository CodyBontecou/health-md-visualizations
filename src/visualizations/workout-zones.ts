import { HealthDay, HitRegistry, RenderFn, ResolvedTheme, TimeSeriesSample, VizConfig, WorkoutHeartRateZone } from "../types";
import { hexToRgba, formatDuration } from "../canvas-utils";
import { renderInlineStats } from "../dom-utils";
import { drawEmptyState, pickWorkout } from "../workout-utils";

const ZONE_HUES = [210, 180, 120, 40, 0];
const DEFAULT_ZONE_LABELS = ["Recovery", "Aerobic", "Tempo", "Threshold", "Max"];
const DEFAULT_ZONE_FRACTIONS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.01];

function resolveMaxHeartRate(config: VizConfig, theme: ResolvedTheme): number | undefined {
	const cfg = config.maxHeartRate;
	if (typeof cfg === "number" && cfg > 0) return cfg;
	if (typeof cfg === "string") {
		const n = parseInt(cfg, 10);
		if (Number.isFinite(n) && n > 0) return n;
	}
	return theme.maxHeartRate;
}

function formatZoneDuration(zone: WorkoutHeartRateZone): string {
	return zone.durationFormatted ?? formatDuration(zone.seconds);
}

function zonesFromSamples(samples: TimeSeriesSample[], maxHr: number | undefined): WorkoutHeartRateZone[] {
	if (!samples.length || !maxHr) return [];
	const zones = DEFAULT_ZONE_LABELS.map((label, idx) => ({
		index: idx + 1,
		label,
		range: `${Math.round(maxHr * DEFAULT_ZONE_FRACTIONS[idx])}-${Math.round(maxHr * DEFAULT_ZONE_FRACTIONS[idx + 1])}`,
		seconds: 0,
	}));
	for (let i = 0; i < samples.length; i++) {
		const current = samples[i];
		const next = samples[i + 1];
		const currentMs = Date.parse(current.timestamp);
		const nextMs = next ? Date.parse(next.timestamp) : NaN;
		const seconds = Number.isFinite(currentMs) && Number.isFinite(nextMs)
			? Math.max(1, Math.min(300, (nextMs - currentMs) / 1000))
			: 60;
		const frac = current.value / maxHr;
		let zoneIndex = zones.findIndex((zone, idx) => frac >= DEFAULT_ZONE_FRACTIONS[idx] && frac < DEFAULT_ZONE_FRACTIONS[idx + 1]);
		if (zoneIndex === -1 && frac >= 1) zoneIndex = zones.length - 1;
		if (zoneIndex !== -1) zones[zoneIndex].seconds += seconds;
	}
	return zones.filter((zone) => zone.seconds > 0);
}

export const renderWorkoutZones: RenderFn = (
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

	const { day, workout } = picked;
	const zones = (workout.heartRateZones ?? []).filter((zone) => zone.seconds > 0);
	const fallbackZones = zones.length ? [] : zonesFromSamples(workout.timeSeries?.heartRate ?? [], resolveMaxHeartRate(config, theme));
	const visibleZones = zones.length ? zones : fallbackZones;
	if (!visibleZones.length) {
		drawEmptyState(ctx, W, H, theme.bg, theme.muted, "No heart-rate zones for this workout");
		statsEl.empty();
		return;
	}

	const minH = 132;
	if (H < minH) {
		const dpr = activeWindow.devicePixelRatio || 1;
		ctx.canvas.width = W * dpr;
		ctx.canvas.height = minH * dpr;
		ctx.canvas.style.width = W + "px";
		ctx.canvas.style.height = minH + "px";
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.scale(dpr, dpr);
		H = minH;
	}

	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);

	const total = visibleZones.reduce((sum, zone) => sum + zone.seconds, 0);
	const padX = 28;
	const titleY = 14;
	const barY = Math.max(52, H * 0.32);
	const barH = Math.min(34, Math.max(22, H * 0.14));
	const barW = W - padX * 2;
	const radius = barH / 2;

	ctx.fillStyle = theme.fg;
	ctx.font = "600 13px sans-serif";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillText(`${workout.activityType ?? workout.type} zones`, padX, titleY);
	ctx.fillStyle = theme.muted;
	ctx.font = "10px sans-serif";
	ctx.fillText(day.date, padX, titleY + 18);

	ctx.save();
	ctx.beginPath();
	ctx.roundRect(padX, barY, barW, barH, radius);
	ctx.clip();

	let x = padX;
	visibleZones.forEach((zone) => {
		const w = (zone.seconds / total) * barW;
		const hue = ZONE_HUES[(zone.index - 1 + ZONE_HUES.length) % ZONE_HUES.length];
		ctx.fillStyle = `hsl(${hue},70%,${theme.isDark ? 52 : 46}%)`;
		ctx.fillRect(x, barY, Math.max(0, w), barH);
		if (w > 42) {
			ctx.fillStyle = hexToRgba("#ffffff", 0.92);
			ctx.font = "700 10px sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(`Z${zone.index}`, x + w / 2, barY + barH / 2);
		}
		hits.add({
			shape: "rect",
			x,
			y: barY,
			w: Math.max(1, w),
			h: barH,
			title: `Zone ${zone.index} — ${zone.label}`,
			details: [
				{ label: "Time", value: formatZoneDuration(zone) },
				{ label: "Share", value: `${Math.round((zone.seconds / total) * 100)}%` },
				...(zone.range ? [{ label: "Range", value: `${zone.range} bpm` }] : []),
			],
			payload: day,
		});
		x += w;
	});
	ctx.restore();

	const legendY = barY + barH + 22;
	const colW = barW / visibleZones.length;
	visibleZones.forEach((zone, idx) => {
		const hue = ZONE_HUES[(zone.index - 1 + ZONE_HUES.length) % ZONE_HUES.length];
		const lx = padX + idx * colW;
		ctx.fillStyle = `hsl(${hue},70%,${theme.isDark ? 58 : 42}%)`;
		ctx.beginPath();
		ctx.arc(lx + 5, legendY + 4, 4, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = theme.fg;
		ctx.font = "700 10px sans-serif";
		ctx.textAlign = "left";
		ctx.textBaseline = "top";
		ctx.fillText(`Z${zone.index}`, lx + 14, legendY - 1);
		ctx.fillStyle = theme.muted;
		ctx.font = "9px sans-serif";
		ctx.fillText(formatZoneDuration(zone), lx + 14, legendY + 12);
	});

	const dominant = visibleZones.reduce((best, zone) => zone.seconds > best.seconds ? zone : best, visibleZones[0]);
	renderInlineStats(statsEl, [
		[
			{ text: "Zone time " },
			{ text: formatDuration(total), strong: true },
		],
		[
			{ text: "Dominant " },
			{ text: `Z${dominant.index} ${dominant.label}`, strong: true },
		],
	]);
};
