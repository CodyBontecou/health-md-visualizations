import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

let tempDir;
let harnessPromise;

async function loadDataLoaderHarness() {
	if (harnessPromise) return harnessPromise;

	harnessPromise = (async () => {
		tempDir = await mkdtemp(path.join(os.tmpdir(), "health-md-data-loader-tests-"));
		const shimPath = path.join(tempDir, "obsidian-shim.ts");
		const harnessPath = path.join(tempDir, "data-loader-harness.ts");
		const outfile = path.join(tempDir, "data-loader-harness.mjs");

		await writeFile(shimPath, `
export class TAbstractFile {
	path: string;
	name: string;
	parent: TFolder | null = null;
	constructor(path = "") {
		this.path = path;
		this.name = path.split("/").filter(Boolean).pop() ?? "";
	}
}
export class TFile extends TAbstractFile {
	extension: string;
	basename: string;
	constructor(path = "") {
		super(path);
		const dot = this.name.lastIndexOf(".");
		this.extension = dot >= 0 ? this.name.slice(dot + 1) : "";
		this.basename = dot >= 0 ? this.name.slice(0, dot) : this.name;
	}
}
export class TFolder extends TAbstractFile {
	children: Array<TFile | TFolder>;
	constructor(path = "", children: Array<TFile | TFolder> = []) {
		super(path);
		this.children = children;
	}
}
export class Vault {}
export class MetadataCache {}
`, "utf8");

		await writeFile(harnessPath, `
import { DataLoader } from ${JSON.stringify(path.join(process.cwd(), "src/data-loader.ts"))};
export { DataLoader };
export { TFile, TFolder } from "obsidian";
`, "utf8");

		await esbuild.build({
			entryPoints: [harnessPath],
			bundle: true,
			platform: "node",
			format: "esm",
			outfile,
			logLevel: "silent",
			plugins: [
				{
					name: "obsidian-shim",
					setup(build) {
						build.onResolve({ filter: /^obsidian$/ }, () => ({ path: shimPath }));
					},
				},
			],
		});

		return import(pathToFileURL(outfile).href);
	})();

	return harnessPromise;
}

after(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

function createMockVault({ TFile, TFolder, contentsByPath }) {
	const allByPath = new Map();
	const readPaths = [];

	function file(filePath, content) {
		const item = new TFile(filePath);
		contentsByPath.set(filePath, content);
		return item;
	}

	function folder(folderPath, children = []) {
		const item = new TFolder(folderPath, children);
		for (const child of children) child.parent = item;
		return item;
	}

	const tree = folder("Health", [
		file("Health/_healthmd_data_dictionary.json", JSON.stringify([
			{ key: "mySteps", canonicalKey: "steps", unit: "count", schemaVersion: 1 },
			{ key: "myWalkingMiles", canonicalKey: "walking_running_mi", unit: "mi", schemaVersion: 1 },
		])),
		folder("Health/JSON", [
			file("Health/JSON/2026-06-14.json", JSON.stringify({
				type: "health-data",
				date: "2026-06-14",
				units: "imperial",
				activity: {
					steps: 100,
					walkingRunningDistanceKm: 1,
					walkingRunningDistance: 1000,
					activeCalories: 321,
					exerciseMinutes: 20,
				},
				heart: {
					averageHeartRate: 70,
					heartRateMin: 50,
					heartRateMax: 140,
					heartRateSamples: [],
				},
			})),
			file("Health/JSON/2026-06-17.json", JSON.stringify({
				schema: "healthmd.health_data",
				schema_version: 99,
				type: "health-data",
				date: "2026-06-17",
				unit_system: "metric",
				units: { steps: "count" },
				activity: {
					steps: 999,
					walkingRunningDistanceKm: 0,
					activeCalories: 0,
					exerciseMinutes: 0,
				},
			})),
			file("Health/JSON/2026-06-18.json", JSON.stringify({
				schema: "healthmd.health_data",
				schema_version: 5,
				type: "health-data",
				date: "2026-06-18",
				activity: { steps: 5000, walkingRunningDistanceKm: 4, activeCalories: 300, exerciseMinutes: 30 },
			})),
			file("Health/JSON/2026-06-19.json", JSON.stringify({
				schema: "healthmd.health_data",
				schema_version: 6,
				type: "health-data",
				date: "2026-06-19",
				raw_capture_status: "partial",
				activity: { steps: 6000, walkingRunningDistanceKm: 5, activeCalories: 400, exerciseMinutes: 40 },
				healthkit_record_archive: {
					schema: "healthmd.healthkit_records",
					schema_version: 1,
					capture_status: "partial",
					records: [{ payload: "must-not-enter-loader-cache" }],
					external_records: [],
					query_manifest: { results: [{ status: "unsupported" }] },
					integrity_warnings: [],
				},
			})),
			file("Health/JSON/2026-06-20.json", JSON.stringify({
				schema: "healthmd.health_data",
				schema_version: 7,
				type: "health-data",
				date: "2026-06-20",
				raw_capture_status: "not_requested",
				activity: { steps: 0, walkingRunningDistanceKm: 0, activeCalories: 0, exerciseMinutes: 0 },
			})),
		]),
		folder("Health/Bases", [
			file("Health/Bases/2026-06-14.md", `---
schema: healthmd.health_data
schema_version: 1
date: 2026-06-14
type: health-data
unit_system: metric
mySteps: 12345
myWalkingMiles: 6.21
---
`),
			file("Health/Bases/2026-06-20.md", `---
schema: healthmd.health_data
schema_version: 7
date: 2026-06-20
type: health-data
raw_capture_status: not_requested
steps: 999
active_calories: 999
exercise_minutes: 99
walking_running_km: 9.9
---
`),
		]),
		folder("Health/CSV", [
			file("Health/CSV/2026-06-15.csv", `Date,Category,Metric,Value,Unit,Timestamp
2026-06-15,Metadata,schema,healthmd.health_data,,
2026-06-15,Metadata,schema_version,1,,
2026-06-15,Metadata,unit_system,metric,,
2026-06-15,Activity,Steps,22222,count,
2026-06-15,Activity,Walking Running Distance,5,km,
`),
			file("Health/CSV/2026-06-20-stale.csv", `Date,Category,Metric,Value,Unit,Timestamp
2026-06-20,Metadata,schema,healthmd.health_data,,
2026-06-20,Metadata,schema_version,6,,
2026-06-20,Raw HealthKit,Raw Capture Status,partial,status,
2026-06-20,Raw HealthKit,Archive Manifest,"{""schema"":""healthmd.healthkit_records"",""schema_version"":1,""capture_status"":""partial"",""query_manifest"":{""results"":[{""status"":""unsupported""}]},""integrity_warnings"":[]}",json,
2026-06-20,Activity,Steps,777,count,
`),
		]),
		folder("Health/Markdown", [
			file("Health/Markdown/2026-06-16.md", `---
date: 2026-06-16
type: health-data
steps: 33333
active_calories: 444
exercise_minutes: 55
walking_running_km: 6.7
---
`),
		]),
		folder("Health/Rollups", [
			folder("Health/Rollups/Weekly", [
				file("Health/Rollups/Weekly/2026-W24.json", JSON.stringify({
					schema: "healthmd.rollup_summary",
					schema_version: 6,
					type: "health_rollup",
					rollup_period: "weekly",
					period_id: "2026-W24",
					start_date: "2026-06-08",
					end_date: "2026-06-14",
					days_expected: 7,
					days_counted: 7,
					coverage_percent: 100,
					source_schema: "healthmd.health_data",
					source_schema_version: 6,
					rollup_metrics: {
						steps: { value: 70000, unit: "count", rule: "sum" },
						vo2_max: {
							value: 42.1,
							unit: "mL/kg/min",
							rule: "maximum",
							statistics: { maximum_daily_value: 42.1 },
						},
					},
				})),
			]),
			folder("Health/Rollups/JSON", [
				folder("Health/Rollups/JSON/Weekly", [
					file("Health/Rollups/JSON/Weekly/2026-W24.json", JSON.stringify({
						schema: "healthmd.rollup_summary",
						schema_version: 6,
						type: "health_rollup",
						rollup_period: "weekly",
						period_id: "2026-W24",
						start_date: "2026-06-08",
						end_date: "2026-06-14",
						rollup_metrics: { active_calories: { value: 3500, unit: "kcal" } },
					})),
				]),
			]),
			folder("Health/Rollups/Markdown", [
				folder("Health/Rollups/Markdown/Monthly", [
					file("Health/Rollups/Markdown/Monthly/2026-06.md", `---
schema: healthmd.rollup_summary
schema_version: 1
type: health_rollup
rollup_period: monthly
period_id: 2026-06
start_date: 2026-06-01
end_date: 2026-06-30
days_expected: 30
days_counted: 16
coverage_percent: 53.3
source_schema: healthmd.health_data
source_schema_version: 1
---
# Monthly summary
`),
				]),
			]),
			folder("Health/Rollups/CSV", [
				folder("Health/Rollups/CSV/Weekly", [
					file("Health/Rollups/CSV/Weekly/2026-W24.csv", `Period,Period ID,Start Date,End Date,Days Expected,Days Counted,Coverage Percent,Category,Metric,Key,Canonical Key,Primary Value,Unit,Metric Days Counted,Rule,Statistic,Statistic Value,Notes
weekly,2026-W24,2026-06-08,2026-06-14,7,7,100,Activity,Cardio Fitness,vo2_max,vo2_max,40.2,mL/kg/min,2,latest,primary,40.2,current contract
weekly,2026-W24,2026-06-08,2026-06-14,7,7,100,Activity,Cardio Fitness,vo2_max,vo2_max,40.2,mL/kg/min,2,latest,latest,40.2,current contract
weekly,2026-W24,2026-06-08,2026-06-14,7,7,100,Activity,Cardio Fitness,vo2_max,vo2_max,40.2,mL/kg/min,2,latest,maximum_daily_value,42.1,current contract
weekly,2026-W24,2026-06-08,2026-06-14,7,7,100,Activity,Steps,steps,steps,70000,count,7,sum,primary,70000,
`),
				]),
				folder("Health/Rollups/CSV/Yearly", [
					file("Health/Rollups/CSV/Yearly/2026.csv", `Period,Period ID,Start Date,End Date,Days Expected,Days Counted,Coverage Percent,Category,Metric,Key,Canonical Key,Primary Value,Unit,Metric Days Counted,Rule,Statistic,Statistic Value,Notes
yearly,2026,2026-01-01,2026-12-31,365,166,45.5,Activity,Steps,steps,steps,1234567,count,166,sum,primary,1234567,
`),
				]),
			]),
		]),
	]);

	function index(node) {
		allByPath.set(node.path, node);
		if (node.children) node.children.forEach(index);
	}
	index(tree);

	return {
		vault: {
			getAbstractFileByPath(filePath) {
				return allByPath.get(filePath) ?? null;
			},
			async read(item) {
				readPaths.push(item.path);
				return contentsByPath.get(item.path) ?? "";
			},
			async cachedRead() {
				throw new Error("DataLoader should not retain raw Health exports in Obsidian's read cache");
			},
		},
		readPaths,
	};
}

for (const [granularity, maxDepth, template = ""] of [
	["flat", 0],
	["year", 1],
	["month", 2],
	["week", 3],
	["day", 4],
	["custom", 3, "{year}/{month}/{day}"],
	["custom", 3, "Apple Health/{year}/{week}"],
]) {
	test(`DataLoader limits ${granularity}${template ? ` (${template})` : ""} scans while retaining direct files`, async () => {
		const { DataLoader, TFile, TFolder } = await loadDataLoaderHarness();
		const root = new TFolder("Health");
		const index = new Map([[root.path, root]]);
		const contents = new Map();
		const dates = [];
		const readPaths = [];
		let folder = root;
		for (let depth = 0; depth <= 5; depth++) {
			const date = `2026-01-0${depth + 1}`;
			const file = new TFile(`${folder.path}/day.json`);
			file.parent = folder;
			folder.children.push(file);
			index.set(file.path, file);
			contents.set(file.path, JSON.stringify({ type: "health-data", date, activity: { steps: 100 } }));
			dates.push(date);
			if (depth < 5) {
				const nested = new TFolder(`${folder.path}/nested`);
				nested.parent = folder;
				folder.children.push(nested);
				index.set(nested.path, nested);
				folder = nested;
			}
		}
		const loader = new DataLoader({
			getAbstractFileByPath: (filePath) => index.get(filePath) ?? null,
			async read(file) {
				readPaths.push(file.path);
				return contents.get(file.path);
			},
		}, {
			dataFolder: "Health",
			filePattern: "*.json",
			dataFormat: "auto",
			dataFolderGranularity: granularity,
			dataFolderCustomPathTemplate: template,
		});

		const days = await loader.load();
		assert.deepEqual(days.map((day) => day.date), dates.slice(0, maxDepth + 1));
		assert.equal(readPaths.length, maxDepth + 1, "files beyond the configured depth are never read");
		assert.ok(readPaths.includes("Health/day.json"), "direct files remain loadable in every mode");
	});
}

test("DataLoader loads mixed Health.md schema vaults and indexes roll-ups separately", async () => {
	const { DataLoader, TFile, TFolder } = await loadDataLoaderHarness();
	const contentsByPath = new Map();
	const { vault, readPaths } = createMockVault({ TFile, TFolder, contentsByPath });
	const loader = new DataLoader(vault, {
		dataFolder: "Health",
		filePattern: "*",
		dataFormat: "auto",
		dataFolderGranularity: "flat",
		dataFolderCustomPathTemplate: "",
	});

	const days = await loader.load();

	assert.equal(days.length, 7);
	assert.deepEqual(days.map((day) => day.date), [
		"2026-06-14",
		"2026-06-15",
		"2026-06-16",
		"2026-06-17",
		"2026-06-18",
		"2026-06-19",
		"2026-06-20",
	]);
	assert.ok(readPaths.some((filePath) => filePath.startsWith("Health/Rollups/")), "roll-up folders should be read for the separate roll-up index");
	assert.ok(!days.some((day) => day.date === "2026-W24" || day.date === "2026-06"), "roll-ups should not be mixed into daily records");

	const merged = days.find((day) => day.date === "2026-06-14");
	assert.ok(merged);
	assert.equal(merged.schemaVersion, 1);
	assert.equal(merged.unitSystem, "metric");
	assert.equal(merged.activity?.steps, 12345);
	assert.equal(merged.activity?.activeCalories, 321, "legacy fields are preserved when v1 data is merged in");
	assert.equal(merged.heart?.averageHeartRate, 70, "different sections from legacy files are preserved");
	assert.equal(Math.round((merged.activity?.walkingRunningDistanceKm ?? 0) * 100) / 100, 9.99);
	assert.deepEqual(merged.sourcePaths, [
		"Health/Bases/2026-06-14.md",
		"Health/JSON/2026-06-14.json",
	]);

	const csvDay = days.find((day) => day.date === "2026-06-15");
	assert.ok(csvDay);
	assert.equal(csvDay.schemaVersion, 1);
	assert.equal(csvDay.activity?.walkingRunningDistanceKm, 5);

	const markdownDay = days.find((day) => day.date === "2026-06-16");
	assert.ok(markdownDay);
	assert.equal(markdownDay.schemaVersion, 0);
	assert.equal(markdownDay.activity?.steps, 33333);

	const rollups = await loader.loadRollups();
	assert.equal(rollups.length, 3);
	assert.deepEqual(rollups.map((rollup) => `${rollup.rollupPeriod}:${rollup.periodId}`).sort(), [
		"monthly:2026-06",
		"weekly:2026-W24",
		"yearly:2026",
	]);
	const weekly = rollups.find((rollup) => rollup.rollupPeriod === "weekly");
	assert.ok(weekly);
	assert.equal(weekly.daysExpected, 7);
	assert.equal(weekly.daysCounted, 7);
	assert.equal(weekly.coveragePercent, 100);
	assert.equal(weekly.schemaVersion, undefined, "current roll-up CSV remains explicitly unversioned");
	assert.deepEqual(weekly.sourcePaths, [
		"Health/Rollups/CSV/Weekly/2026-W24.csv",
		"Health/Rollups/JSON/Weekly/2026-W24.json",
		"Health/Rollups/Weekly/2026-W24.json",
	]);
	assert.ok(weekly.metrics.steps);
	assert.ok(weekly.metrics.active_calories);
	assert.equal(weekly.metrics.vo2_max.rule, "latest");
	assert.equal(weekly.metrics.vo2_max.primaryValue, 40.2);
	assert.equal(weekly.metrics.vo2_max.statistics.maximum_daily_value, 42.1);

	const futureDay = days.find((day) => day.date === "2026-06-17");
	assert.ok(futureDay);
	assert.equal(futureDay.schemaVersion, 99);
	assert.equal(futureDay.activity?.steps, 999);

	const report = loader.getLastLoadReport();
	assert.equal(report.dictionaryLoaded, true);
	assert.equal(report.dictionaryEntries, 2);
	assert.equal(loader.getDataDictionary().unitsByCanonicalKey.walking_running_mi, "mi");
	assert.deepEqual(report.schemaVersions, [0, 1, 5, 6, 7, 99]);
	assert.deepEqual(report.rollupSchemaVersions, [0, 1, 6]);
	assert.deepEqual(report.archiveSchemaVersions, [1]);
	assert.deepEqual(report.captureStatuses, { partial: 1, not_requested: 1 });
	assert.equal(report.captureIssueDays, 1);
	assert.ok(report.warnings.some((warning) => warning.includes("Conflicting duplicate export capture metadata")));
	assert.ok(report.warnings.some((warning) => warning.includes("schema v99")));
	assert.equal(report.loadedRollups, 3);
	assert.deepEqual(report.rollupPeriods, ["monthly", "weekly", "yearly"]);
	assert.ok(report.skippedFiles.some((entry) => entry.path === "Health/_healthmd_data_dictionary.json" && entry.reason === "data-dictionary"));
	assert.ok(loader.getLastLoadSummary().includes("data dictionary loaded"));
	assert.ok(loader.getLastLoadSummary().includes("indexed 3 roll-ups"));
	assert.ok(loader.getLastLoadSummary().includes("lossless capture"));

	const v6 = days.find((day) => day.date === "2026-06-19");
	assert.equal(v6?.rawCapture?.archiveVersion, 1);
	assert.equal(v6?.rawCapture?.recordCount, 1);
	assert.ok(!JSON.stringify(days).includes("must-not-enter-loader-cache"));

	const zeroDay = days.find((day) => day.date === "2026-06-20");
	assert.equal(zeroDay?.activity?.steps, 0, "newer JSON explicit zero must not be replaced by stale Bases data");
	assert.equal(zeroDay?.activity?.activeCalories, 0);
	assert.equal(zeroDay?.canonicalMetrics?.steps, 0, "canonical metric merge must preserve the preferred explicit zero");
	assert.equal(zeroDay?.rawCapture?.status, "not_requested", "v6 archive status must not replace the v7 user setting");
	assert.equal(zeroDay?.rawCapture?.archiveVersion, undefined);
});

test("DataLoader shares one in-flight read across concurrent visualizations", async () => {
	const { DataLoader, TFile, TFolder } = await loadDataLoaderHarness();
	const contentsByPath = new Map();
	const { vault, readPaths } = createMockVault({ TFile, TFolder, contentsByPath });
	const loader = new DataLoader(vault, {
		dataFolder: "Health",
		filePattern: "*",
		dataFormat: "auto",
		dataFolderGranularity: "flat",
		dataFolderCustomPathTemplate: "",
	});

	const [first, second, third] = await Promise.all([
		loader.load(),
		loader.load(),
		loader.load(),
	]);

	assert.equal(first, second);
	assert.equal(second, third);
	const dailyPath = "Health/JSON/2026-06-17.json";
	assert.equal(readPaths.filter((filePath) => filePath === dailyPath).length, 1);
});

test("invalidate during an in-flight load discards the stale scan instead of caching it", async () => {
	const { DataLoader, TFile, TFolder } = await loadDataLoaderHarness();
	const dayFile = new TFile("Health/JSON/2026-06-17.json");
	const jsonFolder = new TFolder("Health/JSON", [dayFile]);
	const rootFolder = new TFolder("Health", [jsonFolder]);
	jsonFolder.parent = rootFolder;
	dayFile.parent = jsonFolder;

	const dailyV1 = JSON.stringify({
		type: "health-data",
		date: "2026-06-17",
		schema: "healthmd.health_data",
		schema_version: 7,
		activity: { steps: 111 },
	});
	const dailyV2 = JSON.stringify({
		type: "health-data",
		date: "2026-06-17",
		schema: "healthmd.health_data",
		schema_version: 7,
		activity: { steps: 222 },
	});

	let contents = dailyV1;
	const pendingReads = [];
	const vault = {
		getAbstractFileByPath(filePath) {
			return filePath === "Health" ? rootFolder : (filePath === "Health/JSON" ? jsonFolder : null);
		},
		read() {
			// Reads only resolve when the test releases them, so invalidate() can
		// be observed deterministically mid-scan.
			return new Promise((resolve) => pendingReads.push(() => resolve(contents)));
		},
		async cachedRead() {
			throw new Error("DataLoader should not retain raw Health exports in Obsidian's read cache");
		},
	};
	const loader = new DataLoader(vault, {
		dataFolder: "Health",
		filePattern: "*",
		dataFormat: "auto",
		dataFolderGranularity: "flat",
		dataFolderCustomPathTemplate: "",
	});

	const firstLoad = loader.load();
	await new Promise((resolve) => setImmediate(resolve));
	// The vault changes while the first scan is parked inside vault.read().
	loader.invalidate();
	pendingReads.shift()();
	const staleDays = await firstLoad;
	assert.equal(staleDays.length, 1);
	assert.equal(staleDays[0].activity?.steps, 111, "the superseded caller still receives its scan");

	contents = dailyV2;
	const secondLoad = loader.load();
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(pendingReads.length, 1, "a fresh scan must run after the invalidation");
	pendingReads.shift()();
	const freshDays = await secondLoad;
	assert.equal(freshDays.length, 1);
	assert.equal(freshDays[0].activity?.steps, 222, "the stale in-flight result must not serve later loads");
});

test("DataLoader resolves route sidecar files referenced by workout notes", async () => {
	const { DataLoader, TFile, TFolder } = await loadDataLoaderHarness();
	const contentsByPath = new Map();
	const file = (filePath, content) => {
		contentsByPath.set(filePath, content);
		return new TFile(filePath);
	};
	const folder = (folderPath, children = []) => {
		const item = new TFolder(folderPath, children);
		for (const child of children) child.parent = item;
		return item;
	};
	const sidecar = JSON.stringify({
		schema: "healthmd.workout_route",
		schema_version: 1,
		point_count: 2,
		route: [
			{ timestamp: "2026-08-27T17:00:00Z", latitude: 21.3069, longitude: -157.8583, speedMps: 1.4 },
			{ timestamp: "2026-08-27T17:00:05Z", latitude: 21.3071, longitude: -157.8581, speedMps: 1.5 },
		],
	});
	const tree = folder("Health", [
		folder("Health/Workouts", [
			file("Health/Workouts/2026-08-27-walking.md", `---
date: 2026-08-27
time: "17:00"
type: workout
metric: workouts
value: "Walking"
workout_type: Walking
sport: walking
duration_minutes: 40
distance_m: 3200
route_points: 2
route_file: 2026-08-27-walking.route.json
---
`),
			file("Health/Workouts/2026-08-27-walking.route.json", sidecar),
		]),
	]);
	const allByPath = new Map();
	(function index(node) {
		allByPath.set(node.path, node);
		if (node.children) node.children.forEach(index);
	})(tree);
	const vault = {
		getAbstractFileByPath(filePath) {
			return allByPath.get(filePath) ?? null;
		},
		async read(item) {
			return contentsByPath.get(item.path) ?? "";
		},
	};
	const loader = new DataLoader(vault, {
		dataFolder: "Health",
		filePattern: "*",
		dataFormat: "auto",
		dataFolderGranularity: "flat",
		dataFolderCustomPathTemplate: "",
	});

	const days = await loader.load();

	assert.equal(days.length, 1);
	const workout = days[0].workouts?.[0];
	assert.ok(workout);
	assert.equal(workout.type, "walking");
	assert.equal(workout.route?.length, 2);
	assert.equal(workout.route?.[0].latitude, 21.3069);
	assert.equal(workout.route?.[1].longitude, -157.8581);
	assert.equal(workout.routePointCount, 2);

	const report = loader.getLastLoadReport();
	assert.equal(report.skippedFiles.length, 0, `sidecar must not be scanned as a data file: ${JSON.stringify(report.skippedFiles)}`);
});

test("DataLoader warns when a workout note references a missing route file", async () => {
	const { DataLoader, TFile, TFolder } = await loadDataLoaderHarness();
	const contentsByPath = new Map();
	const file = (filePath, content) => {
		contentsByPath.set(filePath, content);
		return new TFile(filePath);
	};
	const folder = (folderPath, children = []) => {
		const item = new TFolder(folderPath, children);
		for (const child of children) child.parent = item;
		return item;
	};
	const tree = folder("Health", [
		folder("Health/Workouts", [
			file("Health/Workouts/2026-08-28-run.md", `---
date: 2026-08-28
time: "07:00"
type: workout
metric: workouts
value: "Running"
workout_type: Running
duration_minutes: 30
route_points: 900
route_file: gone.route.json
---
`),
		]),
	]);
	const allByPath = new Map();
	(function index(node) {
		allByPath.set(node.path, node);
		if (node.children) node.children.forEach(index);
	})(tree);
	const vault = {
		getAbstractFileByPath(filePath) {
			return allByPath.get(filePath) ?? null;
		},
		async read(item) {
			return contentsByPath.get(item.path) ?? "";
		},
	};
	const loader = new DataLoader(vault, {
		dataFolder: "Health",
		filePattern: "*",
		dataFormat: "auto",
		dataFolderGranularity: "flat",
		dataFolderCustomPathTemplate: "",
	});

	const days = await loader.load();

	assert.equal(days.length, 1);
	const workout = days[0].workouts?.[0];
	assert.ok(workout);
	assert.equal(workout.route, undefined);
	assert.equal(workout.routePointCount, 900);
	const report = loader.getLastLoadReport();
	assert.ok(report.warnings.some((w) => w.includes("gone.route.json")));
});

async function loadWhoopVault(contents, includeReport = false) {
	const { DataLoader, TFile, TFolder } = await loadDataLoaderHarness();
	const root = new TFolder("Health", Object.keys(contents).map((name) => new TFile(`Health/${name}`)));
	root.children.forEach((file) => { file.parent = root; });
	const index = new Map([[root.path, root], ...root.children.map((file) => [file.path, file])]);
	const vault = {
		getAbstractFileByPath(filePath) { return index.get(filePath) ?? null; },
		async read(file) { return contents[file.name] ?? ""; },
	};
	const loader = new DataLoader(vault, { dataFolder: "Health", filePattern: "*", dataFormat: "auto", dataFolderGranularity: "flat", dataFolderCustomPathTemplate: "" });
	const days = await loader.load();
	return includeReport ? {days, report: loader.getLastLoadReport()} : days;
}

const whoopFixture = (name) => readFile(path.join(process.cwd(), "tests/fixtures/schema-v8", name), "utf8");

test("DataLoader retains the native WHOOP capture atomically across JSON, CSV and Bases duplicates", async () => {
	const [json, csv, bases] = await Promise.all([whoopFixture("provider-day.json"), whoopFixture("provider-day.csv"), whoopFixture("provider-day-bases.md")]);
	for (const contents of [
		{ "a.json": json, "b.csv": csv, "c.md": bases },
		{ "c.json": json, "b.csv": csv, "a.md": bases },
	]) {
		const [day] = await loadWhoopVault(contents);
		assert.equal(day.whoop.source, "typed");
		assert.equal(day.whoop.sleep.length, 1);
		assert.equal(day.whoop.sleep[0].id, "202");
		assert.equal(day.whoop.sleep[0].recent_nap_adjustment_milliseconds, -900000);
		assert.equal(day.whoop.workouts.length, 1, "same event in three formats is not triple counted");
		assert.equal(day.sourcePaths.length, 3);
		assert.equal(day.canonicalMetrics.hrv_ms, undefined);
	}
});

test("DataLoader does not resurrect flat WHOOP values after a newer complete-empty or not-requested native capture", async () => {
	const [json, csv] = await Promise.all([whoopFixture("provider-day.json"), whoopFixture("provider-day.csv")]);
	for (const capture_status of ["complete", "not_requested"]) {
		const newer = JSON.parse(json);
		Object.assign(newer.providers.whoop, {
			capture_status, fetched_at: capture_status === "not_requested" ? null : "2026-03-16T00:00:00Z", cycles: [], recoveries: [], sleep: [], workouts: [], resources: [],
		});
		delete newer.providers.whoop.body;
		const [day] = await loadWhoopVault({ "a-new.json": JSON.stringify(newer), "b-old.json": json, "c.csv": csv });
		assert.equal(day.whoop.captureStatus, capture_status);
		assert.equal(day.whoop.sleep.length, 0);
		assert.equal(day.whoop.recoveries.length, 0);
		assert.equal(day.whoop.workouts.length, 0);
		assert.equal(day.providers.whoop.sleep.length, 0, "retained namespace agrees with selected native capture");
	}
});

test("DataLoader preserves an unknown WHOOP native version without interpreting older CSV projections as that capture", async () => {
	const [json, csv] = await Promise.all([whoopFixture("provider-day.json"), whoopFixture("provider-day.csv")]);
	const future = JSON.parse(json);
	future.providers.whoop.schema_version = 3;
	const [day] = await loadWhoopVault({ "a.csv": csv, "b.json": JSON.stringify(future) });
	assert.equal(day.providers.whoop.schema_version, 3);
	assert.equal(day.whoop, undefined);
});

test("DataLoader retains mixed-date sleep versions but omits conflicting same-date authority", async () => {
	const { DataLoader, TFile, TFolder } = await loadDataLoaderHarness();
	const context = { calendar_timezone: "America/New_York", timestamp_timezone: "UTC",
		sleep_day_attribution: "morning_ends", sleep_owner_day_rule: "session_end_date", sleep_interval_clipping: "none" };
	for (const reverse of [false, true]) {
		const sources = [
			["Health/night.json", { date: "2026-08-10", schema_version: 8, sleep: { totalDuration: 100, coreSleep: 80 } }],
			["Health/morning.json", { date: "2026-08-10", schema_version: 6, schema_profile: "android-sleep-v6", time_context: context,
				sleep: { totalDuration: 27900, lightSleep: 15300 } }],
			["Health/historical.json", { date: "2026-08-09", schema_version: 8, activity: { steps: 100 } }],
			["Health/new.json", { date: "2026-08-11", schema_version: 11, schema_profile: "apple-v11", time_context: context,
				sleep: { totalDuration: 28000, coreSleep: 15400 } }],
		];
		if (reverse) sources.reverse();
		const contents = new Map(sources.map(([file, data]) => [file, JSON.stringify({ type: "health-data", schema: "healthmd.health_data", ...data })]));
		const files = sources.map(([file]) => new TFile(file));
		const folder = new TFolder("Health", files);
		for (const file of files) file.parent = folder;
		const loader = new DataLoader({ getAbstractFileByPath: (name) => name === "Health" ? folder : files.find((file) => file.path === name),
			read: async (file) => contents.get(file.path) }, { dataFolder: "Health", filePattern: "*", dataFormat: "auto",
			dataFolderGranularity: "flat", dataFolderCustomPathTemplate: "" });
		const days = await loader.load();
		assert.deepEqual(days.map((day) => day.date), ["2026-08-09", "2026-08-11"]);
		assert.equal(days[1].timeContext.sleep_day_attribution, "morning_ends");
		assert.ok(loader.getLastLoadReport().warnings.some((warning) => warning.includes("conflicting sleep attribution/profile")));
	}
});


test("DataLoader omits same-window rollups with conflicting sleep ownership independently of scan order", async () => {
	const { DataLoader, TFile, TFolder } = await loadDataLoaderHarness();
	const morning = JSON.parse(await readFile(path.join(process.cwd(), "tests/fixtures/rollup-summary-v11/range-v11.json"), "utf8"));
	const night = { ...morning, schema_version: 9, source_schema_version: 8, rollup_rules_version: 8 };
	delete night.schema_profile;
	delete night.source_schema_profile;
	delete night.time_context;
	for (const reverse of [false, true]) {
		const values = reverse ? [morning, morning, night] : [night, morning, morning];
		const sources = values.map((value, index) => [`Health/Rollups/${index}.json`, value]);
		const contents = new Map(sources.map(([file, data]) => [file, JSON.stringify(data)]));
		const files = sources.map(([file]) => new TFile(file));
		const rollupsFolder = new TFolder("Health/Rollups", files);
		const folder = new TFolder("Health", [rollupsFolder]);
		rollupsFolder.parent = folder;
		for (const file of files) file.parent = rollupsFolder;
		const loader = new DataLoader({ getAbstractFileByPath: (name) => name === "Health" ? folder : name === "Health/Rollups" ? rollupsFolder : files.find((file) => file.path === name),
			read: async (file) => contents.get(file.path) }, { dataFolder: "Health", filePattern: "*", dataFormat: "auto",
			dataFolderGranularity: "flat", dataFolderCustomPathTemplate: "" });
		assert.deepEqual(await loader.loadRollups(), []);
		assert.ok(loader.getLastLoadReport().warnings.some((warning) => warning.includes("ambiguous rollup data")));
	}
});
test('DataLoader preserves native parent and stage objects across duplicate formats in either order', async () => {
 const fixture = async suffix => readFile(path.join(process.cwd(), `tests/fixtures/sleep-native-parents/2026-11-01${suffix}`), 'utf8');
 const [json,csv,md,bases] = await Promise.all(['.json','.csv','.md','-bases.md'].map(fixture));
 const native = JSON.parse(json).sleep;
 for(const contents of [
  {'a.json':json,'b.csv':csv,'c.md':md,'d.md':bases},
  {'a.md':md,'b.csv':csv,'c.json':json,'d.md':bases},
  {'a.csv':csv,'b.md':md},
  {'a.md':md,'b.csv':csv},
 ]){
  const [day] = await loadWhoopVault(contents);
  assert.deepEqual(day.sleep.sleepStages,native.sleepStages);
  assert.deepEqual(day.sleep.sleepSessions,native.sleepSessions);
 }
});


test('DataLoader retains native Apple metadata when display tables and machine formats coexist', async () => {
 for (const variant of ['selected-stages', 'total-only']) {
  const base = path.join(process.cwd(), 'tests/fixtures/sleep-native-apple', variant, '2026-11-01');
  const [json, csv, md, bases] = await Promise.all(['.json', '.csv', '.md', '-bases.md'].map(suffix => readFile(base + suffix, 'utf8')));
  const native = JSON.parse(json).sleep.sleepStages;
  for (const contents of [
   {'a.json': json, 'b.csv': csv, 'c.md': md, 'd.md': bases},
   {'a.md': md, 'b.csv': csv, 'c.json': json, 'd.md': bases},
   {'a.csv': csv, 'b.md': md},
   {'a.md': md, 'b.csv': csv},
   {'a.md': bases, 'b.md': md},
   {'a.md': md, 'b.md': bases},
  ]) {
   const [day] = await loadWhoopVault(contents);
   assert.ok(day, variant);
   assert.deepEqual(day.sleep.sleepStages, native, variant);
   assert.equal(day.sleep.sleepSessions, undefined);
  }
 }
});

test('DataLoader retains complete quantity source objects across machine and display formats',async()=>{
 for(const [variant,date] of [['apple-v11-quantities','2026-03-15'],['android-v6-quantities','2026-11-01']]){
  const base=path.join(process.cwd(),'tests/fixtures/native-quantity-details',variant,date);
  const [json,csv,md,bases]=await Promise.all(['.json','.csv','.md','-bases.md'].map(suffix=>readFile(base+suffix,'utf8')));
  const native=JSON.parse(json);
  for(const contents of [{'a.json':json,'b.csv':csv,'c.md':md,'d.md':bases},{'a.md':md,'b.csv':csv,'c.json':json,'d.md':bases},{'a.csv':csv,'b.md':md},{'a.md':md,'b.csv':csv},{'a.md':bases,'b.md':md},{'a.md':md,'b.md':bases}]){
   const [day]=await loadWhoopVault(contents);
   assert.ok(day,variant);
   assert.deepEqual(day.heart.heartRateSamples,native.heart.heartRateSamples,variant);
   assert.deepEqual(day.heart.hrvSamples,native.heart.hrvSamples,variant);
   assert.deepEqual(day.vitals.bloodGlucoseSamples,native.vitals.bloodGlucoseSamples,variant);
   assert.equal(day.heart.averageHeartRate,undefined,variant);
  }
 }
});

test('DataLoader merges complementary quantity provenance and rejects conflicting source facts',async()=>{
 const original=JSON.parse(await readFile('tests/fixtures/native-quantity-details/android-v6-heart-only/2026-11-01.json','utf8'));
 const left=structuredClone(original),right=structuredClone(original);
 left.heart.heartRateSamples[0].metadata.left={name:'recorded source'};
 right.heart.heartRateSamples[0].metadata.right={version:'recorded revision'};
 for(const [a,b] of [[left,right],[right,left]]){
  const [day]=await loadWhoopVault({'a.json':JSON.stringify(a),'b.json':JSON.stringify(b)});
  assert.deepEqual(day.heart.heartRateSamples[0].metadata,{synthetic:'quantity-source',left:{name:'recorded source'},right:{version:'recorded revision'}});
 }
 for(const mutation of [sample=>sample.identity.nativeId='another-source',sample=>sample.metadata.synthetic='contradictory-source',sample=>sample.value=75.25]){
  const changed=structuredClone(original);mutation(changed.heart.heartRateSamples[0]);
  for(const [a,b] of [[original,changed],[changed,original]]){
   const {days,report}=await loadWhoopVault({'a.json':JSON.stringify(a),'b.json':JSON.stringify(b),'c.json':JSON.stringify(original)},true);
   assert.deepEqual(days,[]);
   assert.ok(report.warnings.some(warning=>warning.includes('conflicting native source facts')));
  }
 }
});


test('DataLoader pairs duplicate quantity clocks by compatible identity independently of array order',async()=>{
 const original=JSON.parse(await readFile('tests/fixtures/native-quantity-details/android-v6-heart-only/2026-11-01.json','utf8'));
 const second=structuredClone(original.heart.heartRateSamples[0]);second.identity.nativeId='second-native-record';
 original.heart.heartRateSamples.push(second);
 const reversed=structuredClone(original);reversed.heart.heartRateSamples.reverse();
 for(const [a,b] of [[original,reversed],[reversed,original]]){
  const [day]=await loadWhoopVault({'a.json':JSON.stringify(a),'b.json':JSON.stringify(b)});
  assert.deepEqual(day.heart.heartRateSamples.map(sample=>sample.identity.nativeId).sort(),['second-native-record','synthetic-quantity']);
 }
 const truncated=structuredClone(original);truncated.heart.heartRateSamples.pop();
 for(const [a,b] of [[original,truncated],[truncated,original]]){
  assert.deepEqual(await loadWhoopVault({'a.json':JSON.stringify(a),'b.json':JSON.stringify(b)}),[]);
 }
});

test('DataLoader retains native paired-pressure objects across all format orders and rejects source conflicts',async()=>{
 for(const [variant,date] of [['apple-v11-blood-pressure','2026-03-15'],['android-v6-blood-pressure','2026-11-01']]){
  const base=path.join(process.cwd(),'tests/fixtures/native-blood-pressure',variant,date);
  const [json,csv,md,bases]=await Promise.all(['.json','.csv','.md','-bases.md'].map(suffix=>readFile(base+suffix,'utf8')));
  const native=JSON.parse(json);
  for(const contents of [{'a.json':json,'b.csv':csv,'c.md':md,'d.md':bases},{'a.md':md,'b.csv':csv,'c.json':json,'d.md':bases},{'a.csv':csv,'b.md':md},{'a.md':md,'b.csv':csv},{'a.md':bases,'b.md':md},{'a.md':md,'b.md':bases}]){
   const [day]=await loadWhoopVault(contents);assert.ok(day,variant);
   assert.deepEqual(day.vitals.bloodPressureSamples,native.vitals.bloodPressureSamples,variant);
   assert.equal(day.canonicalMetrics?.blood_pressure_systolic,undefined);
  }
  const changed=structuredClone(native);changed.vitals.bloodPressureSamples[0].metadata.synthetic='another-capture';
  for(const [a,b] of [[json,JSON.stringify(changed)],[JSON.stringify(changed),json]]){
   const {days,report}=await loadWhoopVault({'a.json':a,'b.json':b,'c.md':md},true);
   assert.deepEqual(days,[]);assert.ok(report.warnings.some(warning=>warning.includes('conflicting native source facts')));
  }
 }
});
