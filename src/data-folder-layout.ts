import type { DataFolderGranularity } from "./types";

export const SUPPORTED_DATA_EXTENSIONS = ["json", "csv", "md"] as const;
export const DEFAULT_CUSTOM_DATA_FOLDER_PATH_TEMPLATE = "{year}/{month}/{day}";
export const DATA_FOLDER_PATH_TEMPLATE_VARIABLES = [
	"year",
	"month",
	"week",
	"day",
	"date",
] as const;

const MAX_CUSTOM_DATA_FOLDER_DEPTH = 8;

const PREDEFINED_DATA_FOLDER_MAX_DEPTH: Record<
	Exclude<DataFolderGranularity, "custom">,
	number
> = {
	flat: 0,
	year: 1,
	month: 2,
	week: 3,
	day: 4,
};

type DataFolderPathTemplateVariable =
	(typeof DATA_FOLDER_PATH_TEMPLATE_VARIABLES)[number];

export interface DataFilePathCandidate {
	name: string;
	extension: string;
	path: string;
	rootPath: string;
	pattern: string;
}

export interface DataFolderPathTemplateDateParts {
	year: string;
	month: string;
	week: string;
	day: string;
	date: string;
}

export function dataFolderMaxDepth(
	granularity: DataFolderGranularity,
	customTemplate = DEFAULT_CUSTOM_DATA_FOLDER_PATH_TEMPLATE
): number {
	if (granularity === "custom") {
		return customDataFolderPathTemplateDepth(customTemplate);
	}
	return PREDEFINED_DATA_FOLDER_MAX_DEPTH[granularity];
}

export function shouldDescendIntoDataFolderDepth(
	granularity: DataFolderGranularity,
	depth: number,
	customTemplate = DEFAULT_CUSTOM_DATA_FOLDER_PATH_TEMPLATE
): boolean {
	return depth < dataFolderMaxDepth(granularity, customTemplate);
}

export function customDataFolderPathTemplateDepth(template: string): number {
	const normalized = normalizeDataFolderPathTemplate(template);
	if (!normalized) return 0;
	return Math.min(normalized.split("/").length, MAX_CUSTOM_DATA_FOLDER_DEPTH);
}

export function normalizeDataFolderPathTemplate(template: string): string {
	const normalized = stripPathControlCharacters(
		template.trim().replace(/\\/g, "/")
	)
		.replace(/\/+$/g, "")
		.replace(/^\/+|\/+$/g, "")
		.replace(/\/+/g, "/");

	const safeSegments = normalized
		.split("/")
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0 && segment !== "." && segment !== "..")
		.slice(0, MAX_CUSTOM_DATA_FOLDER_DEPTH);

	return safeSegments.join("/") || DEFAULT_CUSTOM_DATA_FOLDER_PATH_TEMPLATE;
}

export function dataFolderPathTemplateDateParts(
	value: Date | string
): DataFolderPathTemplateDateParts {
	const date = parseTemplateDate(value);
	const year = String(date.getUTCFullYear());
	const month = pad2(date.getUTCMonth() + 1);
	const day = pad2(date.getUTCDate());
	return {
		year,
		month,
		week: `W${pad2(isoWeekNumber(date))}`,
		day,
		date: `${year}-${month}-${day}`,
	};
}

export function renderDataFolderPathTemplate(
	template: string,
	value: Date | string
): string {
	const normalized = normalizeDataFolderPathTemplate(template);
	const parts = dataFolderPathTemplateDateParts(value);
	return normalized.replace(
		/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,
		(match: string, name: string): string => {
			if (isDataFolderPathTemplateVariable(name)) {
				return parts[name];
			}
			return match;
		}
	);
}

export function isSupportedDataExtension(extension: string): boolean {
	return (SUPPORTED_DATA_EXTENSIONS as readonly string[]).includes(extension);
}

export function matchesGlob(candidate: string, pattern: string): boolean {
	if (!pattern || pattern === "*" || pattern === "*.*") return true;

	// Simple glob: support * and ? wildcards
	const regex = new RegExp(
		"^" +
			pattern
				.replace(/[.+^${}()|[\]\\]/g, "\\$&")
				.replace(/\*/g, ".*")
				.replace(/\?/g, ".") +
			"$",
		"i"
	);
	return regex.test(candidate);
}

export function relativePathFromRoot(rootPath: string, filePath: string): string {
	const normalizedRoot = rootPath.replace(/\/+$/g, "");
	if (!normalizedRoot) return filePath;
	const prefix = `${normalizedRoot}/`;
	return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath;
}

export function matchesDataFilePath({
	name,
	extension,
	path,
	rootPath,
	pattern,
}: DataFilePathCandidate): boolean {
	if (!isSupportedDataExtension(extension)) return false;
	if (matchesGlob(name, pattern)) return true;
	return matchesGlob(relativePathFromRoot(rootPath, path), pattern);
}

function stripPathControlCharacters(value: string): string {
	let result = "";
	for (const character of value) {
		const codePoint = character.codePointAt(0) ?? 0;
		if (codePoint >= 0x20 && codePoint !== 0x7f) {
			result += character;
		}
	}
	return result;
}

function isDataFolderPathTemplateVariable(
	value: string
): value is DataFolderPathTemplateVariable {
	return (DATA_FOLDER_PATH_TEMPLATE_VARIABLES as readonly string[]).includes(value);
}

function parseTemplateDate(value: Date | string): Date {
	if (value instanceof Date) {
		return new Date(Date.UTC(
			value.getFullYear(),
			value.getMonth(),
			value.getDate()
		));
	}

	const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (dateMatch) {
		return new Date(Date.UTC(
			Number(dateMatch[1]),
			Number(dateMatch[2]) - 1,
			Number(dateMatch[3])
		));
	}

	const parsed = new Date(value);
	if (!Number.isNaN(parsed.getTime())) {
		return new Date(Date.UTC(
			parsed.getFullYear(),
			parsed.getMonth(),
			parsed.getDate()
		));
	}

	return new Date(Date.UTC(1970, 0, 1));
}

function isoWeekNumber(date: Date): number {
	const weekDate = new Date(Date.UTC(
		date.getUTCFullYear(),
		date.getUTCMonth(),
		date.getUTCDate()
	));
	const day = weekDate.getUTCDay() || 7;
	weekDate.setUTCDate(weekDate.getUTCDate() + 4 - day);
	const yearStart = new Date(Date.UTC(weekDate.getUTCFullYear(), 0, 1));
	return Math.ceil(((weekDate.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function pad2(value: number): string {
	return String(value).padStart(2, "0");
}
