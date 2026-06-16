import type { HealthMdUnitMap } from "./healthmd-schema";

export interface TimeSeriesSample {
	timestamp: string;
	value: number;
}

export interface WorkoutInterval {
	index: number;
	/** Duration in seconds. */
	duration: number;
	/** Distance in meters when the source unit can be normalized. */
	distance?: number;
	distanceFormatted?: string;
	paceFormatted?: string;
	speedFormatted?: string;
	avgHeartRate?: number;
	maxHeartRate?: number;
	avgPower?: number;
	avgCadence?: number;
	cadenceUnit?: string;
}

export type WorkoutLap = WorkoutInterval;
export type WorkoutSplit = WorkoutInterval;

export interface WorkoutHeartRateZone {
	index: number;
	key?: string;
	label: string;
	range?: string;
	seconds: number;
	durationFormatted?: string;
}

export interface RoutePoint {
	timestamp: string;
	latitude: number;
	longitude: number;
	altitude?: number;
	speedMps?: number;
	courseDegrees?: number;
	horizontalAccuracyMeters?: number;
}

export interface WorkoutTimeSeries {
	heartRate?: TimeSeriesSample[];
	speed?: TimeSeriesSample[];
	power?: TimeSeriesSample[];
	cadence?: TimeSeriesSample[];
	strideLength?: TimeSeriesSample[];
	groundContactTime?: TimeSeriesSample[];
	verticalOscillation?: TimeSeriesSample[];
	altitude?: TimeSeriesSample[];
}

export interface WorkoutEntry {
	type: string;
	activityType?: string;
	sport?: string;
	duration: number;
	durationFormatted?: string;
	calories?: number;
	/** Historical JSON exports may store kilometers here; new Markdown exports use meters. Prefer distanceMeters for new code. */
	distance?: number;
	distanceMeters?: number;
	distanceKm?: number;
	distanceMi?: number;
	distanceFormatted?: string;
	startTime?: string;
	startTimeISO?: string;
	endTimeISO?: string;
	isIndoor?: boolean;
	locationType?: string;
	avgPaceFormatted?: string;
	avgSpeedFormatted?: string;
	speedKmh?: number;
	speedMph?: number;
	avgHeartRate?: number;
	maxHeartRate?: number;
	minHeartRate?: number;
	avgRunningCadence?: number;
	avgStrideLength?: number;
	avgGroundContactTime?: number;
	avgVerticalOscillation?: number;
	avgCyclingCadence?: number;
	avgPower?: number;
	maxPower?: number;
	elevationGainMeters?: number;
	elevationLossMeters?: number;
	heartRateZones?: WorkoutHeartRateZone[];
	laps?: WorkoutLap[];
	splits?: WorkoutSplit[];
	route?: RoutePoint[];
	timeSeries?: WorkoutTimeSeries;
}

export type HealthRollupPeriod = "weekly" | "monthly" | "yearly";

export interface HealthRollupSummary {
	type: "health_rollup";
	schema: string;
	schemaVersion?: number;
	schema_version?: number;
	rollupPeriod: HealthRollupPeriod;
	rollup_period: HealthRollupPeriod;
	periodId: string;
	period_id: string;
	startDate?: string;
	start_date?: string;
	endDate?: string;
	end_date?: string;
	daysExpected?: number;
	days_expected?: number;
	daysCounted?: number;
	days_counted?: number;
	coveragePercent?: number;
	coverage_percent?: number;
	sourceSchema?: string;
	source_schema?: string;
	sourceSchemaVersion?: number;
	source_schema_version?: number;
	metrics?: Record<string, unknown>;
	sourcePaths?: string[];
}

export interface HealthDay {
	type: string;
	date: string;
	/** Health.md export schema identifier, e.g. healthmd.health_data. */
	schema?: string;
	/** Normalized schema version. Legacy/unversioned files are treated as 0. */
	schemaVersion?: number;
	/** Raw snake_case schema version from JSON/frontmatter when present. */
	schema_version?: number;
	/** Vault-relative paths for files that contributed this day. Added at load time. */
	sourcePaths?: string[];
	/** Legacy files used "metric"/"imperial" here; schema v1 uses a per-field unit map. */
	units?: string | HealthMdUnitMap;
	/** Normalized unit system from versioned exports (`unit_system`) or legacy `units`. */
	unitSystem?: string;
	/** Raw snake_case unit system from JSON/frontmatter when present. */
	unit_system?: string;
	activity?: {
		steps: number;
		walkingRunningDistanceKm: number;
		activeCalories: number;
		exerciseMinutes: number;
		vo2Max?: number;
		basalEnergyBurned?: number;
		standHours?: number;
		flightsClimbed?: number;
		walkingRunningDistance?: number;
	};
	heart?: {
		averageHeartRate: number;
		heartRateMin: number;
		heartRateMax: number;
		heartRateSamples: Array<{ timestamp: string; value: number }>;
		hrvSamples?: Array<{ timestamp: string; value: number }>;
		hrv?: number;
		restingHeartRate?: number;
		walkingHeartRateAverage?: number;
	};
	vitals?: {
		bloodOxygenSamples?: Array<{ timestamp: string; value: number; percent?: number }>;
		respiratoryRateSamples?: Array<{ timestamp: string; value: number }>;
		bloodOxygenPercent?: number;
		respiratoryRate?: number;
		bloodOxygenAvg?: number;
		bloodOxygenMin?: number;
		bloodOxygenMax?: number;
		respiratoryRateAvg?: number;
		respiratoryRateMin?: number;
		respiratoryRateMax?: number;
	};
	sleep?: {
		sleepStages: Array<{
			stage: string;
			startDate: string;
			endDate: string;
			durationSeconds: number;
		}>;
		totalDuration: number;
		totalDurationFormatted?: string;
		deepSleep: number;
		deepSleepFormatted?: string;
		remSleep: number;
		remSleepFormatted?: string;
		coreSleep: number;
		coreSleepFormatted?: string;
		awakeTime?: number;
		awakeTimeFormatted?: string;
		bedtime: string;
		bedtimeISO?: string;
		wakeTime: string;
		wakeTimeISO?: string;
	};
	mobility?: {
		walkingSpeed: number;
		walkingAsymmetryPercentage: number;
		walkingStepLength?: number;
		walkingDoubleSupportPercentage?: number;
		stairAscentSpeed?: number;
		stairDescentSpeed?: number;
	};
	workouts?: WorkoutEntry[];
	hearing?: {
		headphoneAudioLevel?: number;
	};
}

export interface VizConfig {
	type: string;
	width?: number;
	height?: number;
	[key: string]: string | number | undefined;
}

export type DataFormat = "auto" | "json" | "csv" | "markdown" | "bases";
export type DataFolderGranularity = "flat" | "year" | "month" | "week" | "day" | "custom";
export type DataPointClickAction = "pin" | "source" | "daily";

export interface ColorPalette {
	accent: string;
	secondary: string;
	heart: string;
	sleep: {
		deep: string;
		rem: string;
		core: string;
		awake: string;
	};
}

export type ColorSchemeId = "default" | "ocean" | "forest" | "sunset" | "aurora" | "monochrome" | "custom";

export interface HealthMdSettings {
	dataFolder: string;
	filePattern: string;
	dataFormat: DataFormat;
	dataFolderGranularity: DataFolderGranularity;
	dataFolderCustomPathTemplate: string;
	theme: "dark" | "light" | "auto";
	defaultWidth: number;
	defaultHeight: number;
	colorScheme: ColorSchemeId;
	colorAccent: string;
	colorSecondary: string;
	colorHeart: string;
	colorSleepDeep: string;
	colorSleepRem: string;
	colorSleepCore: string;
	colorSleepAwake: string;
	maxHeartRate?: number;
	dataPointClickAction: DataPointClickAction;
	mapTilesEnabled: boolean;
	mapTileUrl: string;
	mapTileAttribution: string;
}

export interface ResolvedTheme {
	bg: string;
	fg: string;
	muted: string;
	isDark: boolean;
	colors: ColorPalette;
	maxHeartRate?: number;
	mapTilesEnabled: boolean;
	mapTileUrl: string;
	mapTileAttribution: string;
}

export interface HitRegionDetail {
	label: string;
	value: string;
}

interface HitRegionBase {
	title: string;
	details: HitRegionDetail[];
	payload?: unknown;
}

export type HitRegion =
	| (HitRegionBase & {
			shape: "rect";
			x: number;
			y: number;
			w: number;
			h: number;
	  })
	| (HitRegionBase & {
			shape: "circle";
			cx: number;
			cy: number;
			r: number;
	  })
	| (HitRegionBase & {
			shape: "sector";
			cx: number;
			cy: number;
			r0: number;
			r1: number;
			a0: number;
			a1: number;
	  });

export interface HitRegistry {
	add(region: HitRegion): void;
}

export type RenderFn = (
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	w: number,
	h: number,
	config: VizConfig,
	theme: ResolvedTheme,
	statsEl: HTMLElement,
	hits: HitRegistry
) => void;

// Special render fn for intro-stats (no canvas)
export type HtmlRenderFn = (
	data: HealthDay[],
	el: HTMLElement,
	config: VizConfig,
	theme: ResolvedTheme
) => void;
