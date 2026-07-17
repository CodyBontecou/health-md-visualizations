import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
			async cachedRead(item) {
				readPaths.push(item.path);
				return contentsByPath.get(item.path) ?? "";
			},
		},
		readPaths,
	};
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
