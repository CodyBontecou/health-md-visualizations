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
		const schemaOutfile = path.join(tempDir, "healthmd-schema.mjs");

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
			esbuild.build({
				entryPoints: [path.join(process.cwd(), "src/healthmd-schema.ts")],
				bundle: true,
				platform: "node",
				format: "esm",
				outfile: schemaOutfile,
				logLevel: "silent",
			}),
		]);

		const [csvModule, jsonModule, markdownModule, schemaModule] = await Promise.all([
			import(pathToFileURL(csvOutfile).href),
			import(pathToFileURL(jsonOutfile).href),
			import(pathToFileURL(markdownOutfile).href),
			import(pathToFileURL(schemaOutfile).href),
		]);

		return {
			parseCSV: csvModule.parseCSV,
			parseJSON: jsonModule.parseJSON,
			parseMarkdown: markdownModule.parseMarkdown,
			detectJsonSchema: schemaModule.detectJsonSchema,
			detectCsvSchema: schemaModule.detectCsvSchema,
			detectFrontmatterSchema: schemaModule.detectFrontmatterSchema,
			parseHealthMetricDataDictionaryDetails: schemaModule.parseHealthMetricDataDictionaryDetails,
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

test("JSON parser accepts Health.md schema v1 metadata and units map", async () => {
	const { parseJSON } = await loadParsers();
	const day = parseJSON(JSON.stringify({
		schema: "healthmd.health_data",
		schema_version: 1,
		type: "health-data",
		date: "2026-06-14",
		unit_system: "metric",
		units: {
			steps: "count",
			walking_running_km: "km",
		},
		activity: {
			steps: 12000,
			walkingRunningDistance: 9500,
			walkingRunningDistanceKm: 9.5,
			walkingRunningDistanceMi: 5.9,
			activeCalories: 500,
			exerciseMinutes: 45,
		},
	}));

	assert.equal(day.schema, "healthmd.health_data");
	assert.equal(day.schemaVersion, 1);
	assert.equal(day.unitSystem, "metric");
	assert.deepEqual(day.units, {
		steps: "count",
		walking_running_km: "km",
	});
	assert.equal(day.activity.walkingRunningDistanceKm, 9.5);
});

test("JSON parser reads Health.md mindfulness State of Mind entries", async () => {
	const { parseJSON } = await loadParsers();
	const day = parseJSON(JSON.stringify({
		schema: "healthmd.health_data",
		schema_version: 2,
		type: "health-data",
		date: "2026-05-12",
		unit_system: "metric",
		mindfulness: {
			stateOfMindCount: 2,
			averageValence: 0.42,
			averageValencePercent: 71,
			dailyMoodCount: 1,
			momentaryEmotionCount: 1,
			emotionLabels: ["Calm", "Focused"],
			associations: ["Fitness", "Work"],
			stateOfMindEntries: [
				{
					timestamp: "08:30",
					kind: "Daily Mood",
					valence: 0.64,
					valencePercent: 82,
					valenceDescription: "Very Pleasant",
					labels: ["Calm"],
					associations: ["Fitness"],
				},
				{
					timestamp: "15:45",
					kind: "Momentary Emotion",
					valence: 0.2,
					labels: ["Focused"],
					associations: ["Work"],
				},
			],
		},
	}));

	assert.equal(day.mood?.entries.length, 2);
	assert.equal(day.mood?.entries[0].timestamp, "2026-05-12T08:30:00");
	assert.equal(day.mood?.entries[0].kind, "Daily Mood");
	assert.equal(day.mood?.entries[0].label, "Calm");
	assert.equal(Math.round((day.mood?.averageValence ?? 0) * 100) / 100, 0.42);
});

test("schema detection classifies legacy, daily, roll-up, dictionary, and future versions", async () => {
	const {
		detectJsonSchema,
		detectCsvSchema,
		detectFrontmatterSchema,
		parseHealthMetricDataDictionaryDetails,
	} = await loadParsers();

	assert.deepEqual(detectJsonSchema(JSON.stringify({ type: "health-data", date: "2026-06-14" })), {
		kind: "legacy-health-day",
		version: 0,
		format: "json",
	});

	const future = detectJsonSchema(JSON.stringify({
		schema: "healthmd.health_data",
		schema_version: 99,
		type: "health-data",
		date: "2026-06-14",
	}));
	assert.equal(future.kind, "health-data");
	assert.equal(future.isFutureVersion, true);

	assert.equal(detectFrontmatterSchema({ schema: "healthmd.rollup_summary", schema_version: 1 }).kind, "rollup-summary");
	assert.equal(detectCsvSchema("Period,Period ID,Start Date\nweekly,2026-W24,2026-06-08").kind, "rollup-summary");

	const dictionary = JSON.stringify([
		{
			key: "mySteps",
			canonicalKey: "steps",
			displayName: "Steps",
			category: "Activity",
			unit: "count",
			dailyAggregation: "sum",
			healthKitAggregation: "cumulativeSum",
			rollup: { primary: "sum" },
			schemaVersion: 1,
		},
	]);
	assert.equal(detectJsonSchema(dictionary).kind, "data-dictionary");
	assert.deepEqual(parseHealthMetricDataDictionaryDetails(dictionary), {
		entries: [{
			key: "mySteps",
			canonicalKey: "steps",
			displayName: "Steps",
			category: "Activity",
			unit: "count",
			dailyAggregation: "sum",
			healthKitAggregation: "cumulativeSum",
			rollup: { primary: "sum" },
			schemaVersion: 1,
		}],
		aliases: { mySteps: "steps" },
		unitsByCanonicalKey: { steps: "count" },
		dailyAggregationByCanonicalKey: { steps: "sum" },
		healthKitAggregationByCanonicalKey: { steps: "cumulativeSum" },
		rollupByCanonicalKey: { steps: { primary: "sum" } },
		schemaVersion: 1,
	});
});

test("JSON parser ignores Health.md roll-up summaries", async () => {
	const { parseJSON } = await loadParsers();
	assert.equal(parseJSON(JSON.stringify({
		schema: "healthmd.rollup_summary",
		schema_version: 1,
		type: "health_rollup",
		period_id: "2026-W24",
	})), null);
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

test("CSV parser reads mood/state-of-mind rows", async () => {
	const { parseCSV } = await loadParsers();
	const csv = `Date,Category,Metric,Value,Unit,Timestamp
2026-03-15,Mood,State of Mind Valence,0.6,score,2026-03-15T09:00:00
2026-03-15,Mood,Emotion Label,Calm,text,2026-03-15T09:00:00
2026-03-15,Mood,Association,Work,text,2026-03-15T09:00:00
2026-03-15,Mood,Daily Mood Score,4,score,
2026-03-15,Activity,Exercise Minutes,30,minutes,
2026-03-15,Sleep,Total Duration,28800,seconds,`;

	const [day] = parseCSV(csv);

	assert.equal(day.mood?.entries.length, 2);
	assert.equal(Math.round((day.mood?.averageValence ?? 0) * 100) / 100, 0.55);
	assert.equal(day.mood?.entries[0].label, "Calm");
	assert.deepEqual(day.mood?.entries[0].associations, ["Work"]);
	assert.equal(day.activity?.exerciseMinutes, 30);
	assert.equal(day.sleep?.totalDuration, 28800);
});

test("CSV parser reads Health.md app State of Mind export rows", async () => {
	const { parseCSV } = await loadParsers();
	const csv = `Date,Category,Metric,Value,Unit,Timestamp
2026-05-12,Mindfulness,State of Mind Entries,2,count,
2026-05-12,Mindfulness,Average Mood Valence,0.42,scale(-1 to 1),
2026-05-12,Mindfulness,Average Mood Percent,71,percent,
2026-05-12,Mindfulness,Daily Mood Count,1,count,
2026-05-12,Mindfulness,Momentary Emotion Count,1,count,
2026-05-12,State of Mind,Daily Mood at 08:30,0.64,valence,
2026-05-12,State of Mind,Daily Mood Labels at 08:30,"Calm; Grateful",labels,
2026-05-12,State of Mind,Daily Mood Associations at 08:30,Fitness,associations,
2026-05-12,State of Mind,Momentary Emotion at 15:45,0.20,valence,
2026-05-12,State of Mind,Momentary Emotion Labels at 15:45,Focused,labels,
2026-05-12,State of Mind,Momentary Emotion Associations at 15:45,Work,associations,`;

	const [day] = parseCSV(csv);

	assert.equal(day.mood?.entries.length, 2);
	assert.equal(day.mood?.entries[0].timestamp, "2026-05-12T08:30:00");
	assert.equal(day.mood?.entries[0].kind, "dailyMood");
	assert.equal(day.mood?.entries[0].label, "Calm");
	assert.deepEqual(day.mood?.entries[0].labels, ["Calm", "Grateful"]);
	assert.deepEqual(day.mood?.entries[0].associations, ["Fitness"]);
	assert.equal(day.mood?.entries[1].timestamp, "2026-05-12T15:45:00");
	assert.equal(Math.round((day.mood?.averageValence ?? 0) * 100) / 100, 0.42);
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

test("CSV parser reads schema metadata rows and normalizes distance units", async () => {
	const { parseCSV } = await loadParsers();
	const csv = `Date,Category,Metric,Value,Unit,Timestamp
2026-06-14,Metadata,schema,healthmd.health_data,,
2026-06-14,Metadata,schema_version,1,,
2026-06-14,Metadata,unit_system,metric,,
2026-06-14,Activity,Walking Running Distance,6.21,mi,
2026-06-14,Activity,Steps,12345,count,`;

	const [day] = parseCSV(csv);
	assert.equal(day.schema, "healthmd.health_data");
	assert.equal(day.schemaVersion, 1);
	assert.equal(day.unitSystem, "metric");
	assert.equal(Math.round((day.activity?.walkingRunningDistanceKm ?? 0) * 100) / 100, 9.99);
	assert.equal(Math.round((day.activity?.walkingRunningDistance ?? 0) / 10) * 10, 9990);
});

test("CSV parser applies root metadata rows without creating blank-date days", async () => {
	const { parseCSV } = await loadParsers();
	const csv = `Date,Category,Metric,Value,Unit,Timestamp
,Metadata,schema,healthmd.health_data,,
,Metadata,schema_version,1,,
,Metadata,unit_system,metric,,
2026-06-14,Activity,Steps,12345,count,`;
	const days = parseCSV(csv);
	assert.equal(days.length, 1);
	assert.equal(days[0].date, "2026-06-14");
	assert.equal(days[0].schemaVersion, 1);
});

test("CSV parser ignores schema v1 roll-up summary CSV files", async () => {
	const { parseCSV } = await loadParsers();
	const csv = `Period,Period ID,Start Date,End Date,Days Expected,Days Counted,Coverage Percent,Category,Metric,Key,Canonical Key,Primary Value,Unit,Metric Days Counted,Rule,Statistic,Statistic Value,Notes
weekly,2026-W24,2026-06-08,2026-06-14,7,7,100,Activity,Steps,steps,steps,70000,count,7,sum,primary,70000,`;
	assert.deepEqual(parseCSV(csv), []);
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

test("Markdown parser reads comma decimal frontmatter values", async () => {
	const { parseMarkdown } = await loadParsers();
	const markdown = `---
date: 2026-06-29
type: health-data
sleep_total_hours: 7,23
hrv_ms: 11,8
walking_running_km: 2,18
respiratory_rate: 16,4
walking_speed: 0,68
steps: 1,993
---
`;

	const day = parseMarkdown(markdown);

	assert.ok(day);
	assert.equal(day.sleep?.totalDuration, 26028);
	assert.equal(day.heart?.hrv, 11.8);
	assert.equal(day.activity?.walkingRunningDistanceKm, 2.18);
	assert.equal(day.activity?.walkingRunningDistance, 2180);
	assert.equal(day.activity?.steps, 1993);
	assert.equal(day.vitals?.respiratoryRate, 16.4);
	assert.equal(day.mobility?.walkingSpeed, 0.68);
});

test("Markdown parser reads mood/state-of-mind frontmatter", async () => {
	const { parseMarkdown } = await loadParsers();
	const markdown = `---
date: 2026-03-15
type: health-data
mood_valence: -0.4
mood_label: Stressed
mood_kind: dailyMood
mood_associations: [Work, Health]
sleep_total_hours: 7
---
`;

	const day = parseMarkdown(markdown);

	assert.ok(day);
	assert.equal(day.mood?.entries.length, 1);
	assert.equal(day.mood?.averageValence, -0.4);
	assert.equal(day.mood?.primaryLabel, "Stressed");
	assert.deepEqual(day.mood?.entries[0].associations, ["Work", "Health"]);
	assert.equal(day.sleep?.totalDuration, 25200);
});

test("Markdown parser treats Health.md mood count fields as aggregates", async () => {
	const { parseMarkdown } = await loadParsers();
	const markdown = `---
date: 2026-05-12
type: health-data
mood_entries: 2
average_mood_valence: 0.42
average_mood_percent: 71
daily_mood_count: 1
daily_mood_percent: 82
momentary_emotion_count: 1
mood_labels: [calm, grateful]
mood_associations: [fitness, work]
---
`;

	const day = parseMarkdown(markdown);

	assert.ok(day);
	assert.equal(day.mood?.entries.length, 1);
	assert.equal(day.mood?.averageValence, 0.42);
	assert.equal(day.mood?.entries[0].timestamp, "2026-05-12T12:00:00");
	assert.deepEqual(day.mood?.entries[0].labels, ["calm", "grateful"]);
	assert.deepEqual(day.mood?.entries[0].associations, ["fitness", "work"]);
});

test("Markdown parser reads schema v1 metadata, units map, and data dictionary aliases", async () => {
	const { parseMarkdown } = await loadParsers();
	const markdown = `---
schema: healthmd.health_data
schema_version: 1
date: 2026-06-14
type: health-data
mySteps: 12345
myWalkingMiles: 6.21
units:
  mySteps: count
  myWalkingMiles: mi
---
`;

	const day = parseMarkdown(markdown, undefined, {
		mySteps: "steps",
		myWalkingMiles: "walking_running_mi",
	});

	assert.ok(day);
	assert.equal(day.schema, "healthmd.health_data");
	assert.equal(day.schemaVersion, 1);
	assert.equal(day.unitSystem, "metric");
	assert.equal(day.units.steps, "count");
	assert.equal(day.units.walking_running_mi, "mi");
	assert.equal(day.activity?.steps, 12345);
	assert.equal(Math.round((day.activity?.walkingRunningDistanceKm ?? 0) * 100) / 100, 9.99);
});

test("Markdown parser reads Health.md schema v2 medication frontmatter", async () => {
	const { parseMarkdown } = await loadParsers();
	const markdown = `---
schema: healthmd.health_data
schema_version: 2
date: 2026-06-18
type: health-data
medication_count: 2
active_medication_count: 1
archived_medication_count: 1
medication_dose_count: 3
medication_taken_count: 2
medication_skipped_count: 1
medications: [Atorvastatin, Vitamin D]
medication_details:
  - name: atorvastatin
    concept_identifier: rx-123
    display_name: Atorvastatin
    general_form: tablet
    is_archived: false
    has_schedule: true
    nickname: Statin
    rxnorm_codes: [83367]
  - name: vitamin-d
    concept_identifier: rx-456
    display_name: Vitamin D
    general_form: capsule
    is_archived: true
    has_schedule: false
medication_dose_events: '[{"name":"Atorvastatin","status":"taken","status_display":"Taken","id":"dose-1","medication_concept_identifier":"rx-123","scheduled_date":"2026-06-18T08:00:00","dose_quantity":1,"unit":"tablet","schedule_type":"daily"},{"name":"Vitamin D","status":"skipped","id":"dose-2","medication_concept_identifier":"rx-456","scheduled_date":"2026-06-18T09:00:00","scheduled_dose_quantity":1,"unit":"capsule","schedule_type":"daily"}]'
---
`;

	const day = parseMarkdown(markdown);

	assert.ok(day);
	assert.equal(day.schemaVersion, 2);
	assert.equal(day.medicationCount, 2);
	assert.equal(day.activeMedicationCount, 1);
	assert.equal(day.archivedMedicationCount, 1);
	assert.equal(day.medicationDoseCount, 3);
	assert.equal(day.medicationTakenCount, 2);
	assert.equal(day.medicationSkippedCount, 1);
	assert.deepEqual(day.medications, ["Atorvastatin", "Vitamin D"]);
	assert.equal(day.medicationDetails?.length, 2);
	assert.equal(day.medicationDetails?.[0].displayName, "Atorvastatin");
	assert.equal(day.medicationDetails?.[0].conceptIdentifier, "rx-123");
	assert.equal(day.medicationDetails?.[0].isArchived, false);
	assert.equal(day.medicationDetails?.[1].isArchived, true);
	assert.equal(day.medicationDoseEvents?.length, 2);
	assert.equal(day.medicationDoseEvents?.[0].status, "taken");
	assert.equal(day.medicationDoseEvents?.[0].doseQuantity, 1);
	assert.equal(day.medicationDoseEvents?.[1].status, "skipped");
	assert.equal(day.medicationDoseEvents?.[1].scheduledDoseQuantity, 1);
});

test("Markdown parser falls back to medications list and stringified medication YAML", async () => {
	const { parseMarkdown } = await loadParsers();
	const legacy = parseMarkdown(`---
date: 2026-06-19
type: health-data
medication_count: 2
medications: [Aspirin, Metformin]
---
`);
	assert.ok(legacy);
	assert.equal(legacy.medicationCount, 2);
	assert.deepEqual(legacy.medications, ["Aspirin", "Metformin"]);
	assert.equal(legacy.medicationDetails?.length, 2);
	assert.equal(legacy.medicationDetails?.[0].displayName, "Aspirin");

	const stringified = parseMarkdown(`---
date: 2026-06-20
type: health-data
---
`, {
		medication_details: "- name: Lisinopril\n  display_name: Lisinopril\n  is_archived: false\n  has_schedule: true",
		medication_dose_events: "- name: Lisinopril\n  status: completed\n  scheduled_date: 2026-06-20T07:30:00\n  dose_quantity: 5\n  unit: mg\n  schedule_type: daily",
	});
	assert.ok(stringified);
	assert.equal(stringified.medicationCount, 1);
	assert.equal(stringified.activeMedicationCount, 1);
	assert.equal(stringified.medicationTakenCount, 1);
	assert.equal(stringified.medicationDoseEvents?.[0].statusDisplay, "Taken");
	assert.equal(stringified.medicationDoseEvents?.[0].doseQuantity, 5);

	const zeroCounts = parseMarkdown(`---
date: 2026-06-21
type: health-data
medication_count: 0
active_medication_count: 0
archived_medication_count: 0
medication_dose_count: 0
medication_taken_count: 0
medication_skipped_count: 0
---
`);
	assert.ok(zeroCounts);
	assert.equal(zeroCounts.medicationCount, 0);
	assert.equal(zeroCounts.medicationDoseCount, 0);
});

test("Markdown parser treats structured canonical units as authoritative over imperial prose", async () => {
	const { parseMarkdown } = await loadParsers();
	const markdown = `---
schema: healthmd.health_data
schema_version: 1
date: 2026-06-15
type: health-data
walking_running_km: 10
units:
  walking_running_km: km
---
You walked 6.21 mi today.
`;
	const day = parseMarkdown(markdown);
	assert.ok(day);
	assert.equal(day.activity?.walkingRunningDistanceKm, 10);
});

test("Markdown parser ignores Health.md roll-up summary files", async () => {
	const { parseMarkdown } = await loadParsers();
	const markdown = `---
schema: healthmd.rollup_summary
schema_version: 1
type: health_rollup
rollup_period: weekly
period_id: 2026-W24
start_date: 2026-06-08
end_date: 2026-06-14
rollup_metrics:
  steps:
    value: "70000"
---
# Weekly Health Summary — 2026-W24
`;
	assert.equal(parseMarkdown(markdown), null);
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
