import { App, MarkdownView, Plugin, PluginSettingTab, Setting } from "obsidian";
import { HealthMdSettings } from "./types";
import { DataLoader } from "./data-loader";
import { renderCodeBlock } from "./renderer";

const DEFAULT_SETTINGS: HealthMdSettings = {
	dataFolder: "Health",
	filePattern: "*",
	dataFormat: "auto",
	theme: "auto",
	defaultWidth: 800,
	defaultHeight: 400,
};

export default class HealthMdPlugin extends Plugin {
	settings: HealthMdSettings = DEFAULT_SETTINGS;
	dataLoader!: DataLoader;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.dataLoader = new DataLoader(this.app.vault, this.settings);

		this.registerMarkdownCodeBlockProcessor(
			"health-viz",
			(source, el, ctx) => renderCodeBlock(this, source, el, ctx)
		);

		this.addSettingTab(new HealthMdSettingTab(this.app, this));

		// Invalidate cache when files change in the data folder
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (file.path.startsWith(this.settings.dataFolder + "/")) {
					this.dataLoader.invalidate();
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file.path.startsWith(this.settings.dataFolder + "/")) {
					this.dataLoader.invalidate();
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (file.path.startsWith(this.settings.dataFolder + "/")) {
					this.dataLoader.invalidate();
				}
			})
		);

		this.addCommand({
			id: "insert-health-chart",
			name: "Insert health visualization",
			editorCallback: (editor) => {
				editor.replaceSelection(
					"```health-viz\ntype: heart-terrain\n```\n"
				);
			},
		});
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	refreshViews(): void {
		this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
			if (leaf.view instanceof MarkdownView) {
				leaf.view.previewMode.rerender(true);
			}
		});
	}
}

class HealthMdSettingTab extends PluginSettingTab {
	plugin: HealthMdPlugin;

	constructor(app: App, plugin: HealthMdPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Data folder")
			.setDesc("Path to the folder containing health data files")
			.addText((text) =>
				text
					.setPlaceholder("Health")
					.setValue(this.plugin.settings.dataFolder)
					.onChange(async (value) => {
						this.plugin.settings.dataFolder = value.trim();
						this.plugin.dataLoader.invalidate();
						await this.plugin.saveSettings();
						this.plugin.refreshViews();
					})
			);

		new Setting(containerEl)
			.setName("File pattern")
			.setDesc(
				"Glob pattern to match files (e.g. *.json, 2026-*.md, health-*.csv). Use * for all supported files."
			)
			.addText((text) =>
				text
					.setPlaceholder("*")
					.setValue(this.plugin.settings.filePattern)
					.onChange(async (value) => {
						this.plugin.settings.filePattern = value.trim();
						this.plugin.dataLoader.invalidate();
						await this.plugin.saveSettings();
						this.plugin.refreshViews();
					})
			);

		new Setting(containerEl)
			.setName("Data format")
			.setDesc(
				"Auto-detect reads JSON, CSV, and Markdown/Bases by file extension. Or force a specific format."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("auto", "Auto-detect by extension")
					.addOption("json", "JSON")
					.addOption("csv", "CSV")
					.addOption("markdown", "Markdown (frontmatter)")
					.addOption("bases", "Obsidian Bases (YAML frontmatter)")
					.setValue(this.plugin.settings.dataFormat)
					.onChange(async (value) => {
						this.plugin.settings.dataFormat = value as HealthMdSettings["dataFormat"];
						this.plugin.dataLoader.invalidate();
						await this.plugin.saveSettings();
						this.plugin.refreshViews();
					})
			);

		new Setting(containerEl)
			.setName("Theme")
			.setDesc("Color theme for visualizations")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("auto", "Auto (match Obsidian)")
					.addOption("dark", "Dark")
					.addOption("light", "Light")
					.setValue(this.plugin.settings.theme)
					.onChange(async (value) => {
						this.plugin.settings.theme = value as "auto" | "dark" | "light";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default width")
			.setDesc("Default canvas width in pixels")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.defaultWidth))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.defaultWidth = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Default height")
			.setDesc("Default canvas height in pixels")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.defaultHeight))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.defaultHeight = num;
							await this.plugin.saveSettings();
						}
					})
			);
	}
}
