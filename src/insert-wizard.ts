import { App, Editor, Modal, Notice, Setting, SuggestModal } from "obsidian";
import type { HealthMdSettings } from "./types";

type VisualizationCategoryId =
	| "summary"
	| "activity"
	| "heart"
	| "respiratory"
	| "sleep"
	| "mobility"
	| "workouts";

type CategoryFilterId = VisualizationCategoryId | "all";

type DateRangeMode = "last" | "single" | "custom" | "none";

type TextValidation =
	| "positive-number"
	| "positive-integer"
	| "non-negative-integer"
	| "date"
	| "time";

interface SelectOption {
	value: string;
	label: string;
}

interface BaseParamDefinition {
	key: string;
	label: string;
	desc: string;
	optional?: boolean;
}

interface SelectParamDefinition extends BaseParamDefinition {
	kind: "select";
	options: SelectOption[];
	defaultValue: string;
}

interface TextParamDefinition extends BaseParamDefinition {
	kind: "text";
	placeholder?: string;
	defaultValue?: string;
	validation?: TextValidation;
}

interface ToggleParamDefinition extends BaseParamDefinition {
	kind: "toggle";
	defaultValue: boolean;
}

type ParamDefinition =
	| SelectParamDefinition
	| TextParamDefinition
	| ToggleParamDefinition;

interface VisualizationCategory {
	id: CategoryFilterId;
	label: string;
	description: string;
}

interface VisualizationOption {
	type: string;
	label: string;
	category: VisualizationCategoryId;
	description: string;
	defaultLast: number;
	defaultHeight?: number;
	params: ParamDefinition[];
}

const DATE_OR_DATETIME_INPUT =
	/^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;
const TIME_INPUT = /^\d{1,2}:\d{2}$/;
const DATE_PLACEHOLDER = "YYYY-MM-DD";
const DATE_OR_DATETIME_PLACEHOLDER = "YYYY-MM-DD or YYYY-MM-DDTHH:MM";

const CATEGORIES: VisualizationCategory[] = [
	{
		id: "all",
		label: "All visualizations",
		description: "Browse every Health.md chart and component.",
	},
	{
		id: "summary",
		label: "Summary & cards",
		description: "Dataset overviews, KPI cards, and trend tiles.",
	},
	{
		id: "activity",
		label: "Activity",
		description: "Move rings, bars, heatmaps, spirals, and weekday patterns.",
	},
	{
		id: "heart",
		label: "Heart",
		description: "Heart-rate terrain, daily ranges, and HRV trends.",
	},
	{
		id: "respiratory",
		label: "Respiratory & oxygen",
		description: "Blood oxygen and respiratory-rate charts.",
	},
	{
		id: "sleep",
		label: "Sleep",
		description: "Schedules, sleep stages, quality bars, and polar clocks.",
	},
	{
		id: "mobility",
		label: "Mobility",
		description: "Walking speed and asymmetry.",
	},
	{
		id: "workouts",
		label: "Workouts",
		description: "Workout logs, detailed zones, interval tables, trends, and GPS route maps.",
	},
];

const SUMMARY_METRICS: SelectOption[] = [
	{ value: "heart-rate", label: "Heart rate" },
	{ value: "steps", label: "Steps" },
	{ value: "sleep-duration", label: "Sleep duration" },
	{ value: "active-calories", label: "Active calories" },
	{ value: "hrv", label: "HRV" },
	{ value: "blood-oxygen", label: "Blood oxygen" },
	{ value: "respiratory-rate", label: "Respiratory rate" },
];

const TREND_METRICS: SelectOption[] = [
	{ value: "resting-heart-rate", label: "Resting heart rate" },
	{ value: "hrv", label: "HRV" },
	{ value: "steps", label: "Steps" },
	{ value: "vo2max", label: "VO₂ max" },
	{ value: "walking-speed", label: "Walking speed" },
	{ value: "sleep-duration", label: "Sleep duration" },
	{ value: "active-calories", label: "Active calories" },
];

const BAR_METRICS: SelectOption[] = [
	{ value: "steps", label: "Steps" },
	{ value: "activeCalories", label: "Active calories" },
	{ value: "exerciseMinutes", label: "Exercise minutes" },
	{ value: "distance", label: "Walking/running distance" },
	{ value: "sleepHours", label: "Sleep hours" },
	{ value: "flightsClimbed", label: "Flights climbed" },
];

const ACTIVITY_HEATMAP_METRICS: SelectOption[] = [
	{ value: "steps", label: "Steps" },
	{ value: "calories", label: "Calories" },
	{ value: "distance", label: "Distance" },
];

const WEEKDAY_METRICS: SelectOption[] = [
	{ value: "steps", label: "Steps" },
	{ value: "activeCalories", label: "Active calories" },
	{ value: "exerciseMinutes", label: "Exercise minutes" },
	{ value: "sleepHours", label: "Sleep hours" },
	{ value: "heartRate", label: "Heart rate" },
	{ value: "hrv", label: "HRV" },
];

const HEART_RANGE_METRICS: SelectOption[] = [
	{ value: "heart-rate", label: "Heart min/max/average" },
	{ value: "resting", label: "Resting heart rate" },
	{ value: "walking", label: "Walking heart-rate average" },
];

const OXYGEN_RANGE_METRICS: SelectOption[] = [
	{ value: "blood-oxygen", label: "Blood oxygen" },
	{ value: "respiratory-rate", label: "Respiratory rate" },
];

const WORKOUT_TREND_METRICS: SelectOption[] = [
	{ value: "all", label: "All workout metrics" },
	{ value: "duration", label: "Duration" },
	{ value: "distance", label: "Distance" },
	{ value: "calories", label: "Calories" },
	{ value: "hr_avg", label: "Average heart rate" },
	{ value: "power_avg", label: "Average power" },
];

const VISUALIZATIONS: VisualizationOption[] = [
	{
		type: "intro-stats",
		label: "Intro stats",
		category: "summary",
		description: "Responsive dataset summary with totals, averages, sleep, and vitals.",
		defaultLast: 30,
		params: [],
	},
	{
		type: "summary-card",
		label: "Summary card",
		category: "summary",
		description: "Apple-style KPI card with sparkline and prior-period comparison.",
		defaultLast: 14,
		params: [
			{
				kind: "select",
				key: "metric",
				label: "Metric",
				desc: "Choose the headline KPI.",
				options: SUMMARY_METRICS,
				defaultValue: "heart-rate",
			},
			{
				kind: "select",
				key: "compareWindow",
				label: "Comparison window",
				desc: "How to compare the selected data window.",
				options: [
					{ value: "same-length", label: "Same length" },
					{ value: "week", label: "Week over week" },
					{ value: "month", label: "Month over month" },
				],
				defaultValue: "week",
			},
		],
	},
	{
		type: "trend-tile",
		label: "Trend tile",
		category: "summary",
		description: "Trends-tab style card comparing current and prior windows.",
		defaultLast: 60,
		params: [
			{
				kind: "select",
				key: "metric",
				label: "Metric",
				desc: "Choose the trend metric and preferred direction.",
				options: TREND_METRICS,
				defaultValue: "resting-heart-rate",
			},
			{
				kind: "text",
				key: "currentWindow",
				label: "Current window",
				desc: "Number of most-recent days in the current period.",
				defaultValue: "30",
				validation: "positive-integer",
			},
			{
				kind: "text",
				key: "priorWindow",
				label: "Prior window",
				desc: "Number of days before the current period used for comparison.",
				defaultValue: "30",
				validation: "positive-integer",
			},
		],
	},
	{
		type: "activity-rings",
		label: "Activity rings",
		category: "activity",
		description: "Apple-style Move, Exercise, and Stand rings.",
		defaultLast: 1,
		defaultHeight: 260,
		params: [
			{
				kind: "text",
				key: "moveGoal",
				label: "Move goal",
				desc: "Target active calories for the Move ring.",
				defaultValue: "500",
				validation: "positive-number",
			},
			{
				kind: "text",
				key: "exerciseGoal",
				label: "Exercise goal",
				desc: "Target exercise minutes for the Exercise ring.",
				defaultValue: "30",
				validation: "positive-number",
			},
			{
				kind: "text",
				key: "standGoal",
				label: "Stand goal",
				desc: "Target stand hours for the Stand ring.",
				defaultValue: "12",
				validation: "positive-number",
			},
		],
	},
	{
		type: "vitals-rings",
		label: "Vitals rings",
		category: "activity",
		description: "Radial daily rings for steps, active calories, and heart context.",
		defaultLast: 30,
		defaultHeight: 280,
		params: [],
	},
	{
		type: "bar-chart",
		label: "Bar chart",
		category: "activity",
		description: "Daily bars with optional goal and average lines.",
		defaultLast: 7,
		defaultHeight: 220,
		params: [
			{
				kind: "select",
				key: "metric",
				label: "Metric",
				desc: "Choose which daily value to render.",
				options: BAR_METRICS,
				defaultValue: "steps",
			},
			{
				kind: "text",
				key: "goal",
				label: "Goal line",
				desc: "Optional goal in the selected metric's units.",
				placeholder: "10000",
				optional: true,
				validation: "positive-number",
			},
			{
				kind: "toggle",
				key: "showAverage",
				label: "Show average line",
				desc: "Draw a dashed average line across the bars.",
				defaultValue: true,
			},
		],
	},
	{
		type: "activity-heatmap",
		label: "Activity heatmap",
		category: "activity",
		description: "GitHub-style calendar grid for activity intensity.",
		defaultLast: 90,
		defaultHeight: 180,
		params: [
			{
				kind: "select",
				key: "metric",
				label: "Metric",
				desc: "Choose what each day should shade by.",
				options: ACTIVITY_HEATMAP_METRICS,
				defaultValue: "steps",
			},
		],
	},
	{
		type: "step-spiral",
		label: "Step spiral",
		category: "activity",
		description: "Radial step-count history, older days inside and newer days outside.",
		defaultLast: 30,
		defaultHeight: 300,
		params: [],
	},
	{
		type: "weekday-average",
		label: "Weekday average",
		category: "activity",
		description: "Average a metric by day of week.",
		defaultLast: 56,
		defaultHeight: 240,
		params: [
			{
				kind: "select",
				key: "metric",
				label: "Metric",
				desc: "Choose the value to bucket by weekday.",
				options: WEEKDAY_METRICS,
				defaultValue: "steps",
			},
			{
				kind: "select",
				key: "weekStart",
				label: "Week starts on",
				desc: "Controls bar order and x-axis labels.",
				options: [
					{ value: "monday", label: "Monday" },
					{ value: "sunday", label: "Sunday" },
				],
				defaultValue: "monday",
			},
		],
	},
	{
		type: "heart-terrain",
		label: "Heart terrain",
		category: "heart",
		description: "Ridgeline heatmap for heart-rate samples or daily aggregates.",
		defaultLast: 7,
		defaultHeight: 220,
		params: [],
	},
	{
		type: "heart-range",
		label: "Heart range",
		category: "heart",
		description: "Daily min/max/average heart-rate capsules.",
		defaultLast: 14,
		defaultHeight: 220,
		params: [
			{
				kind: "select",
				key: "metric",
				label: "Metric",
				desc: "Choose the heart metric for the capsules.",
				options: HEART_RANGE_METRICS,
				defaultValue: "heart-rate",
			},
		],
	},
	{
		type: "hrv-trend",
		label: "HRV trend",
		category: "heart",
		description: "Line chart of heart-rate variability.",
		defaultLast: 30,
		defaultHeight: 180,
		params: [],
	},
	{
		type: "oxygen-river",
		label: "Oxygen river",
		category: "respiratory",
		description: "Flowing band of blood oxygen samples across the selected window.",
		defaultLast: 1,
		defaultHeight: 120,
		params: [],
	},
	{
		type: "oxygen-range",
		label: "Oxygen range",
		category: "respiratory",
		description: "Daily blood oxygen or respiratory-rate min/max range.",
		defaultLast: 14,
		defaultHeight: 220,
		params: [
			{
				kind: "select",
				key: "metric",
				label: "Metric",
				desc: "Choose oxygen percentage or respiratory-rate data.",
				options: OXYGEN_RANGE_METRICS,
				defaultValue: "blood-oxygen",
			},
		],
	},
	{
		type: "breathing-wave",
		label: "Breathing wave",
		category: "respiratory",
		description: "Respiratory-rate wave for overnight or recovery windows.",
		defaultLast: 1,
		defaultHeight: 120,
		params: [],
	},
	{
		type: "sleep-schedule",
		label: "Sleep schedule",
		category: "sleep",
		description: "Bedtime-to-wake bars against a sunset/night/sunrise backdrop.",
		defaultLast: 14,
		defaultHeight: 360,
		params: [
			{
				kind: "text",
				key: "sleepGoal",
				label: "Sleep goal",
				desc: "Target sleep duration in hours.",
				defaultValue: "8",
				validation: "positive-number",
			},
			{
				kind: "text",
				key: "windowStart",
				label: "Window start",
				desc: "Start of the x-axis window on each night's date.",
				defaultValue: "18:00",
				validation: "time",
			},
			{
				kind: "text",
				key: "windowEnd",
				label: "Window end",
				desc: "End of the x-axis window on the next day.",
				defaultValue: "10:00",
				validation: "time",
			},
		],
	},
	{
		type: "sleep-quality-bars",
		label: "Sleep quality bars",
		category: "sleep",
		description: "Stacked nightly bars for deep, core, REM, and awake time.",
		defaultLast: 30,
		defaultHeight: 240,
		params: [],
	},
	{
		type: "sleep-architecture",
		label: "Sleep architecture",
		category: "sleep",
		description: "Linear sleep-stage timeline with one row per night.",
		defaultLast: 7,
		defaultHeight: 160,
		params: [],
	},
	{
		type: "sleep-polar",
		label: "Sleep polar",
		category: "sleep",
		description: "Clock-face sleep stages for bedtime and wake consistency.",
		defaultLast: 14,
		defaultHeight: 280,
		params: [],
	},
	{
		type: "walking-symmetry",
		label: "Walking symmetry",
		category: "mobility",
		description: "Walking speed and asymmetry in one trend view.",
		defaultLast: 30,
		defaultHeight: 180,
		params: [],
	},
	{
		type: "workout-log",
		label: "Workout log",
		category: "workouts",
		description: "Timeline of workouts in the filtered window.",
		defaultLast: 30,
		defaultHeight: 240,
		params: [],
	},
	{
		type: "workout-heart-rate",
		label: "Workout heart rate",
		category: "workouts",
		description: "Heart-rate time series or summary for one selected workout.",
		defaultLast: 30,
		defaultHeight: 260,
		params: [
			{
				kind: "text",
				key: "date",
				label: "Workout date",
				desc: "Optional workout day to select, in YYYY-MM-DD format.",
				placeholder: "2026-05-16",
				optional: true,
				validation: "date",
			},
			{
				kind: "text",
				key: "workout",
				label: "Workout index",
				desc: "Zero-based workout number on that day. 0 means first workout.",
				defaultValue: "0",
				validation: "non-negative-integer",
			},
			{
				kind: "text",
				key: "maxHeartRate",
				label: "Max heart rate",
				desc: "Optional BPM used to draw heart-rate zone bands.",
				placeholder: "190",
				optional: true,
				validation: "positive-number",
			},
		],
	},
	{
		type: "workout-zones",
		label: "Workout zones",
		category: "workouts",
		description: "Stacked heart-rate zone time from detailed workout notes.",
		defaultLast: 30,
		defaultHeight: 180,
		params: [
			{
				kind: "text",
				key: "date",
				label: "Workout date",
				desc: "Optional workout day to select, in YYYY-MM-DD format.",
				placeholder: "2026-03-27",
				optional: true,
				validation: "date",
			},
			{
				kind: "text",
				key: "workout",
				label: "Workout index",
				desc: "Zero-based workout number on that day. 0 means first workout.",
				defaultValue: "0",
				validation: "non-negative-integer",
			},
			{
				kind: "text",
				key: "maxHeartRate",
				label: "Max heart rate",
				desc: "Optional BPM used to derive zones from samples when frontmatter zones are absent.",
				placeholder: "190",
				optional: true,
				validation: "positive-number",
			},
		],
	},
	{
		type: "workout-trends",
		label: "Workout trends",
		category: "workouts",
		description: "Trends for duration, distance, calories, average HR, and power.",
		defaultLast: 90,
		defaultHeight: 420,
		params: [
			{
				kind: "select",
				key: "metric",
				label: "Metric",
				desc: "Choose all workout trend panels or focus one metric.",
				options: WORKOUT_TREND_METRICS,
				defaultValue: "all",
			},
		],
	},
	{
		type: "workout-intervals",
		label: "Workout intervals",
		category: "workouts",
		description: "HTML table for detailed workout laps and splits.",
		defaultLast: 30,
		params: [
			{
				kind: "text",
				key: "date",
				label: "Workout date",
				desc: "Optional workout day to select, in YYYY-MM-DD format.",
				placeholder: "2026-03-27",
				optional: true,
				validation: "date",
			},
			{
				kind: "text",
				key: "workout",
				label: "Workout index",
				desc: "Zero-based workout number on that day. 0 means first workout.",
				defaultValue: "0",
				validation: "non-negative-integer",
			},
			{
				kind: "select",
				key: "kind",
				label: "Interval kind",
				desc: "Show laps, splits, or whichever detailed tables are available.",
				options: [
					{ value: "auto", label: "Auto" },
					{ value: "laps", label: "Laps" },
					{ value: "splits", label: "Splits" },
				],
				defaultValue: "auto",
			},
		],
	},
	{
		type: "workout-map",
		label: "Workout map",
		category: "workouts",
		description: "GPS route map for one selected outdoor workout.",
		defaultLast: 30,
		defaultHeight: 360,
		params: [
			{
				kind: "text",
				key: "date",
				label: "Workout date",
				desc: "Optional workout day to select, in YYYY-MM-DD format.",
				placeholder: "2026-05-16",
				optional: true,
				validation: "date",
			},
			{
				kind: "text",
				key: "workout",
				label: "Workout index",
				desc: "Zero-based workout number on that day. 0 means first workout.",
				defaultValue: "0",
				validation: "non-negative-integer",
			},
			{
				kind: "select",
				key: "colorBy",
				label: "Route color",
				desc: "Color route segments by speed or nearest heart-rate sample.",
				options: [
					{ value: "speed", label: "Speed" },
					{ value: "hr", label: "Heart rate" },
				],
				defaultValue: "speed",
			},
		],
	},
];

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
	return CATEGORIES.find((category) => category.id === categoryId)?.label ?? categoryId;
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
		if (!q) return CATEGORIES;
		return CATEGORIES.filter((category) =>
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
		const category = CATEGORIES.find((item) => item.id === categoryId);
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
			? VISUALIZATIONS
			: VISUALIZATIONS.filter((item) => item.category === this.categoryId);
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
