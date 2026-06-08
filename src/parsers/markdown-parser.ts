import { HealthDay, TimeSeriesSample } from "../types";

interface ParsedFrontmatter {
	frontmatter: Record<string, unknown> | null;
	body: string;
}

interface MarkdownTable {
	context: string;
	headers: string[];
	rows: string[][];
}

interface ClockTime {
	h: number;
	m: number;
	s: number;
}

interface GranularMarkdownData {
	heartRateSamples: TimeSeriesSample[];
	hrvSamples: TimeSeriesSample[];
	bloodOxygenSamples: TimeSeriesSample[];
	respiratoryRateSamples: TimeSeriesSample[];
	sleepStages: NonNullable<HealthDay["sleep"]>["sleepStages"];
}

/**
 * Minimal YAML frontmatter parser.
 * Handles scalar values (strings, numbers, booleans) and simple arrays.
 * Does not handle nested objects or multi-line values.
 */
function parseFrontmatter(content: string): ParsedFrontmatter {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { frontmatter: null, body: content };

	const yaml = match[1];
	const result: Record<string, unknown> = {};

	for (const line of yaml.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		const colonIdx = trimmed.indexOf(":");
		if (colonIdx === -1) continue;

		const key = trimmed.slice(0, colonIdx).trim();
		let val = trimmed.slice(colonIdx + 1).trim();

		if (!val) continue;

		// Array: [item1, item2]
		if (val.startsWith("[") && val.endsWith("]")) {
			const inner = val.slice(1, -1);
			result[key] = inner
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			continue;
		}

		// Quoted string
		if (
			(val.startsWith('"') && val.endsWith('"')) ||
			(val.startsWith("'") && val.endsWith("'"))
		) {
			result[key] = val.slice(1, -1);
			continue;
		}

		// Boolean
		if (val === "true") { result[key] = true; continue; }
		if (val === "false") { result[key] = false; continue; }

		// Number
		const num = Number(val.replace(/,/g, ""));
		if (!isNaN(num) && val !== "") {
			result[key] = num;
			continue;
		}

		// Plain string
		result[key] = val;
	}

	return {
		frontmatter: result,
		body: content.slice(match[0].length),
	};
}

function normalizeLabel(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseNumberValue(value: unknown): number | undefined {
	if (typeof value === "number") return value;
	if (typeof value !== "string") return undefined;
	const normalized = value.trim().replace(/,/g, "");
	const match = /^[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i.exec(normalized);
	if (!match) return undefined;
	const num = Number(match[0]);
	return isNaN(num) ? undefined : num;
}

function getNum(fm: Record<string, unknown>, key: string): number | undefined {
	return parseNumberValue(fm[key]);
}

function getStr(fm: Record<string, unknown>, key: string): string | undefined {
	const v = fm[key];
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") {
		return String(v);
	}
	if (Array.isArray(v)) {
		return v
			.map((item) => {
				if (
					typeof item === "string" ||
					typeof item === "number" ||
					typeof item === "boolean" ||
					typeof item === "bigint"
				) {
					return String(item);
				}
				return JSON.stringify(item);
			})
			.join(", ");
	}
	if (v !== undefined && v !== null) {
		return JSON.stringify(v);
	}
	return undefined;
}

function getFirstNum(fm: Record<string, unknown>, ...keys: string[]): number | undefined {
	for (const key of keys) {
		const value = getNum(fm, key);
		if (value !== undefined) return value;
	}
	return undefined;
}

function getFirstStr(fm: Record<string, unknown>, ...keys: string[]): string | undefined {
	for (const key of keys) {
		const value = getStr(fm, key);
		if (value !== undefined) return value;
	}
	return undefined;
}

function normalizePercent(value: number | undefined): number | undefined {
	if (value === undefined) return undefined;
	return value > 0 && value <= 1 ? value * 100 : value;
}

function average(values: number[]): number | undefined {
	if (!values.length) return undefined;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pad2(value: number): string {
	return value < 10 ? `0${value}` : String(value);
}

function formatLocalDate(ms: number): string {
	const d = new Date(ms);
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatLocalDateTime(ms: number): string {
	const d = new Date(ms);
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function addDaysIso(dateIso: string, days: number): string {
	const base = new Date(`${dateIso}T00:00:00`);
	base.setDate(base.getDate() + days);
	return formatLocalDate(base.getTime());
}

function parseClockTime(raw: string): ClockTime | null {
	const value = raw.trim();
	let match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
	if (match) {
		const h = Number(match[1]);
		const m = Number(match[2]);
		const s = Number(match[3] ?? 0);
		if (h <= 23 && m <= 59 && s <= 59) return { h, m, s };
		return null;
	}

	match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i.exec(value);
	if (match) {
		let h = Number(match[1]);
		const m = Number(match[2]);
		const s = Number(match[3] ?? 0);
		if (h < 1 || h > 12 || m > 59 || s > 59) return null;
		const meridiem = match[4].toLowerCase();
		if (meridiem === "p" && h !== 12) h += 12;
		if (meridiem === "a" && h === 12) h = 0;
		return { h, m, s };
	}

	return null;
}

function absoluteDateMs(raw: string): number | undefined {
	if (!/^\d{4}-\d{2}-\d{2}/.test(raw.trim())) return undefined;
	const ms = Date.parse(raw.trim());
	return isFinite(ms) ? ms : undefined;
}

function timestampMsOnDate(date: string, raw: string, dayOffset: number): number | undefined {
	const absolute = absoluteDateMs(raw);
	if (absolute !== undefined) return absolute;

	const clock = parseClockTime(raw);
	if (!clock) return undefined;
	const dateForOffset = addDaysIso(date, dayOffset);
	const ms = new Date(`${dateForOffset}T${pad2(clock.h)}:${pad2(clock.m)}:${pad2(clock.s)}`).getTime();
	return isFinite(ms) ? ms : undefined;
}

function extractDateFromContent(content: string): string | undefined {
	const match = /(^|\D)(\d{4}-\d{2}-\d{2})(\D|$)/.exec(content);
	return match?.[2];
}

function cleanTableCell(cell: string): string {
	return cell.trim().replace(/<br\s*\/?\s*>/gi, " ").replace(/&nbsp;/g, " ");
}

function parseTableLine(line: string): string[] | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith("|") || !trimmed.includes("|")) return null;
	const withoutEdges = trimmed.replace(/^\|/, "").replace(/\|$/, "");
	return withoutEdges.split("|").map(cleanTableCell);
}

function isSeparatorRow(cells: string[]): boolean {
	return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseMarkdownTables(body: string): MarkdownTable[] {
	const tables: MarkdownTable[] = [];
	const lines = body.split(/\r?\n/);
	let context = "";

	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		const heading = /^#{1,6}\s+(.+)$/.exec(trimmed);
		if (heading) {
			context = heading[1];
			continue;
		}
		const summary = /^<summary>(.*?)<\/summary>$/i.exec(trimmed);
		if (summary) {
			context = summary[1];
			continue;
		}

		const header = parseTableLine(lines[i]);
		const separator = i + 1 < lines.length ? parseTableLine(lines[i + 1]) : null;
		if (!header || !separator || !isSeparatorRow(separator)) continue;

		const rows: string[][] = [];
		i += 2;
		while (i < lines.length) {
			const row = parseTableLine(lines[i]);
			if (!row || isSeparatorRow(row)) break;
			rows.push(row);
			i++;
		}
		i--;

		tables.push({ context, headers: header, rows });
	}

	return tables;
}

function normalizedHeaders(table: MarkdownTable): string[] {
	return table.headers.map((header) => normalizeLabel(header.replace(/[*_`]/g, "")));
}

function findHeaderIndex(headers: string[], predicate: (header: string) => boolean): number {
	for (let i = 0; i < headers.length; i++) {
		if (predicate(headers[i])) return i;
	}
	return -1;
}

function samplesFromTimeValueTable(
	table: MarkdownTable,
	date: string,
	timeIndex: number,
	valueIndex: number,
	transformValue: (value: number) => number | undefined = (value) => value
): TimeSeriesSample[] {
	const samples: TimeSeriesSample[] = [];
	let dayOffset = 0;
	let lastMs = -Infinity;

	for (const row of table.rows) {
		const rawTime = row[timeIndex];
		const rawValue = row[valueIndex];
		if (rawTime === undefined || rawValue === undefined) continue;

		let ms = timestampMsOnDate(date, rawTime, dayOffset);
		while (ms !== undefined && ms <= lastMs && absoluteDateMs(rawTime) === undefined) {
			dayOffset++;
			ms = timestampMsOnDate(date, rawTime, dayOffset);
		}
		if (ms === undefined) continue;

		const parsed = parseNumberValue(rawValue);
		if (parsed === undefined) continue;
		const value = transformValue(parsed);
		if (value === undefined) continue;

		samples.push({ timestamp: formatLocalDateTime(ms), value });
		lastMs = ms;
	}

	return samples;
}

function normalizeSleepStage(stage: string): string {
	const normalized = normalizeLabel(stage)
		.replace(/^asleep[_\s-]*/, "")
		.replace(/^sleep[_\s-]*/, "");
	if (normalized === "light") return "core";
	if (normalized.includes("deep")) return "deep";
	if (normalized.includes("rem")) return "rem";
	if (normalized.includes("awake")) return "awake";
	if (normalized.includes("core")) return "core";
	return normalized || "core";
}

function parseDurationSeconds(raw: string): number | undefined {
	const trimmed = raw.trim().toLowerCase();
	let match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
	if (match) {
		const h = Number(match[1]);
		const m = Number(match[2]);
		const s = Number(match[3] ?? 0);
		return h * 3600 + m * 60 + s;
	}

	let total = 0;
	let found = false;
	const unitPattern = /([0-9]+(?:\.[0-9]+)?)\s*(hours?|hrs?|hr|h|minutes?|mins?|min|m|seconds?|secs?|sec|s)\b/g;
	while ((match = unitPattern.exec(trimmed)) !== null) {
		found = true;
		const value = Number(match[1]);
		const unit = match[2];
		if (unit.startsWith("h")) total += value * 3600;
		else if (unit.startsWith("m")) total += value * 60;
		else total += value;
	}

	return found ? total : undefined;
}

function parseSleepStageRangeTable(
	table: MarkdownTable,
	date: string,
	startIndex: number,
	endIndex: number,
	stageIndex: number
): NonNullable<HealthDay["sleep"]>["sleepStages"] {
	const stages: NonNullable<HealthDay["sleep"]>["sleepStages"] = [];
	let dayOffset = 0;
	let lastStartMs = -Infinity;

	for (const row of table.rows) {
		const rawStart = row[startIndex];
		const rawEnd = row[endIndex];
		const rawStage = row[stageIndex];
		if (!rawStart || !rawEnd || !rawStage) continue;

		let startMs = timestampMsOnDate(date, rawStart, dayOffset);
		while (startMs !== undefined && startMs <= lastStartMs && absoluteDateMs(rawStart) === undefined) {
			dayOffset++;
			startMs = timestampMsOnDate(date, rawStart, dayOffset);
		}
		if (startMs === undefined) continue;

		let endMs = timestampMsOnDate(date, rawEnd, dayOffset);
		if (endMs === undefined) continue;
		while (endMs <= startMs && absoluteDateMs(rawEnd) === undefined) {
			endMs += 86400000;
		}

		stages.push({
			stage: normalizeSleepStage(rawStage),
			startDate: formatLocalDateTime(startMs),
			endDate: formatLocalDateTime(endMs),
			durationSeconds: Math.round((endMs - startMs) / 1000),
		});
		lastStartMs = startMs;
	}

	return stages;
}

function parseSleepStageDurationTable(
	table: MarkdownTable,
	date: string,
	timeIndex: number,
	stageIndex: number,
	durationIndex: number
): NonNullable<HealthDay["sleep"]>["sleepStages"] {
	const stages: NonNullable<HealthDay["sleep"]>["sleepStages"] = [];
	let dayOffset = 0;
	let lastStartMs = -Infinity;

	for (const row of table.rows) {
		const rawTime = row[timeIndex];
		const rawStage = row[stageIndex];
		const rawDuration = row[durationIndex];
		if (!rawTime || !rawStage || !rawDuration) continue;

		let startMs = timestampMsOnDate(date, rawTime, dayOffset);
		while (startMs !== undefined && startMs <= lastStartMs && absoluteDateMs(rawTime) === undefined) {
			dayOffset++;
			startMs = timestampMsOnDate(date, rawTime, dayOffset);
		}
		const durationSeconds = parseDurationSeconds(rawDuration);
		if (startMs === undefined || durationSeconds === undefined) continue;

		stages.push({
			stage: normalizeSleepStage(rawStage),
			startDate: formatLocalDateTime(startMs),
			endDate: formatLocalDateTime(startMs + durationSeconds * 1000),
			durationSeconds,
		});
		lastStartMs = startMs;
	}

	return stages;
}

function parseGranularMarkdownData(body: string, date: string): GranularMarkdownData {
	const data: GranularMarkdownData = {
		heartRateSamples: [],
		hrvSamples: [],
		bloodOxygenSamples: [],
		respiratoryRateSamples: [],
		sleepStages: [],
	};

	for (const table of parseMarkdownTables(body)) {
		const headers = normalizedHeaders(table);
		const context = normalizeLabel(table.context);
		const timeIndex = findHeaderIndex(headers, (header) => header === "time");
		const startIndex = findHeaderIndex(headers, (header) => header === "start");
		const endIndex = findHeaderIndex(headers, (header) => header === "end");
		const stageIndex = findHeaderIndex(headers, (header) => header === "stage");
		const durationIndex = findHeaderIndex(headers, (header) => header === "duration");

		if (startIndex !== -1 && endIndex !== -1 && stageIndex !== -1) {
			data.sleepStages.push(...parseSleepStageRangeTable(table, date, startIndex, endIndex, stageIndex));
			continue;
		}

		if (timeIndex !== -1 && stageIndex !== -1 && durationIndex !== -1) {
			data.sleepStages.push(...parseSleepStageDurationTable(table, date, timeIndex, stageIndex, durationIndex));
			continue;
		}

		if (timeIndex === -1) continue;

		const bpmIndex = findHeaderIndex(headers, (header) => header === "bpm" || header.includes("heart rate"));
		if (bpmIndex !== -1) {
			data.heartRateSamples.push(...samplesFromTimeValueTable(table, date, timeIndex, bpmIndex));
			continue;
		}

		const hrvIndex = findHeaderIndex(headers, (header) => header.includes("hrv") || (header === "ms" && context.includes("hrv")));
		if (hrvIndex !== -1) {
			data.hrvSamples.push(...samplesFromTimeValueTable(table, date, timeIndex, hrvIndex));
			continue;
		}

		const oxygenIndex = findHeaderIndex(headers, (header) => header.includes("spo2") || header.includes("spo₂") || header.includes("blood oxygen"));
		if (oxygenIndex !== -1) {
			data.bloodOxygenSamples.push(...samplesFromTimeValueTable(table, date, timeIndex, oxygenIndex, normalizePercent));
			continue;
		}

		const respiratoryIndex = findHeaderIndex(headers, (header) => header.includes("respiratory") || header.includes("breaths/min"));
		if (respiratoryIndex !== -1) {
			data.respiratoryRateSamples.push(...samplesFromTimeValueTable(table, date, timeIndex, respiratoryIndex));
		}
	}

	data.heartRateSamples.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
	data.hrvSamples.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
	data.bloodOxygenSamples.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
	data.respiratoryRateSamples.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
	data.sleepStages.sort((a, b) => a.startDate.localeCompare(b.startDate));

	return data;
}

function sumStageSeconds(
	stages: NonNullable<HealthDay["sleep"]>["sleepStages"],
	stageName: string
): number {
	return stages
		.filter((stage) => stage.stage === stageName)
		.reduce((sum, stage) => sum + stage.durationSeconds, 0);
}

/**
 * Parse a Markdown or Bases file into a HealthDay.
 * Supports both:
 * - Bases format: flat YAML keys like sleep_total_hours, steps
 * - Markdown format: frontmatter with date/type fields plus optional granular tables
 */
export function parseMarkdown(content: string): HealthDay | null {
	const parsed = parseFrontmatter(content);
	const fm = parsed.frontmatter ?? {};

	// Must have a date. Health.md normally emits `date`, but accept a few common
	// aliases and a title/body ISO date so markdown exports without metadata can
	// still contribute granular tables.
	const date = getFirstStr(fm, "date", "Date", "day", "Day") ?? extractDateFromContent(content);
	if (!date) return null;

	const granular = parseGranularMarkdownData(parsed.body, date);

	const day: HealthDay = {
		type: "health-data",
		date,
	};

	// --- Activity ---
	// Bases keys: steps, active_calories, exercise_minutes, walking_running_km, vo2_max, etc.
	// Also check JSON-style keys that might appear in frontmatter.
	const steps = getFirstNum(fm, "steps", "activity_steps");
	const walkingRunningDistanceKm = getFirstNum(
		fm,
		"walking_running_km",
		"walking_running_distance_km",
		"walkingRunningDistanceKm"
	);
	const activeCalories = getFirstNum(fm, "active_calories", "activity_active_calories", "activeCalories");
	const exerciseMinutes = getFirstNum(fm, "exercise_minutes", "activity_exercise_minutes", "exerciseMinutes");
	const vo2Max = getFirstNum(fm, "vo2_max", "vo2max", "vo2Max", "activity_vo2_max");
	const basalEnergyBurned = getFirstNum(
		fm,
		"basal_energy_burned",
		"basal_calories",
		"basal_energy",
		"basalEnergyBurned"
	);
	const standHours = getFirstNum(fm, "stand_hours", "standHours");
	const flightsClimbed = getFirstNum(fm, "flights_climbed", "floors_climbed", "flightsClimbed");
	if (
		steps !== undefined ||
		walkingRunningDistanceKm !== undefined ||
		activeCalories !== undefined ||
		exerciseMinutes !== undefined ||
		vo2Max !== undefined ||
		basalEnergyBurned !== undefined ||
		standHours !== undefined ||
		flightsClimbed !== undefined
	) {
		day.activity = {
			steps: steps ?? 0,
			walkingRunningDistanceKm: walkingRunningDistanceKm ?? 0,
			activeCalories: activeCalories ?? 0,
			exerciseMinutes: exerciseMinutes ?? 0,
			vo2Max,
			basalEnergyBurned,
			standHours,
			flightsClimbed,
		};
	}

	// --- Heart ---
	const heartValues = granular.heartRateSamples.map((sample) => sample.value);
	const hrvValues = granular.hrvSamples.map((sample) => sample.value);
	const restingHR = getFirstNum(fm, "resting_heart_rate", "heart_resting_heart_rate", "restingHeartRate");
	const avgHR = getFirstNum(fm, "average_heart_rate", "heart_average_heart_rate", "averageHeartRate") ?? average(heartValues);
	const hrvVal = getFirstNum(fm, "hrv_ms", "hrv", "heart_hrv") ?? average(hrvValues);
	const heartRateMin = getFirstNum(fm, "heart_rate_min", "heart_min", "heartRateMin") ??
		(heartValues.length ? Math.min(...heartValues) : undefined);
	const heartRateMax = getFirstNum(fm, "heart_rate_max", "heart_max", "heartRateMax") ??
		(heartValues.length ? Math.max(...heartValues) : undefined);
	const walkingHeartRateAverage = getFirstNum(
		fm,
		"walking_heart_rate",
		"walking_heart_rate_average",
		"walkingHeartRateAverage"
	);
	if (
		restingHR !== undefined ||
		avgHR !== undefined ||
		hrvVal !== undefined ||
		heartRateMin !== undefined ||
		heartRateMax !== undefined ||
		walkingHeartRateAverage !== undefined ||
		granular.heartRateSamples.length ||
		granular.hrvSamples.length
	) {
		day.heart = {
			averageHeartRate: avgHR ?? restingHR ?? 0,
			heartRateMin: heartRateMin ?? avgHR ?? restingHR ?? 0,
			heartRateMax: heartRateMax ?? avgHR ?? restingHR ?? 0,
			heartRateSamples: granular.heartRateSamples,
			hrvSamples: granular.hrvSamples.length ? granular.hrvSamples : undefined,
			restingHeartRate: restingHR,
			walkingHeartRateAverage,
			hrv: hrvVal,
		};
	}

	// --- Sleep ---
	// Bases commonly uses *_hours; JSON-style frontmatter commonly uses seconds.
	// Accept several aliases so sleep-schedule can find timing fields exported by
	// different daily-note/Bases templates.
	const sleepHours = getFirstNum(
		fm,
		"sleep_total_hours",
		"sleepTotalHours",
		"sleep_hours"
	);
	const sleepSeconds = getFirstNum(
		fm,
		"sleep_total_duration",
		"sleepTotalDuration",
		"sleep_total_seconds",
		"sleepTotalSeconds",
		"totalDuration",
		"total_duration"
	);
	const derivedSleepTotal = granular.sleepStages
		.filter((stage) => stage.stage !== "awake")
		.reduce((sum, stage) => sum + stage.durationSeconds, 0);
	const sleepTotal = sleepHours !== undefined
		? sleepHours * 3600
		: (sleepSeconds ?? (derivedSleepTotal > 0 ? derivedSleepTotal : undefined));
	if (sleepTotal !== undefined || granular.sleepStages.length) {
		const deepH = getFirstNum(fm, "sleep_deep_hours", "sleepDeepHours", "deep_sleep_hours");
		const remH = getFirstNum(fm, "sleep_rem_hours", "sleepRemHours", "rem_sleep_hours");
		const coreH = getFirstNum(fm, "sleep_core_hours", "sleepCoreHours", "core_sleep_hours", "sleep_light_hours", "sleepLightHours");
		const awakeH = getFirstNum(fm, "sleep_awake_hours", "sleepAwakeHours", "awake_time_hours");
		day.sleep = {
			sleepStages: granular.sleepStages,
			totalDuration: sleepTotal ?? derivedSleepTotal,
			deepSleep: deepH !== undefined
				? deepH * 3600
				: (getFirstNum(fm, "sleep_deep", "sleepDeep", "deepSleep", "deep_sleep") ?? sumStageSeconds(granular.sleepStages, "deep")),
			remSleep: remH !== undefined
				? remH * 3600
				: (getFirstNum(fm, "sleep_rem", "sleepRem", "remSleep", "rem_sleep") ?? sumStageSeconds(granular.sleepStages, "rem")),
			coreSleep: coreH !== undefined
				? coreH * 3600
				: (getFirstNum(fm, "sleep_core", "sleepCore", "coreSleep", "core_sleep", "sleep_light") ?? sumStageSeconds(granular.sleepStages, "core")),
			awakeTime: awakeH !== undefined
				? awakeH * 3600
				: (getFirstNum(fm, "sleep_awake", "sleepAwake", "awakeTime", "awake_time") ?? sumStageSeconds(granular.sleepStages, "awake")),
			bedtime:
				getFirstStr(
					fm,
					"sleep_bedtime",
					"sleepBedtime",
					"bedtime",
					"bedTime",
					"sleep_start",
					"sleep_start_time",
					"sleep_session_start"
				) ?? granular.sleepStages[0]?.startDate ?? "",
			bedtimeISO:
				getFirstStr(
					fm,
					"sleep_bedtime_iso",
					"sleepBedtimeISO",
					"bedtimeISO",
					"bed_time_iso",
					"sleep_start_iso",
					"sleep_session_start_iso"
				) ?? granular.sleepStages[0]?.startDate,
			wakeTime:
				getFirstStr(
					fm,
					"sleep_wake",
					"sleepWake",
					"sleep_wake_time",
					"wake_time",
					"wakeTime",
					"wake",
					"sleep_end",
					"sleep_end_time",
					"sleep_session_end"
				) ?? granular.sleepStages[granular.sleepStages.length - 1]?.endDate ?? "",
			wakeTimeISO:
				getFirstStr(
					fm,
					"sleep_wake_iso",
					"sleepWakeISO",
					"sleep_wake_time_iso",
					"wake_time_iso",
					"wakeTimeISO",
					"wake_iso",
					"sleep_end_iso",
					"sleep_session_end_iso"
				) ?? granular.sleepStages[granular.sleepStages.length - 1]?.endDate,
		};
	}

	// --- Vitals ---
	const respiratoryValues = granular.respiratoryRateSamples.map((sample) => sample.value);
	const respRateAvg = getFirstNum(fm, "respiratory_rate", "respiratory_rate_avg", "vitals_respiratory_rate", "respiratoryRateAvg") ??
		average(respiratoryValues);
	const respRateMin = getFirstNum(fm, "respiratory_rate_min", "respiratoryRateMin") ??
		(respiratoryValues.length ? Math.min(...respiratoryValues) : undefined);
	const respRateMax = getFirstNum(fm, "respiratory_rate_max", "respiratoryRateMax") ??
		(respiratoryValues.length ? Math.max(...respiratoryValues) : undefined);
	const bloodOxygenSamples = granular.bloodOxygenSamples.map((sample) => ({
		timestamp: sample.timestamp,
		value: sample.value,
		percent: sample.value,
	}));
	const bloodOxygenValues = bloodOxygenSamples.map((sample) => sample.value);
	const bloodOxAvg = normalizePercent(getFirstNum(
		fm,
		"blood_oxygen",
		"blood_oxygen_avg",
		"vitals_blood_oxygen",
		"bloodOxygenAvg",
		"bloodOxygenPercent"
	)) ?? average(bloodOxygenValues);
	const bloodOxMin = normalizePercent(getFirstNum(fm, "blood_oxygen_min", "bloodOxygenMin")) ??
		(bloodOxygenValues.length ? Math.min(...bloodOxygenValues) : undefined);
	const bloodOxMax = normalizePercent(getFirstNum(fm, "blood_oxygen_max", "bloodOxygenMax")) ??
		(bloodOxygenValues.length ? Math.max(...bloodOxygenValues) : undefined);
	if (
		respRateAvg !== undefined ||
		respRateMin !== undefined ||
		respRateMax !== undefined ||
		bloodOxAvg !== undefined ||
		bloodOxMin !== undefined ||
		bloodOxMax !== undefined ||
		granular.respiratoryRateSamples.length ||
		bloodOxygenSamples.length
	) {
		day.vitals = {
			respiratoryRate: respRateAvg,
			respiratoryRateAvg: respRateAvg,
			respiratoryRateMin: respRateMin,
			respiratoryRateMax: respRateMax,
			respiratoryRateSamples: granular.respiratoryRateSamples.length ? granular.respiratoryRateSamples : undefined,
			bloodOxygenPercent: bloodOxAvg,
			bloodOxygenAvg: bloodOxAvg,
			bloodOxygenMin: bloodOxMin,
			bloodOxygenMax: bloodOxMax,
			bloodOxygenSamples: bloodOxygenSamples.length ? bloodOxygenSamples : undefined,
		};
	}

	// --- Mobility ---
	const walkSpeed = getFirstNum(fm, "walking_speed", "mobility_walking_speed", "walkingSpeed");
	const walkingAsymmetryPercentage = getFirstNum(
		fm,
		"walking_asymmetry_percentage",
		"walking_asymmetry_percent",
		"walking_asymmetry",
		"walkingAsymmetryPercentage"
	);
	const walkingStepLengthMeters = getFirstNum(fm, "walking_step_length", "walkingStepLength");
	const walkingStepLengthCm = getNum(fm, "step_length_cm");
	const walkingStepLength = walkingStepLengthMeters ??
		(walkingStepLengthCm !== undefined ? walkingStepLengthCm / 100 : undefined);
	const walkingDoubleSupportPercentage = getFirstNum(
		fm,
		"walking_double_support_percentage",
		"walking_double_support_percent",
		"double_support_percent",
		"walkingDoubleSupportPercentage"
	);
	if (
		walkSpeed !== undefined ||
		walkingAsymmetryPercentage !== undefined ||
		walkingStepLength !== undefined ||
		walkingDoubleSupportPercentage !== undefined
	) {
		day.mobility = {
			walkingSpeed: walkSpeed ?? 0,
			walkingAsymmetryPercentage: walkingAsymmetryPercentage ?? 0,
			walkingStepLength,
			walkingDoubleSupportPercentage,
		};
	}

	// --- Hearing ---
	const headphone = getFirstNum(fm, "headphone_audio_level", "headphone_audio_db", "hearing_headphone_audio_level");
	if (headphone !== undefined) {
		day.hearing = { headphoneAudioLevel: headphone };
	}

	// Only return if we found at least some health data beyond just a date
	const hasData =
		day.activity || day.heart || day.sleep || day.vitals || day.mobility || day.hearing;
	return hasData ? day : null;
}
