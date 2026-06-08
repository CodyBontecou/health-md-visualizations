import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

const repoRoot = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), "health-md-markdown-"));

try {
	const outfile = path.join(tempDir, "markdown-parser.mjs");
	await esbuild.build({
		entryPoints: [path.join(repoRoot, "src/parsers/markdown-parser.ts")],
		bundle: true,
		platform: "node",
		format: "esm",
		outfile,
		logLevel: "silent",
	});

	const { parseMarkdown } = await import(pathToFileURL(outfile).href);

	const androidBasesMarkdown = `---
date: 2026-03-15
type: health-data
sleep_total_hours: 7.75
sleep_bedtime: 16:00
sleep_wake: 00:00
sleep_deep_hours: 1.50
sleep_rem_hours: 2.25
sleep_core_hours: 4.00
sleep_awake_hours: 0.25
sleep_in_bed_hours: 8.00
steps: 12500
active_calories: 520
basal_calories: 1650
exercise_minutes: 45
flights_climbed: 8
walking_running_km: 9.50
cycling_km: 3.20
resting_heart_rate: 58
average_heart_rate: 72
heart_rate_min: 52
heart_rate_max: 155
hrv_ms: 42.0
respiratory_rate: 15.0
respiratory_rate_avg: 15.0
respiratory_rate_min: 12.0
respiratory_rate_max: 18.0
blood_oxygen: 97
blood_oxygen_avg: 97
blood_oxygen_min: 94
blood_oxygen_max: 99
walking_speed: 1.40
step_length_cm: 75.0
double_support_percent: 22.5
walking_asymmetry_percent: 1.2
vo2_max: 42.5
workouts: [running]
---
`;

	const androidDay = parseMarkdown(androidBasesMarkdown);
	assert.ok(androidDay);
	assert.equal(androidDay.date, "2026-03-15");
	assert.equal(androidDay.activity?.steps, 12500);
	assert.equal(androidDay.activity?.walkingRunningDistanceKm, 9.5);
	assert.equal(androidDay.activity?.activeCalories, 520);
	assert.equal(androidDay.activity?.exerciseMinutes, 45);
	assert.equal(androidDay.activity?.vo2Max, 42.5);
	assert.equal(androidDay.activity?.basalEnergyBurned, 1650);
	assert.equal(androidDay.activity?.flightsClimbed, 8);
	assert.equal(androidDay.heart?.averageHeartRate, 72);
	assert.equal(androidDay.heart?.heartRateMin, 52);
	assert.equal(androidDay.heart?.heartRateMax, 155);
	assert.equal(androidDay.heart?.hrv, 42);
	assert.equal(androidDay.sleep?.totalDuration, 27900);
	assert.equal(androidDay.sleep?.deepSleep, 5400);
	assert.equal(androidDay.sleep?.remSleep, 8100);
	assert.equal(androidDay.sleep?.coreSleep, 14400);
	assert.equal(androidDay.sleep?.awakeTime, 900);
	assert.equal(androidDay.sleep?.bedtime, "16:00");
	assert.equal(androidDay.sleep?.wakeTime, "00:00");
	assert.equal(androidDay.vitals?.respiratoryRate, 15);
	assert.equal(androidDay.vitals?.respiratoryRateAvg, 15);
	assert.equal(androidDay.vitals?.respiratoryRateMin, 12);
	assert.equal(androidDay.vitals?.respiratoryRateMax, 18);
	assert.equal(androidDay.vitals?.bloodOxygenAvg, 97);
	assert.equal(androidDay.vitals?.bloodOxygenMin, 94);
	assert.equal(androidDay.vitals?.bloodOxygenMax, 99);
	assert.equal(androidDay.mobility?.walkingSpeed, 1.4);
	assert.equal(androidDay.mobility?.walkingStepLength, 0.75);
	assert.equal(androidDay.mobility?.walkingDoubleSupportPercentage, 22.5);
	assert.equal(androidDay.mobility?.walkingAsymmetryPercentage, 1.2);

	const granularMarkdown = `---
date: 2026-03-16
type: health-data
---

# Health Data — 2026-03-16

## Sleep

| Start | End | Stage |
|-------|-----|-------|
| 22:00 | 23:00 | light |
| 23:00 | 00:30 | deep |

## Heart

| Time | BPM |
|------|-----|
| 06:00 | 55 |
| 06:05 | 60 |

<details>
<summary>HRV Samples (1 readings)</summary>

| Time | ms |
|------|----|
| 06:00 | 45.5 |

</details>

## Vitals

| Time | SpO2 (%) |
|------|----------|
| 06:00 | 0.96 |
| 06:05 | 97% |

| Time | Respiratory Rate |
|------|------------------|
| 06:00 | 14.0 |
| 06:05 | 16.0 |
`;

	const granularDay = parseMarkdown(granularMarkdown);
	assert.ok(granularDay);
	assert.equal(granularDay.sleep?.sleepStages.length, 2);
	assert.equal(granularDay.sleep?.sleepStages[0]?.stage, "core");
	assert.equal(granularDay.sleep?.sleepStages[1]?.endDate, "2026-03-17T00:30:00");
	assert.equal(granularDay.sleep?.totalDuration, 9000);
	assert.equal(granularDay.heart?.heartRateSamples.length, 2);
	assert.equal(granularDay.heart?.averageHeartRate, 57.5);
	assert.equal(granularDay.heart?.hrvSamples?.[0]?.value, 45.5);
	assert.equal(granularDay.vitals?.bloodOxygenSamples?.[0]?.value, 96);
	assert.equal(granularDay.vitals?.bloodOxygenSamples?.[1]?.value, 97);
	assert.equal(granularDay.vitals?.bloodOxygenAvg, 96.5);
	assert.equal(granularDay.vitals?.respiratoryRateSamples?.length, 2);
	assert.equal(granularDay.vitals?.respiratoryRateAvg, 15);

	console.log("Markdown parser compatibility checks passed");
} finally {
	await rm(tempDir, { recursive: true, force: true });
}
