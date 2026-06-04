import {
	AbstractInputSuggest,
	App,
	MarkdownView,
	Plugin,
	PluginSettingTab,
	Setting,
	TFolder,
} from "obsidian";
import {
	ColorSchemeId,
	DataFolderGranularity,
	DataPointClickAction,
	HealthMdSettings,
} from "./types";
import { DataLoader } from "./data-loader";
import {
	DATA_FOLDER_PATH_TEMPLATE_VARIABLES,
	DEFAULT_CUSTOM_DATA_FOLDER_PATH_TEMPLATE,
	normalizeDataFolderPathTemplate,
} from "./data-folder-layout";
import { renderCodeBlock } from "./renderer";
import { openInsertVisualizationWizard } from "./insert-wizard";
import {
	HEALTH_MD_SOURCE_EXTENSIONS,
	HEALTH_MD_SOURCE_VIEW_TYPE,
	HealthMdSourceFileView,
} from "./source-file-view";

interface ColorScheme {
	label: string;
	accent: string;
	secondary: string;
	heart: string;
	sleepDeep: string;
	sleepRem: string;
	sleepCore: string;
	sleepAwake: string;
}

const COLOR_SCHEMES: Record<Exclude<ColorSchemeId, "custom">, ColorScheme> = {
	default: {
		label: "Default",
		accent: "#2dd4bf",
		secondary: "#f59e0b",
		heart: "#ef4444",
		sleepDeep: "#312e81",
		sleepRem: "#7c3aed",
		sleepCore: "#2dd4bf",
		sleepAwake: "#f59e0b",
	},
	ocean: {
		label: "Ocean",
		accent: "#0ea5e9",
		secondary: "#38bdf8",
		heart: "#e11d48",
		sleepDeep: "#0c2461",
		sleepRem: "#1d4ed8",
		sleepCore: "#0ea5e9",
		sleepAwake: "#7dd3fc",
	},
	forest: {
		label: "Forest",
		accent: "#22c55e",
		secondary: "#84cc16",
		heart: "#ef4444",
		sleepDeep: "#14532d",
		sleepRem: "#15803d",
		sleepCore: "#4ade80",
		sleepAwake: "#bbf7d0",
	},
	sunset: {
		label: "Sunset",
		accent: "#f97316",
		secondary: "#ec4899",
		heart: "#ef4444",
		sleepDeep: "#7f1d1d",
		sleepRem: "#be185d",
		sleepCore: "#f97316",
		sleepAwake: "#fbbf24",
	},
	aurora: {
		label: "Aurora",
		accent: "#a855f7",
		secondary: "#06b6d4",
		heart: "#f43f5e",
		sleepDeep: "#1e1b4b",
		sleepRem: "#6d28d9",
		sleepCore: "#a855f7",
		sleepAwake: "#818cf8",
	},
	monochrome: {
		label: "Monochrome",
		accent: "#94a3b8",
		secondary: "#64748b",
		heart: "#475569",
		sleepDeep: "#0f172a",
		sleepRem: "#334155",
		sleepCore: "#64748b",
		sleepAwake: "#cbd5e1",
	},
};

const DEFAULT_SETTINGS: HealthMdSettings = {
	dataFolder: "Health",
	filePattern: "*",
	dataFormat: "auto",
	dataFolderGranularity: "flat",
	dataFolderCustomPathTemplate: DEFAULT_CUSTOM_DATA_FOLDER_PATH_TEMPLATE,
	theme: "auto",
	defaultWidth: 800,
	defaultHeight: 400,
	colorScheme: "default",
	colorAccent: "#2dd4bf",
	colorSecondary: "#f59e0b",
	colorHeart: "#ef4444",
	colorSleepDeep: "#312e81",
	colorSleepRem: "#7c3aed",
	colorSleepCore: "#2dd4bf",
	colorSleepAwake: "#f59e0b",
	dataPointClickAction: "pin",
	mapTilesEnabled: true,
	mapTileUrl: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
	mapTileAttribution: "© OpenStreetMap contributors © CARTO",
};

const DATA_POINT_CLICK_ACTIONS: DataPointClickAction[] = ["pin", "source", "daily"];
const DATA_FOLDER_GRANULARITIES: DataFolderGranularity[] = [
	"flat",
	"year",
	"month",
	"week",
	"day",
	"custom",
];

function isDataPointClickAction(value: unknown): value is DataPointClickAction {
	return typeof value === "string" && DATA_POINT_CLICK_ACTIONS.includes(value as DataPointClickAction);
}

function isDataFolderGranularity(value: unknown): value is DataFolderGranularity {
	return typeof value === "string" && DATA_FOLDER_GRANULARITIES.includes(value as DataFolderGranularity);
}

export default class HealthMdPlugin extends Plugin {
	settings: HealthMdSettings = DEFAULT_SETTINGS;
	dataLoader!: DataLoader;
	private drawCallbacks = new Set<() => void>();

	registerDraw(fn: () => void): () => void {
		this.drawCallbacks.add(fn);
		return () => this.drawCallbacks.delete(fn);
	}

	redrawAll(): void {
		this.drawCallbacks.forEach((fn) => fn());
	}

	async onload(): Promise<void> {
		await this.loadSettings();
		this.dataLoader = new DataLoader(this.app.vault, this.settings);

		this.registerMarkdownCodeBlockProcessor(
			"health-viz",
			(source, el, ctx) => renderCodeBlock(this, source, el, ctx)
		);

		this.addSettingTab(new HealthMdSettingTab(this.app, this));

		this.registerView(
			HEALTH_MD_SOURCE_VIEW_TYPE,
			(leaf) => new HealthMdSourceFileView(leaf)
		);
		this.registerExtensions(HEALTH_MD_SOURCE_EXTENSIONS, HEALTH_MD_SOURCE_VIEW_TYPE);

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
				openInsertVisualizationWizard(this.app, editor, this.settings);
			},
		});
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData() as Partial<HealthMdSettings>
		);
		if (!isDataPointClickAction(this.settings.dataPointClickAction)) {
			this.settings.dataPointClickAction = DEFAULT_SETTINGS.dataPointClickAction;
		}
		if (!isDataFolderGranularity(this.settings.dataFolderGranularity)) {
			this.settings.dataFolderGranularity = DEFAULT_SETTINGS.dataFolderGranularity;
		}
		this.settings.dataFolderCustomPathTemplate = normalizeDataFolderPathTemplate(
			this.settings.dataFolderCustomPathTemplate ??
				DEFAULT_CUSTOM_DATA_FOLDER_PATH_TEMPLATE
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

class FolderInputSuggest extends AbstractInputSuggest<string> {
	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.limit = 200;
	}

	private getFolderPaths(): string[] {
		return this.app.vault
			.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder)
			.map((f) => f.path)
			.filter((path) => path.length > 0 && path !== "/")
			.sort((a, b) => a.localeCompare(b));
	}

	protected getSuggestions(query: string): string[] {
		const q = query.trim().toLowerCase();
		const folders = this.getFolderPaths();
		if (!q) return folders;
		return folders.filter((path) => path.toLowerCase().includes(q));
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
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

		const updateDataFolder = async (value: string): Promise<void> => {
			const next = value.trim().replace(/^\/+|\/+$/g, "");
			if (next === this.plugin.settings.dataFolder) return;
			this.plugin.settings.dataFolder = next;
			this.plugin.dataLoader.invalidate();
			await this.plugin.saveSettings();
			this.plugin.refreshViews();
		};

		const updateCustomPathTemplate = async (value: string): Promise<void> => {
			const next = normalizeDataFolderPathTemplate(value);
			if (next === this.plugin.settings.dataFolderCustomPathTemplate) return;
			this.plugin.settings.dataFolderCustomPathTemplate = next;
			this.plugin.dataLoader.invalidate();
			await this.plugin.saveSettings();
			this.plugin.refreshViews();
		};

		new Setting(containerEl)
			.setName("Data folder")
			.setDesc(
				"Path to the folder containing health data files. Start typing to pick an existing folder."
			)
			.addSearch((search) => {
				search
					.setPlaceholder("Health")
					.setValue(this.plugin.settings.dataFolder)
					.onChange(async (value) => {
						await updateDataFolder(value);
					});

				const folderSuggest = new FolderInputSuggest(this.app, search.inputEl);
				folderSuggest.onSelect((value) => {
					void updateDataFolder(value);
				});
				search.inputEl.addEventListener("focus", () => folderSuggest.open());
				search.inputEl.addEventListener("click", () => folderSuggest.open());
			});

		new Setting(containerEl)
			.setName("Data folder structure")
			.setDesc(
				"Opt in to nested data folders. Flat keeps the existing direct-file behavior; nested choices scan up to that depth and also keep direct files loadable for gradual migrations."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("flat", "Flat (Health/file.json)")
					.addOption("year", "Year folders (Health/YYYY/file.json)")
					.addOption("month", "Month folders (Health/YYYY/MM/file.json)")
					.addOption("week", "Week folders (Health/YYYY/W23/file.json)")
					.addOption("day", "Day folders (Health/YYYY/MM/DD/file.json)")
					.addOption("custom", "Custom template")
					.setValue(this.plugin.settings.dataFolderGranularity)
					.onChange(async (value) => {
						this.plugin.settings.dataFolderGranularity =
							value as DataFolderGranularity;
						this.plugin.dataLoader.invalidate();
						await this.plugin.saveSettings();
						this.plugin.refreshViews();
					})
			);

		const customTemplateVariables = DATA_FOLDER_PATH_TEMPLATE_VARIABLES
			.map((variable) => `{${variable}}`)
			.join(", ");

		new Setting(containerEl)
			.setName("Custom folder path template")
			.setDesc(
				`Used when Data folder structure is Custom. Available variables: ${customTemplateVariables}. Example: {year}/{month}/{day}.`
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_CUSTOM_DATA_FOLDER_PATH_TEMPLATE)
					.setValue(this.plugin.settings.dataFolderCustomPathTemplate)
					.onChange(async (value) => {
						await updateCustomPathTemplate(value);
					})
			);

		new Setting(containerEl)
			.setName("File pattern")
			.setDesc(
				"Glob pattern to match file names or nested paths. Use * to include all supported files."
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
				"Automatically detect file format by extension. Markdown and bases files must include YAML frontmatter."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("auto", "Auto-detect by extension")
					.addOption("json", "JSON")
					.addOption("csv", "CSV")
					.addOption("markdown", "Markdown (YAML frontmatter required)")
					.addOption("bases", "Obsidian bases (YAML frontmatter)")
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
						this.plugin.redrawAll();
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

		new Setting(containerEl)
			.setName("Data point click action")
			.setDesc("Choose what happens when clicking a hoverable point in canvas charts.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("pin", "Pin tooltip")
					.addOption("source", "Open source data file")
					.addOption("daily", "Open daily note")
					.setValue(this.plugin.settings.dataPointClickAction)
					.onChange(async (value) => {
						this.plugin.settings.dataPointClickAction = value as DataPointClickAction;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("Colors").setHeading();

		// Color scheme preset picker
		const colorInputs: Record<string, HTMLInputElement> = {};

		const applyScheme = async (schemeId: ColorSchemeId) => {
			this.plugin.settings.colorScheme = schemeId;
			if (schemeId !== "custom") {
				const scheme = COLOR_SCHEMES[schemeId];
				this.plugin.settings.colorAccent = scheme.accent;
				this.plugin.settings.colorSecondary = scheme.secondary;
				this.plugin.settings.colorHeart = scheme.heart;
				this.plugin.settings.colorSleepDeep = scheme.sleepDeep;
				this.plugin.settings.colorSleepRem = scheme.sleepRem;
				this.plugin.settings.colorSleepCore = scheme.sleepCore;
				this.plugin.settings.colorSleepAwake = scheme.sleepAwake;
				// Sync color pickers to the new values
				if (colorInputs["colorAccent"]) colorInputs["colorAccent"].value = scheme.accent;
				if (colorInputs["colorSecondary"]) colorInputs["colorSecondary"].value = scheme.secondary;
				if (colorInputs["colorHeart"]) colorInputs["colorHeart"].value = scheme.heart;
				if (colorInputs["colorSleepDeep"]) colorInputs["colorSleepDeep"].value = scheme.sleepDeep;
				if (colorInputs["colorSleepRem"]) colorInputs["colorSleepRem"].value = scheme.sleepRem;
				if (colorInputs["colorSleepCore"]) colorInputs["colorSleepCore"].value = scheme.sleepCore;
				if (colorInputs["colorSleepAwake"]) colorInputs["colorSleepAwake"].value = scheme.sleepAwake;
			}
			await this.plugin.saveSettings();
			this.plugin.redrawAll();
		};

		let schemeDropdown: HTMLSelectElement;
		new Setting(containerEl)
			.setName("Color scheme")
			.setDesc("Choose a preset palette or customize individual colors below")
			.addDropdown((dropdown) => {
				(Object.keys(COLOR_SCHEMES) as ColorSchemeId[]).forEach((id) => {
					dropdown.addOption(id, COLOR_SCHEMES[id as Exclude<ColorSchemeId, "custom">].label);
				});
				dropdown.addOption("custom", "Custom");
				dropdown.setValue(this.plugin.settings.colorScheme);
				dropdown.onChange(async (value) => {
					await applyScheme(value as ColorSchemeId);
				});
				schemeDropdown = dropdown.selectEl;
			});

		// Individual color pickers
		const colorSettings: Array<{
			key: keyof HealthMdSettings;
			name: string;
			desc: string;
		}> = [
			{ key: "colorAccent", name: "Accent", desc: "Primary color for activity charts (steps, breathing, rings)" },
			{ key: "colorSecondary", name: "Secondary", desc: "Secondary color for calories, asymmetry, and distance" },
			{ key: "colorHeart", name: "Heart rate", desc: "Color for heart rate stats" },
			{ key: "colorSleepDeep", name: "Deep sleep", desc: "Color for deep sleep stages" },
			{ key: "colorSleepRem", name: "REM sleep", desc: "Color for REM sleep stages" },
			{ key: "colorSleepCore", name: "Core sleep", desc: "Color for core sleep stages" },
			{ key: "colorSleepAwake", name: "Awake", desc: "Color for awake periods in sleep charts" },
		];

		colorSettings.forEach(({ key, name, desc }) => {
			const setting = new Setting(containerEl).setName(name).setDesc(desc);
			const input = setting.controlEl.createEl("input");
			input.type = "color";
			input.value = this.plugin.settings[key] as string;
			colorInputs[key] = input;
			input.addEventListener("change", () => {
				void (async () => {
					(this.plugin.settings[key] as string) = input.value;
					// Switch to custom when the user manually changes a color
					this.plugin.settings.colorScheme = "custom";
					if (schemeDropdown) schemeDropdown.value = "custom";
					await this.plugin.saveSettings();
					this.plugin.redrawAll();
				})();
			});
		});

		new Setting(containerEl).setName("Workouts").setHeading();

		new Setting(containerEl)
			.setName("Maximum heart rate")
			.setDesc(
				"Your max heart rate in beats per minute, used to draw heart-rate zone bands on workout charts. Leave blank to skip zone bands. A common estimate is 220 minus your age."
			)
			.addText((text) =>
				text
					.setPlaceholder("190")
					.setValue(
						this.plugin.settings.maxHeartRate != null
							? String(this.plugin.settings.maxHeartRate)
							: ""
					)
					.onChange(async (value) => {
						const trimmed = value.trim();
						if (!trimmed) {
							this.plugin.settings.maxHeartRate = undefined;
						} else {
							const num = parseInt(trimmed, 10);
							if (Number.isFinite(num) && num > 0) {
								this.plugin.settings.maxHeartRate = num;
							}
						}
						await this.plugin.saveSettings();
						this.plugin.redrawAll();
					})
			);

		new Setting(containerEl)
			.setName("Show map tiles")
			.setDesc(
				"Render workout maps with tile imagery (requires network). When off, the route is drawn as a polyline on a plain background."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.mapTilesEnabled)
					.onChange(async (value) => {
						this.plugin.settings.mapTilesEnabled = value;
						await this.plugin.saveSettings();
						this.plugin.redrawAll();
					})
			);

		new Setting(containerEl)
			.setName("Map tile URL")
			.setDesc(
				"Leaflet tile URL template. Replace with a different provider's URL if you have your own API key."
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.mapTileUrl)
					.setValue(this.plugin.settings.mapTileUrl)
					.onChange(async (value) => {
						this.plugin.settings.mapTileUrl =
							value.trim() || DEFAULT_SETTINGS.mapTileUrl;
						await this.plugin.saveSettings();
						this.plugin.redrawAll();
					})
			);

		new Setting(containerEl)
			.setName("Map attribution")
			.setDesc("Attribution string shown on the map. Required by most tile providers.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.mapTileAttribution)
					.setValue(this.plugin.settings.mapTileAttribution)
					.onChange(async (value) => {
						this.plugin.settings.mapTileAttribution =
							value.trim() || DEFAULT_SETTINGS.mapTileAttribution;
						await this.plugin.saveSettings();
						this.plugin.redrawAll();
					})
			);
	}
}
