/**
 * Pure metadata catalog for Health.md visualizations: categories, per-type
 * options, parameter definitions, and export-source compatibility notes.
 *
 * Kept free of Obsidian imports so tooling (and node tests) can consume it.
 */

export type VisualizationCategoryId =
	| "summary"
	| "activity"
	| "heart"
	| "respiratory"
	| "vitals"
	| "body"
	| "sleep"
	| "mental"
	| "medications"
	| "mobility"
	| "workouts"
	| "nutrition"
	| "symptoms"
	| "reproductive"
	| "hearing"
	| "data-quality";

export type CategoryFilterId = VisualizationCategoryId | "all";

export type DateRangeMode = "last" | "single" | "custom" | "none";

type TextValidation =
	| "positive-number"
	| "positive-integer"
	| "non-negative-integer"
	| "date"
	| "time";

export interface SelectOption {
	value: string;
	label: string;
}

export interface BaseParamDefinition {
	key: string;
	label: string;
	desc: string;
	optional?: boolean;
}

export interface SelectParamDefinition extends BaseParamDefinition {
	kind: "select";
	options: SelectOption[];
	defaultValue: string;
}

export interface TextParamDefinition extends BaseParamDefinition {
	kind: "text";
	placeholder?: string;
	defaultValue?: string;
	validation?: TextValidation;
}

export interface ToggleParamDefinition extends BaseParamDefinition {
	kind: "toggle";
	defaultValue: boolean;
}

export type ParamDefinition =
	| SelectParamDefinition
	| TextParamDefinition
	| ToggleParamDefinition;

export interface VisualizationCategory {
	id: CategoryFilterId;
	label: string;
	description: string;
}

/** Health.md app file exports a visualization can render from. */
export type ExportSourceId =
	| "daily-json"
	| "daily-csv"
	| "daily-markdown"
	| "rollups"
	| "workout-notes";

export interface ExportSourceDescriptor {
	id: ExportSourceId;
	label: string;
	hint: string;
}

export const EXPORT_SOURCE_DESCRIPTORS: ExportSourceDescriptor[] = [
	{
		id: "daily-json",
		label: "Daily JSON",
		hint: "Granular daily export — summary fields, samples, sleep stages, GPS routes, dose events, and mood entries.",
	},
	{
		id: "daily-csv",
		label: "Daily CSV",
		hint: "Daily export rows — summary fields plus sample, sleep-stage, workout, mood, and medication rows when included.",
	},
	{
		id: "daily-markdown",
		label: "Markdown & Bases",
		hint: "Daily note frontmatter / Obsidian Bases summary keys only — no sample arrays or routes.",
	},
	{
		id: "rollups",
		label: "Roll-ups",
		hint: "Health/Rollups/ weekly, monthly, yearly, and v9 range summaries in JSON, Markdown, Bases, or CSV.",
	},
	{
		id: "workout-notes",
		label: "Workout notes",
		hint: "Individual detailed workout notes with laps, splits, and heart-rate zones.",
	},
];

/** Every visualization works with daily JSON unless noted below. */
const ALL_DAILY_EXPORT_SOURCES: ExportSourceId[] = [
	"daily-json",
	"daily-csv",
	"daily-markdown",
];

const SAMPLE_NOTE =
	"Needs granular sample rows — daily JSON and CSV exports include them; Markdown/Bases frontmatter does not.";

/**
 * Export files each visualization renders from, derived from the parsers in
 * src/parsers/ and the iOS export contract (§4 compatibility-critical fields).
 * Anything absent falls back to ALL_DAILY_EXPORT_SOURCES.
 */
const EXPORT_SOURCES_BY_TYPE: Record<string, ExportSourceId[]> = {
	// Sample-level charts: JSON always, CSV with sample rows, no Markdown.
	"heart-terrain": ["daily-json", "daily-csv"],
	"oxygen-river": ["daily-json", "daily-csv"],
	"breathing-wave": ["daily-json", "daily-csv"],
	"sleep-architecture": ["daily-json", "daily-csv"],
	"sleep-polar": ["daily-json", "daily-csv"],
	"workout-zones": ["daily-json", "daily-csv", "workout-notes"],
	"workout-intervals": ["daily-json", "daily-csv", "workout-notes"],
	// Route coordinates are only included in JSON exports.
	"workout-map": ["daily-json"],
	// Individual workout notes enrich these charts.
	"workout-log": [...ALL_DAILY_EXPORT_SOURCES, "workout-notes"],
	"workout-trends": [...ALL_DAILY_EXPORT_SOURCES, "workout-notes"],
	"workout-heart-rate": [...ALL_DAILY_EXPORT_SOURCES, "workout-notes"],
	// Medication dose events/inventory are not parsed from Markdown frontmatter.
	"medication-overview": ["daily-json", "daily-csv"],
	"medication-inventory": ["daily-json", "daily-csv"],
	"medication-adherence-summary": ["daily-json", "daily-csv"],
	"medication-dose-status": ["daily-json", "daily-csv"],
	"medication-adherence-trend": ["daily-json", "daily-csv"],
	"medication-recent-dose-events": ["daily-json", "daily-csv"],
	"medication-schedule-timeline": ["daily-json", "daily-csv"],
	"medication-skip-reasons": ["daily-json", "daily-csv"],
	// The only roll-up-only visualization.
	"rollup-explorer": ["rollups"],
};

const EXPORT_NOTES_BY_TYPE: Record<string, string> = {
	"heart-terrain": SAMPLE_NOTE,
	"oxygen-river": SAMPLE_NOTE,
	"breathing-wave": SAMPLE_NOTE,
	"sleep-architecture": SAMPLE_NOTE,
	"sleep-polar": SAMPLE_NOTE,
	"workout-zones":
		"Needs workout zone exports (JSON) or sample-derived zones (JSON/CSV); Markdown/Bases summaries are not enough.",
	"workout-intervals":
		"Laps/splits come from JSON/CSV workout rows or detailed workout notes.",
	"workout-map": "GPS route coordinates are only included in daily JSON exports.",
	"workout-heart-rate":
		"Prefers workout heart-rate series (JSON), then daily samples in the workout window, then min/avg/max summaries from any daily format.",
	"hrv-trend":
		"HRV samples come from JSON/CSV; Markdown/Bases render the daily HRV summary fallback.",
	"sleep-schedule":
		"Markdown/Bases use bedtime/wake summary keys; JSON/CSV add stage-level timing.",
	"rollup-explorer":
		"Reads Health/Rollups/ historical weekly/monthly/yearly roll-ups and v9 range summaries in every format.",
};

export interface VisualizationOption {
	type: string;
	label: string;
	category: VisualizationCategoryId;
	description: string;
	defaultLast: number;
	defaultHeight?: number;
	params: ParamDefinition[];
	/** Health.md app file exports this visualization renders from. */
	exportSources?: ExportSourceId[];
	/** Caveat about export coverage shown alongside exportSources. */
	exportNote?: string;
}

export const VISUALIZATION_CATEGORIES: VisualizationCategory[] = [
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
		id: "vitals",
		label: "Vitals & metabolism",
		description: "Blood pressure, glucose, and other daily vital summaries.",
	},
	{
		id: "body",
		label: "Body composition",
		description: "Weight, BMI, body fat, lean mass, and waist trends.",
	},
	{
		id: "sleep",
		label: "Sleep",
		description: "Schedules, sleep stages, quality bars, and polar clocks.",
	},
	{
		id: "mental",
		label: "Mood & mind",
		description: "State of Mind mood valence with sleep and workout context.",
	},
	{
		id: "medications",
		label: "Medications",
		description: "Medication inventory, dose events, and adherence trends.",
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
	{
		id: "nutrition",
		label: "Nutrition",
		description: "Macronutrient, vitamin, and mineral summary grids.",
	},
	{
		id: "symptoms",
		label: "Symptoms",
		description: "Recorded symptom-count patterns over time.",
	},
	{
		id: "reproductive",
		label: "Reproductive health",
		description: "Private, opt-in cycle summary timelines.",
	},
	{
		id: "hearing",
		label: "Hearing",
		description: "Headphone and environmental audio-level trends.",
	},
	{
		id: "data-quality",
		label: "Export coverage",
		description: "Lossless capture status and compact export diagnostics.",
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

const BASE_VISUALIZATION_CATALOG: VisualizationOption[] = [
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
		type: "mood-trend",
		label: "Mood trend",
		category: "mental",
		description: "State of Mind mood valence over time with optional sleep and exercise context.",
		defaultLast: 30,
		defaultHeight: 260,
		params: [
			{
				kind: "toggle",
				key: "showContext",
				label: "Show sleep/exercise context",
				desc: "Draw faint sleep duration and exercise/workout bars behind the mood trend.",
				defaultValue: true,
			},
		],
	},
	{
		type: "mood-calendar-heatmap",
		label: "Mood calendar heatmap",
		category: "mental",
		description: "Calendar grid colored by average State of Mind valence.",
		defaultLast: 120,
		defaultHeight: 220,
		params: [],
	},
	{
		type: "mood-sleep-scatter",
		label: "Mood × sleep scatter",
		category: "mental",
		description: "Scatterplot comparing daily mood valence with sleep duration and exercise context.",
		defaultLast: 60,
		defaultHeight: 280,
		params: [],
	},
	{
		type: "mood-day-timeline",
		label: "Mood day timeline",
		category: "mental",
		description: "Time-of-day lanes for mood entries, with sleep spans behind each day.",
		defaultLast: 14,
		defaultHeight: 320,
		params: [
			{
				kind: "text",
				key: "maxDays",
				label: "Max days",
				desc: "Maximum number of recent days to draw as timeline rows.",
				defaultValue: "21",
				validation: "positive-integer",
			},
		],
	},
	{
		type: "mood-association-breakdown",
		label: "Mood association breakdown",
		category: "mental",
		description: "Average mood valence grouped by State of Mind association such as Work, Fitness, or Family.",
		defaultLast: 90,
		defaultHeight: 320,
		params: [
			{
				kind: "text",
				key: "limit",
				label: "Limit",
				desc: "Maximum number of associations to show.",
				defaultValue: "10",
				validation: "positive-integer",
			},
		],
	},
	{
		type: "mood-label-cloud",
		label: "Mood label cloud",
		category: "mental",
		description: "Emotion labels sized by frequency and colored by average valence.",
		defaultLast: 120,
		defaultHeight: 260,
		params: [
			{
				kind: "text",
				key: "limit",
				label: "Limit",
				desc: "Maximum number of labels to include.",
				defaultValue: "28",
				validation: "positive-integer",
			},
		],
	},
	{
		type: "mood-volatility",
		label: "Mood volatility",
		category: "mental",
		description: "Daily mood average with bars showing the spread between lowest and highest entries.",
		defaultLast: 45,
		defaultHeight: 260,
		params: [],
	},
	{
		type: "mood-kind-split",
		label: "Daily vs momentary mood",
		category: "mental",
		description: "Compares Daily Mood entries with Momentary Emotion entries over time.",
		defaultLast: 45,
		defaultHeight: 260,
		params: [],
	},
	{
		type: "mood-circadian-clock",
		label: "Circadian mood clock",
		category: "mental",
		description: "Radial 24-hour clock showing when mood entries happen and how pleasant they are.",
		defaultLast: 90,
		defaultHeight: 320,
		params: [],
	},
	{
		type: "mood-recovery-tile",
		label: "Mood recovery tile",
		category: "mental",
		description: "Recovery and mindset card combining latest mood, sleep, HRV, and exercise context.",
		defaultLast: 30,
		defaultHeight: 280,
		params: [],
	},
	{
		type: "mood-association-matrix",
		label: "Mood association matrix",
		category: "mental",
		description: "Matrix of emotion labels by associations, colored by valence or count.",
		defaultLast: 120,
		defaultHeight: 340,
		params: [
			{
				kind: "select",
				key: "metric",
				label: "Cell metric",
				desc: "Choose whether cells show average valence or entry count.",
				options: [
					{ value: "valence", label: "Average valence" },
					{ value: "count", label: "Count" },
				],
				defaultValue: "valence",
			},
		],
	},
	{
		type: "medication-overview",
		label: "Medication overview",
		category: "medications",
		description: "Medication inventory, taken/skipped dose summary, per-medication breakdown, adherence trend, and recent events.",
		defaultLast: 30,
		params: [
			{
				kind: "select",
				key: "trend",
				label: "Trend grouping",
				desc: "Group adherence trend bars by day, week, month, or choose automatically from the date range.",
				options: [
					{ value: "auto", label: "Auto" },
					{ value: "daily", label: "Daily" },
					{ value: "weekly", label: "Weekly" },
					{ value: "monthly", label: "Monthly" },
				],
				defaultValue: "auto",
			},
			{
				kind: "text",
				key: "limit",
				label: "Recent events",
				desc: "Maximum number of recent medication dose events to list.",
				defaultValue: "12",
				validation: "positive-integer",
			},
		],
	},
	{
		type: "medication-inventory",
		label: "Medication inventory",
		category: "medications",
		description: "Standalone inventory totals with active, archived, scheduled, and unscheduled medication rows.",
		defaultLast: 30,
		params: [],
	},
	{
		type: "medication-adherence-summary",
		label: "Adherence summary",
		category: "medications",
		description: "Standalone taken/skipped/other counts and adherence percentage for the selected range.",
		defaultLast: 30,
		params: [],
	},
	{
		type: "medication-dose-status",
		label: "Per-medication dose status",
		category: "medications",
		description: "Standalone dose-status breakdown and adherence rate for each medication.",
		defaultLast: 30,
		params: [],
	},
	{
		type: "medication-adherence-trend",
		label: "Daily adherence trend",
		category: "medications",
		description: "Standalone adherence trend bars. Defaults to daily grouping; weekly and monthly grouping are available.",
		defaultLast: 30,
		params: [
			{
				kind: "select",
				key: "trend",
				label: "Trend grouping",
				desc: "Group adherence trend bars by day, week, month, or choose automatically from the date range.",
				options: [
					{ value: "daily", label: "Daily" },
					{ value: "weekly", label: "Weekly" },
					{ value: "monthly", label: "Monthly" },
					{ value: "auto", label: "Auto" },
				],
				defaultValue: "daily",
			},
		],
	},
	{
		type: "medication-recent-dose-events",
		label: "Recent dose events",
		category: "medications",
		description: "Standalone table of the most recent medication dose events in the selected range.",
		defaultLast: 30,
		params: [
			{
				kind: "text",
				key: "limit",
				label: "Recent events",
				desc: "Maximum number of recent medication dose events to list.",
				defaultValue: "12",
				validation: "positive-integer",
			},
		],
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
	{
		type: "metric-trend",
		label: "Canonical metric trend",
		category: "summary",
		description: "Trend any numeric Health.md summary using its canonical metric key and exported unit.",
		defaultLast: 90,
		defaultHeight: 260,
		params: [
			{ kind: "text", key: "metric", label: "Canonical metric", desc: "Health.md canonical key, for example weight_kg or blood_glucose_avg.", defaultValue: "steps" },
			{ kind: "text", key: "rollingAverage", label: "Rolling average", desc: "Optional positive number of days for a rolling average.", optional: true, validation: "positive-integer" },
			{ kind: "text", key: "goal", label: "Reference value", desc: "Optional user-provided reference line. No medical threshold is assumed.", optional: true, validation: "positive-number" },
		],
	},
	{
		type: "cardio-fitness-freshness",
		label: "Cardio fitness freshness",
		category: "activity",
		description: "VO₂ Max trend that distinguishes measured and carried-forward values using v7 provenance.",
		defaultLast: 180,
		defaultHeight: 280,
		params: [],
	},
	{
		type: "rollup-explorer",
		label: "Roll-up explorer",
		category: "summary",
		description: "Inspect exported range and historical calendar primary values, rules, coverage, and statistics.",
		defaultLast: 365,
		params: [
			{ kind: "select", key: "period", label: "Period", desc: "Choose which exported roll-up periods to show.", options: [{ value: "all", label: "All" }, { value: "range", label: "Range" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }], defaultValue: "all" },
			{ kind: "text", key: "metric", label: "Canonical metric", desc: "Optional canonical key to filter, such as vo2_max.", optional: true },
			{ kind: "text", key: "statistic", label: "Highlight statistic", desc: "Optional exported statistic name, such as latest or daily_average.", optional: true },
			{ kind: "text", key: "limit", label: "Maximum periods", desc: "Maximum number of period cards.", defaultValue: "12", validation: "positive-integer" },
		],
	},
	{
		type: "capture-coverage-calendar",
		label: "Export coverage calendar",
		category: "data-quality",
		description: "Compact complete, partial, disabled, and legacy capture status without loading source records.",
		defaultLast: 180,
		defaultHeight: 220,
		params: [],
	},
	{
		type: "blood-pressure-bands",
		label: "Blood pressure bands",
		category: "vitals",
		description: "Daily systolic and diastolic min, average, and max summaries with no diagnostic thresholds.",
		defaultLast: 90,
		defaultHeight: 300,
		params: [],
	},
	{
		type: "glucose-range",
		label: "Blood glucose range",
		category: "vitals",
		description: "Daily blood glucose minimum, average, and maximum summaries.",
		defaultLast: 90,
		defaultHeight: 260,
		params: [
			{ kind: "text", key: "minReference", label: "Lower reference", desc: "Optional user-provided reference line.", optional: true, validation: "positive-number" },
			{ kind: "text", key: "maxReference", label: "Upper reference", desc: "Optional user-provided reference line.", optional: true, validation: "positive-number" },
		],
	},
	{
		type: "body-composition",
		label: "Body composition",
		category: "body",
		description: "Small-multiple trends for weight, BMI, body fat, lean mass, and waist circumference.",
		defaultLast: 180,
		defaultHeight: 520,
		params: [{ kind: "text", key: "metrics", label: "Metrics", desc: "Optional comma-separated canonical keys.", optional: true }],
	},
	{
		type: "running-form",
		label: "Running form",
		category: "mobility",
		description: "Running speed, power, stride length, ground contact, and vertical oscillation summary trends.",
		defaultLast: 90,
		defaultHeight: 520,
		params: [{ kind: "text", key: "metrics", label: "Metrics", desc: "Optional comma-separated canonical keys.", optional: true }],
	},
	{
		type: "cycling-performance",
		label: "Cycling performance",
		category: "workouts",
		description: "Cycling power, FTP, cadence, speed, and distance summaries without prescribed zones.",
		defaultLast: 90,
		defaultHeight: 520,
		params: [{ kind: "text", key: "metrics", label: "Metrics", desc: "Optional comma-separated canonical keys.", optional: true }],
	},
	{
		type: "hearing-exposure",
		label: "Hearing exposure",
		category: "hearing",
		description: "Headphone and environmental sound-level trends with an optional user reference.",
		defaultLast: 90,
		defaultHeight: 300,
		params: [{ kind: "text", key: "reference", label: "Reference level", desc: "Optional user-provided dB line; no safety threshold is assumed.", optional: true, validation: "positive-number" }],
	},
	{
		type: "nutrition-grid",
		label: "Nutrition grid",
		category: "nutrition",
		description: "Per-metric daily grid for macros, vitamins, or minerals using exported units.",
		defaultLast: 30,
		defaultHeight: 460,
		params: [
			{ kind: "select", key: "preset", label: "Preset", desc: "Choose the summary metrics to include.", options: [{ value: "macros", label: "Macronutrients" }, { value: "vitamins", label: "Vitamins" }, { value: "minerals", label: "Minerals" }, { value: "all", label: "All nutrition" }], defaultValue: "macros" },
			{ kind: "text", key: "maxRows", label: "Maximum rows", desc: "Bound the number of metric rows shown.", defaultValue: "15", validation: "positive-integer" },
		],
	},
	{
		type: "symptom-heatmap",
		label: "Symptom count heatmap",
		category: "symptoms",
		description: "Recorded symptom counts by day. Values are counts, not severity scores.",
		defaultLast: 60,
		defaultHeight: 480,
		params: [
			{ kind: "select", key: "sort", label: "Sort", desc: "Order symptom rows by total count or name.", options: [{ value: "total", label: "Total count" }, { value: "alphabetical", label: "Alphabetical" }], defaultValue: "total" },
			{ kind: "text", key: "maxRows", label: "Maximum rows", desc: "Bound the number of symptom rows shown.", defaultValue: "15", validation: "positive-integer" },
		],
	},
	{
		type: "cycle-timeline",
		label: "Cycle timeline (private)",
		category: "reproductive",
		description: "Opt-in menstrual flow, cervical mucus, ovulation test, and spotting summary lanes. Sexual activity is excluded.",
		defaultLast: 90,
		defaultHeight: 300,
		params: [
			{ kind: "toggle", key: "showSymptoms", label: "Show symptom overlay", desc: "Include a compact recorded-symptom overlay.", defaultValue: false },
			{ kind: "toggle", key: "showMood", label: "Show mood overlay", desc: "Include daily mood context when available.", defaultValue: false },
		],
	},
	{
		type: "medication-schedule-timeline",
		label: "Medication schedule timeline",
		category: "medications",
		description: "Scheduled versus logged dose timing grouped by scheduled and as-needed events.",
		defaultLast: 30,
		params: [{ kind: "text", key: "limit", label: "Maximum events", desc: "Maximum number of dose events to show.", defaultValue: "30", validation: "positive-integer" }],
	},
	{
		type: "medication-skip-reasons",
		label: "Medication skip reasons",
		category: "medications",
		description: "Counts plain-text reasons attached to skipped top-level dose events.",
		defaultLast: 90,
		params: [{ kind: "text", key: "limit", label: "Maximum reasons", desc: "Maximum number of reason labels to show.", defaultValue: "20", validation: "positive-integer" }],
	},
];

export const VISUALIZATION_CATALOG: VisualizationOption[] = BASE_VISUALIZATION_CATALOG.map((item) => ({
	...item,
	exportSources: EXPORT_SOURCES_BY_TYPE[item.type] ?? ALL_DAILY_EXPORT_SOURCES,
	exportNote: EXPORT_NOTES_BY_TYPE[item.type],
}));
