import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

let tempDir;
let rendererPromise;

async function loadRenderer() {
	if (rendererPromise) return rendererPromise;
	rendererPromise = (async () => {
		tempDir = await mkdtemp(path.join(os.tmpdir(), "health-md-renderer-tests-"));
		const outfile = path.join(tempDir, "renderer.mjs");
		const shims = {
			obsidian: `
export class MarkdownRenderChild {
	constructor(containerEl) {
		this.containerEl = containerEl;
		this.callbacks = [];
	}
	register(callback) { this.callbacks.push(callback); }
	onunload() {}
	unload() {
		this.onunload();
		for (const callback of this.callbacks.splice(0)) callback();
	}
}
export class Notice {}
export class TFile {}
export const normalizePath = (value) => value;
`,
			visualizations: `
export const VISUALIZATIONS = {
	"test-canvas": (ctx) => { ctx.drawCount++; },
};
export const HTML_VISUALIZATIONS = {
	"test-html": (_data, el) => { el.drawCount++; },
};
export const ROLLUP_ONLY_VISUALIZATIONS = new Set();
`,
		};
		await esbuild.build({
			entryPoints: [path.join(process.cwd(), "src/renderer.ts")],
			bundle: true,
			platform: "node",
			format: "esm",
			outfile,
			logLevel: "silent",
			plugins: [{
				name: "renderer-dependencies",
				setup(build) {
					build.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "renderer-test" }));
					build.onResolve({ filter: /^\.\/visualizations$/ }, () => ({ path: "visualizations", namespace: "renderer-test" }));
					build.onLoad({ filter: /.*/, namespace: "renderer-test" }, ({ path: name }) => ({ contents: shims[name], loader: "js" }));
				},
			}],
		});
		return import(pathToFileURL(outfile).href);
	})();
	return rendererPromise;
}

after(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

class FakeElement {
	constructor() {
		this.children = [];
		this.style = {};
		this.clientWidth = 600;
		this.drawCount = 0;
		this.context = { drawCount: 0, scale() {} };
	}
	createDiv() { return this.createEl(); }
	createEl() {
		const child = new FakeElement();
		this.children.push(child);
		return child;
	}
	empty() { this.children = []; }
	addClass() {}
	removeClass() {}
	addEventListener() {}
	getContext() { return this.context; }
}

function createEnvironment(t) {
	const observers = [];
	const globals = {
		activeDocument: { body: {} },
		activeWindow: {
			devicePixelRatio: 1,
			getComputedStyle: () => ({ getPropertyValue: () => "" }),
		},
		ResizeObserver: class {
			constructor(callback) {
				this.callback = callback;
				this.target = null;
				this.disconnectCount = 0;
				observers.push(this);
			}
			observe(target) { this.target = target; }
			disconnect() {
				this.target = null;
				this.disconnectCount++;
			}
			resize() { if (this.target) this.callback(); }
		},
	};
	for (const [key, value] of Object.entries(globals)) {
		const original = Object.getOwnPropertyDescriptor(globalThis, key);
		Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
		t.after(() => {
			if (original) Object.defineProperty(globalThis, key, original);
			else delete globalThis[key];
		});
	}

	const draws = new Set();
	const plugin = {
		settings: { theme: "dark", colorScheme: "default", defaultWidth: 600, defaultHeight: 250, unitSystem: "metric" },
		app: { metadataCache: { getCache: () => null } },
		dataLoader: {
			load: async () => [{ type: "health-data", date: "2026-01-01" }],
			getLastRollups: () => [],
			getDataDictionary: () => null,
			getLastLoadReport: () => ({}),
		},
		registerDraw(draw) {
			draws.add(draw);
			return () => draws.delete(draw);
		},
		redrawAll() { draws.forEach((draw) => draw()); },
	};
	const children = [];
	const ctx = { sourcePath: "", addChild: (child) => children.push(child) };
	return { plugin, ctx, children, observers, draws };
}

test("HTML render children unsubscribe from redraws on unload", async (t) => {
	const { renderCodeBlock } = await loadRenderer();
	const { plugin, ctx, children, observers, draws } = createEnvironment(t);
	const host = new FakeElement();
	await renderCodeBlock(plugin, "type: test-html", host, ctx);
	const container = host.children[0];

	assert.equal(children.length, 1);
	assert.equal(container.drawCount, 1);
	assert.equal(observers.length, 0);
	plugin.redrawAll();
	assert.equal(container.drawCount, 2);

	children[0].unload();
	assert.equal(draws.size, 0);
	plugin.redrawAll();
	assert.equal(container.drawCount, 2);
});

test("canvas render children disconnect resize observers and unsubscribe on unload", async (t) => {
	const { renderCodeBlock } = await loadRenderer();
	const { plugin, ctx, children, observers, draws } = createEnvironment(t);
	const host = new FakeElement();
	await renderCodeBlock(plugin, "type: test-canvas", host, ctx);
	const container = host.children[0];
	const canvas = container.children[0].context;

	assert.equal(children.length, 1);
	assert.equal(observers.length, 1);
	assert.equal(observers[0].target, container);
	assert.equal(canvas.drawCount, 1);
	observers[0].resize();
	plugin.redrawAll();
	assert.equal(canvas.drawCount, 3);

	children[0].unload();
	assert.equal(observers[0].disconnectCount, 1);
	assert.equal(draws.size, 0);
	observers[0].resize();
	plugin.redrawAll();
	assert.equal(canvas.drawCount, 3);
});

test("unloading one visualization leaves other render children active", async (t) => {
	const { renderCodeBlock } = await loadRenderer();
	const { plugin, ctx, children, observers, draws } = createEnvironment(t);
	const canvasHost = new FakeElement();
	const htmlHost = new FakeElement();
	await renderCodeBlock(plugin, "type: test-canvas", canvasHost, ctx);
	await renderCodeBlock(plugin, "type: test-html", htmlHost, ctx);
	const canvas = canvasHost.children[0].children[0].context;
	const html = htmlHost.children[0];
	assert.equal(draws.size, 2);

	children[0].unload();
	plugin.redrawAll();
	assert.equal(canvas.drawCount, 1);
	assert.equal(observers[0].disconnectCount, 1);
	assert.equal(html.drawCount, 2);
	assert.equal(draws.size, 1);

	children[1].unload();
	plugin.redrawAll();
	assert.equal(html.drawCount, 2);
	assert.equal(draws.size, 0);
});
