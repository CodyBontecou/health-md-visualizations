import { HealthDay, MoodEntry, ResolvedTheme } from "./types";
import { hexToRgba } from "./canvas-utils";
import { formatMoodValence, getMoodDaySummary, moodLabelForValence } from "./mood-utils";

export interface MoodVizDay {
	day: HealthDay;
	date: string;
	entries: MoodEntry[];
	averageValence?: number;
	minValence?: number;
	maxValence?: number;
	primaryLabel?: string;
	sleepSeconds?: number;
	exerciseMinutes: number;
	hrv?: number;
}

export interface MoodVizEntry {
	day: HealthDay;
	date: string;
	entry: MoodEntry;
	timestamp?: string;
	hour?: number;
	valence?: number;
	label?: string;
	labels: string[];
	associations: string[];
	kind?: string;
}

export interface AggregateBucket {
	key: string;
	count: number;
	sum: number;
	values: number[];
}

export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function configFlag(value: string | number | undefined, defaultValue: boolean): boolean {
	if (value === undefined) return defaultValue;
	if (typeof value === "number") return value !== 0;
	const normalized = value.trim().toLowerCase();
	if (["false", "0", "no", "off"].includes(normalized)) return false;
	if (["true", "1", "yes", "on"].includes(normalized)) return true;
	return defaultValue;
}

export function configNumber(value: string | number | undefined, fallback: number): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed)) return parsed;
	}
	return fallback;
}

export function configString(value: string | number | undefined, fallback: string): string {
	return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function average(values: number[]): number | undefined {
	const finite = values.filter(Number.isFinite);
	return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : undefined;
}

export function moodHex(valence: number | undefined, theme: ResolvedTheme): string {
	if (valence === undefined || !Number.isFinite(valence)) return theme.muted;
	if (valence < -0.16) return theme.colors.heart;
	if (valence > 0.16) return theme.colors.accent;
	return theme.colors.secondary;
}

export function moodRgba(valence: number | undefined, theme: ResolvedTheme, alpha = 0.75): string {
	return hexToRgba(moodHex(valence, theme), alpha);
}

export function yForValence(valence: number, top: number, height: number): number {
	return top + (1 - (clamp(valence, -1, 1) + 1) / 2) * height;
}

export function valencePercent(valence: number | undefined): string {
	if (valence === undefined || !Number.isFinite(valence)) return "—";
	return `${Math.round(((clamp(valence, -1, 1) + 1) / 2) * 100)}%`;
}

export function dayExerciseMinutes(day: HealthDay): number {
	const activityMinutes = day.activity?.exerciseMinutes ?? 0;
	const workoutMinutes = (day.workouts ?? []).reduce((sum, workout) => sum + (workout.duration || 0) / 60, 0);
	return Math.max(activityMinutes, workoutMinutes);
}

export function shortDate(iso: string): string {
	const d = new Date(iso + "T00:00:00");
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function parseHour(timestamp: string | undefined, fallbackDate?: string): number | undefined {
	if (!timestamp) return undefined;
	const trimmed = timestamp.trim();
	const timeOnly = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(trimmed);
	const dateTime = /T(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(trimmed);
	const match = dateTime ?? timeOnly;
	if (!match) {
		if (fallbackDate && trimmed === fallbackDate) return 12;
		return undefined;
	}
	const h = Number(match[1]);
	const m = Number(match[2]);
	const s = Number(match[3] ?? 0);
	if (h > 23 || m > 59 || s > 59) return undefined;
	return h + m / 60 + s / 3600;
}

export function normalizeKind(kind: string | undefined): "daily" | "momentary" | "other" {
	const normalized = (kind ?? "").replace(/[_-]+/g, " ").toLowerCase();
	if (normalized.includes("daily")) return "daily";
	if (normalized.includes("momentary") || normalized.includes("emotion")) return "momentary";
	return "other";
}

export function kindLabel(kind: string | undefined): string {
	switch (normalizeKind(kind)) {
		case "daily": return "Daily Mood";
		case "momentary": return "Momentary Emotion";
		default: return kind || "Mood";
	}
}

export function entryLabels(entry: MoodEntry): string[] {
	const labels = entry.labels?.length ? entry.labels : entry.label ? [entry.label] : [];
	return labels.filter((item, index, all) => Boolean(item) && all.indexOf(item) === index);
}

export function collectMoodDays(data: HealthDay[]): MoodVizDay[] {
	return data.map((day) => {
		const mood = getMoodDaySummary(day);
		return {
			day,
			date: day.date,
			entries: mood.entries,
			averageValence: mood.averageValence,
			minValence: mood.minValence,
			maxValence: mood.maxValence,
			primaryLabel: mood.primaryLabel,
			sleepSeconds: day.sleep?.totalDuration,
			exerciseMinutes: dayExerciseMinutes(day),
			hrv: day.heart?.hrv,
		};
	}).sort((a, b) => a.date.localeCompare(b.date));
}

export function collectMoodEntries(data: HealthDay[]): MoodVizEntry[] {
	return collectMoodDays(data).flatMap((moodDay) => moodDay.entries.map((entry) => ({
		day: moodDay.day,
		date: moodDay.date,
		entry,
		timestamp: entry.timestamp ?? entry.startDate,
		hour: parseHour(entry.timestamp ?? entry.startDate, moodDay.date),
		valence: entry.valence,
		label: entry.label ?? entryLabels(entry)[0],
		labels: entryLabels(entry),
		associations: entry.associations ?? [],
		kind: entry.kind,
	}))).sort((a, b) => a.date === b.date
		? (a.hour ?? 12) - (b.hour ?? 12)
		: a.date.localeCompare(b.date));
}

export function moodDaysWithValues(data: HealthDay[]): MoodVizDay[] {
	return collectMoodDays(data).filter((day) => day.averageValence !== undefined);
}

export function emptyState(ctx: CanvasRenderingContext2D, W: number, H: number, theme: ResolvedTheme, statsEl: HTMLElement, text = "No mood data in range"): void {
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	ctx.fillStyle = theme.muted;
	ctx.font = "12px sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(text, W / 2, H / 2);
	statsEl.empty();
}

export function drawTitle(ctx: CanvasRenderingContext2D, theme: ResolvedTheme, title: string, subtitle: string, x = 18, y = 24): void {
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = theme.fg;
	ctx.font = "600 20px sans-serif";
	ctx.fillText(title, x, y);
	ctx.fillStyle = theme.muted;
	ctx.font = "11px sans-serif";
	ctx.fillText(subtitle, x, y + 17);
}

export function drawValenceGrid(ctx: CanvasRenderingContext2D, theme: ResolvedTheme, x: number, y: number, w: number, h: number): void {
	for (const tick of [
		{ value: 1, label: "+1" },
		{ value: 0, label: "0" },
		{ value: -1, label: "-1" },
	]) {
		const ty = yForValence(tick.value, y, h);
		ctx.strokeStyle = tick.value === 0 ? hexToRgba(theme.fg, 0.18) : hexToRgba(theme.fg, 0.08);
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(x, ty);
		ctx.lineTo(x + w, ty);
		ctx.stroke();
		ctx.fillStyle = theme.muted;
		ctx.font = "9px sans-serif";
		ctx.textAlign = "right";
		ctx.textBaseline = "middle";
		ctx.fillText(tick.label, x - 6, ty);
	}
}

export function dateToUtc(iso: string): Date {
	return new Date(iso + "T00:00:00Z");
}

export function isoDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
	const d = dateToUtc(iso);
	d.setUTCDate(d.getUTCDate() + days);
	return isoDate(d);
}

export function aggregate(values: Array<{ key: string; valence?: number }>): AggregateBucket[] {
	const buckets = new Map<string, AggregateBucket>();
	for (const value of values) {
		const key = value.key || "Unspecified";
		const existing = buckets.get(key) ?? { key, count: 0, sum: 0, values: [] };
		existing.count += 1;
		if (value.valence !== undefined && Number.isFinite(value.valence)) {
			existing.sum += value.valence;
			existing.values.push(value.valence);
		}
		buckets.set(key, existing);
	}
	return Array.from(buckets.values());
}

export function bucketAverage(bucket: AggregateBucket): number | undefined {
	return bucket.values.length ? bucket.sum / bucket.values.length : undefined;
}

export function detailsForEntry(entry: MoodVizEntry): Array<{ label: string; value: string }> {
	return [
		{ label: "Mood", value: entry.valence !== undefined ? `${moodLabelForValence(entry.valence)} (${formatMoodValence(entry.valence)})` : entry.label ?? "Mood" },
		{ label: "Kind", value: kindLabel(entry.kind) },
		...(entry.labels.length ? [{ label: "Labels", value: entry.labels.join(", ") }] : []),
		...(entry.associations.length ? [{ label: "Associations", value: entry.associations.join(", ") }] : []),
	];
}
