import { MetadataCache, Vault, TFile, TFolder } from "obsidian";
import {
	dataFolderMaxDepth,
	matchesDataFilePath,
} from "./data-folder-layout";
import {
	DetectedSchema,
	HEALTHMD_DATA_DICTIONARY_FILENAME,
	ParsedHealthMetricDataDictionary,
	SUPPORTED_HEALTHMD_ROLLUP_SCHEMA_VERSION,
	SUPPORTED_HEALTHMD_SCHEMA_VERSION,
	detectCsvSchema,
	detectFrontmatterSchema,
	detectJsonSchema,
	parseHealthMetricDataDictionaryDetails,
	schemaVersionOf,
} from "./healthmd-schema";
import {
	HealthDay,
	HealthMdSettings,
	DataFormat,
	DataFolderGranularity,
	HealthRollupSummary,
	MedicationDoseEvent,
	MedicationInventoryItem,
	WorkoutEntry,
} from "./types";
import { parseJSON } from "./parsers/json-parser";
import { parseCSV } from "./parsers/csv-parser";
import { parseMarkdown } from "./parsers/markdown-parser";
import { parseRollupByFormat } from "./parsers/rollup-parser";

const HEALTHMD_FORMAT_FOLDERS = new Set(["Markdown", "Bases", "JSON", "CSV"]);

export interface DataLoaderSkippedFile {
	path: string;
	reason: string;
	schema?: DetectedSchema;
}

export interface DataLoaderLoadReport {
	loadedDays: number;
	loadedRollups: number;
	rollupPeriods: string[];
	schemaVersions: number[];
	skippedFiles: DataLoaderSkippedFile[];
	warnings: string[];
	dictionaryLoaded: boolean;
	dictionaryEntries: number;
}

function emptyLoadReport(): DataLoaderLoadReport {
	return {
		loadedDays: 0,
		loadedRollups: 0,
		rollupPeriods: [],
		schemaVersions: [],
		skippedFiles: [],
		warnings: [],
		dictionaryLoaded: false,
		dictionaryEntries: 0,
	};
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
	private rollupCache: HealthRollupSummary[] = [];
	private dataDictionary: ParsedHealthMetricDataDictionary | null = null;
	private lastLoad = 0;
	private TTL = 30_000;
	private lastReport: DataLoaderLoadReport = emptyLoadReport();

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
		const rollupFiles = this.getRollupFiles(pattern);
		const dictionaryLoad = await this.loadDataDictionaryAliases([...files, ...rollupFiles]);
		const frontmatterAliases = dictionaryLoad.dictionary.aliases;
		const dictionaryUnits = dictionaryLoad.dictionary.unitsByCanonicalKey;
		this.dataDictionary = dictionaryLoad.loaded ? dictionaryLoad.dictionary : null;
		const report = emptyLoadReport();
		report.dictionaryLoaded = dictionaryLoad.loaded;
		report.dictionaryEntries = dictionaryLoad.dictionary.entries.length;
		report.warnings.push(...dictionaryLoad.warnings);

		const days: HealthDay[] = [];
		const rollups: HealthRollupSummary[] = [];
		const schemaVersions = new Set<number>();
		for (const file of files) {
			if (file.name === HEALTHMD_DATA_DICTIONARY_FILENAME) {
				report.skippedFiles.push({
					path: file.path,
					reason: "data-dictionary",
					schema: { kind: "data-dictionary", version: 0, format: "json" },
				});
				continue;
			}
			const content = await this.vault.cachedRead(file);
			const format = detectFormat(file.extension, this.settings.dataFormat);
			const cachedFrontmatter = format === "markdown" || format === "bases"
				? this.metadataCache?.getFileCache(file)?.frontmatter
				: undefined;

			try {
				const parsedDays: HealthDay[] = [];
				switch (format) {
					case "json": {
						const day = parseJSON(content);
						if (day) parsedDays.push(day);
						break;
					}
					case "csv": {
						parsedDays.push(...parseCSV(content));
						break;
					}
					case "markdown":
					case "bases": {
						const day = parseMarkdown(content, cachedFrontmatter, frontmatterAliases, dictionaryUnits);
						if (day) parsedDays.push(day);
						break;
					}
				}

				if (parsedDays.length) {
					for (const day of parsedDays) {
						const version = schemaVersionOf(day);
						schemaVersions.add(version);
						if (version > SUPPORTED_HEALTHMD_SCHEMA_VERSION) {
							report.warnings.push(`${file.path} uses Health.md schema v${version}; parsing best-effort with v${SUPPORTED_HEALTHMD_SCHEMA_VERSION} support.`);
						}
						days.push(withSourcePath(day, file.path));
					}
				} else {
					this.recordSkippedFile(report, file.path, format, content, cachedFrontmatter);
				}
			} catch {
				report.skippedFiles.push({
					path: file.path,
					reason: "malformed-file",
				});
			}
		}

		for (const file of rollupFiles) {
			const content = await this.vault.cachedRead(file);
			const format = detectFormat(file.extension, this.settings.dataFormat);
			const cachedFrontmatter = format === "markdown" || format === "bases"
				? this.metadataCache?.getFileCache(file)?.frontmatter
				: undefined;
			try {
				const rollup = parseRollupByFormat(content, format, cachedFrontmatter);
				if (rollup) {
					const version = schemaVersionOf(rollup);
					schemaVersions.add(version);
					if (version > SUPPORTED_HEALTHMD_ROLLUP_SCHEMA_VERSION) {
						report.warnings.push(`${file.path} uses Health.md roll-up schema v${version}; parsing best-effort with v${SUPPORTED_HEALTHMD_ROLLUP_SCHEMA_VERSION} support.`);
					}
					rollups.push(withRollupSourcePath(rollup, file.path));
				} else {
					this.recordSkippedFile(report, file.path, format, content, cachedFrontmatter);
				}
			} catch {
				report.skippedFiles.push({
					path: file.path,
					reason: "malformed-rollup-file",
				});
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
		this.rollupCache = dedupeRollups(rollups);
		report.loadedDays = this.cache.length;
		report.loadedRollups = this.rollupCache.length;
		report.rollupPeriods = Array.from(new Set(this.rollupCache.map((rollup) => rollup.rollupPeriod))).sort();
		report.schemaVersions = Array.from(schemaVersions).sort((a, b) => a - b);
		this.lastReport = report;
		this.lastLoad = Date.now();
		return this.cache;
	}

	async loadRollups(): Promise<HealthRollupSummary[]> {
		await this.load();
		return this.rollupCache;
	}

	getLastRollups(): HealthRollupSummary[] {
		return this.rollupCache;
	}

	getDataDictionary(): ParsedHealthMetricDataDictionary | null {
		return this.dataDictionary;
	}

	getLastLoadReport(): DataLoaderLoadReport {
		return this.lastReport;
	}

	getLastLoadSummary(): string {
		const report = this.lastReport;
		const versions = report.schemaVersions.length
			? report.schemaVersions.map((version) => `v${version}`).join(", ")
			: "none detected";
		const skipped = report.skippedFiles.length
			? `; skipped ${report.skippedFiles.length} non-daily/unsupported file${report.skippedFiles.length === 1 ? "" : "s"}`
			: "";
		const dictionary = report.dictionaryLoaded ? `; data dictionary loaded (${report.dictionaryEntries} entries)` : "";
		const rollups = report.loadedRollups
			? `; indexed ${report.loadedRollups} roll-up${report.loadedRollups === 1 ? "" : "s"}${report.rollupPeriods.length ? ` (${report.rollupPeriods.join(", ")})` : ""}`
			: "";
		const warnings = report.warnings.length ? `; ${report.warnings.length} warning${report.warnings.length === 1 ? "" : "s"}` : "";
		return `Loaded ${report.loadedDays} health day${report.loadedDays === 1 ? "" : "s"} from Health.md schemas ${versions}${skipped}${dictionary}${rollups}${warnings}.`;
	}

	private async loadDataDictionaryAliases(files: TFile[]): Promise<{ dictionary: ParsedHealthMetricDataDictionary; loaded: boolean; warnings: string[] }> {
		const dictionaryFiles = new Map<string, TFile>();
		for (const file of files) {
			if (file.name === HEALTHMD_DATA_DICTIONARY_FILENAME) {
				dictionaryFiles.set(file.path, file);
			}
		}

		const rootDictionary = this.vault.getAbstractFileByPath(
			`${this.settings.dataFolder.replace(/\/+$/g, "")}/${HEALTHMD_DATA_DICTIONARY_FILENAME}`
		);
		if (rootDictionary instanceof TFile) {
			dictionaryFiles.set(rootDictionary.path, rootDictionary);
		}

		const mergedDictionary: ParsedHealthMetricDataDictionary = {
			entries: [],
			aliases: {},
			unitsByCanonicalKey: {},
			dailyAggregationByCanonicalKey: {},
			healthKitAggregationByCanonicalKey: {},
			rollupByCanonicalKey: {},
			schemaVersion: 0,
		};
		const warnings: string[] = [];
		let loaded = false;
		for (const file of dictionaryFiles.values()) {
			try {
				const dictionary = parseHealthMetricDataDictionaryDetails(await this.vault.cachedRead(file));
				mergedDictionary.entries.push(...dictionary.entries);
				Object.assign(mergedDictionary.aliases, dictionary.aliases);
				Object.assign(mergedDictionary.unitsByCanonicalKey, dictionary.unitsByCanonicalKey);
				Object.assign(mergedDictionary.dailyAggregationByCanonicalKey, dictionary.dailyAggregationByCanonicalKey);
				Object.assign(mergedDictionary.healthKitAggregationByCanonicalKey, dictionary.healthKitAggregationByCanonicalKey);
				Object.assign(mergedDictionary.rollupByCanonicalKey, dictionary.rollupByCanonicalKey);
				mergedDictionary.schemaVersion = Math.max(mergedDictionary.schemaVersion, dictionary.schemaVersion);
				if (dictionary.schemaVersion > SUPPORTED_HEALTHMD_SCHEMA_VERSION) {
					warnings.push(`${file.path} data dictionary uses Health.md schema v${dictionary.schemaVersion}; alias mapping is best-effort.`);
				}
				loaded = true;
			} catch {
				// Ignore malformed or transiently unreadable dictionary files.
			}
		}
		return { dictionary: mergedDictionary, loaded, warnings };
	}

	private recordSkippedFile(
		report: DataLoaderLoadReport,
		path: string,
		format: DataFormat,
		content: string,
		frontmatter?: Record<string, unknown>
	): void {
		const schema = this.detectSchema(format, content, frontmatter);
		let reason = "not-health-data";
		if (schema.kind === "rollup-summary") reason = "rollup-summary";
		else if (schema.kind === "data-dictionary") reason = "data-dictionary";
		else if (schema.kind === "unknown") reason = schema.reason ?? "unsupported-schema";
		report.skippedFiles.push({ path, reason, schema });
		if (schema.isFutureVersion) {
			report.warnings.push(`${path} uses future Health.md schema v${schema.version}; update the plugin if data looks incomplete.`);
		}
	}

	private detectSchema(
		format: DataFormat,
		content: string,
		frontmatter?: Record<string, unknown>
	): DetectedSchema {
		switch (format) {
			case "json":
				return detectJsonSchema(content);
			case "csv":
				return detectCsvSchema(content);
			case "markdown":
			case "bases":
				return detectFrontmatterSchema(frontmatter);
			default:
				return { kind: "unknown", version: 0, format: "unknown", reason: "Unsupported file extension" };
		}
	}

	invalidate(): void {
		this.cache = null;
		this.rollupCache = [];
		this.dataDictionary = null;
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

	private getRollupFiles(pattern: string): TFile[] {
		const roots: TFolder[] = [];
		const configuredFolder = this.vault.getAbstractFileByPath(this.settings.dataFolder);
		if (configuredFolder instanceof TFolder) roots.push(configuredFolder);
		if (this.settings.dataFolder === "Health" && roots.length === 0) {
			for (const fallbackPath of ["examples/Health", "exports/Health"]) {
				const bundledFolder = this.vault.getAbstractFileByPath(fallbackPath);
				if (bundledFolder instanceof TFolder) roots.push(bundledFolder);
			}
		}

		const files: TFile[] = [];
		for (const root of roots) {
			const rollupsFolder = this.vault.getAbstractFileByPath(`${root.path}/Rollups`);
			if (rollupsFolder instanceof TFolder) {
				this.collectRollupFiles(rollupsFolder, rollupsFolder.path, pattern, files);
			}
		}
		const byPath = new Map<string, TFile>();
		for (const file of files) byPath.set(file.path, file);
		return Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path));
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

		// Health.md can organize daily exports into first-level format folders
		// (Markdown/, Bases/, JSON/, CSV/) while keeping the data folder setting at
		// Health/. Discover those folders even when the user leaves granularity flat.
		for (const child of folder.children) {
			if (child instanceof TFolder && HEALTHMD_FORMAT_FOLDERS.has(child.name)) {
				this.collectMatchingFiles(
					child,
					folder.path,
					pattern,
					Math.max(4, dataFolderMaxDepth(granularity, this.settings.dataFolderCustomPathTemplate)),
					1,
					files
				);
			}
		}

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

	private collectRollupFiles(
		folder: TFolder,
		rootPath: string,
		pattern: string,
		files: TFile[],
		depth = 0
	): void {
		if (depth > 5) return;
		for (const child of folder.children) {
			if (child instanceof TFile) {
				if (this.matchesRollupFile(child, rootPath, pattern)) files.push(child);
				continue;
			}
			if (child instanceof TFolder) {
				this.collectRollupFiles(child, rootPath, pattern, files, depth + 1);
			}
		}
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
				if (this.isRollupsFolder(child, rootPath)) continue;
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

	private isRollupsFolder(folder: TFolder, rootPath: string): boolean {
		const relative = folder.path.startsWith(`${rootPath}/`)
			? folder.path.slice(rootPath.length + 1)
			: folder.path;
		return relative.split("/")[0] === "Rollups";
	}

	private matchesDataFile(file: TFile, rootPath: string, pattern: string): boolean {
		if (file.path.startsWith(`${rootPath}/Rollups/`)) return false;
		return matchesDataFilePath({
			name: file.name,
			extension: file.extension,
			path: file.path,
			rootPath,
			pattern,
		});
	}

	private matchesRollupFile(file: TFile, rootPath: string, pattern: string): boolean {
		if (file.name === HEALTHMD_DATA_DICTIONARY_FILENAME) return false;
		if (!["json", "csv", "md"].includes(file.extension)) return false;
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

function withRollupSourcePath(rollup: HealthRollupSummary, path: string): HealthRollupSummary {
	return {
		...rollup,
		sourcePaths: mergeSourcePaths(rollup.sourcePaths, [path]),
	};
}

function rollupKey(rollup: HealthRollupSummary): string {
	return `${rollup.rollupPeriod}|${rollup.periodId}`;
}

function rollupDetailScore(rollup: HealthRollupSummary): number {
	return schemaVersionOf(rollup) * 1000 + Object.values(rollup).filter((value) => {
		if (Array.isArray(value)) return value.length > 0;
		if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
		return value !== undefined && value !== null && value !== "";
	}).length;
}

function mergeRollups(a: HealthRollupSummary, b: HealthRollupSummary): HealthRollupSummary {
	const preferred = rollupDetailScore(b) >= rollupDetailScore(a) ? b : a;
	const fallback = preferred === b ? a : b;
	const schemaVersion = Math.max(schemaVersionOf(a), schemaVersionOf(b));
	return {
		...fallback,
		...preferred,
		schemaVersion: schemaVersion || undefined,
		schema_version: schemaVersion || undefined,
		metrics: {
			...(fallback.metrics ?? {}),
			...(preferred.metrics ?? {}),
		},
		sourcePaths: mergeSourcePaths(a.sourcePaths, b.sourcePaths),
	};
}

function dedupeRollups(rollups: HealthRollupSummary[]): HealthRollupSummary[] {
	const byPeriod = new Map<string, HealthRollupSummary>();
	for (const rollup of rollups) {
		const key = rollupKey(rollup);
		const existing = byPeriod.get(key);
		byPeriod.set(key, existing ? mergeRollups(existing, rollup) : rollup);
	}
	return Array.from(byPeriod.values()).sort((a, b) => {
		const startCompare = (a.startDate ?? "").localeCompare(b.startDate ?? "");
		return startCompare || a.rollupPeriod.localeCompare(b.rollupPeriod) || a.periodId.localeCompare(b.periodId);
	});
}

function workoutDetailScore(workout: WorkoutEntry): number {
	let score = 0;
	for (const value of Object.values(workout)) {
		if (Array.isArray(value)) score += value.length * 3;
		else if (value && typeof value === "object") score += Object.keys(value as Record<string, unknown>).length * 2;
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

function medicationDetailKey(item: MedicationInventoryItem): string {
	return (item.conceptIdentifier ?? item.concept_identifier ?? item.name ?? item.displayName ?? item.display_name ?? "").toLowerCase().trim();
}

function mergeMedicationDetails(
	a: MedicationInventoryItem[] | undefined,
	b: MedicationInventoryItem[] | undefined
): MedicationInventoryItem[] | undefined {
	const all = [...(a ?? []), ...(b ?? [])];
	if (!all.length) return undefined;
	const byKey = new Map<string, MedicationInventoryItem>();
	const unkeyed: MedicationInventoryItem[] = [];
	for (const item of all) {
		const key = medicationDetailKey(item);
		if (!key) {
			unkeyed.push(item);
			continue;
		}
		const existing = byKey.get(key);
		byKey.set(key, existing ? { ...existing, ...item } : item);
	}
	return [...Array.from(byKey.values()), ...unkeyed].sort((left, right) =>
		(left.displayName ?? left.display_name ?? left.name ?? "").localeCompare(right.displayName ?? right.display_name ?? right.name ?? "")
	);
}

function medicationDoseEventKey(event: MedicationDoseEvent): string {
	return (event.id ?? `${event.scheduledDate ?? event.scheduled_date ?? event.startDate ?? event.start_date ?? ""}|${event.name ?? ""}|${event.status ?? ""}`).toLowerCase().trim();
}

function mergeMedicationDoseEvents(
	a: MedicationDoseEvent[] | undefined,
	b: MedicationDoseEvent[] | undefined
): MedicationDoseEvent[] | undefined {
	const all = [...(a ?? []), ...(b ?? [])];
	if (!all.length) return undefined;
	const byKey = new Map<string, MedicationDoseEvent>();
	const unkeyed: MedicationDoseEvent[] = [];
	for (const event of all) {
		const key = medicationDoseEventKey(event);
		if (!key || key.startsWith("||")) {
			unkeyed.push(event);
			continue;
		}
		const existing = byKey.get(key);
		byKey.set(key, existing ? { ...existing, ...event } : event);
	}
	return [...Array.from(byKey.values()), ...unkeyed].sort((left, right) => {
		const leftDate = left.scheduledDate ?? left.scheduled_date ?? left.startDate ?? left.start_date ?? "";
		const rightDate = right.scheduledDate ?? right.scheduled_date ?? right.startDate ?? right.start_date ?? "";
		return leftDate.localeCompare(rightDate);
	});
}

function mergeStringLists(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
	const merged = [...(a ?? []), ...(b ?? [])].filter(Boolean);
	if (!merged.length) return undefined;
	return Array.from(new Set(merged)).sort((left, right) => left.localeCompare(right));
}

function objectDetailScore(value: unknown): number {
	if (!value || typeof value !== "object") return 0;
	let score = 0;
	for (const item of Object.values(value as Record<string, unknown>)) {
		if (Array.isArray(item)) score += item.length * 3;
		else if (item && typeof item === "object") score += Object.keys(item).length * 2;
		else if (item !== undefined && item !== null && item !== "") score += 1;
	}
	return score;
}

function dayDetailScore(day: HealthDay): number {
	return schemaVersionOf(day) * 1000 +
		objectDetailScore(day.activity) +
		objectDetailScore(day.heart) +
		objectDetailScore(day.vitals) +
		objectDetailScore(day.sleep) +
		objectDetailScore(day.mobility) +
		objectDetailScore(day.mood) +
		objectDetailScore(day.mindfulness) +
		objectDetailScore(day.hearing) +
		objectDetailScore({
			medicationCount: day.medicationCount ?? day.medication_count,
			activeMedicationCount: day.activeMedicationCount ?? day.active_medication_count,
			archivedMedicationCount: day.archivedMedicationCount ?? day.archived_medication_count,
			medicationDoseCount: day.medicationDoseCount ?? day.medication_dose_count,
			medicationTakenCount: day.medicationTakenCount ?? day.medication_taken_count,
			medicationSkippedCount: day.medicationSkippedCount ?? day.medication_skipped_count,
			medications: day.medications,
			medicationDetails: day.medicationDetails ?? day.medication_details,
			medicationDoseEvents: day.medicationDoseEvents ?? day.medication_dose_events,
		}) +
		(day.workouts ?? []).reduce((sum, workout) => sum + workoutDetailScore(workout), 0);
}

function preferMeaningfulValue(fallback: unknown, preferred: unknown): unknown {
	if (preferred === undefined || preferred === null || preferred === "") return fallback;
	if (Array.isArray(preferred) && preferred.length === 0 && Array.isArray(fallback) && fallback.length > 0) return fallback;
	if (typeof preferred === "number" && preferred === 0 && typeof fallback === "number" && fallback !== 0) return fallback;
	return preferred;
}

function mergeSection<T extends object>(
	fallback: T | undefined,
	preferred: T | undefined
): T | undefined {
	if (!fallback) return preferred;
	if (!preferred) return fallback;
	const fallbackRecord = fallback as Record<string, unknown>;
	const merged: Record<string, unknown> = { ...fallbackRecord };
	for (const [key, value] of Object.entries(preferred)) {
		merged[key] = preferMeaningfulValue(fallbackRecord[key], value);
	}
	return merged as T;
}

/** Merge two HealthDay objects for the same date, preferring newer schema/richer fields. */
function mergeDays(a: HealthDay, b: HealthDay): HealthDay {
	const preferred = dayDetailScore(b) >= dayDetailScore(a) ? b : a;
	const fallback = preferred === b ? a : b;
	const schemaVersion = Math.max(schemaVersionOf(a), schemaVersionOf(b));
	const unitSystem = preferred.unitSystem ?? preferred.unit_system ?? fallback.unitSystem ?? fallback.unit_system;

	return {
		type: "health-data",
		date: a.date,
		schema: preferred.schema ?? fallback.schema,
		schemaVersion: schemaVersion || undefined,
		schema_version: schemaVersion || undefined,
		sourcePaths: mergeSourcePaths(a.sourcePaths, b.sourcePaths),
		units: preferred.units ?? fallback.units,
		unitSystem,
		unit_system: unitSystem,
		activity: mergeSection(fallback.activity, preferred.activity),
		heart: mergeSection(fallback.heart, preferred.heart),
		vitals: mergeSection(fallback.vitals, preferred.vitals),
		sleep: mergeSection(fallback.sleep, preferred.sleep),
		mobility: mergeSection(fallback.mobility, preferred.mobility),
		workouts: mergeWorkouts(a.workouts, b.workouts),
		mood: mergeSection(fallback.mood, preferred.mood),
		mindfulness: mergeSection(fallback.mindfulness, preferred.mindfulness),
		medicationCount: preferMeaningfulValue(fallback.medicationCount ?? fallback.medication_count, preferred.medicationCount ?? preferred.medication_count) as number | undefined,
		medication_count: preferMeaningfulValue(fallback.medication_count ?? fallback.medicationCount, preferred.medication_count ?? preferred.medicationCount) as number | undefined,
		activeMedicationCount: preferMeaningfulValue(fallback.activeMedicationCount ?? fallback.active_medication_count, preferred.activeMedicationCount ?? preferred.active_medication_count) as number | undefined,
		active_medication_count: preferMeaningfulValue(fallback.active_medication_count ?? fallback.activeMedicationCount, preferred.active_medication_count ?? preferred.activeMedicationCount) as number | undefined,
		archivedMedicationCount: preferMeaningfulValue(fallback.archivedMedicationCount ?? fallback.archived_medication_count, preferred.archivedMedicationCount ?? preferred.archived_medication_count) as number | undefined,
		archived_medication_count: preferMeaningfulValue(fallback.archived_medication_count ?? fallback.archivedMedicationCount, preferred.archived_medication_count ?? preferred.archivedMedicationCount) as number | undefined,
		medicationDoseCount: preferMeaningfulValue(fallback.medicationDoseCount ?? fallback.medication_dose_count, preferred.medicationDoseCount ?? preferred.medication_dose_count) as number | undefined,
		medication_dose_count: preferMeaningfulValue(fallback.medication_dose_count ?? fallback.medicationDoseCount, preferred.medication_dose_count ?? preferred.medicationDoseCount) as number | undefined,
		medicationTakenCount: preferMeaningfulValue(fallback.medicationTakenCount ?? fallback.medication_taken_count, preferred.medicationTakenCount ?? preferred.medication_taken_count) as number | undefined,
		medication_taken_count: preferMeaningfulValue(fallback.medication_taken_count ?? fallback.medicationTakenCount, preferred.medication_taken_count ?? preferred.medicationTakenCount) as number | undefined,
		medicationSkippedCount: preferMeaningfulValue(fallback.medicationSkippedCount ?? fallback.medication_skipped_count, preferred.medicationSkippedCount ?? preferred.medication_skipped_count) as number | undefined,
		medication_skipped_count: preferMeaningfulValue(fallback.medication_skipped_count ?? fallback.medicationSkippedCount, preferred.medication_skipped_count ?? preferred.medicationSkippedCount) as number | undefined,
		medications: mergeStringLists(fallback.medications, preferred.medications),
		medicationDetails: mergeMedicationDetails(fallback.medicationDetails ?? fallback.medication_details, preferred.medicationDetails ?? preferred.medication_details),
		medication_details: mergeMedicationDetails(fallback.medication_details ?? fallback.medicationDetails, preferred.medication_details ?? preferred.medicationDetails),
		medicationDoseEvents: mergeMedicationDoseEvents(fallback.medicationDoseEvents ?? fallback.medication_dose_events, preferred.medicationDoseEvents ?? preferred.medication_dose_events),
		medication_dose_events: mergeMedicationDoseEvents(fallback.medication_dose_events ?? fallback.medicationDoseEvents, preferred.medication_dose_events ?? preferred.medicationDoseEvents),
		hearing: mergeSection(fallback.hearing, preferred.hearing),
	};
}
