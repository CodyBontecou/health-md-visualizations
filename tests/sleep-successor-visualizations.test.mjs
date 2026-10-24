import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

let directory;
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });
class Element {
	constructor(text = "") { this.text = text; this.children = []; this.style = {}; this.classList = { add() {}, remove() {} }; }
	empty() { this.children = []; this.text = ""; }
	createSpan() { const child = new Element(); this.children.push(child); return child; }
	createEl(_tag, options) { const child = new Element(options.text); this.children.push(child); return child; }
	appendChild(child) { this.children.push(child); }
}
test("actual sleep charts keep Light distinct and do not invent stage timing from summary totals", async () => {
	directory = await mkdtemp(path.join(os.tmpdir(), "health-md-sleep-charts-"));
	const source = path.join(directory, "charts.ts");
	const output = path.join(directory, "charts.mjs");
	await writeFile(source, ["src/parsers/json-parser.ts", "src/visualizations/sleep-architecture.ts", "src/visualizations/sleep-polar.ts", "src/visualizations/sleep-quality-bars.ts"]
		.map((file) => `export * from ${JSON.stringify(path.join(process.cwd(), file))};`).join("\n"));
	await esbuild.build({ entryPoints: [source], bundle: true, platform: "node", format: "esm", outfile: output, logLevel: "silent" });
	const module = await import(pathToFileURL(output).href);
	globalThis.activeWindow = { devicePixelRatio: 1 };
	globalThis.activeDocument = { createTextNode: (text) => new Element(text) };
	const day = module.parseJSON(JSON.stringify({ type: "health-data", schema: "healthmd.health_data", schema_version: 6,
		schema_profile: "android-sleep-v6", date: "2026-08-10", time_context: { calendar_timezone: "America/New_York", timestamp_timezone: "UTC",
			sleep_day_attribution: "morning_ends", sleep_owner_day_rule: "session_end_date", sleep_interval_clipping: "none" },
		sleep: { totalDuration: 27900, lightSleep: 15300, bedtime: "23:45", wakeTime: "07:30",
			bedtimeISO: "2026-08-10T03:45:00.123456789Z", wakeTimeISO: "2026-08-10T11:30:00.123456789Z" } }));
	const theme = { muted: "#aaaaaa", fg: "#ffffff", bg: "#000000", isDark: true,
		colors: { sleep: { deep: "#123456", rem: "#234567", core: "#345678", awake: "#456789" } } };
	for (const recorded of [false, true]) {
		if (recorded) day.sleep.sleepStages = [{ stage: "light", startDate: "2026-08-10T03:45:00.123456789Z", endDate: "2026-08-10T08:00:00.123456789Z", durationSeconds: 15300 }];
		for (const name of ["renderSleepArchitecture", "renderSleepPolar", "renderSleepQualityBars"]) {
			const labels = [];
			const hits = [];
			const target = { canvas: { width: 600, height: 300, style: {} } };
			const ctx = new Proxy(target, { get: (object, key) => key in object ? object[key] : (...args) => {
				for (const value of args) if (typeof value === "number") assert.ok(Number.isFinite(value));
				if (key === "fillText") labels.push(args[0]);
			} });
			module[name](ctx, [day], 600, 300, {}, theme, new Element(), { add: (hit) => hits.push(hit) });
			if (name === "renderSleepQualityBars" || recorded) {
				assert.ok(hits.some((hit) => hit.details.some((detail) => detail.label === "Light")));
				assert.ok(hits.every((hit) => hit.details.every((detail) => detail.label !== "Core")));
			} else {
				assert.equal(hits.length, 0);
				assert.ok(labels.includes("No recorded sleep stage timing"));
			}
		}
	}
	delete globalThis.activeWindow;
	delete globalThis.activeDocument;
});
