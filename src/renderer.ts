import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import type HealthMdPlugin from "./main";
import { VizConfig } from "./types";
import { setupCanvas, resolveTheme } from "./canvas-utils";
import { VISUALIZATIONS } from "./visualizations";
import { renderIntroStats } from "./visualizations/intro-stats";

function parseConfig(source: string): VizConfig {
	const config: VizConfig = { type: "" };
	for (const line of source.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const colonIdx = trimmed.indexOf(":");
		if (colonIdx === -1) continue;
		const key = trimmed.slice(0, colonIdx).trim();
		const val = trimmed.slice(colonIdx + 1).trim();
		const num = Number(val);
		config[key] = isNaN(num) ? val : num;
	}
	return config;
}

class VizRenderChild extends MarkdownRenderChild {
	private observer: ResizeObserver | null = null;

	setObserver(obs: ResizeObserver): void {
		this.observer = obs;
	}

	onunload(): void {
		this.observer?.disconnect();
	}
}

export async function renderCodeBlock(
	plugin: HealthMdPlugin,
	source: string,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext
): Promise<void> {
	const config = parseConfig(source);
	if (!config.type) {
		el.createEl("p", {
			text: 'Missing type. Example: type: heart-terrain',
			cls: "health-md-error",
		});
		return;
	}

	// Intro stats is HTML-only, no canvas
	if (config.type === "intro-stats") {
		const data = await plugin.dataLoader.load();
		if (!data.length) {
			el.createEl("p", {
				text: `No health data found in ${plugin.settings.dataFolder}/`,
			});
			return;
		}
		const theme = resolveTheme(plugin.settings.theme);
		const container = el.createDiv({ cls: "health-md-container" });
		renderIntroStats(data, container, config, theme);
		return;
	}

	const renderFn = VISUALIZATIONS[config.type];
	if (!renderFn) {
		el.createEl("p", {
			text: `Unknown chart type: ${config.type}`,
			cls: "health-md-error",
		});
		return;
	}

	const data = await plugin.dataLoader.load();
	if (!data.length) {
		el.createEl("p", {
			text: `No health data found in ${plugin.settings.dataFolder}/`,
		});
		return;
	}

	const defaultWidth = config.width ?? plugin.settings.defaultWidth;
	const height = (config.height ?? plugin.settings.defaultHeight) as number;
	const theme = resolveTheme(plugin.settings.theme);

	const container = el.createDiv({ cls: "health-md-container" });
	const canvas = container.createEl("canvas");
	const statsEl = container.createDiv({ cls: "health-md-stats" });

	const renderChild = new VizRenderChild(container);
	ctx.addChild(renderChild);

	function draw(): void {
		const width = Math.min(container.clientWidth || defaultWidth, defaultWidth) as number;
		statsEl.empty();
		const canvasCtx = setupCanvas(canvas, width, height);
		renderFn(canvasCtx, data, width, height, config, theme, statsEl);
	}

	draw();

	const observer = new ResizeObserver(() => draw());
	observer.observe(container);
	renderChild.setObserver(observer);
}
