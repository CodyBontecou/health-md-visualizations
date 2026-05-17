#!/usr/bin/env node
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "examples", "Health");

const START_DATE = "2025-11-19";
const END_DATE = "2026-12-31";
const SEED = 0x5eed5eed;

const DAY_MS = 86_400_000;
const SAMPLE_TIMEZONE_NOTE = "Floating local timestamps (no timezone) keep the sample vault portable.";

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
	return new Date(`${dateIso}T00:00:00`);
}

function isoDate(date) {
	return date.toISOString().slice(0, 10);
}

function addDays(dateIso, days) {
	const d = dateFromIso(dateIso);
	d.setUTCDate(d.getUTCDate() + days);
	return isoDate(d);
}

function localTimestamp(dateIso, minutesFromMidnight, seconds = 0) {
	const dayOffset = Math.floor(minutesFromMidnight / 1440);
	const minuteOfDay = ((Math.floor(minutesFromMidnight) % 1440) + 1440) % 1440;
	const d = addDays(dateIso, dayOffset);
	const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
	const mm = String(minuteOfDay % 60).padStart(2, "0");
	const ss = String(seconds).padStart(2, "0");
	return `${d}T${hh}:${mm}:${ss}`;
}

function durationText(seconds) {
	const h = Math.floor(seconds / 3600);
	const m = Math.round((seconds % 3600) / 60);
	return h === 0 ? `${m}m` : `${h}h ${m}m`;
}

function paceText(durationSeconds, distanceKm) {
	if (!distanceKm) return undefined;
	const secPerKm = durationSeconds / distanceKm;
	const min = Math.floor(secPerKm / 60);
	const sec = Math.round(secPerKm % 60);
	return `${min}:${String(sec).padStart(2, "0")}/km`;
}

function speedText(distanceKm, durationSeconds) {
	if (!distanceKm || !durationSeconds) return undefined;
	return `${round(distanceKm / (durationSeconds / 3600), 1)} km/h`;
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

function stageTemplate(rng, totalSleepSeconds, awakeSeconds) {
	const stages = [];
	let remaining = totalSleepSeconds;
	let awakeRemaining = awakeSeconds;

	const addAwake = (seconds) => {
		const s = Math.round(clamp(seconds, 0, awakeRemaining));
		if (s > 0) {
			stages.push(["awake", s]);
			awakeRemaining -= s;
		}
	};
	const addSleep = (stage, seconds) => {
		const s = Math.round(clamp(seconds, 0, remaining));
		if (s > 0) {
			stages.push([stage, s]);
			remaining -= s;
		}
	};

	addAwake(awakeSeconds * randBetween(rng, 0.18, 0.32));

	const cycles = [
		{ core: 0.12, deep: 0.11, rem: 0.04 },
		{ core: 0.16, deep: 0.07, rem: 0.08 },
		{ core: 0.18, deep: 0.03, rem: 0.12 },
		{ core: 0.14, deep: 0.01, rem: 0.14 },
	];

	for (const cycle of cycles) {
		if (remaining <= 0) break;
		addSleep("core", totalSleepSeconds * cycle.core * randBetween(rng, 0.85, 1.15));
		addSleep("deep", totalSleepSeconds * cycle.deep * randBetween(rng, 0.75, 1.25));
		addSleep("core", totalSleepSeconds * cycle.core * randBetween(rng, 0.45, 0.75));
		addSleep("rem", totalSleepSeconds * cycle.rem * randBetween(rng, 0.85, 1.2));
		addAwake(randBetween(rng, 90, 420));
	}

	while (remaining > 0) {
		const next = remaining > 45 * 60 ? choose(rng, ["core", "rem", "core"]) : "core";
		addSleep(next, Math.min(remaining, randBetween(rng, 12 * 60, 38 * 60)));
		if (remaining > 0 && rng() < 0.28) addAwake(randBetween(rng, 60, 240));
	}
	addAwake(awakeRemaining);

	return stages.filter(([, seconds]) => seconds > 0);
}

function buildSleep(dateIso, rng, dayIndex, totalDays, workoutLoad) {
	const dow = dateFromIso(dateIso).getUTCDay();
	const weekend = dow === 5 || dow === 6;
	const seasonal = Math.sin((dayIndex / 365) * Math.PI * 2);
	const consistency = Math.sin(dayIndex / 9) * 9;
	const bedMinutes = 22 * 60 + 25 + consistency + (weekend ? 42 : 0) + randBetween(rng, -28, 26);
	const sleepHours = clamp(
		7.45 + seasonal * 0.22 - workoutLoad * 0.18 + (weekend ? 0.28 : 0) + randBetween(rng, -0.48, 0.48),
		5.9,
		9.05
	);
	const awakeMinutes = clamp(24 + workoutLoad * 9 + randBetween(rng, -8, 18), 12, 58);
	const totalSleepSeconds = Math.round(sleepHours * 3600);
	const awakeSeconds = Math.round(awakeMinutes * 60);
	const inBedSeconds = totalSleepSeconds + awakeSeconds;
	const wakeMinutes = bedMinutes + inBedSeconds / 60;

	let cursorMinutes = bedMinutes;
	const stageDurations = stageTemplate(rng, totalSleepSeconds, awakeSeconds);
	const sleepStages = stageDurations.map(([stage, seconds]) => {
		const startDate = localTimestamp(dateIso, cursorMinutes);
		cursorMinutes += seconds / 60;
		return {
			stage,
			startDate,
			endDate: localTimestamp(dateIso, cursorMinutes),
			durationSeconds: seconds,
		};
	});

	const totals = sleepStages.reduce(
		(acc, stage) => {
			if (stage.stage === "deep") acc.deep += stage.durationSeconds;
			else if (stage.stage === "rem") acc.rem += stage.durationSeconds;
			else if (stage.stage === "core" || stage.stage === "light") acc.core += stage.durationSeconds;
			else if (stage.stage === "awake") acc.awake += stage.durationSeconds;
			return acc;
		},
		{ deep: 0, rem: 0, core: 0, awake: 0 }
	);
	const actualSleep = totals.deep + totals.rem + totals.core;

	return {
		sleepStages,
		totalDuration: actualSleep,
		totalDurationFormatted: durationText(actualSleep),
		deepSleep: totals.deep,
		deepSleepFormatted: durationText(totals.deep),
		remSleep: totals.rem,
		remSleepFormatted: durationText(totals.rem),
		coreSleep: totals.core,
		coreSleepFormatted: durationText(totals.core),
		awakeTime: totals.awake,
		awakeTimeFormatted: durationText(totals.awake),
		bedtime: localTimestamp(dateIso, bedMinutes),
		wakeTime: localTimestamp(dateIso, wakeMinutes),
	};
}

function workoutPlan(dateIso, rng, dayIndex) {
	const dow = dateFromIso(dateIso).getUTCDay();
	const weekPhase = Math.floor(dayIndex / 7) % 4;
	const workouts = [];

	if (dow === 2) {
		const duration = Math.round(randBetween(rng, 36, 50) * 60);
		const distance = round(duration / 60 / randBetween(rng, 5.7, 6.45), 2);
		workouts.push({ type: weekPhase === 2 ? "high intensity interval training" : "running", startMinute: 17 * 60 + 30 + Math.round(randBetween(rng, -20, 25)), duration, distance });
	} else if (dow === 4) {
		const type = weekPhase === 1 ? "yoga" : "strength training";
		workouts.push({ type, startMinute: 18 * 60 + Math.round(randBetween(rng, -25, 30)), duration: Math.round(randBetween(rng, 32, 52) * 60) });
	} else if (dow === 6) {
		const type = weekPhase === 3 ? "hiking" : "cycling";
		const duration = Math.round(randBetween(rng, type === "hiking" ? 78 : 58, type === "hiking" ? 118 : 92) * 60);
		const distance = round(type === "hiking" ? randBetween(rng, 7.4, 11.8) : randBetween(rng, 18, 32), 2);
		workouts.push({ type, startMinute: 9 * 60 + Math.round(randBetween(rng, -35, 50)), duration, distance });
	} else if (dow === 0 && dayIndex % 3 === 0) {
		workouts.push({ type: "walking", startMinute: 10 * 60 + Math.round(randBetween(rng, -20, 45)), duration: Math.round(randBetween(rng, 30, 55) * 60), distance: round(randBetween(rng, 2.4, 4.6), 2) });
	}

	return workouts;
}

function buildWorkoutTimeSeries(dateIso, workout, rng, restingHr) {
	const start = workout.startMinute;
	const duration = workout.duration;
	const samples = [];
	const route = [];
	const routeCapable = ["running", "cycling", "hiking", "walking", "high intensity interval training"].includes(workout.type);
	const peakByType = {
		running: 156,
		"high intensity interval training": 170,
		cycling: 148,
		hiking: 136,
		walking: 112,
		"strength training": 128,
		yoga: 92,
	};
	const peak = (peakByType[workout.type] ?? 128) + randBetween(rng, -5, 6);
	const floor = restingHr + randBetween(rng, 18, 26);
	const sampleStep = 60;
	for (let t = 0; t <= duration; t += sampleStep) {
		const frac = duration > 0 ? t / duration : 0;
		const warmup = Math.min(1, frac / 0.18);
		const cooldown = frac > 0.82 ? (1 - frac) / 0.18 : 1;
		const effort = clamp(Math.min(warmup, cooldown) + 0.08 * Math.sin(frac * Math.PI * 10), 0, 1);
		const value = Math.round(floor + (peak - floor) * effort + randBetween(rng, -3.2, 3.2));
		samples.push({ timestamp: localTimestamp(dateIso, start + t / 60), value });
	}

	if (routeCapable && workout.distance) {
		const points = Math.min(72, Math.max(28, Math.round(duration / 90)));
		const centerLat = 37.7694 + randBetween(rng, -0.004, 0.004);
		const centerLon = -122.4862 + randBetween(rng, -0.004, 0.004);
		const radius = workout.type === "cycling" ? 0.018 : workout.type === "hiking" ? 0.012 : 0.007;
		for (let i = 0; i < points; i++) {
			const frac = i / (points - 1 || 1);
			const angle = frac * Math.PI * 2 + randBetween(rng, -0.07, 0.07);
			const wobble = 1 + 0.18 * Math.sin(frac * Math.PI * 6 + dayIndexFromDate(dateIso) * 0.1);
			route.push({
				timestamp: localTimestamp(dateIso, start + (duration / 60) * frac),
				latitude: round(centerLat + Math.sin(angle) * radius * wobble, 6),
				longitude: round(centerLon + Math.cos(angle) * radius * wobble, 6),
				altitude: round(45 + 18 * Math.sin(frac * Math.PI * 4) + randBetween(rng, -2, 2), 1),
				speedMps: round((workout.distance * 1000 / duration) * randBetween(rng, 0.82, 1.18), 2),
				courseDegrees: Math.round(((angle * 180) / Math.PI + 360) % 360),
				horizontalAccuracyMeters: round(randBetween(rng, 3.5, 9), 1),
			});
		}
	}

	return { samples, route };
}

function dayIndexFromDate(dateIso) {
	return Math.round((dateFromIso(dateIso).getTime() - dateFromIso(START_DATE).getTime()) / DAY_MS);
}

function buildWorkoutEntries(dateIso, plans, rng, restingHr) {
	return plans.map((plan, index) => {
		const ts = buildWorkoutTimeSeries(dateIso, plan, rngFor(dateIso, `workout-${index}`), restingHr);
		const avgHeartRate = Math.round(ts.samples.reduce((sum, sample) => sum + sample.value, 0) / ts.samples.length);
		const maxHeartRate = Math.max(...ts.samples.map((sample) => sample.value));
		const minHeartRate = Math.min(...ts.samples.map((sample) => sample.value));
		const caloriesByType = {
			running: 10.4,
			"high intensity interval training": 11.2,
			cycling: 8.2,
			hiking: 7.5,
			walking: 4.2,
			"strength training": 6.0,
			yoga: 3.0,
		};
		const calories = Math.round((plan.duration / 60) * (caloriesByType[plan.type] ?? 6.2) * randBetween(rng, 0.9, 1.08));
		const workout = {
			type: plan.type,
			duration: plan.duration,
			durationFormatted: durationText(plan.duration),
			calories,
			startTime: localTimestamp(dateIso, plan.startMinute),
			avgHeartRate,
			maxHeartRate,
			minHeartRate,
			timeSeries: {
				heartRate: ts.samples,
			},
		};
		if (plan.distance) {
			workout.distance = plan.distance;
			workout.distanceFormatted = `${plan.distance.toFixed(2)} km`;
			workout.avgPaceFormatted = paceText(plan.duration, plan.distance);
			workout.avgSpeedFormatted = speedText(plan.distance, plan.duration);
		}
		if (ts.route.length) workout.route = ts.route;
		if (plan.type === "running" || plan.type === "high intensity interval training") {
			const km = Math.max(1, Math.floor(plan.distance ?? 0));
			workout.splits = Array.from({ length: km }, (_, i) => ({
				index: i + 1,
				duration: Math.round(plan.duration / km + randBetween(rng, -18, 22)),
				distance: 1,
				paceFormatted: paceText(Math.round(plan.duration / km + randBetween(rng, -18, 22)), 1),
				avgHeartRate: Math.round(avgHeartRate + randBetween(rng, -5, 6)),
			}));
		}
		return workout;
	});
}

function buildActivity(dateIso, rng, dayIndex, totalDays, workoutEntries, recoveryFlag) {
	const dow = dateFromIso(dateIso).getUTCDay();
	const trend = dayIndex / Math.max(1, totalDays - 1);
	const dayShape = [-1350, -250, 600, 300, 720, 120, 2450][dow];
	const seasonal = Math.sin((dayIndex / 365) * Math.PI * 2) * 620;
	const workoutSteps = workoutEntries.reduce((sum, workout) => {
		if (workout.type === "running" || workout.type === "high intensity interval training") return sum + (workout.distance ?? 0) * 1320;
		if (workout.type === "walking" || workout.type === "hiking") return sum + (workout.distance ?? 0) * 1280;
		return sum;
	}, 0);
	let steps = 7100 + trend * 850 + dayShape + seasonal + workoutSteps + randBetween(rng, -1250, 1450);
	if (recoveryFlag) steps *= randBetween(rng, 0.42, 0.62);
	steps = Math.round(clamp(steps, 2400, 21000));
	const distance = round(steps * randBetween(rng, 0.00072, 0.00084), 2);
	const workoutCalories = workoutEntries.reduce((sum, workout) => sum + (workout.calories ?? 0), 0);
	const activeCalories = Math.round(clamp(steps * 0.043 + workoutCalories * 0.58 + randBetween(rng, 30, 95), 165, 1180));
	const workoutMinutes = workoutEntries.reduce((sum, workout) => sum + workout.duration / 60, 0);
	const exerciseMinutes = Math.round(clamp(steps / 640 + workoutMinutes * 0.72 + randBetween(rng, -4, 7), 6, 145));
	const standHours = Math.round(clamp(6 + steps / 1350 + randBetween(rng, -1.2, 1.6), 5, 14));
	return {
		steps,
		walkingRunningDistanceKm: distance,
		walkingRunningDistance: round(distance * 1000, 0),
		activeCalories,
		exerciseMinutes,
		vo2Max: round(41.6 + trend * 3.4 + Math.sin(dayIndex / 31) * 0.7 + randBetween(rng, -0.45, 0.45), 1),
		basalEnergyBurned: Math.round(1600 + randBetween(rng, -55, 55)),
		standHours,
		flightsClimbed: Math.round(clamp(steps / 1650 + randBetween(rng, -2, 5), 0, 24)),
	};
}

function buildHeart(dateIso, rng, dayIndex, totalDays, sleep, workoutPlans, recoveryFlag) {
	const trend = dayIndex / Math.max(1, totalDays - 1);
	const sleepHours = sleep.totalDuration / 3600;
	const workoutLoad = workoutPlans.reduce((sum, workout) => sum + workout.duration / 3600, 0);
	const resting = Math.round(clamp(61.8 - trend * 3.2 + (7.2 - sleepHours) * 1.15 + workoutLoad * 0.8 + (recoveryFlag ? 3 : 0) + randBetween(rng, -2.2, 2.2), 48, 72));
	const hrvBase = 44 + trend * 8.5 + (sleepHours - 7.2) * 2.8 - workoutLoad * 1.4 - (recoveryFlag ? 7 : 0);
	const hrv = round(clamp(hrvBase + randBetween(rng, -5.5, 5.5), 22, 78), 1);
	const workoutWindows = workoutPlans.map((plan) => ({ start: plan.startMinute, end: plan.startMinute + plan.duration / 60, type: plan.type }));
	const samples = [];
	for (let minute = 0; minute < 1440; minute += 15) {
		const hour = minute / 60;
		const asleep = hour < 6.75 || hour >= 22.75;
		let value = resting + (asleep ? randBetween(rng, -4, 5) : 10 + 8 * Math.sin(((hour - 8) / 14) * Math.PI) + randBetween(rng, -5, 8));
		for (const window of workoutWindows) {
			if (minute >= window.start - 20 && minute <= window.end + 28) {
				const mid = (window.start + window.end) / 2;
				const span = (window.end - window.start) / 2 + 24;
				const effort = clamp(1 - Math.abs(minute - mid) / span, 0, 1);
				const boost = window.type === "yoga" ? 18 : window.type === "strength training" ? 42 : window.type === "walking" ? 30 : 78;
				value += boost * effort;
			}
		}
		if (!asleep && minute % 180 === 0) value += randBetween(rng, 3, 12);
		samples.push({ timestamp: localTimestamp(dateIso, minute), value: Math.round(clamp(value, 44, 188)) });
	}
	const values = samples.map((sample) => sample.value);
	const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
	const hrvSamples = [
		{ timestamp: localTimestamp(dateIso, 2 * 60 + 45), value: round(clamp(hrv + randBetween(rng, -4, 4), 18, 85), 1) },
		{ timestamp: localTimestamp(dateIso, 4 * 60 + 15), value: round(clamp(hrv + randBetween(rng, -3, 3), 18, 85), 1) },
	];
	return {
		averageHeartRate: round(avg, 1),
		heartRateMin: Math.min(...values),
		heartRateMax: Math.max(...values),
		heartRateSamples: samples,
		hrvSamples,
		hrv,
		restingHeartRate: resting,
		walkingHeartRateAverage: Math.round(clamp(resting + 34 + randBetween(rng, -4, 7), 82, 122)),
	};
}

function buildVitals(dateIso, rng, dayIndex, sleep, recoveryFlag) {
	const sleepHours = sleep.totalDuration / 3600;
	const spo2Base = 97.4 + Math.sin(dayIndex / 19) * 0.35 + (sleepHours - 7.2) * 0.08 + randBetween(rng, -0.22, 0.22);
	const respBase = 14.7 - (sleepHours - 7.2) * 0.18 + (recoveryFlag ? 1.2 : 0) + Math.sin(dayIndex / 17) * 0.25;
	const bloodOxygenSamples = [];
	const respiratoryRateSamples = [];
	for (const minute of [45, 120, 195, 270, 345, 420, 900, 1320]) {
		let oxygen = spo2Base + randBetween(rng, -0.8, 0.9);
		if (recoveryFlag && minute < 430) oxygen -= randBetween(rng, 0.4, 1.3);
		oxygen = round(clamp(oxygen, 92.6, 99.8), 1);
		bloodOxygenSamples.push({ timestamp: localTimestamp(dateIso, minute), value: oxygen, percent: oxygen });
		const respiratory = round(clamp(respBase + randBetween(rng, -0.65, 0.8), 11.2, 21.6), 1);
		respiratoryRateSamples.push({ timestamp: localTimestamp(dateIso, minute), value: respiratory });
	}
	const oxVals = bloodOxygenSamples.map((sample) => sample.value);
	const respVals = respiratoryRateSamples.map((sample) => sample.value);
	const avgOx = oxVals.reduce((sum, value) => sum + value, 0) / oxVals.length;
	const avgResp = respVals.reduce((sum, value) => sum + value, 0) / respVals.length;
	return {
		bloodOxygenSamples,
		respiratoryRateSamples,
		bloodOxygenPercent: round(avgOx, 1),
		bloodOxygenAvg: round(avgOx, 1),
		bloodOxygenMin: Math.min(...oxVals),
		bloodOxygenMax: Math.max(...oxVals),
		respiratoryRate: round(avgResp, 1),
		respiratoryRateAvg: round(avgResp, 1),
		respiratoryRateMin: Math.min(...respVals),
		respiratoryRateMax: Math.max(...respVals),
	};
}

function buildMobility(rng, dayIndex, totalDays, recoveryFlag) {
	const trend = dayIndex / Math.max(1, totalDays - 1);
	return {
		walkingSpeed: round(clamp(1.24 + trend * 0.08 + randBetween(rng, -0.07, 0.07) - (recoveryFlag ? 0.08 : 0), 0.92, 1.52), 2),
		walkingAsymmetryPercentage: round(clamp(1.8 - trend * 0.35 + randBetween(rng, -0.35, 0.42) + (recoveryFlag ? 0.45 : 0), 0.4, 4.2), 1),
		walkingStepLength: round(clamp(0.74 + trend * 0.03 + randBetween(rng, -0.035, 0.035), 0.58, 0.92), 2),
		walkingDoubleSupportPercentage: round(clamp(25.5 - trend * 1.1 + randBetween(rng, -1.4, 1.5) + (recoveryFlag ? 1.5 : 0), 18, 32), 1),
		stairAscentSpeed: round(clamp(0.52 + trend * 0.04 + randBetween(rng, -0.06, 0.06), 0.32, 0.78), 2),
		stairDescentSpeed: round(clamp(0.58 + trend * 0.04 + randBetween(rng, -0.06, 0.06), 0.36, 0.86), 2),
	};
}

function buildDay(dateIso, dayIndex, totalDays) {
	const rng = rngFor(dateIso, "day");
	const recoveryFlag = dayIndex % 37 === 11 || dayIndex % 53 === 29;
	const rawPlans = workoutPlan(dateIso, rngFor(dateIso, "plan"), dayIndex);
	const workoutLoad = rawPlans.reduce((sum, workout) => sum + workout.duration / 3600, 0);
	const sleep = buildSleep(dateIso, rngFor(dateIso, "sleep"), dayIndex, totalDays, workoutLoad + (recoveryFlag ? 0.8 : 0));
	const preliminaryResting = 61 + randBetween(rng, -3, 3);
	const workouts = buildWorkoutEntries(dateIso, rawPlans, rngFor(dateIso, "workouts"), preliminaryResting);
	const activity = buildActivity(dateIso, rngFor(dateIso, "activity"), dayIndex, totalDays, workouts, recoveryFlag);
	const heart = buildHeart(dateIso, rngFor(dateIso, "heart"), dayIndex, totalDays, sleep, rawPlans, recoveryFlag);
	const refreshedWorkouts = buildWorkoutEntries(dateIso, rawPlans, rngFor(dateIso, "workouts-final"), heart.restingHeartRate);
	const finalActivity = buildActivity(dateIso, rngFor(dateIso, "activity-final"), dayIndex, totalDays, refreshedWorkouts, recoveryFlag);
	const vitals = buildVitals(dateIso, rngFor(dateIso, "vitals"), dayIndex, sleep, recoveryFlag);
	const mobility = buildMobility(rngFor(dateIso, "mobility"), dayIndex, totalDays, recoveryFlag);
	const day = {
		type: "health-data",
		date: dateIso,
		units: "metric",
		activity: finalActivity,
		heart,
		vitals,
		sleep,
		mobility,
		hearing: {
			headphoneAudioLevel: round(clamp(64 + Math.sin(dayIndex / 11) * 3 + randBetween(rng, -4, 5), 48, 82), 1),
		},
	};
	if (refreshedWorkouts.length) day.workouts = refreshedWorkouts;
	return day;
}

async function cleanOutputDir() {
	await mkdir(OUT_DIR, { recursive: true });
	const files = await readdir(OUT_DIR);
	await Promise.all(
		files
			.filter((file) => file.endsWith(".json"))
			.map((file) => rm(path.join(OUT_DIR, file), { force: true }))
	);
}

async function main() {
	const dates = enumerateDates(START_DATE, END_DATE);
	await cleanOutputDir();

	for (let i = 0; i < dates.length; i++) {
		const day = buildDay(dates[i], i, dates.length);
		await writeFile(path.join(OUT_DIR, `${dates[i]}.json`), `${JSON.stringify(day)}\n`);
	}

	const readme = `# Mock Health.md export\n\nThis folder contains deterministic, privacy-safe mock Apple Health data for the example dashboards in \`examples/\`. It is not real user data.\n\n- Files: one \`health-data\` JSON document per day\n- Range: \`${START_DATE}\` through \`${END_DATE}\`\n- Includes: activity, heart rate samples, HRV, sleep stages, blood oxygen, respiratory rate, mobility, and sample workouts\n- Note: ${SAMPLE_TIMEZONE_NOTE}\n\nTo preview the bundled examples after cloning this repo, open the repo as an Obsidian vault, enable the plugin, and set **Settings → Health.md Visualizations → Data folder** to \`examples/Health\`.\n\nRegenerate with:\n\n\`\`\`bash\nnpm run generate:mock-health\n\`\`\`\n`;
	await writeFile(path.join(OUT_DIR, "README.md"), readme);

	console.log(`Wrote ${dates.length} mock Health.md JSON files to ${path.relative(REPO_ROOT, OUT_DIR)}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
