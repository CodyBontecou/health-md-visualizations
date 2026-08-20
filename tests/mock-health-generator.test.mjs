import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

const execFileAsync = promisify(execFile);
const bundledDayPath = path.join(process.cwd(), "examples", "Health", "2026-07-17.json");
const bundledRollupPath = path.join(process.cwd(), "examples", "Health", "Rollups", "Monthly", "2026-07.json");
const bundledRangePath = path.join(process.cwd(), "examples", "Health", "Rollups", "Range", "2025-11-19_to_2026-12-31.json");
const tempDirs = [];

function requiredVisualizationFields(day) {
	return {
		weight: day.body?.weight,
		bmi: day.body?.bmi,
		bodyFat: day.body?.bodyFatPercent,
		leanMass: day.body?.leanBodyMass,
		waist: day.body?.waistCircumference,
		bloodPressure: day.vitals?.bloodPressureSystolicAvg,
		bloodGlucose: day.vitals?.bloodGlucoseAvg,
		runningSpeed: day.mobility?.runningSpeed,
		runningPower: day.mobility?.runningPowerW,
		cyclingPower: day.cyclingPerformance?.cycling_power_w,
		headphoneAudio: day.hearing?.headphoneAudioLevel,
		environmentalSound: day.hearing?.environmentalSoundLevel,
		vitaminD: day.vitamins?.vitamin_d_ug,
		symptomCount: day.symptoms?.symptom_headache,
		cycleFlow: day.reproductiveHealth?.menstrual_flow,
		captureStatus: day.raw_capture_status,
	};
}

function assertVisualizationCoverage(day) {
	assert.equal(day.schema, "healthmd.health_data");
	assert.equal(day.schema_version, 8);
	assert.equal(day.units?.steps, "steps");
	for (const [name, value] of Object.entries(requiredVisualizationFields(day))) {
		assert.notEqual(value, undefined, `${name} should be present in mock data`);
	}
}

function assertPrivacySafeCapture(day) {
	assert.equal(day.raw_capture_status, "not_requested");
	assert.equal(Object.hasOwn(day, "healthkit_record_archive"), false);
}

function assertRollupCoverage(rollup, period = "monthly") {
	assert.equal(rollup.schema, "healthmd.rollup_summary");
	assert.equal(rollup.schema_version, period === "range" ? 9 : 8);
	assert.equal(rollup.rollup_period, period);
	assert.equal(rollup.source_schema, "healthmd.health_data");
	assert.equal(rollup.source_schema_version, 8);
	assert.equal(rollup.rollup_rules_version, 8);
	assert.equal(rollup.units?.steps, "steps");
	if (period === "range") assert.equal(rollup.calendar_timezone, "UTC");
	assert.ok(rollup.rollup_metrics?.vo2_max, "VO2 Max roll-up should be present");
	assert.ok(rollup.rollup_metrics?.steps, "steps roll-up should be present");
	assert.ok(rollup.rollup_metrics?.weight_kg, "weight roll-up should be present");
	assert.ok(rollup.rollup_metrics?.blood_glucose_avg, "blood glucose roll-up should be present");
}

after(async () => {
	await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

test("bundled mock data pairs daily v8 with a source-compatible range v9 summary", async () => {
	const [day, rollup, range, bundledFiles] = await Promise.all([
		readFile(bundledDayPath, "utf8").then(JSON.parse),
		readFile(bundledRollupPath, "utf8").then(JSON.parse),
		readFile(bundledRangePath, "utf8").then(JSON.parse),
		readdir(path.join(process.cwd(), "examples", "Health")),
	]);
	assertVisualizationCoverage(day);
	const dailyFiles = bundledFiles.filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file));
	assert.equal(dailyFiles.length, 408);
	const bundledDays = await Promise.all(
		dailyFiles.map((file) => readFile(path.join(process.cwd(), "examples", "Health", file), "utf8").then(JSON.parse))
	);
	for (const bundledDay of bundledDays) assertPrivacySafeCapture(bundledDay);
	assertRollupCoverage(rollup);
	assertRollupCoverage(range, "range");
	assert.equal(range.start_date, "2025-11-19");
	assert.equal(range.end_date, "2026-12-31");
});

test("mock generator writes daily summaries and roll-ups to a clean output directory", async () => {
	const outputDir = await mkdtemp(path.join(os.tmpdir(), "health-md-mock-generator-"));
	tempDirs.push(outputDir);
	await execFileAsync(process.execPath, [path.join(process.cwd(), "scripts", "generate-mock-health-data.mjs")], {
		cwd: process.cwd(),
		env: {
			...process.env,
			HEALTHMD_MOCK_OUTPUT_DIR: outputDir,
			HEALTHMD_MOCK_START_DATE: "2026-07-01",
			HEALTHMD_MOCK_END_DATE: "2026-07-31",
		},
	});

	const [day, rollup, range, generatedFiles] = await Promise.all([
		readFile(path.join(outputDir, "2026-07-17.json"), "utf8").then(JSON.parse),
		readFile(path.join(outputDir, "Rollups", "Monthly", "2026-07.json"), "utf8").then(JSON.parse),
		readFile(path.join(outputDir, "Rollups", "Range", "2026-07-01_to_2026-07-31.json"), "utf8").then(JSON.parse),
		readdir(outputDir),
	]);
	assertVisualizationCoverage(day);
	const dailyFiles = generatedFiles.filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file));
	assert.equal(dailyFiles.length, 31);
	const generatedDays = await Promise.all(
		dailyFiles.map((file) => readFile(path.join(outputDir, file), "utf8").then(JSON.parse))
	);
	for (const generatedDay of generatedDays) assertPrivacySafeCapture(generatedDay);
	assertRollupCoverage(rollup);
	assertRollupCoverage(range, "range");
	assert.equal(range.period_id, "2026-07-01_to_2026-07-31");
	assert.equal(range.days_counted, 31);
});
