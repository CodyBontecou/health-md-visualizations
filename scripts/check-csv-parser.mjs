import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

const repoRoot = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), "health-md-csv-"));

try {
	const outfile = path.join(tempDir, "csv-parser.mjs");
	await esbuild.build({
		entryPoints: [path.join(repoRoot, "src/parsers/csv-parser.ts")],
		bundle: true,
		platform: "node",
		format: "esm",
		outfile,
		logLevel: "silent",
	});

	const { parseCSV } = await import(pathToFileURL(outfile).href);

	const modernCsv = `Date,Category,Metric,Value,Unit,Timestamp
2026-03-15,Sleep,Total Duration,27900,seconds,
2026-03-15,Sleep,Deep Sleep,5400,seconds,
2026-03-15,Sleep,REM Sleep,8100,seconds,
2026-03-15,Sleep,Core Sleep,14400,seconds,
2026-03-15,Sleep,Awake Time,900,seconds,
2026-03-15,Sleep,Bedtime,16:00,time,
2026-03-15,Sleep,Wake Time,00:00,time,
2026-03-15,Sleep,Sleep Stage,deep (5400s),seconds,2026-03-14T16:00:00
2026-03-15,Sleep,Sleep Stage,light (14400s),seconds,2026-03-14T19:30:00
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

	const modernDay = parseCSV(modernCsv)[0];
	assert.equal(modernDay.activity?.steps, 12500);
	assert.equal(modernDay.activity?.walkingRunningDistanceKm, 9.5);
	assert.equal(modernDay.activity?.vo2Max, 42.5);
	assert.equal(modernDay.activity?.basalEnergyBurned, 1650);
	assert.equal(modernDay.heart?.heartRateMin, 52);
	assert.equal(modernDay.heart?.heartRateMax, 155);
	assert.equal(modernDay.heart?.heartRateSamples.length, 1);
	assert.equal(modernDay.heart?.hrvSamples?.length, 1);
	assert.equal(modernDay.sleep?.sleepStages.length, 2);
	assert.equal(modernDay.sleep?.sleepStages[1].stage, "core");
	assert.equal(modernDay.vitals?.respiratoryRate, 15);
	assert.equal(modernDay.vitals?.respiratoryRateAvg, 15);
	assert.equal(modernDay.vitals?.bloodOxygenAvg, 97);
	assert.equal(modernDay.vitals?.bloodOxygenSamples?.[0]?.value, 96);
	assert.equal(modernDay.mobility?.walkingSpeed, 1.4);

	const legacyCsv = `Date,Category,Metric,Value,Unit
2026-03-16,Activity,Steps,10000,count
2026-03-16,Activity,VO2 Max,41,mL/kg/min
2026-03-16,Activity,Basal Energy Burned,1500,kcal
2026-03-16,Heart,Heart Rate Min,50,bpm
2026-03-16,Heart,Heart Rate Max,150,bpm
2026-03-16,Vitals,Respiratory Rate,14,breaths/min
2026-03-16,Vitals,Blood Oxygen,98,percent`;

	const legacyDay = parseCSV(legacyCsv)[0];
	assert.equal(legacyDay.activity?.vo2Max, 41);
	assert.equal(legacyDay.activity?.basalEnergyBurned, 1500);
	assert.equal(legacyDay.heart?.heartRateMin, 50);
	assert.equal(legacyDay.heart?.heartRateMax, 150);
	assert.equal(legacyDay.vitals?.respiratoryRateAvg, 14);
	assert.equal(legacyDay.vitals?.bloodOxygenAvg, 98);

	console.log("CSV parser compatibility checks passed");
} finally {
	await rm(tempDir, { recursive: true, force: true });
}
