import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
		const jsonOutfile = path.join(tempDir, "json-parser.mjs");
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
				entryPoints: [path.join(process.cwd(), "src/parsers/json-parser.ts")],
				bundle: true,
				platform: "node",
				format: "esm",
				outfile: jsonOutfile,
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

		const [csvModule, jsonModule, markdownModule] = await Promise.all([
			import(pathToFileURL(csvOutfile).href),
			import(pathToFileURL(jsonOutfile).href),
			import(pathToFileURL(markdownOutfile).href),
		]);

		return {
			parseCSV: csvModule.parseCSV,
			parseJSON: jsonModule.parseJSON,
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

test("JSON parser preserves the complete HealthDay data structure", async () => {
	const { parseJSON } = await loadParsers();
	const completeDay = {
		type: "health-data",
		date: "2026-03-17",
		sourcePaths: ["Health/2026-03-17.json"],
		units: "metric",
		activity: {
			steps: 14321,
			walkingRunningDistanceKm: 10.2,
			activeCalories: 640,
			exerciseMinutes: 55,
			vo2Max: 43.2,
			basalEnergyBurned: 1680,
			standHours: 12,
			flightsClimbed: 14,
			walkingRunningDistance: 10200,
		},
		heart: {
			averageHeartRate: 73,
			heartRateMin: 51,
			heartRateMax: 162,
			heartRateSamples: [
				{ timestamp: "2026-03-17T06:00:00", value: 58 },
				{ timestamp: "2026-03-17T06:05:00", value: 62 },
			],
			hrvSamples: [
				{ timestamp: "2026-03-17T06:00:00", value: 44 },
			],
			hrv: 44,
			restingHeartRate: 57,
			walkingHeartRateAverage: 89,
		},
		vitals: {
			bloodOxygenSamples: [
				{ timestamp: "2026-03-17T06:00:00", value: 96, percent: 96 },
			],
			respiratoryRateSamples: [
				{ timestamp: "2026-03-17T06:00:00", value: 14.5 },
			],
			bloodOxygenPercent: 97,
			respiratoryRate: 15,
			bloodOxygenAvg: 97,
			bloodOxygenMin: 94,
			bloodOxygenMax: 99,
			respiratoryRateAvg: 15,
			respiratoryRateMin: 12,
			respiratoryRateMax: 18,
		},
		sleep: {
			sleepStages: [
				{
					stage: "core",
					startDate: "2026-03-16T22:00:00",
					endDate: "2026-03-16T23:00:00",
					durationSeconds: 3600,
				},
			],
			totalDuration: 28800,
			totalDurationFormatted: "8h 0m",
			deepSleep: 5400,
			deepSleepFormatted: "1h 30m",
			remSleep: 7200,
			remSleepFormatted: "2h 0m",
			coreSleep: 15300,
			coreSleepFormatted: "4h 15m",
			awakeTime: 900,
			awakeTimeFormatted: "15m",
			bedtime: "22:00",
			bedtimeISO: "2026-03-16T22:00:00",
			wakeTime: "06:00",
			wakeTimeISO: "2026-03-17T06:00:00",
		},
		mobility: {
			walkingSpeed: 1.42,
			walkingAsymmetryPercentage: 1.2,
			walkingStepLength: 0.75,
			walkingDoubleSupportPercentage: 22.5,
			stairAscentSpeed: 0.55,
			stairDescentSpeed: 0.6,
		},
		workouts: [
			{
				type: "running",
				duration: 1800,
				durationFormatted: "30m",
				calories: 310,
				distance: 5000,
				distanceFormatted: "5.0 km",
				startTime: "06:30",
				startTimeISO: "2026-03-17T06:30:00",
				endTimeISO: "2026-03-17T07:00:00",
				avgPaceFormatted: "6:00/km",
				avgSpeedFormatted: "10.0 km/h",
				avgHeartRate: 142,
				maxHeartRate: 172,
				minHeartRate: 105,
				avgRunningCadence: 168,
				avgStrideLength: 1.05,
				avgGroundContactTime: 245,
				avgVerticalOscillation: 8.5,
				avgCyclingCadence: 0,
				avgPower: 240,
				maxPower: 410,
				elevationGainMeters: 48,
				elevationLossMeters: 42,
				laps: [
					{ index: 1, duration: 900, distance: 2500, paceFormatted: "6:00/km" },
				],
				splits: [
					{ index: 1, duration: 360, distance: 1000, paceFormatted: "6:00/km", avgHeartRate: 136 },
				],
				route: [
					{
						timestamp: "2026-03-17T06:30:00",
						latitude: 45.5,
						longitude: -122.6,
						altitude: 80,
						speedMps: 2.8,
						courseDegrees: 180,
						horizontalAccuracyMeters: 5,
					},
				],
				timeSeries: {
					heartRate: [{ timestamp: "2026-03-17T06:30:00", value: 136 }],
					speed: [{ timestamp: "2026-03-17T06:30:00", value: 2.8 }],
					power: [{ timestamp: "2026-03-17T06:30:00", value: 240 }],
					cadence: [{ timestamp: "2026-03-17T06:30:00", value: 168 }],
					strideLength: [{ timestamp: "2026-03-17T06:30:00", value: 1.05 }],
					groundContactTime: [{ timestamp: "2026-03-17T06:30:00", value: 245 }],
					verticalOscillation: [{ timestamp: "2026-03-17T06:30:00", value: 8.5 }],
					altitude: [{ timestamp: "2026-03-17T06:30:00", value: 80 }],
				},
			},
		],
		hearing: {
			headphoneAudioLevel: 64.5,
		},
	};

	assert.deepEqual(parseJSON(JSON.stringify(completeDay)), completeDay);
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
2026-03-15,Mobility,Walking Speed,1.4,m/s,
2026-03-15,Mobility,Walking Asymmetry Percentage,1.2,percent,
2026-03-15,Mobility,Walking Step Length,0.75,m,
2026-03-15,Mobility,Walking Double Support Percentage,22.5,percent,
2026-03-15,Hearing,Headphone Audio,64.5,dB,`;

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
	assert.equal(day.mobility?.walkingAsymmetryPercentage, 1.2);
	assert.equal(day.mobility?.walkingStepLength, 0.75);
	assert.equal(day.mobility?.walkingDoubleSupportPercentage, 22.5);
	assert.equal(day.hearing?.headphoneAudioLevel, 64.5);
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
headphone_audio_db: 64.5
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
	assert.equal(day.hearing?.headphoneAudioLevel, 64.5);
});

test("Markdown parser reads detailed Health.md workout notes", async () => {
	const { parseMarkdown } = await loadParsers();
	const markdown = await readFile(path.join(process.cwd(), "tests/fixtures/detailed-workout.md"), "utf8");

	const day = parseMarkdown(markdown);

	assert.ok(day);
	assert.equal(day.date, "2026-03-27");
	assert.equal(day.workouts?.length, 1);
	const workout = day.workouts?.[0];
	assert.ok(workout);
	assert.equal(workout.type, "cycling");
	assert.equal(workout.activityType, "Cycling");
	assert.equal(workout.sport, "cycling");
	assert.equal(workout.duration, 300);
	assert.equal(workout.durationFormatted, "5:00");
	assert.equal(workout.startTimeISO, "2026-03-27T10:30:00Z");
	assert.equal(workout.endTimeISO, "2026-03-27T10:35:00Z");
	assert.equal(workout.distanceMeters, 1000);
	assert.equal(workout.distanceKm, 1);
	assert.equal(workout.distanceMi, 0.62);
	assert.equal(workout.distanceFormatted, "1.00 km");
	assert.equal(workout.avgSpeedFormatted, "12.0 km/h");
	assert.equal(workout.speedKmh, 12);
	assert.equal(workout.speedMph, 7.5);
	assert.equal(workout.calories, 50);
	assert.equal(workout.avgHeartRate, 150);
	assert.equal(workout.maxHeartRate, 200);
	assert.equal(workout.minHeartRate, 100);
	assert.equal(workout.avgRunningCadence, 178);
	assert.equal(workout.avgCyclingCadence, 84);
	assert.equal(workout.avgPower, 120);
	assert.equal(workout.maxPower, 140);
	assert.equal(workout.elevationGainMeters, 12);
	assert.equal(workout.elevationLossMeters, 5);
	assert.equal(workout.heartRateZones?.length, 5);
	assert.deepEqual(workout.heartRateZones?.[0], {
		index: 1,
		key: "zone1",
		label: "Recovery",
		range: "100-119",
		seconds: 60,
		durationFormatted: "1:00",
	});
	assert.equal(workout.laps?.length, 2);
	assert.equal(workout.laps?.[0].duration, 150);
	assert.equal(workout.laps?.[0].distance, 500);
	assert.equal(workout.laps?.[0].paceFormatted, "5:00 /km");
	assert.equal(workout.laps?.[0].avgHeartRate, 145);
	assert.equal(workout.laps?.[0].maxHeartRate, 180);
	assert.equal(workout.laps?.[0].avgPower, 110);
	assert.equal(workout.laps?.[0].avgCadence, 82);
	assert.equal(workout.laps?.[0].cadenceUnit, "rpm");
	assert.equal(workout.splits?.length, 1);
	assert.equal(workout.splits?.[0].speedFormatted, "12.0 km/h");
	assert.equal(workout.splits?.[0].distance, 1000);
});

test("Markdown parser reads legacy simple individual workout notes", async () => {
	const { parseMarkdown } = await loadParsers();
	const markdown = `---
date: 2026-03-28
time: "06:05"
datetime: 2026-03-28T06:05:00Z
type: workouts
metric: workouts
value: "Running"
workout_type: Running
duration_minutes: 30
calories: 310
distance_meters: 5000
avg_heart_rate: 142
max_heart_rate: 172
min_heart_rate: 105
avg_running_cadence: 168
avg_power_w: 240
max_power_w: 410
---
`;

	const day = parseMarkdown(markdown);

	assert.ok(day);
	const workout = day.workouts?.[0];
	assert.ok(workout);
	assert.equal(workout.type, "Running");
	assert.equal(workout.duration, 1800);
	assert.equal(workout.distanceMeters, 5000);
	assert.equal(workout.distanceFormatted, "5.00 km");
	assert.equal(workout.avgHeartRate, 142);
	assert.equal(workout.avgRunningCadence, 168);
	assert.equal(workout.avgPower, 240);
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
