import { HealthDay, VizConfig, WorkoutEntry } from "./types";

export interface PickedWorkout {
	day: HealthDay;
	workout: WorkoutEntry;
	indexInDay: number;
}

// Selects a single workout from filtered HealthDay[]. Config keys:
//   date: YYYY-MM-DD (optional — narrows to a specific day)
//   workout: <index> (zero-based within the day; default 0)
// When date is omitted, picks the most-recent day that has any workout.
export function pickWorkout(
	data: HealthDay[],
	config: VizConfig
): PickedWorkout | null {
	const dateKey = config.date != null ? String(config.date).trim() : "";
	const indexRaw = config.workout;
	const index =
		typeof indexRaw === "number"
			? indexRaw
			: indexRaw != null
				? parseInt(String(indexRaw), 10)
				: 0;
	const idx = Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0;

	if (dateKey) {
		const day = data.find((d) => d.date === dateKey);
		if (!day || !day.workouts || !day.workouts.length) return null;
		const w = day.workouts[idx];
		if (!w) return null;
		return { day, workout: w, indexInDay: idx };
	}

	for (let i = data.length - 1; i >= 0; i--) {
		const day = data[i];
		if (day.workouts && day.workouts.length > idx) {
			return { day, workout: day.workouts[idx], indexInDay: idx };
		}
	}
	return null;
}

// "imperial" → miles/feet, anything else (default) → kilometers/meters.
export type UnitSystem = "metric" | "imperial";

export function resolveUnits(day: HealthDay): UnitSystem {
	return day.units === "imperial" ? "imperial" : "metric";
}

// Distance: prefer pre-formatted; else convert from meters.
export function formatDistance(
	meters: number,
	day: HealthDay,
	preFormatted?: string
): string {
	if (preFormatted) return preFormatted;
	if (resolveUnits(day) === "imperial") {
		const mi = meters / 1609.344;
		return mi >= 10 ? `${mi.toFixed(1)} mi` : `${mi.toFixed(2)} mi`;
	}
	const km = meters / 1000;
	return km >= 10 ? `${km.toFixed(1)} km` : `${km.toFixed(2)} km`;
}

// Pace: prefer pre-formatted; else compute from meters + seconds.
export function formatPace(
	meters: number,
	seconds: number,
	day: HealthDay,
	preFormatted?: string
): string {
	if (preFormatted) return preFormatted;
	if (!meters || !seconds) return "—";
	const unitDistance = resolveUnits(day) === "imperial" ? 1609.344 : 1000;
	const secPerUnit = seconds / (meters / unitDistance);
	const m = Math.floor(secPerUnit / 60);
	const s = Math.round(secPerUnit % 60);
	const suffix = resolveUnits(day) === "imperial" ? "/mi" : "/km";
	return `${m}:${s.toString().padStart(2, "0")}${suffix}`;
}

// Speed: prefer pre-formatted; else convert m/s.
export function formatSpeed(
	mps: number,
	day: HealthDay,
	preFormatted?: string
): string {
	if (preFormatted) return preFormatted;
	if (resolveUnits(day) === "imperial") {
		return `${(mps * 2.236936).toFixed(1)} mph`;
	}
	return `${(mps * 3.6).toFixed(1)} km/h`;
}

// Elevation: meters → ft for imperial, otherwise meters as-is (rounded).
export function formatElevation(meters: number, day: HealthDay): string {
	if (resolveUnits(day) === "imperial") {
		return `${Math.round(meters * 3.28084)} ft`;
	}
	return `${Math.round(meters)} m`;
}

// Elapsed time from a workout's startTime to a sample timestamp, in seconds.
// Returns NaN when either is unparseable.
export function elapsedSeconds(
	startTime: string | undefined,
	sampleTimestamp: string
): number {
	if (!startTime) return NaN;
	const start = Date.parse(startTime);
	const sample = Date.parse(sampleTimestamp);
	if (!Number.isFinite(start) || !Number.isFinite(sample)) return NaN;
	return (sample - start) / 1000;
}

// "1:23:45" / "23:45" / "0:45" depending on magnitude.
export function formatElapsed(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return "—";
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	const pad = (n: number) => n.toString().padStart(2, "0");
	if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
	return `${m}:${pad(s)}`;
}

// Renders a centered placeholder message into the canvas. Used when a
// workout has no data for the requested visualization (e.g. indoor run, no GPS).
export function drawEmptyState(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	bg: string,
	muted: string,
	message: string
): void {
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, w, h);
	ctx.fillStyle = muted;
	ctx.font = "12px sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(message, w / 2, h / 2);
}
