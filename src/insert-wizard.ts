import { App, Editor, Modal, Notice, Setting, SuggestModal } from "obsidian";
import type { HealthMdSettings } from "./types";
import {
	CategoryFilterId,
	DateRangeMode,
	ParamDefinition,
	TextParamDefinition,
	VisualizationCategory,
	VisualizationCategoryId,
	VisualizationOption,
	VISUALIZATION_CATALOG,
	VISUALIZATION_CATEGORIES,
} from "./visualization-catalog";

export * from "./visualization-catalog";


const DATE_OR_DATETIME_INPUT =
	/^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;
const TIME_INPUT = /^\d{1,2}:\d{2}$/;
const DATE_PLACEHOLDER = "YYYY-MM-DD";
const DATE_OR_DATETIME_PLACEHOLDER = "YYYY-MM-DD or YYYY-MM-DDTHH:MM";


export function openInsertVisualizationWizard(
	app: App,
	editor: Editor,
	settings: HealthMdSettings
): void {
	new VisualizationCategoryModal(app, (category) => {
		new VisualizationTypeModal(app, category.id, (visualization) => {
			new VisualizationConfigModal(app, editor, visualization, settings).open();
		}).open();
	}).open();
}

function categoryLabel(categoryId: VisualizationCategoryId): string {
	return VISUALIZATION_CATEGORIES.find((category) => category.id === categoryId)?.label ?? categoryId;
}

function normalizeLineValue(value: string): string {
	return value.replace(/[\r\n]/g, " ").trim();
}

function isPositiveNumber(value: string): boolean {
	const numberValue = Number(value);
	return Number.isFinite(numberValue) && numberValue > 0;
}

function isInteger(value: string): boolean {
	return /^\d+$/.test(value.trim());
}

function paramSearchText(param: ParamDefinition): string {
	const optionText = param.kind === "select"
		? param.options.map((option) => `${option.value} ${option.label}`).join(" ")
		: "";
	return `${param.key} ${param.label} ${param.desc} ${optionText}`;
}

class VisualizationCategoryModal extends SuggestModal<VisualizationCategory> {
	private readonly onPick: (category: VisualizationCategory) => void;

	constructor(app: App, onPick: (category: VisualizationCategory) => void) {
		super(app);
		this.onPick = onPick;
		this.setPlaceholder("Choose a health visualization category…");
		this.setInstructions([
			{ command: "↑↓", purpose: "navigate" },
			{ command: "↵", purpose: "choose category" },
			{ command: "esc", purpose: "cancel" },
		]);
	}

	getSuggestions(query: string): VisualizationCategory[] {
		const q = query.trim().toLowerCase();
		if (!q) return VISUALIZATION_CATEGORIES;
		return VISUALIZATION_CATEGORIES.filter((category) =>
			`${category.label} ${category.description}`.toLowerCase().includes(q)
		);
	}

	renderSuggestion(category: VisualizationCategory, el: HTMLElement): void {
		el.createDiv({ cls: "suggestion-title", text: category.label });
		el.createDiv({ cls: "suggestion-note", text: category.description });
	}

	onChooseSuggestion(category: VisualizationCategory): void {
		this.close();
		this.onPick(category);
	}
}

class VisualizationTypeModal extends SuggestModal<VisualizationOption> {
	private readonly categoryId: CategoryFilterId;
	private readonly onPick: (visualization: VisualizationOption) => void;

	constructor(
		app: App,
		categoryId: CategoryFilterId,
		onPick: (visualization: VisualizationOption) => void
	) {
		super(app);
		this.categoryId = categoryId;
		this.onPick = onPick;
		const category = VISUALIZATION_CATEGORIES.find((item) => item.id === categoryId);
		this.setPlaceholder(
			categoryId === "all"
				? "Choose a health visualization…"
				: `Choose a ${category?.label.toLowerCase() ?? "health"} visualization…`
		);
		this.setInstructions([
			{ command: "↑↓", purpose: "navigate" },
			{ command: "↵", purpose: "configure visualization" },
			{ command: "esc", purpose: "cancel" },
		]);
	}

	getSuggestions(query: string): VisualizationOption[] {
		const q = query.trim().toLowerCase();
		const scoped = this.categoryId === "all"
			? VISUALIZATION_CATALOG
			: VISUALIZATION_CATALOG.filter((item) => item.category === this.categoryId);
		if (!q) return scoped;
		return scoped.filter((item) => {
			const text = [
				item.type,
				item.label,
				item.description,
				categoryLabel(item.category),
				...item.params.map(paramSearchText),
			]
				.join(" ")
				.toLowerCase();
			return text.includes(q);
		});
	}

	renderSuggestion(item: VisualizationOption, el: HTMLElement): void {
		el.createDiv({ cls: "suggestion-title", text: item.label });
		el.createDiv({
			cls: "suggestion-note",
			text: `${item.type} · ${categoryLabel(item.category)}`,
		});
		el.createDiv({ cls: "suggestion-note", text: item.description });
	}

	onChooseSuggestion(item: VisualizationOption): void {
		this.close();
		this.onPick(item);
	}
}

class VisualizationConfigModal extends Modal {
	private readonly editor: Editor;
	private readonly option: VisualizationOption;
	private readonly settings: HealthMdSettings;
	private readonly paramValues: Record<string, string | boolean> = {};
	private rangeMode: DateRangeMode = "last";
	private lastDays: string;
	private toDate = "";
	private singleDate = "";
	private fromDate = "";
	private customToDate = "";
	private width = "";
	private height: string;

	constructor(
		app: App,
		editor: Editor,
		option: VisualizationOption,
		settings: HealthMdSettings
	) {
		super(app);
		this.editor = editor;
		this.option = option;
		this.settings = settings;
		this.lastDays = String(option.defaultLast);
		this.height = option.defaultHeight != null ? String(option.defaultHeight) : "";
		this.shouldRestoreSelection = true;

		for (const param of option.params) {
			if (param.kind === "toggle") {
				this.paramValues[param.key] = param.defaultValue;
			} else if (param.key === "maxHeartRate" && settings.maxHeartRate != null) {
				this.paramValues[param.key] = String(settings.maxHeartRate);
			} else {
				this.paramValues[param.key] = param.defaultValue ?? "";
			}
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(`Insert ${this.option.label}`);

		contentEl.createEl("p", {
			cls: "setting-item-description",
			text: `${this.option.type} · ${categoryLabel(this.option.category)} · ${this.option.description}`,
		});

		new Setting(contentEl).setName("Date range").setHeading();

		let lastDaysSetting: Setting;
		let toDateSetting: Setting;
		let singleDateSetting: Setting;
		let fromDateSetting: Setting;
		let customToDateSetting: Setting;

		const updateRangeVisibility = (): void => {
			lastDaysSetting.settingEl.style.display = this.rangeMode === "last" ? "" : "none";
			toDateSetting.settingEl.style.display = this.rangeMode === "last" ? "" : "none";
			singleDateSetting.settingEl.style.display = this.rangeMode === "single" ? "" : "none";
			fromDateSetting.settingEl.style.display = this.rangeMode === "custom" ? "" : "none";
			customToDateSetting.settingEl.style.display = this.rangeMode === "custom" ? "" : "none";
		};

		new Setting(contentEl)
			.setName("Range mode")
			.setDesc("Choose whether this block follows a rolling window, one day, explicit boundaries, or all loaded data.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("last", "Rolling days")
					.addOption("single", "Single day")
					.addOption("custom", "Custom from/to")
					.addOption("none", "All available data")
					.setValue(this.rangeMode)
					.onChange((value) => {
						this.rangeMode = value as DateRangeMode;
						updateRangeVisibility();
					})
			);

		lastDaysSetting = new Setting(contentEl)
			.setName("Last days")
			.setDesc("Number of calendar days to include.")
			.addText((text) =>
				text
					.setPlaceholder(String(this.option.defaultLast))
					.setValue(this.lastDays)
					.onChange((value) => {
						this.lastDays = value;
					})
			);

		toDateSetting = new Setting(contentEl)
			.setName("Anchor to date")
			.setDesc("Optional end date/datetime. Leave blank to end today.")
			.addText((text) =>
				text
					.setPlaceholder(DATE_OR_DATETIME_PLACEHOLDER)
					.setValue(this.toDate)
					.onChange((value) => {
						this.toDate = value;
					})
			);

		singleDateSetting = new Setting(contentEl)
			.setName("Day")
			.setDesc("Date to use for both from and to.")
			.addText((text) =>
				text
					.setPlaceholder(DATE_PLACEHOLDER)
					.setValue(this.singleDate)
					.onChange((value) => {
						this.singleDate = value;
					})
			);

		fromDateSetting = new Setting(contentEl)
			.setName("From")
			.setDesc("Inclusive start date or datetime.")
			.addText((text) =>
				text
					.setPlaceholder(DATE_OR_DATETIME_PLACEHOLDER)
					.setValue(this.fromDate)
					.onChange((value) => {
						this.fromDate = value;
					})
			);

		customToDateSetting = new Setting(contentEl)
			.setName("To")
			.setDesc("Inclusive end date or datetime.")
			.addText((text) =>
				text
					.setPlaceholder(DATE_OR_DATETIME_PLACEHOLDER)
					.setValue(this.customToDate)
					.onChange((value) => {
						this.customToDate = value;
					})
			);

		if (this.option.params.length > 0) {
			new Setting(contentEl).setName("Visualization options").setHeading();
			this.renderParamSettings(contentEl);
		} else {
			contentEl.createEl("p", {
				cls: "setting-item-description",
				text: "This visualization does not need extra component parameters.",
			});
		}

		new Setting(contentEl).setName("Size").setHeading();

		new Setting(contentEl)
			.setName("Height")
			.setDesc("Optional render height in pixels. Clear to use the plugin default.")
			.addText((text) =>
				text
					.setPlaceholder(String(this.settings.defaultHeight))
					.setValue(this.height)
					.onChange((value) => {
						this.height = value;
					})
			);

		new Setting(contentEl)
			.setName("Width")
			.setDesc("Optional maximum render width in pixels.")
			.addText((text) =>
				text
					.setPlaceholder(String(this.settings.defaultWidth))
					.setValue(this.width)
					.onChange((value) => {
						this.width = value;
					})
			);

		new Setting(contentEl)
			.addButton((button) =>
				button
					.setButtonText("Insert visualization")
					.setCta()
					.onClick(() => this.insertVisualization())
			)
			.addButton((button) =>
				button
					.setButtonText("Cancel")
					.onClick(() => this.close())
			);

		updateRangeVisibility();
	}

	private renderParamSettings(contentEl: HTMLElement): void {
		for (const param of this.option.params) {
			if (param.kind === "select") {
				new Setting(contentEl)
					.setName(param.label)
					.setDesc(param.desc)
					.addDropdown((dropdown) => {
						for (const option of param.options) {
							dropdown.addOption(option.value, option.label);
						}
						dropdown
							.setValue(String(this.paramValues[param.key] ?? param.defaultValue))
							.onChange((value) => {
								this.paramValues[param.key] = value;
							});
					});
			} else if (param.kind === "toggle") {
				new Setting(contentEl)
					.setName(param.label)
					.setDesc(param.desc)
					.addToggle((toggle) =>
						toggle
							.setValue(Boolean(this.paramValues[param.key]))
							.onChange((value) => {
								this.paramValues[param.key] = value;
							})
					);
			} else {
				new Setting(contentEl)
					.setName(param.label)
					.setDesc(param.desc)
					.addText((text) =>
						text
							.setPlaceholder(param.placeholder ?? param.defaultValue ?? "")
							.setValue(String(this.paramValues[param.key] ?? ""))
							.onChange((value) => {
								this.paramValues[param.key] = value;
							})
					);
			}
		}
	}

	private insertVisualization(): void {
		const block = this.buildBlock();
		if (!block) return;

		this.editor.replaceSelection(block);
		new Notice(`Inserted ${this.option.label} visualization`);
		this.close();
	}

	private buildBlock(): string | null {
		const paramLines = this.buildParamLines();
		if (!paramLines) return null;
		const dateLines = this.buildDateLines();
		if (!dateLines) return null;
		const sizeLines = this.buildSizeLines();
		if (!sizeLines) return null;

		const lines = [
			`type: ${this.option.type}`,
			...paramLines,
			...dateLines,
			...sizeLines,
		];

		return `\`\`\`health-viz\n${lines.join("\n")}\n\`\`\`\n`;
	}

	private buildParamLines(): string[] | null {
		const lines: string[] = [];

		for (const param of this.option.params) {
			const rawValue = this.paramValues[param.key];
			if (param.kind === "toggle") {
				lines.push(`${param.key}: ${rawValue ? "true" : "false"}`);
				continue;
			}

			const value = normalizeLineValue(String(rawValue ?? ""));
			if (!value) {
				if (param.optional) continue;
				new Notice(`${param.label} is required.`);
				return null;
			}

			if (param.kind === "text" && !this.validateTextValue(param, value)) {
				return null;
			}

			lines.push(`${param.key}: ${value}`);
		}

		return lines;
	}

	private buildDateLines(): string[] | null {
		if (this.rangeMode === "none") return [];

		if (this.rangeMode === "last") {
			const last = normalizeLineValue(this.lastDays);
			if (!isPositiveNumber(last)) {
				new Notice("Last days must be a positive number.");
				return null;
			}

			const to = normalizeLineValue(this.toDate);
			if (to && !DATE_OR_DATETIME_INPUT.test(to)) {
				new Notice(`Anchor date must be ${DATE_OR_DATETIME_PLACEHOLDER}.`);
				return null;
			}

			return to ? [`to: ${to}`, `last: ${last}`] : [`last: ${last}`];
		}

		if (this.rangeMode === "single") {
			const day = normalizeLineValue(this.singleDate);
			if (!DATE_INPUT.test(day)) {
				new Notice(`Single day must be ${DATE_PLACEHOLDER}.`);
				return null;
			}
			return [`from: ${day}`, `to: ${day}`];
		}

		const from = normalizeLineValue(this.fromDate);
		const to = normalizeLineValue(this.customToDate);
		if (!from && !to) {
			new Notice("Enter at least a from or to value, or choose another range mode.");
			return null;
		}
		if (from && !DATE_OR_DATETIME_INPUT.test(from)) {
			new Notice(`The from value must be ${DATE_OR_DATETIME_PLACEHOLDER}.`);
			return null;
		}
		if (to && !DATE_OR_DATETIME_INPUT.test(to)) {
			new Notice(`The to value must be ${DATE_OR_DATETIME_PLACEHOLDER}.`);
			return null;
		}

		const lines: string[] = [];
		if (from) lines.push(`from: ${from}`);
		if (to) lines.push(`to: ${to}`);
		return lines;
	}

	private buildSizeLines(): string[] | null {
		const lines: string[] = [];
		const height = normalizeLineValue(this.height);
		const width = normalizeLineValue(this.width);

		if (height) {
			if (!isPositiveNumber(height)) {
				new Notice("Height must be a positive number.");
				return null;
			}
			lines.push(`height: ${height}`);
		}

		if (width) {
			if (!isPositiveNumber(width)) {
				new Notice("Width must be a positive number.");
				return null;
			}
			lines.push(`width: ${width}`);
		}

		return lines;
	}

	private validateTextValue(param: TextParamDefinition, value: string): boolean {
		if (!param.validation) return true;

		if (param.validation === "positive-number") {
			if (isPositiveNumber(value)) return true;
			new Notice(`${param.label} must be a positive number.`);
			return false;
		}

		if (param.validation === "positive-integer") {
			if (isInteger(value) && Number(value) > 0) return true;
			new Notice(`${param.label} must be a positive whole number.`);
			return false;
		}

		if (param.validation === "non-negative-integer") {
			if (isInteger(value)) return true;
			new Notice(`${param.label} must be 0 or a positive whole number.`);
			return false;
		}

		if (param.validation === "date") {
			if (DATE_INPUT.test(value)) return true;
			new Notice(`${param.label} must be YYYY-MM-DD.`);
			return false;
		}

		if (param.validation === "time") {
			if (TIME_INPUT.test(value)) return true;
			new Notice(`${param.label} must be HH:MM.`);
			return false;
		}

		return true;
	}
}
