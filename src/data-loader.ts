import { Vault, TFile, TFolder } from "obsidian";
import {
	dataFolderMaxDepth,
	matchesDataFilePath,
} from "./data-folder-layout";
import {
	HealthDay,
	HealthMdSettings,
	DataFormat,
	DataFolderGranularity,
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

	constructor(private vault: Vault, private settings: HealthMdSettings) {}

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
						const day = parseMarkdown(content);
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
			dataFolderMaxDepth(granularity),
			0,
			files
		);
		return files.sort((a, b) => a.path.localeCompare(b.path));
	}

	private collectMatchingFiles(
		folder: TFolder,
		rootPath: string,
		pattern: string,
		maxDepth: number,
		depth: number,
		files: TFile[]
	): void {
		for (const child of folder.children) {
			if (child instanceof TFile) {
				if (this.matchesDataFile(child, rootPath, pattern)) {
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
					files
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
		workouts: a.workouts ?? b.workouts,
		hearing: a.hearing ?? b.hearing,
	};
}
