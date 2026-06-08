import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const repoRoot = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "health-md-parser-compat-"));
const entryPath = path.join(tempDir, "parsers-entry.mjs");
const bundlePath = path.join(tempDir, "parsers-bundle.mjs");

fs.writeFileSync(
	entryPath,
	[
		`export { parseJSON } from ${JSON.stringify(path.join(repoRoot, "src/parsers/json-parser.ts"))};`,
		`export { parseMarkdown } from ${JSON.stringify(path.join(repoRoot, "src/parsers/markdown-parser.ts"))};`,
		`export { parseCSV } from ${JSON.stringify(path.join(repoRoot, "src/parsers/csv-parser.ts"))};`,
	].join("\n")
);

await esbuild.build({
	entryPoints: [entryPath],
	outfile: bundlePath,
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node18",
	logLevel: "silent",
});

const { parseJSON, parseMarkdown, parseCSV } = await import(pathToFileURL(bundlePath).href);

try {
	const jsonDay = parseJSON(JSON.stringify({
		type: "health-data",
		date: "2026-03-15",
		activity: {
			steps: 1000,
			walkingRunningDistanceKm: 1.5,
			activeCalories: 100,
			exerciseMinutes: 10,
		},
		mobility: { vo2Max: 42.5 },
		sleep: {
			lightSleep: 3600,
			lightSleepFormatted: "1h",
			stages: [
				{ stage: "light", startTime: "22:00", endTime: "23:00" },
			],
		},
		heart: {
			heartRateSamples: [{ time: "06:00", bpm: 55 }],
			hrvSamples: [{ time: "07:00", ms: 42 }],
		},
		vitals: {
			bloodOxygenAvg: 0.97,
			bloodOxygenMin: 0.94,
			bloodOxygenMax: 0.99,
			bloodOxygenSamples: [{ timestamp: "2026-03-15T06:00:00", value: 0.96 }],
			respiratoryRateSamples: [{ time: "06:30", breathsPerMin: 14 }],
		},
		mindfulness: { mindfulnessMinutes: 15 },
	}));
	assert.equal(jsonDay.sleep.sleepStages[0].stage, "core", "Android light sleep maps to Core");
	assert.equal(jsonDay.sleep.sleepStages[0].durationSeconds, 3600, "sleep stage duration is derived");
	assert.equal(jsonDay.sleep.coreSleep, 3600, "lightSleep aliases to coreSleep");
	assert.equal(jsonDay.activity.vo2Max, 42.5, "mobility.vo2Max aliases to activity.vo2Max");
	assert.equal(jsonDay.heart.heartRateSamples[0].timestamp, "2026-03-15T06:00:00");
	assert.equal(jsonDay.heart.heartRateSamples[0].value, 55);
	assert.equal(jsonDay.heart.hrvSamples[0].value, 42);
	assert.equal(jsonDay.vitals.bloodOxygenAvg, 97, "fraction SpO₂ normalizes to percent scale");
	assert.equal(jsonDay.vitals.bloodOxygenSamples[0].value, 96);
	assert.equal(jsonDay.vitals.respiratoryRateSamples[0].value, 14);
	assert.equal(jsonDay.mindfulness.mindfulMinutes, 15);

	const percentJsonDay = parseJSON(JSON.stringify({
		type: "health-data",
		date: "2026-03-16",
		vitals: {
			bloodOxygenAvg: 97,
			bloodOxygenMin: 94,
			bloodOxygenMax: 99,
			bloodOxygenSamples: [{ timestamp: "2026-03-16T06:00:00", value: 96 }],
		},
	}));
	assert.equal(percentJsonDay.vitals.bloodOxygenAvg, 97, "percent SpO₂ stays percent scale");
	assert.equal(percentJsonDay.vitals.bloodOxygenSamples[0].value, 96);

	const markdownDay = parseMarkdown(`---
date: 2026-03-15
type: health-data
steps: 1000
walking_running_km: 1.5
active_calories: 100
exercise_minutes: 10
basal_calories: 1600
sleep_total_hours: 7
sleep_light_hours: 4
blood_oxygen_avg: 0.97
blood_oxygen_min: 0.94
blood_oxygen_max: 0.99
respiratory_rate_avg: 15
respiratory_rate_min: 12
respiratory_rate_max: 18
---
`);
	assert.equal(markdownDay.activity.basalEnergyBurned, 1600);
	assert.equal(markdownDay.sleep.coreSleep, 4 * 3600, "sleep_light_hours aliases to core sleep");
	assert.equal(markdownDay.vitals.bloodOxygenAvg, 97);
	assert.equal(markdownDay.vitals.bloodOxygenMin, 94);
	assert.equal(markdownDay.vitals.respiratoryRateAvg, 15);
	assert.equal(markdownDay.vitals.respiratoryRateMin, 12);

	const csvDays = parseCSV(`Date,Category,Metric,Value,Unit,Timestamp
2026-03-15,Activity,Steps,1000,count,
2026-03-15,Activity,Walking Running Distance,1500,meters,
2026-03-15,Activity,Cardio Fitness (VO2 Max),42.5,mL/kg/min,
2026-03-15,Activity,Basal Energy,1600,kcal,
2026-03-15,Heart,Average Heart Rate,72,bpm,
2026-03-15,Heart,Min Heart Rate,52,bpm,
2026-03-15,Heart,Max Heart Rate,155,bpm,
2026-03-15,Heart,Heart Rate Sample,55,bpm,2026-03-15T06:00:00
2026-03-15,Heart,HRV (RMSSD),42,ms,
2026-03-15,Heart,HRV Sample,41,ms,2026-03-15T07:00:00
2026-03-15,Sleep,Total Duration,3600,seconds,
2026-03-15,Sleep,Light Sleep,3600,seconds,
2026-03-15,Sleep,Sleep Stage,light (3600s),seconds,2026-03-15T22:00:00
2026-03-15,Vitals,Respiratory Rate Avg,15,breaths/min,
2026-03-15,Vitals,Respiratory Rate Min,12,breaths/min,
2026-03-15,Vitals,Respiratory Rate Max,18,breaths/min,
2026-03-15,Vitals,Blood Oxygen Avg,0.97,percent,
2026-03-15,Vitals,Blood Oxygen Min,0.94,percent,
2026-03-15,Vitals,Blood Oxygen Max,0.99,percent,
2026-03-15,Vitals,Blood Oxygen Sample,0.96,percent,2026-03-15T06:00:00
2026-03-15,Vitals,Respiratory Rate Sample,14,breaths/min,2026-03-15T06:30:00
`);
	const csvDay = csvDays[0];
	assert.equal(csvDay.activity.walkingRunningDistanceKm, 1.5);
	assert.equal(csvDay.activity.vo2Max, 42.5);
	assert.equal(csvDay.activity.basalEnergyBurned, 1600);
	assert.equal(csvDay.heart.heartRateMin, 52);
	assert.equal(csvDay.heart.heartRateMax, 155);
	assert.equal(csvDay.heart.heartRateSamples[0].value, 55);
	assert.equal(csvDay.heart.hrv, 42);
	assert.equal(csvDay.heart.hrvSamples[0].value, 41);
	assert.equal(csvDay.sleep.coreSleep, 3600);
	assert.equal(csvDay.sleep.sleepStages[0].stage, "core");
	assert.equal(csvDay.vitals.bloodOxygenAvg, 97);
	assert.equal(csvDay.vitals.bloodOxygenSamples[0].value, 96);
	assert.equal(csvDay.vitals.respiratoryRateAvg, 15);
	assert.equal(csvDay.vitals.respiratoryRateSamples[0].value, 14);

	console.log("Parser compatibility checks passed");
} finally {
	fs.rmSync(tempDir, { recursive: true, force: true });
}
