import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

let tempDir;
let parsersPromise;

async function loadParsers() {
	if (parsersPromise) return parsersPromise;

	parsersPromise = (async () => {
		tempDir = await mkdtemp(path.join(os.tmpdir(), "health-md-parser-tests-"));
		const csvOutfile = path.join(tempDir, "csv-parser.mjs");
		const markdownOutfile = path.join(tempDir, "markdown-parser.mjs");

		await Promise.all([
			esbuild.build({
				entryPoints: [path.join(process.cwd(), "src/parsers/csv-parser.ts")],
				bundle: true,
				platform: "node",
				format: "esm",
				outfile: csvOutfile,
				logLevel: "silent",
			}),
			esbuild.build({
				entryPoints: [path.join(process.cwd(), "src/parsers/markdown-parser.ts")],
				bundle: true,
				platform: "node",
				format: "esm",
				outfile: markdownOutfile,
				logLevel: "silent",
			}),
		]);

		const [csvModule, markdownModule] = await Promise.all([
			import(pathToFileURL(csvOutfile).href),
			import(pathToFileURL(markdownOutfile).href),
		]);

		return {
			parseCSV: csvModule.parseCSV,
			parseMarkdown: markdownModule.parseMarkdown,
		};
	})();

	return parsersPromise;
}

after(async () => {
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("CSV parser accepts current iOS/Android aliases and granular samples", async () => {
	const { parseCSV } = await loadParsers();
	const csv = `Date,Category,Metric,Value,Unit,Timestamp
2026-03-15,Sleep,Total Duration,27900,seconds,
2026-03-15,Sleep,Deep Sleep,5400,seconds,
2026-03-15,Sleep,REM Sleep,8100,seconds,
2026-03-15,Sleep,Core Sleep,14400,seconds,
2026-03-15,Sleep,Awake Time,900,seconds,
2026-03-15,Sleep,Sleep Stage,deep (5400s),seconds,2026-03-14T22:00:00
2026-03-15,Sleep,Sleep Stage,light (14400s),seconds,2026-03-14T23:30:00
2026-03-15,Activity,Steps,12500,count,
2026-03-15,Activity,Active Calories,520,kcal,
2026-03-15,Activity,Basal Energy,1650,kcal,
2026-03-15,Activity,Exercise Minutes,45,minutes,
2026-03-15,Activity,Flights Climbed,8,count,
2026-03-15,Activity,Walking Running Distance,9500,meters,
2026-03-15,Activity,Cardio Fitness (VO2 Max),42.5,mL/kg/min,
2026-03-15,Heart,Resting Heart Rate,58,bpm,
2026-03-15,Heart,Average Heart Rate,72,bpm,
2026-03-15,Heart,Min Heart Rate,52,bpm,
2026-03-15,Heart,Max Heart Rate,155,bpm,
2026-03-15,Heart,HRV,42,ms,
2026-03-15,Heart,Heart Rate Sample,55,bpm,2026-03-15T06:00:00
2026-03-15,Heart,HRV Sample,45,ms,2026-03-15T06:00:00
2026-03-15,Vitals,Respiratory Rate Avg,15,breaths/min,
2026-03-15,Vitals,Respiratory Rate Min,12,breaths/min,
2026-03-15,Vitals,Respiratory Rate Max,18,breaths/min,
2026-03-15,Vitals,Blood Oxygen Avg,97,percent,
2026-03-15,Vitals,Blood Oxygen Min,94,percent,
2026-03-15,Vitals,Blood Oxygen Max,99,percent,
2026-03-15,Vitals,Blood Oxygen Sample,0.96,percent,2026-03-15T06:00:00
2026-03-15,Vitals,Respiratory Rate Sample,14,breaths/min,2026-03-15T06:00:00
2026-03-15,Mobility,Walking Speed,1.4,m/s,`;

	const [day] = parseCSV(csv);

	assert.equal(day.activity?.steps, 12500);
	assert.equal(day.activity?.walkingRunningDistanceKm, 9.5);
	assert.equal(day.activity?.vo2Max, 42.5);
	assert.equal(day.activity?.basalEnergyBurned, 1650);
	assert.equal(day.heart?.heartRateMin, 52);
	assert.equal(day.heart?.heartRateMax, 155);
	assert.equal(day.heart?.heartRateSamples.length, 1);
	assert.equal(day.heart?.hrvSamples?.length, 1);
	assert.equal(day.sleep?.sleepStages.length, 2);
	assert.equal(day.sleep?.sleepStages[1].stage, "core");
	assert.equal(day.vitals?.respiratoryRate, 15);
	assert.equal(day.vitals?.respiratoryRateAvg, 15);
	assert.equal(day.vitals?.respiratoryRateMin, 12);
	assert.equal(day.vitals?.respiratoryRateMax, 18);
	assert.equal(day.vitals?.bloodOxygenAvg, 97);
	assert.equal(day.vitals?.bloodOxygenMin, 94);
	assert.equal(day.vitals?.bloodOxygenMax, 99);
	assert.equal(day.vitals?.bloodOxygenSamples?.[0]?.value, 96);
	assert.equal(day.mobility?.walkingSpeed, 1.4);
});

test("CSV parser preserves legacy plugin labels", async () => {
	const { parseCSV } = await loadParsers();
	const csv = `Date,Category,Metric,Value,Unit
2026-03-16,Activity,Steps,10000,count
2026-03-16,Activity,VO2 Max,41,mL/kg/min
2026-03-16,Activity,Basal Energy Burned,1500,kcal
2026-03-16,Heart,Heart Rate Min,50,bpm
2026-03-16,Heart,Heart Rate Max,150,bpm
2026-03-16,Vitals,Respiratory Rate,14,breaths/min
2026-03-16,Vitals,Blood Oxygen,98,percent`;

	const [day] = parseCSV(csv);

	assert.equal(day.activity?.vo2Max, 41);
	assert.equal(day.activity?.basalEnergyBurned, 1500);
	assert.equal(day.heart?.heartRateMin, 50);
	assert.equal(day.heart?.heartRateMax, 150);
	assert.equal(day.vitals?.respiratoryRateAvg, 14);
	assert.equal(day.vitals?.bloodOxygenAvg, 98);
});

test("Markdown parser reads Android/iOS Bases frontmatter aliases", async () => {
	const { parseMarkdown } = await loadParsers();
	const markdown = `---
date: 2026-03-15
type: health-data
sleep_total_hours: 7.75
sleep_bedtime: 16:00
sleep_wake: 00:00
sleep_deep_hours: 1.50
sleep_rem_hours: 2.25
sleep_core_hours: 4.00
sleep_awake_hours: 0.25
steps: 12500
active_calories: 520
basal_calories: 1650
exercise_minutes: 45
flights_climbed: 8
walking_running_km: 9.50
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

	const day = parseMarkdown(markdown);

	assert.ok(day);
	assert.equal(day.activity?.steps, 12500);
	assert.equal(day.activity?.walkingRunningDistanceKm, 9.5);
	assert.equal(day.activity?.activeCalories, 520);
	assert.equal(day.activity?.exerciseMinutes, 45);
	assert.equal(day.activity?.vo2Max, 42.5);
	assert.equal(day.activity?.basalEnergyBurned, 1650);
	assert.equal(day.activity?.flightsClimbed, 8);
	assert.equal(day.heart?.averageHeartRate, 72);
	assert.equal(day.heart?.heartRateMin, 52);
	assert.equal(day.heart?.heartRateMax, 155);
	assert.equal(day.heart?.hrv, 42);
	assert.equal(day.sleep?.totalDuration, 27900);
	assert.equal(day.sleep?.deepSleep, 5400);
	assert.equal(day.sleep?.remSleep, 8100);
	assert.equal(day.sleep?.coreSleep, 14400);
	assert.equal(day.sleep?.awakeTime, 900);
	assert.equal(day.sleep?.bedtime, "16:00");
	assert.equal(day.sleep?.wakeTime, "00:00");
	assert.equal(day.vitals?.respiratoryRate, 15);
	assert.equal(day.vitals?.respiratoryRateAvg, 15);
	assert.equal(day.vitals?.respiratoryRateMin, 12);
	assert.equal(day.vitals?.respiratoryRateMax, 18);
	assert.equal(day.vitals?.bloodOxygenAvg, 97);
	assert.equal(day.vitals?.bloodOxygenMin, 94);
	assert.equal(day.vitals?.bloodOxygenMax, 99);
	assert.equal(day.mobility?.walkingSpeed, 1.4);
	assert.equal(day.mobility?.walkingStepLength, 0.75);
	assert.equal(day.mobility?.walkingDoubleSupportPercentage, 22.5);
	assert.equal(day.mobility?.walkingAsymmetryPercentage, 1.2);
});

test("Markdown parser reads granular Health.md tables and derives aggregates", async () => {
	const { parseMarkdown } = await loadParsers();
	const markdown = `# Health Data — 2026-03-16

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

	const day = parseMarkdown(markdown);

	assert.ok(day);
	assert.equal(day.date, "2026-03-16");
	assert.equal(day.sleep?.sleepStages.length, 2);
	assert.equal(day.sleep?.sleepStages[0].stage, "core");
	assert.equal(day.sleep?.sleepStages[1].endDate, "2026-03-17T00:30:00");
	assert.equal(day.sleep?.totalDuration, 9000);
	assert.equal(day.heart?.heartRateSamples.length, 2);
	assert.equal(day.heart?.averageHeartRate, 57.5);
	assert.equal(day.heart?.heartRateMin, 55);
	assert.equal(day.heart?.heartRateMax, 60);
	assert.equal(day.heart?.hrvSamples?.[0].value, 45.5);
	assert.equal(day.vitals?.bloodOxygenSamples?.[0].value, 96);
	assert.equal(day.vitals?.bloodOxygenSamples?.[1].value, 97);
	assert.equal(day.vitals?.bloodOxygenAvg, 96.5);
	assert.equal(day.vitals?.respiratoryRateSamples?.length, 2);
	assert.equal(day.vitals?.respiratoryRateAvg, 15);
});
