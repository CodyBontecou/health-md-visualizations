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
	if (modulePromise) return modulePromise;
	modulePromise = (async () => {
		tempDir = await mkdtemp(path.join(os.tmpdir(), "health-md-v9-range-viz-tests-"));
		const harness = path.join(tempDir, "range-viz-harness.ts");
		const outfile = path.join(tempDir, "range-viz-harness.mjs");
		await writeFile(harness, `
export { parseRollupJSON } from ${JSON.stringify(path.join(process.cwd(), "src/parsers/rollup-parser.ts"))};
export { renderRollupExplorer } from ${JSON.stringify(path.join(process.cwd(), "src/visualizations/rollup-explorer.ts"))};
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

class FakeClassList {
	constructor(element) {
		this.element = element;
	}

	add(...names) {
		const classes = new Set(this.element.className.split(/\s+/).filter(Boolean));
		for (const name of names) classes.add(name);
		this.element.className = [...classes].join(" ");
	}
}

class FakeElement {
	constructor(tagName, ownerDocument) {
		this.tagName = tagName;
		this.ownerDocument = ownerDocument;
		this.children = [];
		this.className = "";
		this.classList = new FakeClassList(this);
		this.textContent = "";
	}

	appendChild(child) {
		this.children.push(child);
		return child;
	}
}

class FakeDocument {
	createElement(tagName) {
		return new FakeElement(tagName, this);
	}
}

function renderedText(element) {
	return [element.textContent, ...element.children.map(renderedText)].filter(Boolean).join(" ");
}

function renderWithPeriod(renderRollupExplorer, rollups, period) {
	const document = new FakeDocument();
	const host = new FakeElement("div", document);
	renderRollupExplorer([], host, { type: "rollup-explorer", period }, {}, { rollups });
	return renderedText(host);
}

test("roll-up explorer renders v9 ranges while retaining historical calendar filters", async () => {
	const { parseRollupJSON, renderRollupExplorer } = await loadModule();
	const content = await readFile(
		path.join(process.cwd(), "tests/fixtures/rollup-summary-v9/range-v9.json"),
		"utf8"
	);
	const range = parseRollupJSON(content);
	assert.ok(range);
	const weekly = parseRollupJSON(await readFile(
		path.join(process.cwd(), "tests/fixtures/rollup-summary-v8/weekly.json"),
		"utf8"
	));
	assert.ok(weekly);

	const rangeText = renderWithPeriod(renderRollupExplorer, [range, weekly], "range");
	assert.match(rangeText, /range · 1 shown/);
	assert.match(rangeText, /2026-07-06_to_2026-07-11/);
	assert.match(rangeText, /Steps/);
	assert.match(rangeText, /3000/);
	assert.doesNotMatch(rangeText, /2026-W28/);

	const weeklyText = renderWithPeriod(renderRollupExplorer, [range, weekly], "weekly");
	assert.match(weeklyText, /weekly · 1 shown/);
	assert.match(weeklyText, /2026-W28/);
	assert.doesNotMatch(weeklyText, /2026-07-06_to_2026-07-11/);
});

test("insert wizard offers the range roll-up period", async () => {
	const wizard = await readFile(path.join(process.cwd(), "src/insert-wizard.ts"), "utf8");
	assert.match(wizard, /value: "range", label: "Range"/);
});
