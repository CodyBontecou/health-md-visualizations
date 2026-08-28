import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

let tempDir;
let modulePromise;
let unitsModulePromise;

async function loadUnits() {
	if (modulePromise) return modulePromise;
	modulePromise = (async () => {
		tempDir = await mkdtemp(path.join(os.tmpdir(), "health-md-units-tests-"));
		const outfile = path.join(tempDir, "workout-utils.mjs");
		await esbuild.build({
			entryPoints: [path.join(process.cwd(), "src/workout-utils.ts")],
			bundle: true,
			platform: "node",
			format: "esm",
			outfile,
			logLevel: "silent",
		});
		return import(pathToFileURL(outfile).href);
	})();
	return modulePromise;
}

async function loadUnitHelpers() {
	if (unitsModulePromise) return unitsModulePromise;
	unitsModulePromise = (async () => {
		tempDir = tempDir ?? await mkdtemp(path.join(os.tmpdir(), "health-md-units-tests-"));
		const outfile = path.join(tempDir, "units.mjs");
		await esbuild.build({
			entryPoints: [path.join(process.cwd(), "src/units.ts")],
			bundle: true,
			platform: "node",
			format: "esm",
			outfile,
			logLevel: "silent",
		});
		return import(pathToFileURL(outfile).href);
	})();
	return unitsModulePromise;
}

after(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

function metricDay() {
	return { type: "healthmd.health_data", date: "2026-01-01", unitSystem: "metric" };
}

function imperialDay() {
	return { type: "healthmd.health_data", date: "2026-01-01", unitSystem: "imperial" };
}

test("resolveUnits follows the day's declared unit system by default", async () => {
	const { resolveUnits } = await loadUnits();
	assert.equal(resolveUnits(metricDay()), "metric");
	assert.equal(resolveUnits(imperialDay()), "imperial");
	assert.equal(resolveUnits({ type: "x", date: "2026-01-01" }), "metric");
});

test("resolveUnits lets an explicit preference override the day", async () => {
	const { resolveUnits } = await loadUnits();
	assert.equal(resolveUnits(metricDay(), "imperial"), "imperial");
	assert.equal(resolveUnits(imperialDay(), "metric"), "metric");
	// No preference keeps per-day behavior.
	assert.equal(resolveUnits(imperialDay(), undefined), "imperial");
});

test("formatDistance converts meters using the effective unit system", async () => {
	const { formatDistance } = await loadUnits();
	assert.equal(formatDistance(5000, metricDay()), "5.00 km");
	assert.equal(formatDistance(5000, metricDay(), undefined, "imperial"), "3.11 mi");
	assert.equal(formatDistance(16093.44, imperialDay(), undefined, "metric"), "16.1 km");
});

test("formatDistance recomputes instead of trusting preformatted values on mismatch", async () => {
	const { formatDistance } = await loadUnits();
	// Preformatted metric string, imperial preference → must recompute.
	assert.equal(formatDistance(5000, metricDay(), "5.00 km", "imperial"), "3.11 mi");
	// Preformatted matches the preference → reused as-is.
	assert.equal(formatDistance(5000, imperialDay(), "3.11 mi", "imperial"), "3.11 mi");
	// No preference → preformatted wins.
	assert.equal(formatDistance(5000, metricDay(), "5.00 km"), "5.00 km");
});

test("formatPace and formatElevation honor the preference", async () => {
	const { formatPace, formatElevation } = await loadUnits();
	// 5000 m in 1500 s → 5:00/km or 8:02/mi.
	assert.equal(formatPace(5000, 1500, metricDay()), "5:00/km");
	assert.equal(formatPace(5000, 1500, metricDay(), undefined, "imperial"), "8:03/mi");
	assert.equal(formatElevation(100, metricDay(), "imperial"), "328 ft");
	assert.equal(formatElevation(100, metricDay(), "metric"), "100 m");
});

test("formatWorkoutDistance passes the preference through", async () => {
	const { formatWorkoutDistance } = await loadUnits();
	const workout = { type: "running", duration: 1800, distanceMeters: 5000 };
	assert.equal(formatWorkoutDistance(workout, metricDay()), "5.00 km");
	assert.equal(formatWorkoutDistance(workout, metricDay(), "imperial"), "3.11 mi");
});

test("formatDistanceKm and formatSpeedKmh format aggregate values", async () => {
	const { formatDistanceKm, formatSpeedKmh } = await loadUnitHelpers();
	assert.equal(formatDistanceKm(42.195, "metric"), "42.2 km");
	assert.equal(formatDistanceKm(42.195, "imperial"), "26.2 mi");
	assert.equal(formatSpeedKmh(12, "metric"), "12.0 km/h");
	assert.equal(formatSpeedKmh(12, "imperial"), "7.5 mph");
});

test("normalizeUnitPreference accepts common aliases and resolves auto to undefined", async () => {
	const { normalizeUnitPreference } = await loadUnitHelpers();
	assert.equal(normalizeUnitPreference("metric"), "metric");
	assert.equal(normalizeUnitPreference("si"), "metric");
	assert.equal(normalizeUnitPreference("imperial"), "imperial");
	assert.equal(normalizeUnitPreference("US"), "imperial");
	assert.equal(normalizeUnitPreference("auto"), undefined);
	assert.equal(normalizeUnitPreference(""), undefined);
	assert.equal(normalizeUnitPreference("nonsense"), undefined);
	assert.equal(normalizeUnitPreference(42), undefined);
});

test("convertToDisplayUnit converts canonical metric units for imperial display", async () => {
	const { convertToDisplayUnit } = await loadUnitHelpers();
	assert.deepEqual(convertToDisplayUnit(70, "kg", "metric"), { value: 70, unit: "kg" });
	assert.equal(convertToDisplayUnit(70, "kg", "imperial").unit, "lb");
	assert.ok(Math.abs(convertToDisplayUnit(70, "kg", "imperial").value - 154.32) < 0.01);
	assert.equal(convertToDisplayUnit(80, "cm", "imperial").unit, "in");
	assert.ok(Math.abs(convertToDisplayUnit(80, "cm", "imperial").value - 31.5) < 0.01);
	assert.equal(convertToDisplayUnit(10, "km", "imperial").unit, "mi");
	assert.equal(convertToDisplayUnit(3.5, "m/s", "imperial").unit, "mph");
	assert.equal(convertToDisplayUnit(37, "°C", "imperial").value, 98.6);
	assert.equal(convertToDisplayUnit(37, "°C", "imperial").unit, "°F");
	// Units without an imperial equivalent pass through unchanged.
	assert.deepEqual(convertToDisplayUnit(55, "ms", "imperial"), { value: 55, unit: "ms" });
	assert.deepEqual(convertToDisplayUnit(12, "percent", "imperial"), { value: 12, unit: "percent" });
});
