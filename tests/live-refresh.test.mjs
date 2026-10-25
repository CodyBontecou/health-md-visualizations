import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

let tempDir;
let harness;
async function loadHarness() {
	if (harness) return harness;
	tempDir = await mkdtemp(path.join(os.tmpdir(), "health-md-live-refresh-"));
	const shim = path.join(tempDir, "obsidian.ts");
	await writeFile(
		shim,
		`
 export class TAbstractFile {parent=null; constructor(public path=''){this.name=path.split('/').pop()??'';} name:string;}
 export class TFile extends TAbstractFile {extension='json';basename='2026-10-23';}
 export class TFolder extends TAbstractFile {children:any[]=[];}
 export class App {} export class Vault {} export class MetadataCache {}
 export class MarkdownView {previewMode:any;}
 export class AbstractInputSuggest {} export class Modal {} export class Notice {}
 export class PluginSettingTab {constructor(...args:any[]){}}
 export class Setting {} export const normalizePath=(p:string)=>p;
 export class Plugin {
  app:any; cleanups:Array<()=>void>=[];
  async loadData(){return {dataFolder:'health'};}
  register(fn:()=>void){this.cleanups.push(fn);}
  registerEvent(ref:any){this.register(ref.off);}
  unload(){this.cleanups.splice(0).reverse().forEach(fn=>fn());}
  registerMarkdownCodeBlockProcessor(...args:any[]){} addSettingTab(...args:any[]){}
  registerView(...args:any[]){} registerExtensions(...args:any[]){} addCommand(...args:any[]){} addRibbonIcon(...args:any[]){}
 }
 `,
	);
	const entry = path.join(tempDir, "entry.ts");
	await writeFile(
		entry,
		`export {default as HealthMdPlugin} from ${JSON.stringify(path.join(process.cwd(), "src/main.ts"))};export {TFile,TFolder,MarkdownView} from 'obsidian';`,
	);
	const outfile = path.join(tempDir, "bundle.mjs");
	await esbuild.build({
		entryPoints: [entry],
		bundle: true,
		platform: "node",
		format: "esm",
		outfile,
		logLevel: "silent",
		plugins: [
			{
				name: "obsidian-view-boundary",
				setup(build) {
					build.onResolve({ filter: /^obsidian$/ }, () => ({ path: shim }));
					build.onResolve(
						{
							filter:
								/^\.\/(renderer|insert-wizard|source-file-view|canvas-utils)$/,
						},
						(args) => ({ path: args.path, namespace: "view-stub" }),
					);
					build.onLoad({ filter: /.*/, namespace: "view-stub" }, (args) => ({
						contents:
							args.path === "./renderer"
								? "export const renderCodeBlock=()=>{};"
								: args.path === "./insert-wizard"
									? "export const openInsertVisualizationWizard=()=>{};"
									: args.path === "./canvas-utils"
										? "export const COLOR_SCHEMES={};"
										: 'export const HEALTH_MD_SOURCE_EXTENSIONS=[];export const HEALTH_MD_SOURCE_VIEW_TYPE="source";export class HealthMdSourceFileView{};',
						loader: "ts",
					}));
				},
			},
		],
	});
	harness = await import(pathToFileURL(outfile).href);
	return harness;
}
after(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
	delete globalThis.window;
});

async function fixture({ empty = false, markdown = false } = {}) {
	const { HealthMdPlugin, TFile, TFolder, MarkdownView } = await loadHarness();
	const file = new TFile("health/2026-10-23." + (markdown ? "md" : "json"));
	file.extension = markdown ? "md" : "json";
	const folder = new TFolder("health");
	folder.children = empty ? [] : [file];
	file.parent = folder;
	let steps = 1234,
		cachedSteps = 1234,
		displayed = null,
		renders = 0;
	const listeners = new Map(),
		metaListeners = new Map(),
		timers = new Map();
	let timerId = 0;
	globalThis.window = {
		setTimeout: (fn) => {
			timers.set(++timerId, fn);
			return timerId;
		},
		clearTimeout: (id) => timers.delete(id),
	};
	const on = (map, event, fn) => {
		const callbacks = map.get(event) ?? new Set();
		callbacks.add(fn);
		map.set(event, callbacks);
		return { off: () => callbacks.delete(fn) };
	};
	const content = () =>
		markdown
			? `---\ntype: health-data\ndate: 2026-10-23\nsteps: ${steps}\n---\n`
			: JSON.stringify({
					type: "health-data",
					date: "2026-10-23",
					activity: { steps },
				});
	const plugin = new HealthMdPlugin(),
		view = new MarkdownView();
	const render = async () => {
		renders++;
		displayed = (await plugin.dataLoader.load())[0]?.activity?.steps ?? null;
	};
	const renderJobs = [];
	view.previewMode = {
		rerender: () => {
			renderJobs.push(render());
		},
	};
	plugin.app = {
		vault: {
			on: (event, fn) => on(listeners, event, fn),
			getAbstractFileByPath: (p) =>
				p === "health"
					? folder
					: (folder.children.find((f) => f.path === p) ?? null),
			read: async () => content(),
		},
		metadataCache: {
			on: (event, fn) => on(metaListeners, event, fn),
			getFileCache: () =>
				markdown
					? {
							frontmatter: {
								type: "health-data",
								date: "2026-10-23",
								steps: cachedSteps,
							},
						}
					: null,
		},
		workspace: { getLeavesOfType: () => [{ view }] },
	};
	await plugin.onload();
	await render();
	const emit = (event, ...args) => {
		for (const fn of listeners.get(event) ?? []) fn(...args);
	};
	return {
		plugin,
		file,
		folder,
		emit,
		setSteps: (n) => {
			steps = n;
		},
		setCachedSteps: (n) => {
			cachedSteps = n;
		},
		metadataChanged: () => {
			for (const fn of metaListeners.get("changed") ?? []) fn(file);
		},
		displayed: () => displayed,
		renders: () => renders,
		pending: () => timers.size,
		flush: async () => {
			const pending = [...timers.values()];
			timers.clear();
			for (const fn of pending) fn();
			await Promise.all(renderJobs.splice(0));
		},
	};
}

test("a modified export updates an already open reading view without reopening the note", async () => {
	const f = await fixture();
	assert.equal(f.displayed(), 1234);
	f.setSteps(2345);
	f.emit("modify", f.file);
	await f.flush();
	assert.equal(f.displayed(), 2345);
	f.plugin.unload();
});
test("a late Markdown metadata update replaces stale cached frontmatter in the open view", async () => {
	const f = await fixture({ markdown: true });
	assert.equal(f.displayed(), 1234);
	f.setSteps(2345);
	f.emit("modify", f.file);
	await f.flush();
	assert.equal(f.displayed(), 1234);
	f.setCachedSteps(2345);
	f.metadataChanged();
	await f.flush();
	assert.equal(f.displayed(), 2345);
	f.plugin.unload();
});
test("first export, deletion, and moving an export outside the data folder update the open view", async () => {
	const f = await fixture({ empty: true });
	assert.equal(f.displayed(), null);
	f.folder.children = [f.file];
	f.emit("create", f.file);
	await f.flush();
	assert.equal(f.displayed(), 1234);
	f.folder.children = [];
	f.emit("delete", f.file);
	await f.flush();
	assert.equal(f.displayed(), null);
	f.folder.children = [f.file];
	f.emit("create", f.file);
	await f.flush();
	assert.equal(f.displayed(), 1234);
	const oldPath = f.file.path;
	f.file.path = "archive/2026-10-23.json";
	f.folder.children = [];
	f.emit("rename", f.file, oldPath);
	await f.flush();
	assert.equal(f.displayed(), null);
	f.plugin.unload();
});
test("unrelated notes do not refresh charts and a burst of source events coalesces", async () => {
	const f = await fixture(),
		before = f.renders();
	f.setSteps(2345);
	f.emit("modify", { path: "health-other/note.md" });
	await f.flush();
	assert.equal(f.renders(), before);
	assert.equal(f.displayed(), 1234);
	f.emit("modify", f.file);
	f.emit("modify", f.file);
	f.metadataChanged();
	assert.equal(f.pending(), 1);
	await f.flush();
	assert.equal(f.renders(), before + 1);
	assert.equal(f.displayed(), 2345);
	f.plugin.unload();
});
test("unloading cancels a pending refresh and unregisters source listeners", async () => {
	const f = await fixture();
	f.setSteps(2345);
	f.emit("modify", f.file);
	f.plugin.unload();
	await f.flush();
	assert.equal(f.displayed(), 1234);
	f.emit("modify", f.file);
	assert.equal(f.pending(), 0);
});
