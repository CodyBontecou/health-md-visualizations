import { MetadataCache, Vault, TFile, TFolder } from "obsidian";
import {
	dataFolderMaxDepth,
	matchesDataFilePath,
} from "./data-folder-layout";
import {
	HealthDay,
	HealthMdSettings,
	DataFormat,
	DataFolderGranularity,
	WorkoutEntry,
} from "./types";
import { parseJSON } from "./parsers/json-parser";
import { parseCSV } from "./parsers/csv-parser";
import { parseMarkdown } from "./parsers/markdown-parser";

function detectFormat(extension: string, configFormat: DataFormat): DataFormat {
	if (configFormat !== "auto") return configFormat;
	switch (extension) {
		case "json":
			return "json";
		case "csv":
			return "csv";
		case "md":
			return "markdown"; // works for both markdown and bases (same parser)
		default:
			return "json";
	}
}

export class DataLoader {
	private cache: HealthDay[] | null = null;
	private lastLoad = 0;
	private TTL = 30_000;

	constructor(
		private vault: Vault,
		private settings: HealthMdSettings,
		private metadataCache?: MetadataCache
	) {}

	async load(): Promise<HealthDay[]> {
		if (this.cache && Date.now() - this.lastLoad < this.TTL) {
			return this.cache;
		}

		const pattern = this.settings.filePattern || "*";
		const files = this.getDataFiles(pattern);

		const days: HealthDay[] = [];
		for (const file of files) {
			const content = await this.vault.cachedRead(file);
			const format = detectFormat(file.extension, this.settings.dataFormat);

			try {
				switch (format) {
					case "json": {
						const day = parseJSON(content);
						if (day) days.push(withSourcePath(day, file.path));
						break;
					}
					case "csv": {
						const csvDays = parseCSV(content);
						days.push(...csvDays.map((day) => withSourcePath(day, file.path)));
						break;
					}
					case "markdown":
					case "bases": {
						const cachedFrontmatter = this.metadataCache?.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
						const day = parseMarkdown(content, cachedFrontmatter);
						if (day) days.push(withSourcePath(day, file.path));
						break;
					}
				}
			} catch {
				// skip malformed files
			}
		}

		// Deduplicate by date (prefer the entry with more data)
		const byDate = new Map<string, HealthDay>();
		for (const day of days) {
			const existing = byDate.get(day.date);
			if (!existing) {
				byDate.set(day.date, day);
			} else {
				byDate.set(day.date, mergeDays(existing, day));
			}
		}

		this.cache = Array.from(byDate.values()).sort((a, b) =>
			a.date.localeCompare(b.date)
		);
		this.lastLoad = Date.now();
		return this.cache;
	}

	invalidate(): void {
		this.cache = null;
	}

	private getDataFiles(pattern: string): TFile[] {
		const granularity = this.settings.dataFolderGranularity ?? "flat";
		const configuredFolder = this.vault.getAbstractFileByPath(this.settings.dataFolder);
		if (configuredFolder instanceof TFolder) {
			const files = this.getMatchingFiles(configuredFolder, pattern, granularity);
			if (files.length > 0 || this.settings.dataFolder !== "Health") {
				return files;
			}
		}

		// Cloned copies of this repository ship example data in examples/Health,
		// while the production default remains Health/ for app-generated exports.
		if (this.settings.dataFolder === "Health") {
			for (const fallbackPath of ["examples/Health", "exports/Health"]) {
				const bundledFolder = this.vault.getAbstractFileByPath(fallbackPath);
				if (bundledFolder instanceof TFolder) {
					const files = this.getMatchingFiles(bundledFolder, pattern, granularity);
					if (files.length > 0) return files;
				}
			}
		}

		return [];
	}

	private getMatchingFiles(
		folder: TFolder,
		pattern: string,
		granularity: DataFolderGranularity
	): TFile[] {
		const files: TFile[] = [];
		this.collectMatchingFiles(
			folder,
			folder.path,
			pattern,
			dataFolderMaxDepth(
				granularity,
				this.settings.dataFolderCustomPathTemplate
			),
			0,
			files
		);

		// Health.md's individual workout exporter commonly writes Markdown notes
		// into metric-specific subfolders. Keep the existing flat JSON/CSV behavior,
		// but always allow Markdown workout notes a modest recursive search so they
		// are discovered without requiring users to change the folder granularity.
		this.collectMatchingFiles(
			folder,
			folder.path,
			pattern,
			Math.max(4, dataFolderMaxDepth(granularity, this.settings.dataFolderCustomPathTemplate)),
			0,
			files,
			"md"
		);

		const byPath = new Map<string, TFile>();
		for (const file of files) byPath.set(file.path, file);
		return Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path));
	}

	private collectMatchingFiles(
		folder: TFolder,
		rootPath: string,
		pattern: string,
		maxDepth: number,
		depth: number,
		files: TFile[],
		extension?: string
	): void {
		for (const child of folder.children) {
			if (child instanceof TFile) {
				if (
					(!extension || child.extension === extension) &&
					this.matchesDataFile(child, rootPath, pattern)
				) {
					files.push(child);
				}
				continue;
			}

			if (child instanceof TFolder && depth < maxDepth) {
				this.collectMatchingFiles(
					child,
					rootPath,
					pattern,
					maxDepth,
					depth + 1,
					files,
					extension
				);
			}
		}
	}

	private matchesDataFile(file: TFile, rootPath: string, pattern: string): boolean {
		return matchesDataFilePath({
			name: file.name,
			extension: file.extension,
			path: file.path,
			rootPath,
			pattern,
		});
	}
}

function mergeSourcePaths(...pathLists: Array<string[] | undefined>): string[] | undefined {
	const paths = new Set<string>();
	for (const list of pathLists) {
		list?.forEach((path) => paths.add(path));
	}
	return paths.size ? Array.from(paths).sort((a, b) => a.localeCompare(b)) : undefined;
}

function withSourcePath(day: HealthDay, path: string): HealthDay {
	return {
		...day,
		sourcePaths: mergeSourcePaths(day.sourcePaths, [path]),
	};
}

function workoutDetailScore(workout: WorkoutEntry): number {
	let score = 0;
	for (const value of Object.values(workout)) {
		if (Array.isArray(value)) score += value.length * 3;
		else if (value && typeof value === "object") score += Object.keys(value).length * 2;
		else if (value !== undefined && value !== null && value !== "") score += 1;
	}
	return score;
}

function workoutKey(workout: WorkoutEntry): string {
	const type = (workout.sport ?? workout.type ?? "workout").toLowerCase().trim();
	const start = workout.startTimeISO ?? workout.startTime ?? "";
	const duration = Number.isFinite(workout.duration) ? Math.round(workout.duration) : 0;
	const distance = workout.distanceMeters ?? workout.distance ?? 0;
	return `${start}|${type}|${duration}|${Math.round(distance)}`;
}

function preferArray<T>(next: T[] | undefined, prev: T[] | undefined): T[] | undefined {
	if (next && next.length) return next;
	return prev && prev.length ? prev : undefined;
}

function mergeWorkoutEntries(a: WorkoutEntry, b: WorkoutEntry): WorkoutEntry {
	const preferred = workoutDetailScore(b) >= workoutDetailScore(a) ? b : a;
	const fallback = preferred === b ? a : b;
	const merged: Record<string, unknown> = { ...fallback };
	for (const [key, value] of Object.entries(preferred)) {
		if (value !== undefined && value !== null) merged[key] = value;
	}

	return {
		...(merged as unknown as WorkoutEntry),
		heartRateZones: preferArray(preferred.heartRateZones, fallback.heartRateZones),
		laps: preferArray(preferred.laps, fallback.laps),
		splits: preferArray(preferred.splits, fallback.splits),
		route: preferArray(preferred.route, fallback.route),
		timeSeries: preferred.timeSeries ?? fallback.timeSeries,
	};
}

function mergeWorkouts(a: WorkoutEntry[] | undefined, b: WorkoutEntry[] | undefined): WorkoutEntry[] | undefined {
	const all = [...(a ?? []), ...(b ?? [])];
	if (!all.length) return undefined;
	const byKey = new Map<string, WorkoutEntry>();
	const unkeyed: WorkoutEntry[] = [];
	for (const workout of all) {
		const key = workoutKey(workout);
		if (key.startsWith("|") || key.includes("||0|0")) {
			unkeyed.push(workout);
			continue;
		}
		const existing = byKey.get(key);
		byKey.set(key, existing ? mergeWorkoutEntries(existing, workout) : workout);
	}
	return [...Array.from(byKey.values()), ...unkeyed].sort((left, right) => {
		const aStart = left.startTimeISO ?? left.startTime ?? "";
		const bStart = right.startTimeISO ?? right.startTime ?? "";
		return aStart.localeCompare(bStart);
	});
}

/** Merge two HealthDay objects for the same date, preferring non-null fields */
function mergeDays(a: HealthDay, b: HealthDay): HealthDay {
	return {
		type: "health-data",
		date: a.date,
		sourcePaths: mergeSourcePaths(a.sourcePaths, b.sourcePaths),
		units: a.units ?? b.units,
		activity: a.activity ?? b.activity,
		heart: a.heart ?? b.heart,
		vitals: a.vitals ?? b.vitals,
		sleep: a.sleep ?? b.sleep,
		mobility: a.mobility ?? b.mobility,
		workouts: mergeWorkouts(a.workouts, b.workouts),
		hearing: a.hearing ?? b.hearing,
	};
}
