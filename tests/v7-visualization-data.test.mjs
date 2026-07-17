import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

let tempDir;
let modulePromise;

async function loadModule() {
	if (modulePromise) return modulePromise;
	modulePromise = (async () => {
		tempDir = await mkdtemp(path.join(os.tmpdir(), "health-md-v7-viz-tests-"));
		const outfile = path.join(tempDir, "v7-viz-data.mjs");
		const harness = path.join(tempDir, "v7-viz-data.ts");
		await writeFile(harness, `
export * from ${JSON.stringify(path.join(process.cwd(), "src/metric-resolver.ts"))};
export { doseStatusKind } from ${JSON.stringify(path.join(process.cwd(), "src/medication-utils.ts"))};
`, "utf8");
		await esbuild.build({
			entryPoints: [harness],
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

after(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

test("canonical metric resolver preserves explicit zero, false, and categorical values", async () => {
	const { resolveMetricScalar, resolveNumericMetric } = await loadModule();
	const day = {
		type: "health-data",
		date: "2026-07-16",
		canonicalMetrics: {
			steps: 0,
			vo2_max_carried_forward: false,
			menstrual_flow: "light",
		},
	};
	assert.equal(resolveNumericMetric(day, "steps"), 0);
	assert.equal(resolveMetricScalar(day, "vo2_max_carried_forward"), false);
	assert.equal(resolveMetricScalar(day, "menstrual_flow"), "light");
	assert.equal(resolveMetricScalar(day, "missing_metric"), undefined);
});

test("metric metadata prefers the Health.md data dictionary", async () => {
	const { resolveMetricDefinition } = await loadModule();
	const dictionary = {
		entries: [{
			key: "weight_kg",
			canonicalKey: "weight_kg",
			displayName: "Body Mass",
			category: "Body",
			unit: "kilograms",
			dailyAggregation: "latest",
		}],
		aliases: { weight: "weight_kg" },
		unitsByCanonicalKey: { weight_kg: "kilograms" },
		dailyAggregationByCanonicalKey: { weight_kg: "latest" },
		healthKitAggregationByCanonicalKey: {},
		rollupByCanonicalKey: {},
		schemaVersion: 7,
	};
	const definition = resolveMetricDefinition("weight", dictionary, []);
	assert.equal(definition.key, "weight_kg");
	assert.equal(definition.label, "Body Mass");
	assert.equal(definition.unit, "kilograms");
	assert.equal(definition.dailyAggregation, "latest");
});

test("Health.md non-taken medication outcomes count as skipped", async () => {
	const { doseStatusKind } = await loadModule();
	for (const status of ["skipped", "snoozed", "not_interacted", "notification_not_sent", "not_logged"]) {
		assert.equal(doseStatusKind(status), "skipped", status);
	}
	assert.equal(doseStatusKind("taken"), "taken");
});

test("legacy typed daily data resolves without a canonical map", async () => {
	const { resolveNumericMetric } = await loadModule();
	const day = {
		type: "health-data",
		date: "2025-01-01",
		activity: { steps: 4321, vo2Max: 41.2 },
		heart: { averageHeartRate: 70, heartRateMin: 50, heartRateMax: 120, heartRateSamples: [], hrv: 38 },
	};
	assert.equal(resolveNumericMetric(day, "steps"), 4321);
	assert.equal(resolveNumericMetric(day, "vo2_max"), 41.2);
	assert.equal(resolveNumericMetric(day, "hrv_ms"), 38);
});
