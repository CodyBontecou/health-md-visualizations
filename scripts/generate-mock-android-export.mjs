#!/usr/bin/env node
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "examples", "AndroidHealthExport");

const START_DATE = process.env.ANDROID_HEALTH_START ?? "2026-01-01";
const END_DATE = process.env.ANDROID_HEALTH_END ?? "2026-06-10";
const SEED = 0xa6d201d;
const DAY_MS = 86_400_000;

function mulberry32(seed) {
	return function rand() {
		let t = (seed += 0x6d2b79f5);
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function hashString(str) {
	let h = SEED;
	for (let i = 0; i < str.length; i++) {
		h = Math.imul(h ^ str.charCodeAt(i), 2654435761);
	}
	return h >>> 0;
}

function rngFor(dateIso, salt = "") {
	return mulberry32(hashString(`${dateIso}:${salt}`));
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function round(value, digits = 0) {
	const p = 10 ** digits;
	return Math.round(value * p) / p;
}

function randBetween(rng, min, max) {
	return min + (max - min) * rng();
}

function choose(rng, items) {
	return items[Math.floor(rng() * items.length)];
}

function dateFromIso(dateIso) {
	return new Date(`${dateIso}T00:00:00Z`);
}

function isoDate(date) {
	return date.toISOString().slice(0, 10);
}

function addDays(dateIso, days) {
	const d = dateFromIso(dateIso);
	d.setUTCDate(d.getUTCDate() + days);
	return isoDate(d);
}

function enumerateDates(startIso, endIso) {
	const dates = [];
	let cursor = dateFromIso(startIso);
	const end = dateFromIso(endIso);
	while (cursor <= end) {
		dates.push(isoDate(cursor));
		cursor = new Date(cursor.getTime() + DAY_MS);
	}
	return dates;
}

function dayIndexFromDate(dateIso) {
	return Math.round((dateFromIso(dateIso).getTime() - dateFromIso(START_DATE).getTime()) / DAY_MS);
}

function localTimestamp(dateIso, minutesFromMidnight, seconds = 0) {
	const dayOffset = Math.floor(minutesFromMidnight / 1440);
	const minuteOfDay = ((Math.floor(minutesFromMidnight) % 1440) + 1440) % 1440;
	const d = addDays(dateIso, dayOffset);
	const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
	const mm = String(minuteOfDay % 60).padStart(2, "0");
	const ss = String(Math.floor(seconds)).padStart(2, "0");
	return `${d}T${hh}:${mm}:${ss}`;
}

function clockTime(dateTime) {
	return dateTime.slice(11, 16);
}

function durationText(seconds) {
	const h = Math.floor(seconds / 3600);
	const m = Math.round((seconds % 3600) / 60);
	if (h === 0) return `${m}m`;
	if (m === 0) return `${h}h`;
	return `${h}h ${m}m`;
}

function isoAtOffset(startMinute, secondsOffset, dateIso) {
	return localTimestamp(dateIso, startMinute + secondsOffset / 60);
}

function stageTemplate(rng, totalSleepSeconds, awakeSeconds) {
	const stages = [];
	let remainingSleep = totalSleepSeconds;
	let remainingAwake = awakeSeconds;

	const addStage = (stage, seconds) => {
		const pool = stage === "awake" ? remainingAwake : remainingSleep;
		const s = Math.round(clamp(seconds, 0, pool));
		if (s <= 0) return;
		stages.push([stage, s]);
		if (stage === "awake") remainingAwake -= s;
		else remainingSleep -= s;
	};

	addStage("awake", awakeSeconds * randBetween(rng, 0.12, 0.24));
	const cycles = [
		{ light: 0.17, deep: 0.10, rem: 0.04 },
		{ light: 0.20, deep: 0.07, rem: 0.08 },
		{ light: 0.21, deep: 0.035, rem: 0.11 },
		{ light: 0.18, deep: 0.015, rem: 0.14 },
	];

	for (const cycle of cycles) {
		if (remainingSleep <= 0) break;
		addStage("light", totalSleepSeconds * cycle.light * randBetween(rng, 0.82, 1.12));
		addStage("deep", totalSleepSeconds * cycle.deep * randBetween(rng, 0.75, 1.25));
		addStage("light", totalSleepSeconds * cycle.light * randBetween(rng, 0.35, 0.6));
		addStage("rem", totalSleepSeconds * cycle.rem * randBetween(rng, 0.85, 1.2));
		addStage("awake", randBetween(rng, 60, 360));
	}

	while (remainingSleep > 0) {
		addStage(choose(rng, ["light", "light", "rem"]), Math.min(remainingSleep, randBetween(rng, 12 * 60, 34 * 60)));
		if (remainingSleep > 0 && rng() < 0.25) addStage("awake", randBetween(rng, 45, 210));
	}
	addStage("awake", remainingAwake);
	return stages;
}

function buildSleep(dateIso, rng, dayIndex, workoutLoad, recoveryFlag) {
	const dow = dateFromIso(dateIso).getUTCDay();
	const weekendWake = dow === 0 || dow === 6;
	const seasonal = Math.sin(dayIndex / 365 * Math.PI * 2);
	const bedClock = 22 * 60 + 34 + Math.sin(dayIndex / 8) * 12 + (weekendWake ? 34 : 0) + randBetween(rng, -24, 26);
	const bedMinute = bedClock - 1440;
	const sleepHours = clamp(
		7.35 + seasonal * 0.22 + (weekendWake ? 0.38 : 0) - workoutLoad * 0.08 - (recoveryFlag ? 0.35 : 0) + randBetween(rng, -0.38, 0.42),
		5.8,
		9.05
	);
	const awakeSeconds = Math.round(clamp(22 + workoutLoad * 5 + (recoveryFlag ? 11 : 0) + randBetween(rng, -8, 20), 10, 65) * 60);
	const totalSleepSeconds = Math.round(sleepHours * 3600);
	const inBedSeconds = totalSleepSeconds + awakeSeconds;
	let cursor = bedMinute;
	const sleepStages = stageTemplate(rng, totalSleepSeconds, awakeSeconds).map(([stage, seconds]) => {
		const startDate = localTimestamp(dateIso, cursor);
		cursor += seconds / 60;
		return {
			stage,
			startDate,
			endDate: localTimestamp(dateIso, cursor),
			durationSeconds: seconds,
		};
	});

	const totals = sleepStages.reduce((acc, stage) => {
		if (stage.stage === "deep") acc.deep += stage.durationSeconds;
		else if (stage.stage === "rem") acc.rem += stage.durationSeconds;
		else if (stage.stage === "light" || stage.stage === "core") acc.light += stage.durationSeconds;
		else if (stage.stage === "awake") acc.awake += stage.durationSeconds;
		return acc;
	}, { deep: 0, rem: 0, light: 0, awake: 0 });
	const sleepTotal = totals.deep + totals.rem + totals.light;
	const bedtimeISO = sleepStages[0]?.startDate ?? localTimestamp(dateIso, bedMinute);
	const wakeTimeISO = sleepStages.at(-1)?.endDate ?? localTimestamp(dateIso, bedMinute + inBedSeconds / 60);

	return {
		totalDuration: sleepTotal,
		totalDurationFormatted: durationText(sleepTotal),
		bedtime: clockTime(bedtimeISO),
		bedtimeISO,
		wakeTime: clockTime(wakeTimeISO),
		wakeTimeISO,
		deepSleep: totals.deep,
		deepSleepFormatted: durationText(totals.deep),
		remSleep: totals.rem,
		remSleepFormatted: durationText(totals.rem),
		coreSleep: totals.light,
		coreSleepFormatted: durationText(totals.light),
		lightSleep: totals.light,
		lightSleepFormatted: durationText(totals.light),
		awakeTime: totals.awake,
		awakeTimeFormatted: durationText(totals.awake),
		inBedTime: sleepTotal + totals.awake,
		inBedTimeFormatted: durationText(sleepTotal + totals.awake),
		sleepStages,
	};
}

function workoutPlan(dateIso, rng, dayIndex) {
	const dow = dateFromIso(dateIso).getUTCDay();
	const weekPhase = Math.floor(dayIndex / 7) % 5;
	const workouts = [];

	if (dow === 1) {
		workouts.push({ type: "Strength Training", startMinute: 18 * 60 + Math.round(randBetween(rng, -25, 30)), duration: Math.round(randBetween(rng, 34, 52) * 60), indoor: true });
	} else if (dow === 2) {
		const duration = Math.round(randBetween(rng, 35, 54) * 60);
		const pace = randBetween(rng, weekPhase === 2 ? 4.85 : 5.45, weekPhase === 2 ? 5.35 : 6.2);
		workouts.push({ type: weekPhase === 2 ? "High Intensity Interval Training" : "Running", startMinute: 7 * 60 + 10 + Math.round(randBetween(rng, -22, 28)), duration, distance: Math.round((duration / 60 / pace) * 1000), indoor: false });
	} else if (dow === 4) {
		workouts.push({ type: weekPhase === 1 ? "Pilates" : "Yoga", startMinute: 18 * 60 + Math.round(randBetween(rng, -20, 30)), duration: Math.round(randBetween(rng, 28, 48) * 60), indoor: true });
	} else if (dow === 5 && dayIndex % 4 === 0) {
		const duration = Math.round(randBetween(rng, 30, 45) * 60);
		workouts.push({ type: "Swimming", startMinute: 6 * 60 + 45 + Math.round(randBetween(rng, -12, 15)), duration, distance: Math.round(randBetween(rng, 1050, 1850)), indoor: true, strokes: Math.round(randBetween(rng, 680, 1180)) });
	} else if (dow === 6) {
		const type = weekPhase === 4 ? "Hiking" : "Cycling";
		const duration = Math.round(randBetween(rng, type === "Hiking" ? 78 : 58, type === "Hiking" ? 126 : 96) * 60);
		const distance = Math.round(type === "Hiking" ? randBetween(rng, 7200, 13200) : randBetween(rng, 21000, 42000));
		workouts.push({ type, startMinute: 9 * 60 + Math.round(randBetween(rng, -35, 55)), duration, distance, indoor: false });
	} else if (dow === 0 && dayIndex % 3 === 0) {
		const duration = Math.round(randBetween(rng, 32, 58) * 60);
		workouts.push({ type: "Walking", startMinute: 10 * 60 + Math.round(randBetween(rng, -20, 45)), duration, distance: Math.round(randBetween(rng, 2400, 5200)), indoor: false });
	}

	return workouts;
}

function workoutIntensity(type) {
	return {
		Running: 158,
		"High Intensity Interval Training": 171,
		Cycling: 149,
		Hiking: 137,
		Walking: 112,
		Swimming: 143,
		"Strength Training": 132,
		Yoga: 92,
		Pilates: 105,
	}[type] ?? 126;
}

function buildWorkoutTimeSeries(dateIso, workout, rng, restingHr) {
	const heartRate = [];
	const speed = [];
	const power = [];
	const cadence = [];
	const altitude = [];
	const route = [];
	const peak = workoutIntensity(workout.type) + randBetween(rng, -5, 6);
	const floor = restingHr + randBetween(rng, 16, 24);
	const sampleStep = 60;
	const distanceMeters = workout.distance ?? 0;
	const baseSpeed = distanceMeters > 0 ? distanceMeters / workout.duration : 0;

	for (let t = 0; t <= workout.duration; t += sampleStep) {
		const frac = workout.duration > 0 ? t / workout.duration : 0;
		const warmup = Math.min(1, frac / 0.18);
		const cooldown = frac > 0.84 ? (1 - frac) / 0.16 : 1;
		const effort = clamp(Math.min(warmup, cooldown) + 0.08 * Math.sin(frac * Math.PI * 8), 0, 1);
		const timestamp = isoAtOffset(workout.startMinute, t, dateIso);
		heartRate.push({ timestamp, value: Math.round(floor + (peak - floor) * effort + randBetween(rng, -3, 3)) });
		if (baseSpeed > 0) speed.push({ timestamp, value: round(baseSpeed * randBetween(rng, 0.82, 1.16), 2) });
		if (["Running", "High Intensity Interval Training", "Cycling"].includes(workout.type)) {
			const basePower = workout.type === "Cycling" ? 185 : workout.type === "Running" ? 245 : 280;
			power.push({ timestamp, value: Math.round(basePower * (0.62 + effort * 0.55) + randBetween(rng, -16, 18)) });
		}
		if (["Running", "High Intensity Interval Training"].includes(workout.type)) {
			cadence.push({ timestamp, value: Math.round(164 + effort * 12 + randBetween(rng, -5, 5)) });
		} else if (workout.type === "Cycling") {
			cadence.push({ timestamp, value: Math.round(78 + effort * 16 + randBetween(rng, -6, 6)) });
		}
		if (!workout.indoor) altitude.push({ timestamp, value: round(50 + Math.sin(frac * Math.PI * 4) * 18 + randBetween(rng, -2.5, 2.5), 1) });
	}

	if (!workout.indoor && distanceMeters > 0) {
		const points = Math.min(140, Math.max(32, Math.round(workout.duration / 55)));
		const centerLat = 37.7694 + randBetween(rng, -0.006, 0.006);
		const centerLon = -122.4862 + randBetween(rng, -0.006, 0.006);
		const radius = workout.type === "Cycling" ? 0.021 : workout.type === "Hiking" ? 0.014 : 0.008;
		for (let i = 0; i < points; i++) {
			const frac = i / (points - 1 || 1);
			const angle = frac * Math.PI * 2 + randBetween(rng, -0.08, 0.08);
			const wobble = 1 + 0.16 * Math.sin(frac * Math.PI * 6 + dayIndexFromDate(dateIso) * 0.09);
			route.push({
				timestamp: localTimestamp(dateIso, workout.startMinute + (workout.duration / 60) * frac),
				latitude: round(centerLat + Math.sin(angle) * radius * wobble, 6),
				longitude: round(centerLon + Math.cos(angle) * radius * wobble, 6),
				altitude: round(48 + 20 * Math.sin(frac * Math.PI * 4) + randBetween(rng, -2, 2), 1),
				horizontalAccuracy: round(randBetween(rng, 3.5, 8.5), 1),
				verticalAccuracy: round(randBetween(rng, 4.5, 12), 1),
			});
		}
	}

	return { heartRate, speed, power, cadence, altitude, route };
}

function buildIntervals(dateIso, workout, samples, rng) {
	const laps = [];
	const splits = [];
	if (workout.distance && workout.distance >= 1000) {
		const kilometers = Math.max(1, Math.floor(workout.distance / 1000));
		for (let i = 0; i < kilometers; i++) {
			const startOffset = (workout.duration / kilometers) * i;
			const duration = Math.round(workout.duration / kilometers + randBetween(rng, -20, 22));
			const startTimeISO = isoAtOffset(workout.startMinute, startOffset, dateIso);
			const endTimeISO = isoAtOffset(workout.startMinute, startOffset + duration, dateIso);
			const avgHeartRate = samples.heartRate.length ? Math.round(samples.heartRate[Math.min(samples.heartRate.length - 1, Math.floor((i / kilometers) * samples.heartRate.length))].value) : undefined;
			splits.push({
				index: i + 1,
				startTimeISO,
				endTimeISO,
				duration,
				distance: 1000,
				avgHeartRate,
			});
		}
	}
	if (workout.duration >= 1800) {
		const lapCount = Math.min(4, Math.max(1, Math.floor(workout.duration / 1200)));
		for (let i = 0; i < lapCount; i++) {
			const startOffset = (workout.duration / lapCount) * i;
			const duration = Math.round(workout.duration / lapCount);
			laps.push({
				index: i + 1,
				startTimeISO: isoAtOffset(workout.startMinute, startOffset, dateIso),
				endTimeISO: isoAtOffset(workout.startMinute, startOffset + duration, dateIso),
				duration,
				distance: workout.distance ? Math.round(workout.distance / lapCount) : undefined,
			});
		}
	}
	return { laps, splits };
}

function buildWorkoutEntries(dateIso, plans, rng, restingHr) {
	return plans.map((plan, index) => {
		const ts = buildWorkoutTimeSeries(dateIso, plan, rngFor(dateIso, `workout-series-${index}`), restingHr);
		const hrValues = ts.heartRate.map((sample) => sample.value);
		const avgHeartRate = hrValues.length ? Math.round(hrValues.reduce((sum, value) => sum + value, 0) / hrValues.length) : undefined;
		const maxHeartRate = hrValues.length ? Math.max(...hrValues) : undefined;
		const minHeartRate = hrValues.length ? Math.min(...hrValues) : undefined;
		const caloriesPerMinute = {
			Running: 10.5,
			"High Intensity Interval Training": 11.4,
			Cycling: 8.4,
			Hiking: 7.3,
			Walking: 4.1,
			Swimming: 8.8,
			"Strength Training": 6.2,
			Yoga: 2.9,
			Pilates: 3.7,
		}[plan.type] ?? 6.2;
		const calories = Math.round((plan.duration / 60) * caloriesPerMinute * randBetween(rng, 0.9, 1.08));
		const endTimeISO = isoAtOffset(plan.startMinute, plan.duration, dateIso);
		const intervals = buildIntervals(dateIso, plan, ts, rngFor(dateIso, `intervals-${index}`));
		const workout = {
			type: plan.type,
			startTime: clockTime(localTimestamp(dateIso, plan.startMinute)),
			startTimeISO: localTimestamp(dateIso, plan.startMinute),
			endTimeISO,
			isIndoor: plan.indoor,
			locationType: plan.indoor ? "indoor" : "outdoor",
			routeAccess: ts.route.length ? "granted" : "unavailable",
			duration: plan.duration,
			durationFormatted: durationText(plan.duration),
			calories,
			avgHeartRate,
			averageHeartRate: avgHeartRate,
			maxHeartRate,
			heartRateMax: maxHeartRate,
			minHeartRate,
			heartRateMin: minHeartRate,
			laps: intervals.laps,
			splits: intervals.splits,
			segments: plan.type === "Swimming" ? [
				{
					startTime: localTimestamp(dateIso, plan.startMinute),
					endTime: endTimeISO,
					durationSeconds: plan.duration,
					type: "freestyle",
					repetitions: plan.strokes,
				},
			] : undefined,
			timeSeries: {
				heartRate: ts.heartRate,
				...(ts.speed.length ? { speed: ts.speed } : {}),
				...(ts.power.length ? { power: ts.power } : {}),
				...(ts.cadence.length ? { cadence: ts.cadence } : {}),
				...(ts.altitude.length ? { altitude: ts.altitude } : {}),
			},
			heartRateSamples: ts.heartRate,
			...(ts.speed.length ? { speedSamples: ts.speed } : {}),
			...(ts.power.length ? { powerSamples: ts.power } : {}),
			...(ts.cadence.length && plan.type === "Cycling" ? { cyclingCadenceSamples: ts.cadence } : {}),
			...(ts.cadence.length && plan.type !== "Cycling" ? { stepsCadenceSamples: ts.cadence } : {}),
			...(ts.altitude.length ? { elevationSamples: ts.altitude } : {}),
		};
		if (plan.distance) {
			workout.distance = plan.distance;
			workout.distanceFormatted = `${(plan.distance / 1000).toFixed(plan.distance >= 10000 ? 1 : 2)} km`;
			workout.averageSpeed = round(plan.distance / plan.duration, 2);
			workout.averagePaceSecondsPerKm = round(plan.duration / (plan.distance / 1000), 1);
		}
		if (ts.route.length) {
			workout.route = ts.route;
			workout.routePointCount = ts.route.length;
		}
		if (["Running", "High Intensity Interval Training"].includes(plan.type)) {
			workout.avgRunningCadence = Math.round(170 + randBetween(rng, -5, 6));
			workout.stepsCadenceAvg = workout.avgRunningCadence;
			workout.avgStrideLength = round(1.04 + randBetween(rng, -0.08, 0.09), 2);
			workout.avgGroundContactTime = Math.round(245 + randBetween(rng, -18, 22));
			workout.avgVerticalOscillation = round(8.2 + randBetween(rng, -0.7, 0.9), 1);
		}
		if (plan.type === "Cycling") {
			workout.avgCyclingCadence = Math.round(86 + randBetween(rng, -7, 8));
			workout.cyclingCadenceAvg = workout.avgCyclingCadence;
		}
		if (ts.power.length) {
			workout.avgPower = Math.round(ts.power.reduce((sum, sample) => sum + sample.value, 0) / ts.power.length);
			workout.powerAvg = workout.avgPower;
			workout.maxPower = Math.max(...ts.power.map((sample) => sample.value));
			workout.powerMax = workout.maxPower;
		}
		if (!plan.indoor) {
			workout.elevationGainMeters = Math.round(randBetween(rng, plan.type === "Hiking" ? 220 : 25, plan.type === "Cycling" ? 420 : 95));
			workout.elevationLossMeters = Math.round(workout.elevationGainMeters * randBetween(rng, 0.82, 1.08));
		}
		return workout;
	});
}

function buildActivity(dateIso, rng, dayIndex, totalDays, workouts, recoveryFlag) {
	const dow = dateFromIso(dateIso).getUTCDay();
	const trend = dayIndex / Math.max(1, totalDays - 1);
	const dayShape = [-1250, 180, 850, 420, 650, 220, 2350][dow];
	const seasonal = Math.sin(dayIndex / 365 * Math.PI * 2) * 540;
	const distanceWorkoutMeters = workouts.reduce((sum, workout) => {
		if (["Running", "Walking", "Hiking", "High Intensity Interval Training"].includes(workout.type)) return sum + (workout.distance ?? 0);
		return sum;
	}, 0);
	let steps = 6900 + trend * 720 + dayShape + seasonal + distanceWorkoutMeters * 1.22 + randBetween(rng, -1150, 1350);
	if (recoveryFlag) steps *= randBetween(rng, 0.45, 0.65);
	steps = Math.round(clamp(steps, 2300, 22500));
	const walkingRunningDistance = Math.round(steps * randBetween(rng, 0.72, 0.84) + distanceWorkoutMeters * 0.24);
	const workoutCalories = workouts.reduce((sum, workout) => sum + (workout.calories ?? 0), 0);
	const activeCalories = Math.round(clamp(steps * 0.044 + workoutCalories * 0.62 + randBetween(rng, 25, 95), 160, 1250));
	const basalEnergyBurned = Math.round(1610 + randBetween(rng, -55, 60));
	const exerciseMinutes = Math.round(clamp(steps / 650 + workouts.reduce((sum, workout) => sum + workout.duration / 60, 0) * 0.72 + randBetween(rng, -4, 8), 5, 155));
	const cyclingDistance = workouts.filter((workout) => workout.type === "Cycling").reduce((sum, workout) => sum + (workout.distance ?? 0), 0);
	const swimmingDistance = workouts.filter((workout) => workout.type === "Swimming").reduce((sum, workout) => sum + (workout.distance ?? 0), 0);
	const swimmingStrokes = workouts.filter((workout) => workout.type === "Swimming").reduce((sum, workout) => sum + (workout.segments?.[0]?.repetitions ?? 0), 0);
	const stepSamples = [];
	let cumulative = 0;
	for (let minute = 7 * 60; minute <= 22 * 60; minute += 60) {
		const dailyCurve = Math.max(0.15, Math.sin(((minute / 60) - 6.5) / 16 * Math.PI));
		const inc = Math.round((steps / 15) * dailyCurve * randBetween(rng, 0.55, 1.3));
		cumulative = Math.min(steps, cumulative + inc);
		stepSamples.push({ timestamp: localTimestamp(dateIso, minute), value: cumulative });
	}
	stepSamples[stepSamples.length - 1].value = steps;

	return {
		steps,
		activeCalories,
		totalCalories: activeCalories + basalEnergyBurned,
		basalEnergyBurned,
		exerciseMinutes,
		flightsClimbed: Math.round(clamp(steps / 1700 + randBetween(rng, -2, 5), 0, 26)),
		walkingRunningDistance,
		walkingRunningDistanceKm: round(walkingRunningDistance / 1000, 2),
		...(cyclingDistance ? { cyclingDistance, cyclingDistanceKm: round(cyclingDistance / 1000, 2) } : {}),
		elevationGained: Math.round(workouts.reduce((sum, workout) => sum + (workout.elevationGainMeters ?? 0), 0) + randBetween(rng, 2, 24)),
		pushCount: dayIndex % 41 === 0 ? Math.round(randBetween(rng, 120, 420)) : undefined,
		wheelchairPushes: dayIndex % 41 === 0 ? Math.round(randBetween(rng, 120, 420)) : undefined,
		...(swimmingDistance ? { swimmingDistance, swimmingDistanceKm: round(swimmingDistance / 1000, 2), swimmingStrokes } : {}),
		vo2Max: round(41.8 + trend * 2.8 + Math.sin(dayIndex / 29) * 0.7 + randBetween(rng, -0.45, 0.45), 1),
		stepSamples,
	};
}

function buildHeart(dateIso, rng, dayIndex, totalDays, sleep, workoutPlans, recoveryFlag) {
	const trend = dayIndex / Math.max(1, totalDays - 1);
	const sleepHours = sleep.totalDuration / 3600;
	const workoutLoad = workoutPlans.reduce((sum, workout) => sum + workout.duration / 3600, 0);
	const resting = Math.round(clamp(62 - trend * 3.0 + (7.25 - sleepHours) * 1.15 + workoutLoad * 0.55 + (recoveryFlag ? 3.5 : 0) + randBetween(rng, -2.2, 2.2), 48, 74));
	const hrv = round(clamp(43 + trend * 7.8 + (sleepHours - 7.2) * 2.6 - workoutLoad * 1.2 - (recoveryFlag ? 6 : 0) + randBetween(rng, -5, 5), 22, 78), 1);
	const workoutWindows = workoutPlans.map((plan) => ({ start: plan.startMinute, end: plan.startMinute + plan.duration / 60, type: plan.type }));
	const heartRateSamples = [];
	for (let minute = 0; minute < 1440; minute += 15) {
		const hour = minute / 60;
		const asleep = hour < 6.7 || hour >= 23;
		let value = resting + (asleep ? randBetween(rng, -4, 4) : 10 + 7 * Math.sin(((hour - 8) / 14) * Math.PI) + randBetween(rng, -5, 8));
		for (const window of workoutWindows) {
			if (minute >= window.start - 18 && minute <= window.end + 26) {
				const mid = (window.start + window.end) / 2;
				const span = (window.end - window.start) / 2 + 24;
				const effort = clamp(1 - Math.abs(minute - mid) / span, 0, 1);
				value += (workoutIntensity(window.type) - resting) * 0.78 * effort;
			}
		}
		heartRateSamples.push({ timestamp: localTimestamp(dateIso, minute), value: Math.round(clamp(value, 44, 188)) });
	}
	const values = heartRateSamples.map((sample) => sample.value);
	const averageHeartRate = round(values.reduce((sum, value) => sum + value, 0) / values.length, 1);
	return {
		restingHeartRate: resting,
		averageHeartRate,
		walkingHeartRateAverage: Math.round(clamp(resting + 34 + randBetween(rng, -4, 7), 82, 122)),
		heartRateMin: Math.min(...values),
		heartRateMax: Math.max(...values),
		hrv,
		heartRateSamples,
		hrvSamples: [
			{ timestamp: localTimestamp(dateIso, 2 * 60 + 20), value: round(clamp(hrv + randBetween(rng, -4, 4), 18, 85), 1) },
			{ timestamp: localTimestamp(dateIso, 4 * 60 + 10), value: round(clamp(hrv + randBetween(rng, -3, 3), 18, 85), 1) },
		],
	};
}

function buildVitals(dateIso, rng, dayIndex, sleep, recoveryFlag) {
	const sleepHours = sleep.totalDuration / 3600;
	const spo2Base = 0.974 + Math.sin(dayIndex / 19) * 0.0035 + (sleepHours - 7.2) * 0.0008 + randBetween(rng, -0.0022, 0.0022);
	const respBase = 14.7 - (sleepHours - 7.2) * 0.18 + (recoveryFlag ? 1.15 : 0) + Math.sin(dayIndex / 17) * 0.25;
	const bodyTempBase = 36.55 + Math.sin(dayIndex / 31) * 0.08 + (recoveryFlag ? 0.18 : 0);
	const systolicBase = 118 + Math.sin(dayIndex / 28) * 3 + (recoveryFlag ? 4 : 0);
	const diastolicBase = 74 + Math.cos(dayIndex / 24) * 2 + (recoveryFlag ? 2 : 0);
	const glucoseBase = 92 + Math.sin(dayIndex / 11) * 4;
	const bloodOxygenSamples = [];
	const respiratoryRateSamples = [];
	const bloodPressureSamples = [];
	const bloodGlucoseSamples = [];
	const bodyTemperatureSamples = [];
	for (const minute of [50, 125, 210, 290, 370, 455, 930, 1325]) {
		let oxygen = spo2Base + randBetween(rng, -0.008, 0.009);
		if (recoveryFlag && minute < 460) oxygen -= randBetween(rng, 0.004, 0.012);
		oxygen = round(clamp(oxygen, 0.925, 0.998), 3);
		bloodOxygenSamples.push({ timestamp: localTimestamp(dateIso, minute), value: oxygen });
		respiratoryRateSamples.push({ timestamp: localTimestamp(dateIso, minute), value: round(clamp(respBase + randBetween(rng, -0.65, 0.8), 11.2, 21.6), 1) });
	}
	for (const minute of [8 * 60 + 15, 20 * 60 + 30]) {
		bloodPressureSamples.push({
			timestamp: localTimestamp(dateIso, minute),
			systolic: round(clamp(systolicBase + randBetween(rng, -5, 6), 98, 138), 0),
			diastolic: round(clamp(diastolicBase + randBetween(rng, -4, 5), 60, 92), 0),
		});
	}
	for (const minute of [8 * 60 + 20, 13 * 60 + 10, 19 * 60 + 40]) {
		bloodGlucoseSamples.push({ timestamp: localTimestamp(dateIso, minute), value: round(clamp(glucoseBase + randBetween(rng, -9, 24), 72, 142), 1) });
	}
	for (const minute of [7 * 60, 21 * 60 + 15]) {
		bodyTemperatureSamples.push({ timestamp: localTimestamp(dateIso, minute), value: round(clamp(bodyTempBase + randBetween(rng, -0.16, 0.18), 36.0, 37.4), 2) });
	}

	const oxVals = bloodOxygenSamples.map((sample) => sample.value);
	const respVals = respiratoryRateSamples.map((sample) => sample.value);
	const sysVals = bloodPressureSamples.map((sample) => sample.systolic);
	const diaVals = bloodPressureSamples.map((sample) => sample.diastolic);
	const glucoseVals = bloodGlucoseSamples.map((sample) => sample.value);
	const tempVals = bodyTemperatureSamples.map((sample) => sample.value);
	const avg = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
	return {
		respiratoryRateAvg: round(avg(respVals), 1),
		respiratoryRate: round(avg(respVals), 1),
		respiratoryRateMin: Math.min(...respVals),
		respiratoryRateMax: Math.max(...respVals),
		bloodOxygenAvg: round(avg(oxVals), 3),
		bloodOxygen: round(avg(oxVals), 3),
		bloodOxygenPercent: round(avg(oxVals) * 100, 1),
		bloodOxygenMin: Math.min(...oxVals),
		bloodOxygenMinPercent: round(Math.min(...oxVals) * 100, 1),
		bloodOxygenMax: Math.max(...oxVals),
		bloodOxygenMaxPercent: round(Math.max(...oxVals) * 100, 1),
		bodyTemperatureAvg: round(avg(tempVals), 2),
		bodyTemperature: round(avg(tempVals), 2),
		bodyTemperatureMin: Math.min(...tempVals),
		bodyTemperatureMax: Math.max(...tempVals),
		bloodPressureSystolicAvg: round(avg(sysVals), 0),
		bloodPressureSystolic: round(avg(sysVals), 0),
		bloodPressureSystolicMin: Math.min(...sysVals),
		bloodPressureSystolicMax: Math.max(...sysVals),
		bloodPressureDiastolicAvg: round(avg(diaVals), 0),
		bloodPressureDiastolic: round(avg(diaVals), 0),
		bloodPressureDiastolicMin: Math.min(...diaVals),
		bloodPressureDiastolicMax: Math.max(...diaVals),
		bloodGlucoseAvg: round(avg(glucoseVals), 1),
		bloodGlucose: round(avg(glucoseVals), 1),
		bloodGlucoseMin: Math.min(...glucoseVals),
		bloodGlucoseMax: Math.max(...glucoseVals),
		basalBodyTemperature: round(36.48 + Math.sin(dayIndex / 27) * 0.07, 2),
		skinTemperatureDelta: round(Math.sin(dayIndex / 10) * 0.22 + (recoveryFlag ? 0.38 : 0) + randBetween(rng, -0.08, 0.08), 2),
		bloodOxygenSamples,
		bloodPressureSamples,
		bloodGlucoseSamples,
		respiratoryRateSamples,
		bodyTemperatureSamples,
	};
}

function buildBody(rng, dayIndex) {
	const weight = round(75.2 - dayIndex * 0.006 + Math.sin(dayIndex / 14) * 0.28 + randBetween(rng, -0.18, 0.18), 1);
	const height = 1.78;
	const bodyFatPercentage = round(clamp(0.184 - dayIndex * 0.00004 + Math.sin(dayIndex / 19) * 0.004 + randBetween(rng, -0.002, 0.002), 0.145, 0.215), 3);
	return {
		weight,
		height,
		bmi: round(weight / (height * height), 1),
		bodyFatPercentage,
		bodyFatPercent: round(bodyFatPercentage * 100, 1),
		leanBodyMass: round(weight * (1 - bodyFatPercentage), 1),
		bodyWaterMass: round(weight * 0.58 + randBetween(rng, -0.4, 0.4), 1),
		boneMass: round(3.2 + randBetween(rng, -0.08, 0.08), 2),
	};
}

function buildNutrition(rng, activity, workouts, recoveryFlag) {
	const workoutMinutes = workouts.reduce((sum, workout) => sum + workout.duration / 60, 0);
	const dietaryEnergy = Math.round(clamp(2050 + activity.activeCalories * 0.35 + workoutMinutes * 2.6 + randBetween(rng, -210, 260), 1600, 3200));
	const protein = round(clamp(112 + workoutMinutes * 0.18 + randBetween(rng, -14, 18), 72, 165), 1);
	const carbohydrates = round(clamp(230 + workoutMinutes * 0.72 + randBetween(rng, -45, 55), 130, 390), 1);
	const fat = round(clamp(72 + randBetween(rng, -14, 18), 42, 115), 1);
	const saturatedFat = round(fat * randBetween(rng, 0.23, 0.32), 1);
	const monounsaturatedFat = round(fat * randBetween(rng, 0.28, 0.38), 1);
	const polyunsaturatedFat = round(fat * randBetween(rng, 0.14, 0.23), 1);
	return {
		dietaryEnergy,
		protein,
		carbohydrates,
		fat,
		saturatedFat,
		monounsaturatedFat,
		polyunsaturatedFat,
		unsaturatedFat: round(monounsaturatedFat + polyunsaturatedFat, 1),
		transFat: round(randBetween(rng, 0, 0.8), 1),
		fiber: round(clamp(28 + randBetween(rng, -7, 9), 12, 48), 1),
		sugar: round(clamp(48 + randBetween(rng, -18, 26), 18, 105), 1),
		sodium: Math.round(clamp(2200 + randBetween(rng, -520, 760), 1100, 4200)),
		potassium: Math.round(clamp(3300 + randBetween(rng, -420, 580), 2100, 4700)),
		calcium: Math.round(clamp(930 + randBetween(rng, -190, 260), 520, 1450)),
		iron: round(clamp(13 + randBetween(rng, -3, 4), 7, 24), 1),
		magnesium: Math.round(clamp(385 + randBetween(rng, -60, 80), 220, 560)),
		zinc: round(clamp(11 + randBetween(rng, -2.2, 3.0), 6, 19), 1),
		phosphorus: Math.round(clamp(1160 + randBetween(rng, -170, 220), 720, 1700)),
		iodine: Math.round(clamp(155 + randBetween(rng, -32, 45), 80, 260)),
		selenium: round(clamp(72 + randBetween(rng, -15, 20), 36, 115), 1),
		copper: round(clamp(1.1 + randBetween(rng, -0.2, 0.25), 0.6, 1.9), 2),
		manganese: round(clamp(2.1 + randBetween(rng, -0.4, 0.6), 1.0, 3.5), 2),
		chromium: Math.round(clamp(34 + randBetween(rng, -8, 11), 14, 62)),
		molybdenum: Math.round(clamp(49 + randBetween(rng, -11, 16), 24, 82)),
		chloride: Math.round(clamp(2550 + randBetween(rng, -420, 580), 1500, 3800)),
		vitaminA: Math.round(clamp(780 + randBetween(rng, -180, 260), 360, 1350)),
		vitaminB6: round(clamp(1.7 + randBetween(rng, -0.35, 0.5), 0.9, 3.0), 2),
		vitaminB12: round(clamp(3.5 + randBetween(rng, -0.8, 1.1), 1.2, 6.8), 2),
		vitaminC: Math.round(clamp(95 + randBetween(rng, -32, 55), 28, 220)),
		vitaminD: round(clamp(18 + randBetween(rng, -5, 7), 6, 34), 1),
		vitaminE: round(clamp(13 + randBetween(rng, -3, 4), 6, 24), 1),
		vitaminK: Math.round(clamp(115 + randBetween(rng, -35, 55), 42, 220)),
		thiamin: round(clamp(1.4 + randBetween(rng, -0.25, 0.4), 0.8, 2.5), 2),
		riboflavin: round(clamp(1.6 + randBetween(rng, -0.28, 0.42), 0.8, 2.7), 2),
		niacin: round(clamp(17 + randBetween(rng, -3, 5), 9, 30), 1),
		folate: Math.round(clamp(410 + randBetween(rng, -80, 110), 230, 650)),
		folicAcid: Math.round(clamp(120 + randBetween(rng, -35, 45), 20, 240)),
		pantothenicAcid: round(clamp(5.4 + randBetween(rng, -1, 1.4), 2.8, 9.2), 2),
		biotin: Math.round(clamp(32 + randBetween(rng, -7, 11), 14, 58)),
		cholesterol: Math.round(clamp(185 + randBetween(rng, -55, 70), 60, 330)),
		water: round(clamp(2.5 + activity.steps / 25000 + (recoveryFlag ? 0.25 : 0) + randBetween(rng, -0.35, 0.4), 1.5, 4.2), 2),
		caffeine: Math.round(clamp(165 + randBetween(rng, -80, 100), 0, 390)),
	};
}

function vitaminsFromNutrition(n) {
	return {
		vitamin_a_ug: round(n.vitaminA, 1),
		vitamin_b6_mg: round(n.vitaminB6, 2),
		vitamin_b12_ug: round(n.vitaminB12, 2),
		vitamin_c_mg: round(n.vitaminC, 1),
		vitamin_d_ug: round(n.vitaminD, 1),
		vitamin_e_mg: round(n.vitaminE, 2),
		vitamin_k_ug: round(n.vitaminK, 1),
		thiamin_mg: round(n.thiamin, 2),
		riboflavin_mg: round(n.riboflavin, 2),
		niacin_mg: round(n.niacin, 1),
		folate_ug: round(n.folate, 1),
		biotin_ug: round(n.biotin, 1),
		pantothenic_acid_mg: round(n.pantothenicAcid, 2),
	};
}

function mineralsFromNutrition(n) {
	return {
		calcium_mg: round(n.calcium, 1),
		iron_mg: round(n.iron, 2),
		potassium_mg: round(n.potassium, 1),
		magnesium_mg: round(n.magnesium, 1),
		phosphorus_mg: round(n.phosphorus, 1),
		zinc_mg: round(n.zinc, 2),
		selenium_ug: round(n.selenium, 1),
		copper_mg: round(n.copper, 3),
		manganese_mg: round(n.manganese, 2),
		chromium_ug: round(n.chromium, 1),
		molybdenum_ug: round(n.molybdenum, 1),
		chloride_mg: round(n.chloride, 1),
		iodine_ug: round(n.iodine, 1),
	};
}

function buildMobility(rng, dayIndex, totalDays, workouts, recoveryFlag, vo2Max) {
	const trend = dayIndex / Math.max(1, totalDays - 1);
	const cycling = workouts.find((workout) => workout.type === "Cycling");
	const running = workouts.find((workout) => workout.type === "Running" || workout.type === "High Intensity Interval Training");
	return {
		walkingSpeed: round(clamp(1.25 + trend * 0.07 + randBetween(rng, -0.07, 0.07) - (recoveryFlag ? 0.08 : 0), 0.92, 1.52), 2),
		vo2Max,
		...(cycling?.avgCyclingCadence ? { cyclingCadenceAvg: cycling.avgCyclingCadence } : {}),
		stepsCadenceAvg: running?.avgRunningCadence ?? Math.round(105 + randBetween(rng, -9, 11)),
		...(cycling?.avgPower ? { powerAvg: cycling.avgPower, powerMax: cycling.maxPower } : {}),
		...(running?.distance ? { runningSpeed: round(running.distance / running.duration, 2) } : {}),
		...(running?.avgPower ? { runningPowerW: running.avgPower, runningPowerAvg: running.avgPower, runningPowerMax: running.maxPower } : {}),
	};
}

function buildMindfulness(rng, dateIso) {
	const sessions = rng() < 0.72 ? Math.round(randBetween(rng, 1, 3)) : 0;
	const minutes = sessions ? Math.round(randBetween(rng, 8, 26) * sessions) : undefined;
	if (!sessions) return undefined;
	return {
		mindfulMinutes: minutes,
		mindfulSessions: sessions,
		sessions: Array.from({ length: sessions }, (_, i) => {
			const startMinute = (i === 0 ? 7 * 60 + 20 : 21 * 60) + Math.round(randBetween(rng, -18, 18));
			const duration = Math.round(minutes / sessions) * 60;
			return {
				startTime: localTimestamp(dateIso, startMinute),
				endTime: isoAtOffset(startMinute, duration, dateIso),
			};
		}),
	};
}

function buildReproductiveHealth(dayIndex) {
	const cycleDay = ((dayIndex % 29) + 29) % 29 + 1;
	if (cycleDay <= 5) {
		return {
			menstrual_flow: cycleDay <= 2 ? "medium" : cycleDay === 3 ? "heavy" : "light",
			menstrualFlow: cycleDay <= 2 ? "medium" : cycleDay === 3 ? "heavy" : "light",
		};
	}
	if (cycleDay >= 12 && cycleDay <= 15) {
		return {
			cervical_mucus: "egg_white",
			cervicalMucusAppearance: "egg_white",
			cervicalMucusSensation: "slippery",
			ovulation_test: cycleDay === 14 ? "positive" : "high",
			ovulationTestResult: cycleDay === 14 ? "positive" : "high",
		};
	}
	return undefined;
}

function pruneUndefined(value) {
	if (Array.isArray(value)) return value.map(pruneUndefined).filter((item) => item !== undefined);
	if (value && typeof value === "object") {
		const next = {};
		for (const [key, child] of Object.entries(value)) {
			const pruned = pruneUndefined(child);
			if (pruned !== undefined) next[key] = pruned;
		}
		return next;
	}
	return value === undefined ? undefined : value;
}

function buildDay(dateIso, dayIndex, totalDays) {
	const recoveryFlag = dayIndex % 37 === 11 || dayIndex % 53 === 29;
	const rawPlans = workoutPlan(dateIso, rngFor(dateIso, "plan"), dayIndex);
	const workoutLoad = rawPlans.reduce((sum, workout) => sum + workout.duration / 3600, 0);
	const sleep = buildSleep(dateIso, rngFor(dateIso, "sleep"), dayIndex, workoutLoad, recoveryFlag);
	const preliminaryResting = 61 + randBetween(rngFor(dateIso, "pre-resting"), -3, 3);
	const workouts = buildWorkoutEntries(dateIso, rawPlans, rngFor(dateIso, "workouts"), preliminaryResting);
	const activity = buildActivity(dateIso, rngFor(dateIso, "activity"), dayIndex, totalDays, workouts, recoveryFlag);
	const heart = buildHeart(dateIso, rngFor(dateIso, "heart"), dayIndex, totalDays, sleep, rawPlans, recoveryFlag);
	const finalWorkouts = buildWorkoutEntries(dateIso, rawPlans, rngFor(dateIso, "workouts-final"), heart.restingHeartRate);
	const finalActivity = buildActivity(dateIso, rngFor(dateIso, "activity-final"), dayIndex, totalDays, finalWorkouts, recoveryFlag);
	const vitals = buildVitals(dateIso, rngFor(dateIso, "vitals"), dayIndex, sleep, recoveryFlag);
	const body = buildBody(rngFor(dateIso, "body"), dayIndex);
	const nutrition = buildNutrition(rngFor(dateIso, "nutrition"), finalActivity, finalWorkouts, recoveryFlag);
	const mobility = buildMobility(rngFor(dateIso, "mobility"), dayIndex, totalDays, finalWorkouts, recoveryFlag, finalActivity.vo2Max);
	const mindfulness = buildMindfulness(rngFor(dateIso, "mindfulness"), dateIso);
	const reproductiveHealth = buildReproductiveHealth(dayIndex);
	const cycling = finalWorkouts.find((workout) => workout.type === "Cycling");

	return pruneUndefined({
		date: dateIso,
		type: "health-data",
		units: "metric",
		sleep,
		activity: finalActivity,
		...(cycling || finalActivity.cyclingDistance ? {
			cyclingPerformance: {
				...(finalActivity.cyclingDistance ? { cycling_km: round(finalActivity.cyclingDistance / 1000, 2) } : {}),
				...(cycling?.avgCyclingCadence ? { cycling_cadence_rpm: cycling.avgCyclingCadence } : {}),
				...(cycling?.avgPower ? { cycling_power_w: cycling.avgPower } : {}),
			},
		} : {}),
		heart,
		vitals,
		body,
		nutrition,
		vitamins: vitaminsFromNutrition(nutrition),
		minerals: mineralsFromNutrition(nutrition),
		mobility,
		...(reproductiveHealth ? { reproductiveHealth } : {}),
		...(mindfulness ? { mindfulness } : {}),
		...(finalWorkouts.length ? { workouts: finalWorkouts } : {}),
	});
}

async function cleanOutputDir() {
	await mkdir(OUT_DIR, { recursive: true });
	const files = await readdir(OUT_DIR);
	await Promise.all(
		files
			.filter((file) => file.endsWith(".json") || file === "README.md")
			.map((file) => rm(path.join(OUT_DIR, file), { force: true }))
	);
}

async function main() {
	const dates = enumerateDates(START_DATE, END_DATE);
	await cleanOutputDir();

	for (let i = 0; i < dates.length; i++) {
		const day = buildDay(dates[i], i, dates.length);
		await writeFile(path.join(OUT_DIR, `${dates[i]}.json`), `${JSON.stringify(day, null, 2)}\n`);
	}

	const readme = `# Mock Android Health.md export\n\nThis folder contains deterministic, privacy-safe mock data shaped like a full granular JSON export from \`/Users/codybontecou/projects/health-md-android\`. It is not real health data.\n\n- Files: one Android-compatible \`health-data\` JSON document per day\n- Range: \`${START_DATE}\` through \`${END_DATE}\`\n- Includes: Health Connect-style sleep, activity, heart, vitals, body, nutrition, vitamins, minerals, mobility, reproductive health, mindfulness, detailed workouts, routes, and workout time series\n- Android compatibility keys are included alongside iOS-parity aliases where the Android exporter supports both\n- SpO₂ aggregate/sample values intentionally follow the Android/iOS contract (fractions such as \`0.97\`) while percent aliases such as \`bloodOxygenPercent\` are also present\n\nThis repo is an Obsidian vault. The checked-in local plugin settings point to \`examples/AndroidHealthExport\`, so opening the Android dashboard should use this Android-shaped mock export immediately.\n\nRegenerate with:\n\n\`\`\`bash\nnpm run generate:mock-android\n\`\`\`\n\nOverride the date window if needed:\n\n\`\`\`bash\nANDROID_HEALTH_START=2026-03-01 ANDROID_HEALTH_END=2026-06-10 npm run generate:mock-android\n\`\`\`\n`;
	await writeFile(path.join(OUT_DIR, "README.md"), readme);

	console.log(`Wrote ${dates.length} mock Android Health.md JSON files to ${path.relative(REPO_ROOT, OUT_DIR)}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
