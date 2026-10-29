import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

let tempDir;
let modulePromise;
async function loadModule() {
	if (!modulePromise) modulePromise = (async () => {
		tempDir = await mkdtemp(path.join(os.tmpdir(), "health-md-whoop-tests-"));
		const harness = path.join(tempDir, "harness.ts");
		const outfile = path.join(tempDir, "harness.mjs");
		await writeFile(harness, [
			"src/whoop-data.ts", "src/whoop-viz-utils.ts", "src/visualizations/whoop.ts",
			"src/parsers/json-parser.ts", "src/parsers/csv-parser.ts", "src/parsers/markdown-parser.ts",
			"src/visualization-catalog.ts", "src/dashboard-note.ts",
		].map((file) => `export * from ${JSON.stringify(path.join(process.cwd(), file))};`).join("\n"));
		await esbuild.build({ entryPoints: [harness], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
		return import(pathToFileURL(outfile).href);
	})();
	return modulePromise;
}
after(async () => { if (tempDir) await rm(tempDir, { recursive: true, force: true }); });
const fixture = (name) => readFile(path.join(process.cwd(), "tests/fixtures/schema-v8", name), "utf8");
async function fixtureDay() { return (await loadModule()).parseJSON(await fixture("provider-day.json")); }
function clone(day) { return structuredClone(day); }
function typedDay(section, date = "2026-03-15") {
	return { type: "health-data", date, providers: { whoop: {
		schema: "healthmd.provider.whoop_daily", schema_version: 1, capture_status: "complete",
		cycles: [], recoveries: [], sleep: [], workouts: [], resources: [], warnings: [], ...section,
	} } };
}
const THEME = {
	bg: "#101010", fg: "#eeeeee", muted: "#aaaaaa", isDark: true,
	colors: { accent: "#5b8ff9", secondary: "#61d9a5", heart: "#e8684a", sleep: { deep: "#5b8ff9", rem: "#9270ca", core: "#61d9a5", awake: "#f6bd16" } },
};
class Stats {
	constructor(text = "") { this.text = text; this.children = []; this.style = {}; this.classList = { add() {}, remove() {} }; }
	empty() { this.text = ""; this.children = []; }
	createDiv(options = {}) { const child = new Stats(options.text ?? ""); this.children.push(child); return child; }
	allText() { return [this.text, ...this.children.map((child) => child.allText())].join(" "); }
}
function canvas() {
	const operations = [];
	const target = { canvas: { width: 600, height: 300, style: {} } };
	const ctx = new Proxy(target, {
		get(object, key) {
			if (key in object) return object[key];
			return (...args) => {
				for (const value of args) if (typeof value === "number") assert.ok(Number.isFinite(value), `${String(key)} must use finite geometry`);
				if (["fillRect", "rect"].includes(key)) { assert.ok(args[2] >= 0, `${key} width`); assert.ok(args[3] >= 0, `${key} height`); }
				operations.push({ method: key, args, fillStyle: object.fillStyle, strokeStyle: object.strokeStyle });
			};
		},
	});
	return { ctx, operations };
}
function render(fn, data, config = {}, width = 600, height = 300, theme = THEME) {
	const { ctx, operations } = canvas();
	const stats = new Stats("stale stats");
	const regions = [];
	fn(ctx, data, width, height, config, theme, stats, { add(region) {
		for (const field of ["x", "y", "w", "h", "cx", "cy", "r"]) if (field in region) assert.ok(Number.isFinite(region[field]), `finite hit ${field}`);
		if (region.shape === "rect") { assert.ok(region.w >= 0); assert.ok(region.h >= 0); }
		regions.push(region);
	} });
	assert.ok(!stats.allText().includes("stale stats"));
	return { operations, stats: stats.allText(), regions, canvas: ctx.canvas };
}
const RENDERERS = {
	"whoop-recovery-strain": "renderWhoopRecoveryStrain",
	"whoop-sleep-need": "renderWhoopSleepNeed",
	"whoop-sleep-trends": "renderWhoopSleepTrends",
	"whoop-workout-strain": "renderWhoopWorkoutStrain",
};

test("v10 WHOOP v2 cycle counts preserve exact zero and missingness without a civil-day total", async () => {
	const { parseJSON } = await loadModule();
	const base = JSON.parse(await fixture("provider-day.json"));
	base.schema_version = 10;
	base.providers.whoop.schema_version = 2;
	const cycle = base.providers.whoop.cycles[0];
	const originalSteps = base.activity.steps;
	for (const value of [0, 1, 2147483647]) {
		cycle.step_count = value;
		const day = parseJSON(JSON.stringify(base));
		assert.equal(day.whoop.cycles[0].step_count, value);
		assert.equal(day.activity.steps, originalSteps);
	}
	for (const value of [null, -1, 0.5, 2147483648, true, "0"]) {
		cycle.step_count = value;
		assert.equal(parseJSON(JSON.stringify(base)).whoop.cycles[0].step_count, undefined);
	}
	delete cycle.step_count;
	assert.equal(parseJSON(JSON.stringify(base)).whoop.cycles[0].step_count, undefined);
	cycle.step_count = 0;
	base.providers.whoop.cycles.push({ ...cycle, id: "synthetic-second-cycle", step_count: 17 });
	const repeated = parseJSON(JSON.stringify(base));
	assert.deepEqual(repeated.whoop.cycles.map((item) => item.step_count), [0, 17]);
	assert.equal(repeated.activity.steps, originalSteps);
	base.providers.whoop.schema_version = 1;
	assert.ok(parseJSON(JSON.stringify(base)).whoop.cycles.every((item) => item.step_count === undefined));
});

test("v8 JSON and CSV preserve full reviewed WHOOP events without populating canonical Apple fields", async () => {
	const { parseJSON, parseCSV, whoopRecoveryPairs, whoopSleepNeed, whoopWorkoutZones } = await loadModule();
	const json = parseJSON(await fixture("provider-day.json"));
	const [csv] = parseCSV(await fixture("provider-day.csv"));
	for (const day of [json, csv]) {
		assert.equal(day.whoop.captureStatus, "complete");
		assert.equal(day.whoop.cycles[0].id, "101");
		assert.equal(day.whoop.recoveries[0].cycle_id, "101");
		assert.equal(day.whoop.recoveries[0].sleep_id, "202");
		assert.equal(day.whoop.sleep[0].total_sleep_milliseconds, 24300750);
		assert.equal(day.whoop.sleep[0].recent_nap_adjustment_milliseconds, -900000);
		assert.equal(whoopSleepNeed(day.whoop.sleep[0]), 30600000);
		assert.equal(day.whoop.workouts[0].sport_name, "running");
		assert.equal(whoopWorkoutZones(day.whoop.workouts[0]).length, 6);
		assert.equal(day.whoop.body.source_kind, "current_profile_snapshot");
		assert.equal(day.whoop.body.observed_at, "2026-03-15T06:40:00.000000000Z");
		assert.equal(whoopRecoveryPairs([day])[0].score, 82);
		assert.equal(day.heart?.hrv, undefined);
		assert.equal(day.canonicalMetrics?.hrv_ms, undefined);
		assert.equal(day.workouts?.length ?? 0, 0);
	}
	assert.equal(json.whoop.source, "typed");
	assert.equal(csv.whoop.source, "csv");
	assert.ok(!csv.whoop.notes.some((note) => note.includes("projection")));
});

test("Markdown and Bases expose honest scalar projections without invented IDs, timestamps, or nap identity", async () => {
	const { parseMarkdown, whoopRecoveryPairs, whoopSleepEntries, whoopSleepNeed } = await loadModule();
	for (const name of ["provider-day.md", "provider-day-bases.md"]) {
		const day = parseMarkdown(await fixture(name));
		assert.equal(day.whoop.source, "frontmatter");
		assert.equal(day.whoop.sleep[0].projection, true);
		assert.equal(day.whoop.sleep[0].id, undefined);
		assert.equal(day.whoop.sleep[0].is_nap, undefined);
		assert.equal(day.whoop.sleep[0].start_time, undefined);
		assert.equal(whoopSleepNeed(day.whoop.sleep[0]), undefined);
		assert.equal(whoopSleepEntries([day], "main").length, 0);
		assert.equal(whoopSleepEntries([day], "naps").length, 0);
		assert.equal(whoopRecoveryPairs([day])[0].projection, true);
		assert.equal(day.canonicalMetrics?.hrv_ms, undefined);
	}
});

test("recovery joins only matching cycle IDs; repeated cycles are not averaged, summed, or assumed singleton", async () => {
	const { whoopRecoveryPairs } = await loadModule();
	const day = await fixtureDay();
	day.whoop.cycles.push({ ...day.whoop.cycles[0], id: "other", strain_score: 4 });
	day.whoop.recoveries.push({ ...day.whoop.recoveries[0], cycle_id: "other", recovery_score_percent: 30 });
	assert.deepEqual(whoopRecoveryPairs([day]).map((pair) => [pair.cycle.id, pair.score]), [["101", 82], ["other", 30]]);
	day.whoop.recoveries[0].cycle_id = "missing";
	assert.equal(whoopRecoveryPairs([day]).length, 1);
	day.whoop.cycles[1].score_state = "PENDING_SCORE";
	assert.equal(whoopRecoveryPairs([day]).length, 0);
});

test("missing, zero, unscored and out-of-range values remain distinct; unknown nested versions are not reinterpreted", async () => {
	const { parseWhoopSection, parseWhoopFlat, whoopRecoveryPairs, whoopSleepNeed, whoopWorkoutZones, parseJSON } = await loadModule();
	const raw = JSON.parse(await fixture("provider-day.json"));
	const section = raw.providers.whoop;
	section.cycles[0].strain_score = 0;
	section.recoveries[0].recovery_score_percent = 0;
	assert.equal(whoopRecoveryPairs([typedDay(section)])[0].score, 0);
	section.cycles[0].strain_score = 22;
	section.recoveries[0].recovery_score_percent = null;
	assert.equal(whoopRecoveryPairs([typedDay(section)]).length, 0);
	section.sleep[0].recent_nap_adjustment_milliseconds = 1;
	section.sleep[0].baseline_sleep_need_milliseconds = Number.MAX_SAFE_INTEGER + 1;
	const normalized = parseWhoopSection(section);
	assert.equal(normalized.sleep[0].recent_nap_adjustment_milliseconds, undefined);
	assert.equal(normalized.sleep[0].baseline_sleep_need_milliseconds, undefined);
	assert.equal(whoopSleepNeed(normalized.sleep[0]), undefined);
	assert.equal(whoopSleepNeed({ baseline_sleep_need_milliseconds: 0, sleep_debt_need_milliseconds: 0, recent_strain_need_milliseconds: 0, recent_nap_adjustment_milliseconds: 0 }), 0);
	assert.equal(whoopSleepNeed({ baseline_sleep_need_milliseconds: 0 }), undefined);
	assert.deepEqual(whoopWorkoutZones({ zone_durations: { zone_zero_milliseconds: 0 } }), [{ index: 0, milliseconds: 0 }]);
	assert.deepEqual(whoopWorkoutZones({ score_state: "UNSCORABLE", zone_durations: { zone_zero_milliseconds: 20 } }), []);
	assert.equal(parseWhoopFlat({ whoop_sleep_efficiency_percent: "1" }).sleep[0].sleep_efficiency_percent, 1, "WHOOP percentage 1 is not multiplied by 100");
	section.schema_version = 3;
	const future = parseJSON(JSON.stringify(raw));
	assert.equal(future.whoop, undefined);
	assert.equal(future.providers.whoop.schema_version, 3);
});

test("naps and repeated sleep/workout records survive CSV structured rows without flattening", async () => {
	const { parseCSV, whoopSleepEntries, whoopWorkoutEntries } = await loadModule();
	const day = await fixtureDay();
	const main = day.whoop.sleep[0];
	const nap = { ...main, id: "nap", is_nap: true, start_time: "2026-03-15T18:00:00Z", end_time: "2026-03-15T18:30:00Z" };
	const extra = { ...day.whoop.workouts[0], id: "extra", sport_name: "walking" };
	const cell = (value) => `"${JSON.stringify(value).replaceAll('"', '""')}"`;
	const csv = await fixture("provider-day.csv") + `2026-03-15,WHOOP Sleep,Sleep Record,${cell(nap)},json,${nap.start_time}\n` +
		`2026-03-15,WHOOP Workout,Workout Record,${cell(extra)},json,${extra.start_time}\n`;
	const [parsed] = parseCSV(csv);
	assert.equal(whoopSleepEntries([parsed]).length, 2);
	assert.equal(whoopSleepEntries([parsed], "naps")[0].sleep.id, "nap");
	assert.equal(whoopSleepEntries([parsed], "main")[0].sleep.id, main.id);
	assert.equal(whoopWorkoutEntries([parsed]).length, 2);
	assert.ok(parsed.whoop.notes.some((note) => note.includes("record count")), "stale synthetic resource counts are diagnosed");
});

test("partial captures retain siblings and safe diagnostics; complete-empty and not_requested never revive stale values", async () => {
	const { parseWhoopSection, mergeWhoop, whoopCoverage } = await loadModule();
	const day = await fixtureDay();
	const raw = JSON.parse(await fixture("provider-day.json")).providers.whoop;
	raw.capture_status = "partial";
	raw.resources[1] = { resource: "recovery", status: "failure", record_count: 0, error: { message: "SECRET_RAW_ERROR" } };
	raw.recoveries = [];
	const partial = parseWhoopSection(raw);
	assert.equal(partial.sleep.length, 1);
	assert.equal(partial.recoveries.length, 0);
	const summary = whoopCoverage([{ ...day, whoop: partial }]);
	assert.match(summary, /partial capture/);
	assert.match(summary, /non-success resource/);
	assert.ok(!JSON.stringify(partial).includes("SECRET_RAW_ERROR"));
	const completeEmpty = parseWhoopSection(typedDay({}).providers.whoop);
	assert.equal(mergeWhoop(completeEmpty, day.whoop).sleep.length, 0);
	const notRequested = parseWhoopSection({ ...raw, capture_status: "not_requested" });
	assert.equal(notRequested.sleep.length, 0);
	assert.equal(mergeWhoop(notRequested, day.whoop).sleep.length, 0);
	const projection = { ...day.whoop, source: "frontmatter" };
	assert.equal(mergeWhoop(projection, day.whoop).source, "typed");
});

test("all four renderers produce actual interactive charts from production JSON and CSV fixtures", async () => {
	const module = await loadModule();
	const days = [await fixtureDay(), module.parseCSV(await fixture("provider-day.csv"))[0]];
	for (const day of days) for (const [type, fn] of Object.entries(RENDERERS)) {
		for (const width of [240, 640]) for (const isDark of [true, false]) {
			const scene = render(module[fn], [day], { type }, width, 120, { ...THEME, isDark });
			assert.ok(scene.regions.length > 0, `${type} must create hit regions`);
			assert.ok(scene.operations.some((op) => op.method === "arc" || op.method === "fillRect"), `${type} must draw data`);
			assert.match(scene.stats, /WHOOP|Sessions|cycle|Workouts/);
			assert.ok(scene.regions.every((region) => region.payload === day), "click through to source day");
		}
	}
	const pair = render(module.renderWhoopRecoveryStrain, [days[0]]).regions[0];
	assert.equal(pair.details.find((detail) => detail.label === "Recovery").value, "82%");
	assert.equal(pair.details.find((detail) => detail.label === "Cycle ID").value, "101");
	assert.match(pair.details.find((detail) => detail.label === "HRV (RMSSD)").value, /ms$/);
	const sleep = render(module.renderWhoopSleepNeed, [days[0]]).regions[0];
	assert.match(sleep.details.find((detail) => detail.label === "Nap adjustment").value, /−.*\(-900000 ms\)/);
	assert.equal(sleep.details.find((detail) => detail.label === "Need (component sum)").value, "8h 30m");
	const sleepScene = render(module.renderWhoopSleepNeed, [days[0]]);
	const subtractive = sleepScene.operations.find((op) => op.method === "fillRect" && op.fillStyle === "rgba(146,112,202,0.65)");
	assert.ok(subtractive.args[3] > 0, "negative adjustment extends downward from the positive stack");
	const marker = sleepScene.operations.find((op) => op.method === "lineTo" && op.strokeStyle === THEME.fg);
	assert.ok(Math.abs(marker.args[1] - (subtractive.args[1] + subtractive.args[3])) < 1e-9, "net-need marker is at the lower adjusted stack height");
	const zones = render(module.renderWhoopWorkoutStrain, [days[0]]).regions.filter((region) => region.title.startsWith("WHOOP zone"));
	assert.equal(zones.length, 6);
	assert.match(zones[0].details[0].value, /120000 ms/);
});

test("empty, disabled and unavailable WHOOP charts clear stats and display friendly messages", async () => {
	const module = await loadModule();
	for (const fn of Object.values(RENDERERS)) for (const data of [[], [typedDay({ capture_status: "not_requested" })], [{ type: "health-data", date: "2026-01-01", heart: { hrv: 40 } }]]) {
		const scene = render(module[fn], data);
		assert.equal(scene.regions.length, 0);
		assert.ok(scene.operations.some((op) => op.method === "fillText" && op.args[0].startsWith("No ")));
	}
});

test("sleep trend geometry respects zero, missing metrics, unscored sessions and calendar gaps", async () => {
	const { renderWhoopSleepTrends } = await loadModule();
	const day = await fixtureDay();
	day.whoop.sleep[0].sleep_performance_percent = 0;
	delete day.whoop.sleep[0].sleep_consistency_percent;
	delete day.whoop.sleep[0].sleep_efficiency_percent;
	const next = clone(day); next.date = "2026-03-17"; next.whoop.sleep[0].sleep_performance_percent = 50;
	const scene = render(renderWhoopSleepTrends, [day, next]);
	assert.equal(scene.regions.length, 2);
	assert.equal(scene.regions[0].details[0].value, "0%");
	assert.equal(scene.operations.filter((op) => op.method === "lineTo").length, 5, "grid only: no line across calendar gap");
	next.date = "2026-03-16";
	const continuous = render(renderWhoopSleepTrends, [day, next]);
	assert.equal(continuous.operations.filter((op) => op.method === "lineTo").length, 6);
	const unscored = clone(day); unscored.date = "2026-03-16"; unscored.whoop.sleep[0].score_state = "UNSCORABLE";
	next.date = "2026-03-17";
	assert.equal(render(renderWhoopSleepTrends, [day, unscored, next]).regions.length, 2);
});

test("workout zones preserve missing/zero distinctions and use actual elapsed time, not zone sums", async () => {
	const { renderWhoopWorkoutStrain } = await loadModule();
	const day = await fixtureDay();
	day.whoop.workouts[0].zone_durations = { zone_zero_milliseconds: 0 };
	const scene = render(renderWhoopWorkoutStrain, [day]);
	const details = scene.regions[0].details;
	assert.equal(details.find((detail) => detail.label === "Elapsed").value, "1h 0m");
	assert.match(details.find((detail) => detail.label === "Zones reported").value, /^1 \/ 6/);
	assert.ok(scene.operations.some((op) => op.args[0] === "0 reported zone time"));
	delete day.whoop.workouts[0].zone_durations;
	assert.ok(render(renderWhoopWorkoutStrain, [day]).operations.some((op) => op.args[0] === "No zone data"));
	assert.equal(render(renderWhoopWorkoutStrain, [day], { date: "2026-01-01" }).regions.length, 0);
});

test("malformed structured CSV cannot revive a scalar event or discard valid WHOOP siblings", async () => {
	const { parseCSV } = await loadModule();
	const csv = (await fixture("provider-day.csv")).split("\n").map((line) => line.includes("WHOOP Workout,Workout Record,")
		? "2026-03-15,WHOOP Workout,Workout Record,SECRET_MALFORMED_RESPONSE,json," : line).join("\n");
	const [day] = parseCSV(csv);
	assert.equal(day.whoop.workouts.length, 0);
	assert.equal(day.whoop.sleep.length, 1);
	assert.ok(day.whoop.notes.some((note) => note.includes("Malformed")));
	assert.ok(!JSON.stringify(day.whoop).includes("SECRET_MALFORMED_RESPONSE"));
});

test("display limits bound actual chart hits without summing or misclassifying omitted events", async () => {
	const { renderWhoopRecoveryStrain, renderWhoopSleepNeed, renderWhoopWorkoutStrain } = await loadModule();
	const day = await fixtureDay();
	const cycle = day.whoop.cycles[0], recovery = day.whoop.recoveries[0];
	day.whoop.cycles = Array.from({ length: 5 }, (_, index) => ({ ...cycle, id: String(index) }));
	day.whoop.recoveries = Array.from({ length: 5 }, (_, index) => ({ ...recovery, cycle_id: String(index) }));
	const pairs = render(renderWhoopRecoveryStrain, [day], { limit: 2 });
	assert.equal(pairs.regions.length, 2);
	assert.match(pairs.stats, /0 Unpaired \/ unscored/);
	const sleep = day.whoop.sleep[0], workout = day.whoop.workouts[0];
	day.whoop.sleep = Array.from({ length: 380 }, (_, index) => ({ ...sleep, id: String(index) }));
	day.whoop.workouts = Array.from({ length: 60 }, (_, index) => ({ ...workout, id: String(index) }));
	assert.equal(render(renderWhoopSleepNeed, [day], { limit: 10000 }).regions.length, 365);
	assert.equal(render(renderWhoopWorkoutStrain, [day], { limit: 10000 }).regions.filter((region) => !region.title.startsWith("WHOOP zone")).length, 50);
});

test("WHOOP catalog, registry, generated dashboard and examples cover all four chart types and export limitations", async () => {
	const { VISUALIZATION_CATALOG, buildDashboardMarkdown } = await loadModule();
	const registry = await readFile("src/visualizations/index.ts", "utf8");
	const docs = await readFile("examples/whoop-visualizations.md", "utf8");
	const dashboard = buildDashboardMarkdown("test");
	for (const [type, fn] of Object.entries(RENDERERS)) {
		assert.match(registry, new RegExp(`"${type}"\\s*:\\s*${fn}`));
		const option = VISUALIZATION_CATALOG.find((item) => item.type === type);
		assert.equal(option.category, "whoop");
		assert.ok(option.exportNote);
		assert.ok(dashboard.includes(`type: ${type}\n`));
		assert.ok(docs.includes(`type: ${type}\n`));
	}
	const need = VISUALIZATION_CATALOG.find((option) => option.type === "whoop-sleep-need");
	assert.deepEqual(need.exportSources, ["daily-json", "daily-csv"]);
});

const sourceFixture = (metadata, suffix) => readFile(path.join(process.cwd(),
    'tests/fixtures/apple-v11-whoop-source', String(metadata), `2026-03-15${suffix}`), 'utf8');

function sourceRow(content) {
    return content.split('\n').find(line => line.startsWith('| `{') && line.includes('healthmd.provider.whoop_daily'));
}
function sourceTable(value) {
    const json = JSON.stringify(value).replace(/[|`<>&]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
    return `\n## WHOOP Source Facts\n\n| Native Provider (JSON) |\n|---|\n| \`${json}\` |\n`;
}

test('native Apple-v11 WHOOP fixture bytes retain producer provenance', async () => {
    const root = path.join(process.cwd(), 'tests/fixtures/apple-v11-whoop-source');
    const provenance = JSON.parse(await readFile(path.join(root, 'provenance.json'), 'utf8'));
    assert.equal(provenance.synthetic, true);
    assert.match(provenance.producer_revision, /^[a-f0-9]{40}$/);
    assert.equal(Object.keys(provenance.sha256).length, 8);
    const { createHash } = await import('node:crypto');
    for (const [name, digest] of Object.entries(provenance.sha256)) {
        assert.equal(createHash('sha256').update(await readFile(path.join(root, name))).digest('hex'), digest, name);
    }
});

test('Morning ends Markdown and Bases retain complete WHOOP facts with and without metadata', async () => {
    const { parseJSON, parseMarkdown } = await loadModule();
    for (const metadata of [true, false]) {
        const json = parseJSON(await sourceFixture(metadata, '.json'));
        assert.ok(json?.whoop);
        for (const suffix of ['.md', '-bases.md']) {
            const day = parseMarkdown(await sourceFixture(metadata, suffix));
            assert.ok(day, `${metadata} ${suffix}`);
            assert.ok(day.providers, 'complete native provider facts must remain available');
            assert.deepEqual(day.providers, json.providers);
            assert.deepEqual(day.whoop, json.whoop);
            assert.equal(day.activity?.steps, metadata || suffix === '-bases.md' ? 1 : undefined);
            assert.equal(day.heart?.hrv, undefined);
        }
    }
});

test('complete WHOOP source cells reject malformed, unknown and conflicting representations', async () => {
    const { parseMarkdown } = await loadModule();
    const base = await sourceFixture(false, '.md');
    const row = sourceRow(base);
    assert.ok(row);
    const source = JSON.parse(row.slice(3, -3));
    assert.ok(parseMarkdown(base + sourceTable(source)), 'identical redundant source tables are allowed');
    for (const transform of [
        value => { value.whoop.schema_version = 999; },
        value => { value.whoop.resources[0].record_count += 1; },
        value => { value.whoop.resources.push(value.whoop.resources[0]); },
        value => { value.whoop.cycles = 'invalid'; },
        value => { value.whoop.cycles[0].start_time = 'invalid'; },
    ]) {
        const invalid = structuredClone(source); transform(invalid);
        assert.equal(parseMarkdown(base.replace(row, sourceTable(invalid).trim().split('\n').at(-1))), null);
    }
    const conflict = structuredClone(source); conflict.whoop.cycles[0].strain_score += 1;
    assert.equal(parseMarkdown(base + sourceTable(conflict)), null);
    assert.equal(parseMarkdown(base.replace(row, '| `{broken` |')), null);
    assert.equal(parseMarkdown(base.replace('| Native Provider (JSON) |', '| Unknown |')), null);
});

test('redundant flat WHOOP facts cannot contradict complete source cells', async () => {
    const { parseMarkdown } = await loadModule();
    const base = await sourceFixture(true, '-bases.md');
    assert.ok(parseMarkdown(base));
    assert.equal(parseMarkdown(base.replace('whoop_hrv_rmssd_ms: 54.3', 'whoop_hrv_rmssd_ms: 55.3')), null);
    assert.equal(parseMarkdown(base.replace('whoop_capture_status: "complete"', 'whoop_capture_status: "not_requested"')), null);
});

test('historical WHOOP notes do not acquire successor source-cell constraints', async () => {
    const { parseMarkdown } = await loadModule();
    const legacy = await fixture('provider-day-bases.md');
    const day = parseMarkdown(legacy + '\n## WHOOP Source Facts\n\n| Native Provider (JSON) |\n|---|\n| user notes |\n');
    assert.ok(day);
    assert.equal(day.whoop.source, 'frontmatter');
    assert.equal(day.providers, undefined);
});

test('complete source cells keep not-requested, empty and failed provider capture states distinct', async () => {
    const { parseMarkdown } = await loadModule();
    const base = (await sourceFixture(false, '.md')).split('## WHOOP')[0];
    for (const status of ['not_requested', 'complete', 'partial']) {
        const whoop = {schema:'healthmd.provider.whoop_daily',schema_version:1,capture_status:status,
            fetched_at:status === 'not_requested' ? null : '2026-03-15T18:00:00.000000000Z',
            cycles:[],recoveries:[],sleep:[],workouts:[],warnings:[],resources:status === 'not_requested' ? [] : [{
                resource:'cycles',status:status === 'complete' ? 'success' : 'failure',record_count:0,
                ...(status === 'partial' ? {error:{code:'permission_denied',message:'Synthetic permission failure',retryable:false,http_status_code:403}} : {})
            }]};
        const day = parseMarkdown(base + sourceTable({whoop}));
        assert.ok(day);
        assert.equal(day.whoop.captureStatus, status);
        assert.deepEqual(day.providers, {whoop});
        assert.equal(day.whoop.cycles.length, 0);
    }
});
