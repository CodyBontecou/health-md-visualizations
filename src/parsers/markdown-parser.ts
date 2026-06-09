import {
	HealthDay,
	TimeSeriesSample,
	WorkoutEntry,
	WorkoutHeartRateZone,
	WorkoutInterval,
} from "../types";

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

interface YamlLine {
	indent: number;
	text: string;
}

function countIndent(line: string): number {
	const match = /^ */.exec(line);
	return match ? match[0].length : 0;
}

function stripInlineComment(value: string): string {
	let quote: string | null = null;
	for (let i = 0; i < value.length; i++) {
		const ch = value[i];
		if ((ch === '"' || ch === "'") && value[i - 1] !== "\\") {
			quote = quote === ch ? null : (quote ?? ch);
		}
		if (ch === "#" && !quote && (i === 0 || /\s/.test(value[i - 1]))) {
			return value.slice(0, i).trimEnd();
		}
	}
	return value;
}

function splitInlineArray(inner: string): string[] {
	const parts: string[] = [];
	let current = "";
	let quote: string | null = null;
	for (let i = 0; i < inner.length; i++) {
		const ch = inner[i];
		if ((ch === '"' || ch === "'") && inner[i - 1] !== "\\") {
			quote = quote === ch ? null : (quote ?? ch);
		}
		if (ch === "," && !quote) {
			parts.push(current.trim());
			current = "";
			continue;
		}
		current += ch;
	}
	if (current.trim()) parts.push(current.trim());
	return parts;
}

function parseYamlScalar(raw: string): unknown {
	let val = stripInlineComment(raw.trim());
	if (!val) return null;

	if (val.startsWith("[") && val.endsWith("]")) {
		const inner = val.slice(1, -1);
		return splitInlineArray(inner).map(parseYamlScalar);
	}

	if (
		(val.startsWith('"') && val.endsWith('"')) ||
		(val.startsWith("'") && val.endsWith("'"))
	) {
		val = val.slice(1, -1);
		return val.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
	}

	const lower = val.toLowerCase();
	if (lower === "true") return true;
	if (lower === "false") return false;
	if (lower === "null" || lower === "~") return null;

	const num = Number(val.replace(/,/g, ""));
	if (!isNaN(num) && val !== "") return num;

	return val;
}

function splitYamlKeyValue(text: string): [string, string] | null {
	const colonIdx = text.indexOf(":");
	if (colonIdx === -1) return null;
	const key = text.slice(0, colonIdx).trim();
	if (!key) return null;
	return [key, text.slice(colonIdx + 1).trim()];
}

function parseYamlBlock(lines: YamlLine[], start: number, indent: number): { value: unknown; index: number } {
	if (start >= lines.length) return { value: {}, index: start };
	const first = lines[start];
	if (first.indent < indent) return { value: {}, index: start };

	if (first.indent === indent && first.text.startsWith("- ")) {
		const arr: unknown[] = [];
		let i = start;
		while (i < lines.length && lines[i].indent === indent && lines[i].text.startsWith("- ")) {
			const rest = lines[i].text.slice(2).trim();
			if (!rest) {
				const parsed = parseYamlBlock(lines, i + 1, indent + 2);
				arr.push(parsed.value);
				i = parsed.index;
				continue;
			}

			const keyValue = splitYamlKeyValue(rest);
			if (keyValue) {
				const [key, rawValue] = keyValue;
				const item: Record<string, unknown> = {};
				if (rawValue) {
					item[key] = parseYamlScalar(rawValue);
					i++;
				} else {
					const parsed = parseYamlBlock(lines, i + 1, indent + 2);
					item[key] = parsed.value;
					i = parsed.index;
				}

				while (i < lines.length && lines[i].indent > indent) {
					if (lines[i].indent < indent + 2) break;
					const nested = splitYamlKeyValue(lines[i].text);
					if (!nested) break;
					const [nestedKey, nestedValue] = nested;
					if (nestedValue) {
						item[nestedKey] = parseYamlScalar(nestedValue);
						i++;
					} else {
						const parsed = parseYamlBlock(lines, i + 1, lines[i].indent + 2);
						item[nestedKey] = parsed.value;
						i = parsed.index;
					}
				}
				arr.push(item);
				continue;
			}

			arr.push(parseYamlScalar(rest));
			i++;
		}
		return { value: arr, index: i };
	}

	const obj: Record<string, unknown> = {};
	let i = start;
	while (i < lines.length && lines[i].indent >= indent) {
		if (lines[i].indent > indent) break;
		if (lines[i].text.startsWith("- ")) break;

		const keyValue = splitYamlKeyValue(lines[i].text);
		if (!keyValue) {
			i++;
			continue;
		}
		const [key, rawValue] = keyValue;
		if (rawValue) {
			obj[key] = parseYamlScalar(rawValue);
			i++;
			continue;
		}

		if (i + 1 < lines.length && lines[i + 1].indent > lines[i].indent) {
			const parsed = parseYamlBlock(lines, i + 1, lines[i + 1].indent);
			obj[key] = parsed.value;
			i = parsed.index;
		} else {
			obj[key] = null;
			i++;
		}
	}

	return { value: obj, index: i };
}

/**
 * Minimal YAML frontmatter parser.
 * Handles the subset emitted by Health.md: scalars, inline arrays, block arrays,
 * and nested mappings such as `heart_rate_zones.zone1.seconds`.
 */
function parseFrontmatter(content: string): ParsedFrontmatter {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { frontmatter: null, body: content };

	const yaml = match[1];
	const lines: YamlLine[] = yaml
		.split(/\r?\n/)
		.map((line) => ({ indent: countIndent(line), text: line.trim() }))
		.filter((line) => line.text && !line.text.startsWith("#"));
	const parsed = parseYamlBlock(lines, 0, 0).value;

	return {
		frontmatter: typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
			? parsed as Record<string, unknown>
			: {},
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
	if (v instanceof Date) {
		const ms = v.getTime();
		if (!Number.isFinite(ms)) return undefined;
		const iso = v.toISOString();
		const isMidnightUtc =
			v.getUTCHours() === 0 &&
			v.getUTCMinutes() === 0 &&
			v.getUTCSeconds() === 0 &&
			v.getUTCMilliseconds() === 0;
		return isMidnightUtc ? iso.slice(0, 10) : iso.replace(/\.\d{3}Z$/, "Z");
	}
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeFrontmatter(
	parsed: Record<string, unknown>,
	cached: Record<string, unknown> | undefined
): Record<string, unknown> {
	if (!cached) return parsed;
	return { ...parsed, ...cached };
}

function getBool(fm: Record<string, unknown>, key: string): boolean | undefined {
	const value = fm[key];
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "true") return true;
		if (normalized === "false") return false;
	}
	return undefined;
}

function normalizeTags(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.flatMap((item) => normalizeTags(item))
			.map((tag) => tag.replace(/^#/, ""));
	}
	if (typeof value === "string") {
		return value
			.split(/[\s,]+/)
			.map((tag) => tag.trim().replace(/^#/, ""))
			.filter(Boolean);
	}
	return [];
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

function parseWorkoutDurationSeconds(raw: string): number | undefined {
	const trimmed = raw.trim().toLowerCase();
	let match = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(trimmed);
	if (match) {
		return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
	}
	match = /^(\d{1,3}):(\d{2})$/.exec(trimmed);
	if (match) {
		return Number(match[1]) * 60 + Number(match[2]);
	}
	return parseDurationSeconds(raw);
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

function recordStr(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return undefined;
}

function recordNum(record: Record<string, unknown>, key: string): number | undefined {
	return parseNumberValue(record[key]);
}

function cleanDisplayValue(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (!trimmed || trimmed === "—" || trimmed === "-") return undefined;
	return trimmed;
}

function formatDistanceField(
	meters: number | undefined,
	km: number | undefined,
	mi: number | undefined
): string | undefined {
	if (km !== undefined) return `${km.toFixed(2)} km`;
	if (mi !== undefined) return `${mi.toFixed(2)} mi`;
	if (meters === undefined) return undefined;
	if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
	return `${Math.round(meters)} m`;
}

function parseDistanceToMeters(raw: string | undefined): number | undefined {
	const value = cleanDisplayValue(raw);
	if (!value) return undefined;
	const n = parseNumberValue(value);
	if (n === undefined) return undefined;
	const normalized = value.toLowerCase();
	if (/\bkm\b/.test(normalized)) return n * 1000;
	if (/\bmi\b|miles?\b/.test(normalized)) return n * 1609.344;
	if (/\byd\b|yards?\b/.test(normalized)) return n * 0.9144;
	if (/\bm\b|meters?\b/.test(normalized)) return n;
	return undefined;
}

function buildLocalDateTime(date: string, rawTime: string | undefined): string | undefined {
	if (!rawTime) return undefined;
	if (absoluteDateMs(rawTime) !== undefined) return rawTime;
	const clock = parseClockTime(rawTime);
	if (!clock) return undefined;
	return `${date}T${pad2(clock.h)}:${pad2(clock.m)}:${pad2(clock.s)}`;
}

function addSecondsToTimestamp(timestamp: string | undefined, seconds: number): string | undefined {
	if (!timestamp || !Number.isFinite(seconds) || seconds <= 0) return undefined;
	const ms = Date.parse(timestamp);
	if (!Number.isFinite(ms)) return undefined;
	return new Date(ms + seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function frontmatterIndicatesWorkout(fm: Record<string, unknown>): boolean {
	const type = normalizeLabel(getFirstStr(fm, "type", "Type") ?? "");
	const metric = normalizeLabel(getFirstStr(fm, "metric", "Metric") ?? "");
	const tags = normalizeTags(fm.tags ?? fm.tag).map((tag) => normalizeLabel(tag));
	return (
		type === "workout" ||
		type === "workouts" ||
		metric === "workouts" ||
		tags.includes("workout") ||
		tags.includes("healthmd")
	);
}

function parseHeartRateZones(fm: Record<string, unknown>): WorkoutHeartRateZone[] {
	const raw = fm.heart_rate_zones ?? fm.heartRateZones;
	const zones: WorkoutHeartRateZone[] = [];

	if (isRecord(raw)) {
		const entries = Object.entries(raw).sort(([a], [b]) => {
			const ai = parseNumberValue(a) ?? parseNumberValue(a.replace(/\D+/g, "")) ?? 0;
			const bi = parseNumberValue(b) ?? parseNumberValue(b.replace(/\D+/g, "")) ?? 0;
			return ai - bi || a.localeCompare(b);
		});
		entries.forEach(([key, value], idx) => {
			if (!isRecord(value)) return;
			const seconds = recordNum(value, "seconds") ?? 0;
			const zoneIndex = parseNumberValue(key.replace(/\D+/g, "")) ?? idx + 1;
			zones.push({
				index: Math.round(zoneIndex),
				key,
				label: recordStr(value, "label") ?? `Zone ${idx + 1}`,
				range: recordStr(value, "range"),
				seconds,
				durationFormatted: recordStr(value, "duration"),
			});
		});
		return zones;
	}

	if (Array.isArray(raw)) {
		raw.forEach((value, idx) => {
			if (!isRecord(value)) return;
			const seconds = recordNum(value, "seconds") ?? 0;
			zones.push({
				index: recordNum(value, "index") ?? idx + 1,
				label: recordStr(value, "label") ?? `Zone ${idx + 1}`,
				range: recordStr(value, "range"),
				seconds,
				durationFormatted: recordStr(value, "duration"),
			});
		});
	}

	return zones;
}

function parseWorkoutIntervals(body: string): { laps: WorkoutInterval[]; splits: WorkoutInterval[] } {
	const laps: WorkoutInterval[] = [];
	const splits: WorkoutInterval[] = [];

	for (const table of parseMarkdownTables(body)) {
		const context = normalizeLabel(table.context);
		const target = context.includes("lap")
			? laps
			: context.includes("split")
				? splits
				: null;
		if (!target) continue;

		const headers = normalizedHeaders(table);
		const indexIndex = findHeaderIndex(headers, (header) => header === "#" || header.includes("lap") || header.includes("split"));
		const distanceIndex = findHeaderIndex(headers, (header) => header.includes("distance"));
		const timeIndex = findHeaderIndex(headers, (header) => header === "time" || header.includes("duration"));
		const paceIndex = findHeaderIndex(headers, (header) => header.includes("pace"));
		const speedIndex = findHeaderIndex(headers, (header) => header.includes("speed"));
		const avgHrIndex = findHeaderIndex(headers, (header) => header.includes("avg hr") || header.includes("average hr") || header.includes("avg heart"));
		const maxHrIndex = findHeaderIndex(headers, (header) => header.includes("max hr") || header.includes("maximum hr") || header.includes("max heart"));
		const avgPowerIndex = findHeaderIndex(headers, (header) => header.includes("avg power") || header.includes("average power"));
		const avgCadenceIndex = findHeaderIndex(headers, (header) => header.includes("avg cadence") || header.includes("average cadence"));

		for (const row of table.rows) {
			const distanceFormatted = cleanDisplayValue(distanceIndex === -1 ? undefined : row[distanceIndex]);
			const duration = timeIndex === -1 ? undefined : parseWorkoutDurationSeconds(row[timeIndex] ?? "");
			const cadenceDisplay = cleanDisplayValue(avgCadenceIndex === -1 ? undefined : row[avgCadenceIndex]);
			const interval: WorkoutInterval = {
				index: Math.round(parseNumberValue(indexIndex === -1 ? undefined : row[indexIndex]) ?? target.length + 1),
				duration: duration ?? 0,
				distance: parseDistanceToMeters(distanceFormatted),
				distanceFormatted,
				paceFormatted: cleanDisplayValue(paceIndex === -1 ? undefined : row[paceIndex]),
				speedFormatted: cleanDisplayValue(speedIndex === -1 ? undefined : row[speedIndex]),
				avgHeartRate: parseNumberValue(avgHrIndex === -1 ? undefined : row[avgHrIndex]),
				maxHeartRate: parseNumberValue(maxHrIndex === -1 ? undefined : row[maxHrIndex]),
				avgPower: parseNumberValue(avgPowerIndex === -1 ? undefined : row[avgPowerIndex]),
				avgCadence: parseNumberValue(cadenceDisplay),
				cadenceUnit: cadenceDisplay?.toLowerCase().includes("rpm") ? "rpm" : cadenceDisplay?.toLowerCase().includes("spm") ? "spm" : undefined,
			};
			target.push(interval);
		}
	}

	return { laps, splits };
}

function parseWorkoutEntry(
	fm: Record<string, unknown>,
	body: string,
	date: string
): WorkoutEntry | null {
	if (!frontmatterIndicatesWorkout(fm)) return null;

	const activityType = getFirstStr(fm, "activity_type", "activityType", "workout_type", "workoutType", "value");
	const sport = getFirstStr(fm, "sport", "workout_sport");
	const type = sport ?? activityType ?? "Workout";

	const durationFromString = getFirstStr(fm, "duration", "durationFormatted");
	const durationSeconds = getFirstNum(fm, "duration_sec", "duration_seconds", "durationSeconds");
	const durationMinutes = getFirstNum(fm, "duration_minutes", "duration_min");
	const duration = durationSeconds ??
		(durationMinutes !== undefined ? durationMinutes * 60 : undefined) ??
		(durationFromString ? parseWorkoutDurationSeconds(durationFromString) : undefined) ??
		0;

	const rawStart = getFirstStr(fm, "datetime", "start_datetime", "startTimeISO", "start_time_iso", "startTime");
	const startTimeISO = rawStart && absoluteDateMs(rawStart) !== undefined
		? rawStart
		: buildLocalDateTime(date, rawStart ?? getFirstStr(fm, "time", "start_time", "start"));
	const endTimeISO = getFirstStr(fm, "end_datetime", "endTimeISO", "end_time_iso") ?? addSecondsToTimestamp(startTimeISO, duration);

	const distanceKm = getFirstNum(fm, "distance_km", "distanceKm");
	const distanceMi = getFirstNum(fm, "distance_mi", "distanceMi");
	const distanceMeters = getFirstNum(fm, "distance_m", "distance_meters", "distanceMeters") ??
		(distanceKm !== undefined ? distanceKm * 1000 : undefined) ??
		(distanceMi !== undefined ? distanceMi * 1609.344 : undefined);
	const legacyDistance = getFirstNum(fm, "distance");
	const distanceFormatted = getFirstStr(fm, "distance_formatted", "distanceFormatted") ??
		formatDistanceField(distanceMeters, distanceKm, distanceMi);

	const { laps, splits } = parseWorkoutIntervals(body);
	const zones = parseHeartRateZones(fm);
	const avgPaceFormatted = getFirstStr(
		fm,
		"pace_per_km",
		"pace_per_mi",
		"pace_per_100m",
		"pace_per_100yd",
		"avg_pace",
		"avgPaceFormatted"
	);
	const avgSpeedFormatted = getFirstStr(
		fm,
		"speed_kmh_formatted",
		"speed_mph_formatted",
		"avg_speed",
		"avgSpeedFormatted"
	);

	const workout: WorkoutEntry = {
		type,
		activityType,
		sport,
		duration,
		durationFormatted: durationFromString,
		calories: getFirstNum(fm, "calories", "active_calories", "energy_kcal"),
		distance: distanceMeters ?? legacyDistance,
		distanceMeters,
		distanceKm,
		distanceMi,
		distanceFormatted,
		startTime: startTimeISO,
		startTimeISO,
		endTimeISO,
		isIndoor: getBool(fm, "is_indoor"),
		locationType: getFirstStr(fm, "location_type", "locationType"),
		avgPaceFormatted,
		avgSpeedFormatted,
		speedKmh: getFirstNum(fm, "speed_kmh", "speedKmh"),
		speedMph: getFirstNum(fm, "speed_mph", "speedMph"),
		avgHeartRate: getFirstNum(fm, "hr_avg", "avg_heart_rate", "average_heart_rate", "avgHeartRate"),
		maxHeartRate: getFirstNum(fm, "hr_max", "max_heart_rate", "maxHeartRate"),
		minHeartRate: getFirstNum(fm, "hr_min", "min_heart_rate", "minHeartRate"),
		avgRunningCadence: getFirstNum(fm, "cadence_avg_spm", "avg_running_cadence", "avgRunningCadence"),
		avgCyclingCadence: getFirstNum(fm, "cadence_avg_rpm", "avg_cycling_cadence", "avgCyclingCadence"),
		avgStrideLength: getFirstNum(fm, "avg_stride_length_m", "avgStrideLength"),
		avgGroundContactTime: getFirstNum(fm, "avg_ground_contact_ms", "avgGroundContactTime"),
		avgVerticalOscillation: getFirstNum(fm, "avg_vertical_oscillation_cm", "avgVerticalOscillation"),
		avgPower: getFirstNum(fm, "power_avg_w", "avg_power_w", "avgPower"),
		maxPower: getFirstNum(fm, "power_max_w", "max_power_w", "maxPower"),
		elevationGainMeters: getFirstNum(fm, "ascent_m", "elevation_gain_m", "elevationGainMeters"),
		elevationLossMeters: getFirstNum(fm, "descent_m", "elevation_loss_m", "elevationLossMeters"),
		heartRateZones: zones.length ? zones : undefined,
		laps: laps.length ? laps : undefined,
		splits: splits.length ? splits : undefined,
	};

	return workout;
}

/**
 * Parse a Markdown or Bases file into a HealthDay.
 * Supports both:
 * - Bases format: flat YAML keys like sleep_total_hours, steps
 * - Markdown format: frontmatter with date/type fields plus optional granular tables
 */
export function parseMarkdown(
	content: string,
	cachedFrontmatter?: Record<string, unknown>
): HealthDay | null {
	const parsed = parseFrontmatter(content);
	const fm = mergeFrontmatter(parsed.frontmatter ?? {}, cachedFrontmatter);

	// Must have a date. Health.md normally emits `date`, but accept a few common
	// aliases and a title/body ISO date so markdown exports without metadata can
	// still contribute granular tables.
	const rawDate = getFirstStr(fm, "date", "Date", "day", "Day") ?? extractDateFromContent(content);
	if (!rawDate) return null;
	const date = rawDate.slice(0, 10);

	const granular = parseGranularMarkdownData(parsed.body, date);

	const day: HealthDay = {
		type: "health-data",
		date,
	};

	const workout = parseWorkoutEntry(fm, parsed.body, date);
	if (workout) {
		day.workouts = [workout];
	}

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
		day.activity || day.heart || day.sleep || day.vitals || day.mobility || day.workouts || day.hearing;
	return hasData ? day : null;
}
