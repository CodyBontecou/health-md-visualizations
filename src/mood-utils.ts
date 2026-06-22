import { HealthDay, MoodEntry } from "./types";

export interface MoodDaySummary {
	date: string;
	entries: MoodEntry[];
	averageValence?: number;
	minValence?: number;
	maxValence?: number;
	primaryLabel?: string;
}

const VALENCE_LABELS: Array<{ max: number; label: string }> = [
	{ max: -0.72, label: "Very unpleasant" },
	{ max: -0.44, label: "Unpleasant" },
	{ max: -0.16, label: "Slightly unpleasant" },
	{ max: 0.16, label: "Neutral" },
	{ max: 0.44, label: "Slightly pleasant" },
	{ max: 0.72, label: "Pleasant" },
	{ max: Infinity, label: "Very pleasant" },
];

const LABEL_VALENCE: Record<string, number> = {
	"very unpleasant": -1,
	unpleasant: -0.67,
	"slightly unpleasant": -0.33,
	neutral: 0,
	"slightly pleasant": 0.33,
	pleasant: 0.67,
	"very pleasant": 1,
	amazed: 0.75,
	amused: 0.65,
	angry: -0.72,
	anxious: -0.62,
	ashamed: -0.72,
	brave: 0.35,
	calm: 0.55,
	content: 0.62,
	disappointed: -0.55,
	discouraged: -0.64,
	disgusted: -0.7,
	embarrassed: -0.55,
	excited: 0.78,
	frustrated: -0.65,
	grateful: 0.75,
	guilty: -0.62,
	happy: 0.82,
	hopeless: -0.9,
	irritated: -0.58,
	jealous: -0.55,
	joyful: 0.95,
	lonely: -0.72,
	passionate: 0.74,
	peaceful: 0.72,
	proud: 0.78,
	relieved: 0.55,
	sad: -0.82,
	scared: -0.78,
	stressed: -0.72,
	surprised: 0.1,
	worried: -0.65,
	annoyed: -0.5,
	confident: 0.7,
	drained: -0.55,
	hopeful: 0.65,
	indifferent: 0,
	overwhelmed: -0.68,
	satisfied: 0.7,
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKey(value: string): string {
	return value
		.trim()
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ")
		.toLowerCase();
}

function clampValence(value: number): number {
	return Math.max(-1, Math.min(1, value));
}

function parseNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	const parsed = Number(trimmed.replace(/,/g, ""));
	return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeScore(value: number): number | undefined {
	if (value >= 1 && value <= 5) return clampValence((value - 3) / 2);
	if (value >= 0 && value <= 10) return clampValence(value / 5 - 1);
	if (value >= 0 && value <= 100) return clampValence(value / 50 - 1);
	if (value >= -1 && value <= 1) return clampValence(value);
	return undefined;
}

export function normalizeMoodValence(
	value: unknown,
	hint: "valence" | "score" | "label" = "valence"
): number | undefined {
	const numeric = parseNumber(value);
	if (numeric !== undefined) {
		if (hint === "score") return normalizeScore(numeric);
		if (numeric >= -1 && numeric <= 1) return clampValence(numeric);
		return normalizeScore(numeric);
	}

	if (typeof value !== "string") return undefined;
	const key = normalizeKey(value);
	return LABEL_VALENCE[key];
}

export function moodLabelForValence(valence: number | undefined): string {
	if (valence === undefined || !Number.isFinite(valence)) return "Unknown";
	const clamped = clampValence(valence);
	return VALENCE_LABELS.find((item) => clamped <= item.max)?.label ?? "Neutral";
}

export function formatMoodValence(valence: number | undefined): string {
	if (valence === undefined || !Number.isFinite(valence)) return "—";
	const clamped = clampValence(valence);
	return `${clamped >= 0 ? "+" : ""}${clamped.toFixed(2)}`;
}

export function stringArrayFromUnknown(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.map((item) => {
				if (typeof item === "string") return item.trim();
				if (typeof item === "number" || typeof item === "boolean" || typeof item === "bigint") return String(item);
				return "";
			})
			.filter(Boolean);
	}
	if (typeof value === "string") {
		return value
			.split(/[,;|]/g)
			.map((item) => item.trim())
			.filter(Boolean);
	}
	return [];
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value.trim();
		if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
	}
	return undefined;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
	for (const key of keys) {
		const parsed = parseNumber(record[key]);
		if (parsed !== undefined) return parsed;
	}
	return undefined;
}

function normalizeTimestamp(raw: string | undefined, fallbackDate?: string): string | undefined {
	if (!raw) return fallbackDate;
	const value = raw.trim();
	if (!value) return fallbackDate;
	if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(value) && fallbackDate) {
		const [h = "0", m = "0", s = "0"] = value.split(":");
		return `${fallbackDate}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}`;
	}
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T12:00:00`;
	return value;
}

function moodEntryFromRecord(record: Record<string, unknown>, fallbackDate?: string): MoodEntry | null {
	const valenceRaw = firstNumber(record, [
		"valence",
		"moodValence",
		"mood_valence",
		"stateOfMindValence",
		"state_of_mind_valence",
		"averageValence",
		"average_valence",
		"avgValence",
		"avg_valence",
	]);
	const scoreRaw = firstNumber(record, [
		"score",
		"moodScore",
		"mood_score",
		"rating",
		"moodRating",
		"mood_rating",
		"valencePercent",
		"valence_percent",
		"moodPercent",
		"mood_percent",
		"averageValencePercent",
		"average_valence_percent",
		"averageMoodPercent",
		"average_mood_percent",
	]);
	const label = firstString(record, [
		"label",
		"primaryLabel",
		"primary_label",
		"moodLabel",
		"mood_label",
		"state",
	]);
	const valenceDescription = firstString(record, [
		"classification",
		"valenceClassification",
		"valence_classification",
		"valenceDescription",
		"valence_description",
		"feeling",
	]);
	const rawMood = record.mood;
	const moodLabel = typeof rawMood === "string" && rawMood.trim() ? rawMood.trim() : undefined;
	const labels = [
		...stringArrayFromUnknown(record.labels),
		...stringArrayFromUnknown(record.emotions),
		...stringArrayFromUnknown(record.feelings),
	].filter((item, index, all) => all.indexOf(item) === index);
	const primaryLabel = label ?? moodLabel ?? labels[0] ?? valenceDescription;
	const valence = normalizeMoodValence(valenceRaw, "valence") ??
		normalizeMoodValence(scoreRaw, "score") ??
		normalizeMoodValence(primaryLabel, "label");
	const timestamp = normalizeTimestamp(firstString(record, [
		"timestamp",
		"date",
		"recordedAt",
		"recorded_at",
		"startDate",
		"start_date",
		"startTime",
		"start_time",
		"time",
	]), fallbackDate);
	const endDate = normalizeTimestamp(firstString(record, ["endDate", "end_date", "endTime", "end_time"]), fallbackDate);
	const kind = firstString(record, ["kind", "moodKind", "mood_kind", "feelingKind", "feeling_kind", "category"]);
	const associations = [
		...stringArrayFromUnknown(record.associations),
		...stringArrayFromUnknown(record.contexts),
		...stringArrayFromUnknown(record.factors),
	].filter((item, index, all) => all.indexOf(item) === index);

	if (valence === undefined && !primaryLabel && !labels.length && !kind) return null;

	return {
		timestamp,
		startDate: timestamp,
		endDate,
		kind,
		valence,
		score: scoreRaw,
		label: primaryLabel,
		labels: labels.length ? labels : undefined,
		associations: associations.length ? associations : undefined,
	};
}

function primitiveMoodEntry(value: unknown, fallbackDate?: string): MoodEntry | null {
	const valence = normalizeMoodValence(value, typeof value === "number" ? "valence" : "label");
	const label = typeof value === "string" && value.trim() ? value.trim() : undefined;
	if (valence === undefined && !label) return null;
	return {
		timestamp: fallbackDate ? `${fallbackDate}T12:00:00` : undefined,
		startDate: fallbackDate ? `${fallbackDate}T12:00:00` : undefined,
		valence,
		label,
	};
}

function moodEntriesFromArray(values: unknown[], fallbackDate?: string): MoodEntry[] {
	const entries: MoodEntry[] = [];
	for (const item of values) {
		entries.push(...moodEntriesFromUnknown(item, fallbackDate));
	}
	return entries;
}

export function moodEntriesFromUnknown(value: unknown, fallbackDate?: string): MoodEntry[] {
	if (value === undefined || value === null || value === "") return [];
	if (Array.isArray(value)) return moodEntriesFromArray(value, fallbackDate);
	if (!isRecord(value)) {
		const entry = primitiveMoodEntry(value, fallbackDate);
		return entry ? [entry] : [];
	}

	const entries: MoodEntry[] = [];
	for (const key of ["entries", "samples", "records", "states", "stateOfMind", "state_of_mind", "stateOfMindEntries", "state_of_mind_entries", "moods"]) {
		const nested = value[key];
		if (Array.isArray(nested)) entries.push(...moodEntriesFromArray(nested, fallbackDate));
	}

	// If the value is already a summary object with nested entries/samples,
	// prefer the actual samples instead of adding an extra synthetic average entry.
	if (!entries.length) {
		const ownEntry = moodEntryFromRecord(value, fallbackDate);
		if (ownEntry) entries.push(ownEntry);
	}
	return dedupeMoodEntries(entries);
}

function dedupeMoodEntries(entries: MoodEntry[]): MoodEntry[] {
	const seen = new Set<string>();
	const deduped: MoodEntry[] = [];
	for (const entry of entries) {
		const key = [
			entry.timestamp ?? entry.startDate ?? "",
			entry.kind ?? "",
			entry.valence ?? "",
			entry.label ?? "",
			(entry.labels ?? []).join("|"),
		].join("~");
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(entry);
	}
	return deduped.sort((a, b) => (a.timestamp ?? a.startDate ?? "").localeCompare(b.timestamp ?? b.startDate ?? ""));
}

function primaryLabel(entries: MoodEntry[], averageValence?: number): string | undefined {
	const counts = new Map<string, number>();
	for (const entry of entries) {
		const labels = entry.labels?.length ? entry.labels : entry.label ? [entry.label] : [];
		for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
	}
	let best: string | undefined;
	let bestCount = 0;
	for (const [label, count] of counts) {
		if (count > bestCount) {
			best = label;
			bestCount = count;
		}
	}
	return best ?? (averageValence !== undefined ? moodLabelForValence(averageValence) : undefined);
}

export function createMoodSummary(entries: MoodEntry[]): NonNullable<HealthDay["mood"]> | undefined {
	const normalized = dedupeMoodEntries(entries).filter((entry) =>
		entry.valence !== undefined || entry.label || entry.labels?.length || entry.kind
	);
	if (!normalized.length) return undefined;
	const values = normalized
		.map((entry) => entry.valence)
		.filter((value): value is number => value !== undefined && Number.isFinite(value));
	const averageValence = values.length
		? values.reduce((sum, value) => sum + value, 0) / values.length
		: undefined;
	return {
		entries: normalized,
		averageValence,
		minValence: values.length ? Math.min(...values) : undefined,
		maxValence: values.length ? Math.max(...values) : undefined,
		primaryLabel: primaryLabel(normalized, averageValence),
	};
}

export function getMoodDaySummary(day: HealthDay): MoodDaySummary {
	const dayRecord = day as unknown as Record<string, unknown>;
	const entries = dedupeMoodEntries([
		...moodEntriesFromUnknown(dayRecord.mood, day.date),
		...moodEntriesFromUnknown(dayRecord.stateOfMind, day.date),
		...moodEntriesFromUnknown(dayRecord.state_of_mind, day.date),
		...moodEntriesFromUnknown(dayRecord.moods, day.date),
		...moodEntriesFromUnknown(dayRecord.mindfulness, day.date),
	]);
	const summary = createMoodSummary(entries);
	return {
		date: day.date,
		entries,
		averageValence: summary?.averageValence,
		minValence: summary?.minValence,
		maxValence: summary?.maxValence,
		primaryLabel: summary?.primaryLabel,
	};
}
