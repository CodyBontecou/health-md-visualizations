import { HealthDay, HitRegistry, RenderFn, ResolvedTheme, VizConfig, WorkoutEntry } from "../types";
import { hexToRgba, formatDate, formatDuration } from "../canvas-utils";
import { renderInlineStats } from "../dom-utils";
import { workoutDistanceMeters } from "../workout-utils";

interface WorkoutPoint {
	day: HealthDay;
	workout: WorkoutEntry;
	timestamp: string;
	ms: number;
}

interface MetricDef {
	key: string;
	label: string;
	unit: string;
	color: (theme: ResolvedTheme) => string;
	value: (workout: WorkoutEntry) => number | undefined;
	format: (value: number) => string;
}

const METRICS: MetricDef[] = [
	{
		key: "duration",
		label: "Duration",
		unit: "min",
		color: (theme) => theme.colors.accent,
		value: (workout) => workout.duration > 0 ? workout.duration / 60 : undefined,
		format: (value) => formatDuration(value * 60),
	},
	{
		key: "distance",
		label: "Distance",
		unit: "km",
		color: (theme) => theme.colors.secondary,
		value: (workout) => {
			const meters = workoutDistanceMeters(workout);
			return meters == null ? undefined : meters / 1000;
		},
		format: (value) => `${value.toFixed(value >= 10 ? 1 : 2)} km`,
	},
	{
		key: "calories",
		label: "Calories",
		unit: "kcal",
		color: () => "#f97316",
		value: (workout) => workout.calories,
		format: (value) => `${Math.round(value)} kcal`,
	},
	{
		key: "hr_avg",
		label: "Avg HR",
		unit: "bpm",
		color: (theme) => theme.colors.heart,
		value: (workout) => workout.avgHeartRate,
		format: (value) => `${Math.round(value)} BPM`,
	},
	{
		key: "power_avg",
		label: "Avg Power",
		unit: "W",
		color: () => "#a855f7",
		value: (workout) => workout.avgPower,
		format: (value) => `${Math.round(value)} W`,
	},
];

function metricAliases(raw: string): string {
	const normalized = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
	switch (normalized) {
		case "hr":
		case "heart_rate":
		case "avg_heart_rate":
			return "hr_avg";
		case "power":
		case "avg_power":
			return "power_avg";
		case "cal":
		case "energy":
			return "calories";
		default:
			return normalized;
	}
}

function collectWorkoutPoints(data: HealthDay[]): WorkoutPoint[] {
	const points: WorkoutPoint[] = [];
	for (const day of data) {
		for (const workout of day.workouts ?? []) {
			const timestamp = workout.startTimeISO ?? workout.startTime ?? `${day.date}T00:00:00`;
			const ms = Date.parse(timestamp);
			points.push({
				day,
				workout,
				timestamp,
				ms: Number.isFinite(ms) ? ms : Date.parse(`${day.date}T00:00:00`),
			});
		}
	}
	return points.sort((a, b) => a.ms - b.ms);
}

function niceStep(range: number): number {
	if (range <= 5) return 1;
	if (range <= 20) return 5;
	if (range <= 60) return 10;
	if (range <= 200) return 25;
	return 50;
}

function drawPanel(
	ctx: CanvasRenderingContext2D,
	points: WorkoutPoint[],
	metric: MetricDef,
	x: number,
	y: number,
	w: number,
	h: number,
	theme: ResolvedTheme,
	hits: HitRegistry
): void {
	const values: Array<WorkoutPoint & { value: number }> = [];
	for (const point of points) {
		const value = metric.value(point.workout);
		if (value !== undefined && Number.isFinite(value)) {
			values.push({ ...point, value });
		}
	}
	if (!values.length) return;

	const minMs = values[0].ms;
	const maxMs = values[values.length - 1].ms;
	let minValue = Math.min(...values.map((point) => point.value));
	let maxValue = Math.max(...values.map((point) => point.value));
	if (minValue === maxValue) {
		minValue = Math.max(0, minValue * 0.8 - 1);
		maxValue = maxValue * 1.2 + 1;
	}
	if (minValue > 0) minValue = Math.max(0, minValue - (maxValue - minValue) * 0.12);
	maxValue += (maxValue - minValue) * 0.12;

	const xFor = (ms: number): number => x + ((ms - minMs) / (maxMs - minMs || 1)) * w;
	const yFor = (value: number): number => y + (1 - (value - minValue) / (maxValue - minValue || 1)) * h;
	const color = metric.color(theme);

	ctx.fillStyle = theme.fg;
	ctx.font = "600 11px sans-serif";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillText(metric.label, x, y - 18);
	ctx.fillStyle = theme.muted;
	ctx.font = "9px sans-serif";
	ctx.textAlign = "right";
	ctx.fillText(metric.unit, x + w, y - 17);

	ctx.strokeStyle = hexToRgba(theme.fg, 0.08);
	ctx.lineWidth = 1;
	const step = niceStep(maxValue - minValue);
	const start = Math.ceil(minValue / step) * step;
	for (let tick = start; tick <= maxValue; tick += step) {
		const ty = yFor(tick);
		ctx.beginPath();
		ctx.moveTo(x, ty);
		ctx.lineTo(x + w, ty);
		ctx.stroke();
	}

	ctx.strokeStyle = color;
	ctx.lineWidth = 2;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	ctx.beginPath();
	values.forEach((point, index) => {
		const px = xFor(point.ms);
		const py = yFor(point.value);
		if (index === 0) ctx.moveTo(px, py);
		else ctx.lineTo(px, py);
	});
	ctx.stroke();

	ctx.fillStyle = color;
	values.forEach((point) => {
		const px = xFor(point.ms);
		const py = yFor(point.value);
		ctx.beginPath();
		ctx.arc(px, py, 3.5, 0, Math.PI * 2);
		ctx.fill();
		hits.add({
			shape: "circle",
			cx: px,
			cy: py,
			r: 8,
			title: `${formatDate(point.day.date)} — ${point.workout.activityType ?? point.workout.type}`,
			details: [
				{ label: metric.label, value: metric.format(point.value) },
				{ label: "Duration", value: formatDuration(point.workout.duration) },
				...(point.workout.calories != null ? [{ label: "Calories", value: `${Math.round(point.workout.calories)} kcal` }] : []),
			],
			payload: point.day,
		});
	});

	ctx.fillStyle = theme.muted;
	ctx.font = "8px sans-serif";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillText(formatDate(values[0].day.date), x, y + h + 4);
	ctx.textAlign = "right";
	ctx.fillText(formatDate(values[values.length - 1].day.date), x + w, y + h + 4);
}

export const renderWorkoutTrends: RenderFn = (
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

	const points = collectWorkoutPoints(data);
	if (!points.length) {
		ctx.fillStyle = theme.muted;
		ctx.font = "12px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText("No workouts in range", W / 2, H / 2);
		statsEl.empty();
		return;
	}

	const metricRaw = config.metric == null ? "all" : String(config.metric);
	const requested = metricAliases(metricRaw);
	const metrics = requested === "all"
		? METRICS.filter((metric) => points.some((point) => metric.value(point.workout) !== undefined))
		: METRICS.filter((metric) => metric.key === requested);
	if (!metrics.length) {
		ctx.fillStyle = theme.muted;
		ctx.font = "12px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(`No workout data for metric: ${metricRaw}`, W / 2, H / 2);
		statsEl.empty();
		return;
	}

	const padL = 34;
	const padR = 18;
	const padT = 34;
	const padB = 22;
	const gap = metrics.length > 1 ? 34 : 18;
	const panelH = (H - padT - padB - gap * (metrics.length - 1)) / metrics.length;
	const panelW = W - padL - padR;

	ctx.fillStyle = theme.fg;
	ctx.font = "700 13px sans-serif";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillText("Workout trends", padL, 10);

	metrics.forEach((metric, index) => {
		drawPanel(ctx, points, metric, padL, padT + index * (panelH + gap), panelW, Math.max(24, panelH), theme, hits);
	});

	const totalDuration = points.reduce((sum, point) => sum + (point.workout.duration || 0), 0);
	const totalDistanceMeters = points.reduce((sum, point) => sum + (workoutDistanceMeters(point.workout) ?? 0), 0);
	renderInlineStats(statsEl, [
		[{ text: `${points.length} workouts` }],
		[
			{ text: "Total time " },
			{ text: formatDuration(totalDuration), strong: true },
		],
		...(totalDistanceMeters > 0
			? [[{ text: "Distance " }, { text: `${(totalDistanceMeters / 1000).toFixed(1)} km`, strong: true }]]
			: []),
	]);
};
