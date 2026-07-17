import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const TYPES = [
	"metric-trend",
	"cardio-fitness-freshness",
	"rollup-explorer",
	"capture-coverage-calendar",
	"blood-pressure-bands",
	"glucose-range",
	"body-composition",
	"running-form",
	"cycling-performance",
	"hearing-exposure",
	"nutrition-grid",
	"symptom-heatmap",
	"cycle-timeline",
	"medication-schedule-timeline",
	"medication-skip-reasons",
];

const SUMMARY_VISUALIZATION_FILES = [
	"metric-trends.ts",
	"v7-range-charts.ts",
	"metric-matrix.ts",
	"capture-coverage.ts",
	"cycle-timeline.ts",
	"rollup-explorer.ts",
	"medication-insights.ts",
];

test("every schema v7 summary visualization is registered and offered by the wizard", async () => {
	const [registry, wizard] = await Promise.all([
		readFile(path.join(process.cwd(), "src/visualizations/index.ts"), "utf8"),
		readFile(path.join(process.cwd(), "src/insert-wizard.ts"), "utf8"),
	]);
	assert.match(wizard, /export const VISUALIZATION_CATALOG/);
	assert.match(wizard, /export const VISUALIZATION_CATEGORIES/);
	for (const type of TYPES) {
		assert.match(registry, new RegExp(`"${type}"\\s*:`), `${type} must be registered`);
		assert.match(wizard, new RegExp(`type:\\s*"${type}"`), `${type} must be available in the insert wizard`);
	}
});

test("schema v7 summary visualizations never access Health Records or lossless payload fields", async () => {
	const sources = await Promise.all(SUMMARY_VISUALIZATION_FILES.map((name) =>
		readFile(path.join(process.cwd(), "src/visualizations", name), "utf8")
	));
	const combined = sources.join("\n");
	for (const forbidden of [
		"healthkit_record_archive",
		"original_uuid",
		"external_records",
		"fhir_resource",
		"clinical_record",
		"verifiable_clinical",
		"binary_payload",
	]) {
		assert.equal(combined.toLowerCase().includes(forbidden), false, `must not access ${forbidden}`);
	}
});

test("cycle timeline excludes sexual activity from its summary lanes", async () => {
	const source = await readFile(path.join(process.cwd(), "src/visualizations/cycle-timeline.ts"), "utf8");
	assert.equal(source.includes("sexual_activity"), false);
});
