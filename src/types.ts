export interface TimeSeriesSample {
	timestamp: string;
	value: number;
}

export interface WorkoutLap {
	index: number;
	duration: number;
	distance?: number;
	paceFormatted?: string;
}

export interface WorkoutSplit {
	index: number;
	duration: number;
	distance: number;
	paceFormatted?: string;
	avgHeartRate?: number;
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
	duration: number;
	durationFormatted?: string;
	calories?: number;
	distance?: number;
	distanceFormatted?: string;
	startTime?: string;
	avgPaceFormatted?: string;
	avgSpeedFormatted?: string;
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
	laps?: WorkoutLap[];
	splits?: WorkoutSplit[];
	route?: RoutePoint[];
	timeSeries?: WorkoutTimeSeries;
}

export interface HealthDay {
	type: string;
	date: string;
	units?: string;
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
		wakeTime: string;
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
