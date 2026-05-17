import { Vault, TFile, TFolder } from "obsidian";
import { HealthDay, HealthMdSettings, DataFormat } from "./types";
import { parseJSON } from "./parsers/json-parser";
import { parseCSV } from "./parsers/csv-parser";
import { parseMarkdown } from "./parsers/markdown-parser";

const SUPPORTED_EXTENSIONS = ["json", "csv", "md"];

function matchesGlob(filename: string, pattern: string): boolean {
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
	return regex.test(filename);
}

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
						if (day) days.push(day);
						break;
					}
					case "csv": {
						const csvDays = parseCSV(content);
						days.push(...csvDays);
						break;
					}
					case "markdown":
					case "bases": {
						const day = parseMarkdown(content);
						if (day) days.push(day);
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
		const configuredFolder = this.vault.getAbstractFileByPath(this.settings.dataFolder);
		if (configuredFolder instanceof TFolder) {
			const files = this.getMatchingFiles(configuredFolder, pattern);
			if (files.length > 0 || this.settings.dataFolder !== "Health") {
				return files;
			}
		}

		// Cloned copies of this repository ship example data in exports/Health,
		// while the production default remains Health/ for app-generated exports.
		if (this.settings.dataFolder === "Health") {
			const bundledFolder = this.vault.getAbstractFileByPath("exports/Health");
			if (bundledFolder instanceof TFolder) {
				const files = this.getMatchingFiles(bundledFolder, pattern);
				if (files.length > 0) return files;
			}
		}

		return [];
	}

	private getMatchingFiles(folder: TFolder, pattern: string): TFile[] {
		return folder.children.filter((f): f is TFile => {
			if (!(f instanceof TFile)) return false;
			if (!SUPPORTED_EXTENSIONS.includes(f.extension)) return false;
			return matchesGlob(f.name, pattern);
		});
	}
}

/** Merge two HealthDay objects for the same date, preferring non-null fields */
function mergeDays(a: HealthDay, b: HealthDay): HealthDay {
	return {
		type: "health-data",
		date: a.date,
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
