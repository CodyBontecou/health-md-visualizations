import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

let tempDir;
let modulePromise;

async function loadRegistry() {
	if (modulePromise) return modulePromise;
	modulePromise = (async () => {
		tempDir = await mkdtemp(path.join(os.tmpdir(), "health-md-registry-tests-"));
		const outfile = path.join(tempDir, "registry.mjs");
		await esbuild.build({
			stdin: {
				contents: ["src/visualizations/index.ts", "src/visualization-catalog.ts"]
					.map((file) => `export * from ${JSON.stringify(path.join(process.cwd(), file))};`).join("\n"),
				resolveDir: process.cwd(),
			},
			bundle: true,
			platform: "node",
			format: "esm",
			outfile,
			logLevel: "silent",
			plugins: [{
				name: "leaflet-shim",
				setup(build) {
					// Registry checks do not render maps or require a browser.
					build.onResolve({ filter: /^leaflet$/ }, () => ({ path: "leaflet", namespace: "registry-test" }));
					build.onLoad({ filter: /.*/, namespace: "registry-test" }, () => ({ contents: "module.exports = {};", loader: "js" }));
				},
			}],
		});
		return import(pathToFileURL(outfile).href);
	})();
	return modulePromise;
}

after(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

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

test("every schema v7 summary visualization is registered and present in the catalog", async () => {
	const { VISUALIZATIONS, HTML_VISUALIZATIONS, VISUALIZATION_CATALOG } = await loadRegistry();
	for (const type of TYPES) {
		assert.equal(typeof (VISUALIZATIONS[type] ?? HTML_VISUALIZATIONS[type]), "function", `${type} must be registered`);
		assert.ok(VISUALIZATION_CATALOG.some((option) => option.type === type), `${type} must be available in the catalog`);
	}
});

test("every catalog entry has a renderer and a declared category", async () => {
	const { VISUALIZATIONS, HTML_VISUALIZATIONS, VISUALIZATION_CATALOG, VISUALIZATION_CATEGORIES } = await loadRegistry();
	const categories = new Set(VISUALIZATION_CATEGORIES.map((category) => category.id));
	for (const option of VISUALIZATION_CATALOG) {
		assert.equal(typeof (VISUALIZATIONS[option.type] ?? HTML_VISUALIZATIONS[option.type]), "function", option.type);
		assert.ok(categories.has(option.category), `${option.type} has a declared category`);
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
