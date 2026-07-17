import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

const execFileAsync = promisify(execFile);
const bundledDayPath = path.join(process.cwd(), "examples", "Health", "2026-07-17.json");
const bundledRollupPath = path.join(process.cwd(), "examples", "Health", "Rollups", "Monthly", "2026-07.json");
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
	assert.equal(day.schema_version, 7);
	for (const [name, value] of Object.entries(requiredVisualizationFields(day))) {
		assert.notEqual(value, undefined, `${name} should be present in mock data`);
	}
}

function assertRollupCoverage(rollup) {
	assert.equal(rollup.schema, "healthmd.rollup_summary");
	assert.equal(rollup.schema_version, 7);
	assert.equal(rollup.rollup_period, "monthly");
	assert.ok(rollup.rollup_metrics?.vo2_max, "VO2 Max roll-up should be present");
	assert.ok(rollup.rollup_metrics?.steps, "steps roll-up should be present");
	assert.ok(rollup.rollup_metrics?.weight_kg, "weight roll-up should be present");
	assert.ok(rollup.rollup_metrics?.blood_glucose_avg, "blood glucose roll-up should be present");
}

after(async () => {
	await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

test("bundled mock data covers every schema v7 visualization section", async () => {
	const day = JSON.parse(await readFile(bundledDayPath, "utf8"));
	const rollup = JSON.parse(await readFile(bundledRollupPath, "utf8"));
	assertVisualizationCoverage(day);
	assertRollupCoverage(rollup);
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

	const day = JSON.parse(await readFile(path.join(outputDir, "2026-07-17.json"), "utf8"));
	const rollup = JSON.parse(await readFile(path.join(outputDir, "Rollups", "Monthly", "2026-07.json"), "utf8"));
	assertVisualizationCoverage(day);
	assertRollupCoverage(rollup);
});
