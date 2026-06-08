import { HealthDay, TimeSeriesSample } from "../types";

interface CsvRow {
	date: string;
	category: string;
	metric: string;
	value: string;
	unit: string;
	timestamp?: string;
}

function parseRows(content: string): CsvRow[] {
	const lines = content.split("\n").filter((l) => l.trim());
	if (lines.length < 2) return [];

	// Skip header row. Health.md CSV exports are intentionally simple and do not
	// quote commas in current metric labels/values; keep this parser lightweight.
	const rows: CsvRow[] = [];
	for (let i = 1; i < lines.length; i++) {
		const parts = lines[i].split(",");
		if (parts.length >= 5) {
			rows.push({
				date: parts[0].trim(),
				category: parts[1].trim(),
				metric: parts[2].trim(),
				value: parts[3].trim(),
				unit: parts[4].trim(),
				timestamp: parts[5]?.trim() || undefined,
			});
		}
	}
	return rows;
}

function list(value: string | string[]): string[] {
	return Array.isArray(value) ? value : [value];
}

function normalizeLabel(value: string): string {
	return value.trim().toLowerCase();
}

function findRow(
	rows: CsvRow[],
	category: string | string[],
	metric: string | string[]
): CsvRow | undefined {
	const categories = list(category).map(normalizeLabel);
	const metrics = list(metric).map(normalizeLabel);
	return rows.find(
		(row) =>
			categories.includes(normalizeLabel(row.category)) &&
			metrics.includes(normalizeLabel(row.metric))
	);
}

function matchingRows(
	rows: CsvRow[],
	category: string | string[],
	metric: string | string[]
): CsvRow[] {
	const categories = list(category).map(normalizeLabel);
	const metrics = list(metric).map(normalizeLabel);
	return rows.filter(
		(row) =>
			categories.includes(normalizeLabel(row.category)) &&
			metrics.includes(normalizeLabel(row.metric))
	);
}

function getNum(
	rows: CsvRow[],
	category: string | string[],
	metric: string | string[]
): number | undefined {
	const row = findRow(rows, category, metric);
	if (!row) return undefined;
	const num = parseFloat(row.value);
	return isNaN(num) ? undefined : num;
}

function getString(
	rows: CsvRow[],
	category: string | string[],
	metric: string | string[]
): string | undefined {
	return findRow(rows, category, metric)?.value;
}

function toPercentScale(value: number): number {
	return value > 0 && value <= 1 ? value * 100 : value;
}

function maybePercentScale(value: number | undefined): number | undefined {
	return value === undefined ? undefined : toPercentScale(value);
}

function normalizeTimestamp(raw: string | undefined, fallbackDate: string): string | undefined {
	if (!raw) return undefined;
	const value = raw.trim();
	if (!value) return undefined;
	const timeOnly = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
	if (timeOnly) {
		return `${fallbackDate}T${timeOnly[1].padStart(2, "0")}:${timeOnly[2]}:${timeOnly[3] ?? "00"}`;
	}
	return value;
}

function getSamples(
	rows: CsvRow[],
	category: string | string[],
	metric: string | string[],
	valueNormalizer: (value: number) => number = (value) => value
): TimeSeriesSample[] {
	return matchingRows(rows, category, metric)
		.map((row) => {
			const value = parseFloat(row.value);
			const timestamp = normalizeTimestamp(row.timestamp, row.date);
			if (isNaN(value) || !timestamp) return null;
			return { timestamp, value: valueNormalizer(value) };
		})
		.filter((sample): sample is TimeSeriesSample => sample !== null);
}

function parseSleepStageRows(rows: CsvRow[]): NonNullable<HealthDay["sleep"]>["sleepStages"] {
	return matchingRows(rows, "Sleep", "Sleep Stage")
		.map((row) => {
			const match = /^(.+?)\s*\((\d+(?:\.\d+)?)s\)$/i.exec(row.value.trim());
			if (!match) return null;
			const startDate = normalizeTimestamp(row.timestamp, row.date);
			if (!startDate) return null;
			const durationSeconds = Number(match[2]);
			if (!Number.isFinite(durationSeconds)) return null;
			const startMs = Date.parse(startDate);
			const endDate = Number.isFinite(startMs)
				? new Date(startMs + durationSeconds * 1000).toISOString()
				: startDate;
			const rawStage = match[1].trim().toLowerCase();
			const stage = rawStage === "light" ? "core" : rawStage;
			return { stage, startDate, endDate, durationSeconds };
		})
		.filter((stage): stage is NonNullable<HealthDay["sleep"]>["sleepStages"][number] => stage !== null);
}

function buildDayFromRows(date: string, rows: CsvRow[]): HealthDay {
	const day: HealthDay = {
		type: "health-data",
		date,
	};

	// Activity
	const steps = getNum(rows, "Activity", "Steps");
	if (steps !== undefined) {
		const distance = getNum(rows, "Activity", [
			"Walking Running Distance",
			"Walking + Running Distance",
		]);
		day.activity = {
			steps,
			walkingRunningDistanceKm: distance ?? 0,
			activeCalories: getNum(rows, "Activity", ["Active Calories", "Active Energy"]) ?? 0,
			exerciseMinutes: getNum(rows, "Activity", ["Exercise Minutes", "Exercise Time"]) ?? 0,
			vo2Max:
				getNum(rows, "Activity", ["VO2 Max", "Cardio Fitness (VO2 Max)"]) ??
				getNum(rows, "Mobility", "VO2 Max"),
			basalEnergyBurned: getNum(rows, "Activity", [
				"Basal Energy Burned",
				"Basal Energy",
				"Basal Calories",
			]),
			standHours: getNum(rows, "Activity", "Stand Hours"),
			flightsClimbed: getNum(rows, "Activity", ["Flights Climbed", "Floors Climbed"]),
		};
		// Handle distance in meters - convert to km
		if (distance !== undefined && distance > 100) {
			day.activity.walkingRunningDistanceKm = distance / 1000;
		}
	}

	// Heart
	const restingHR = getNum(rows, "Heart", "Resting Heart Rate");
	const avgHR = getNum(rows, "Heart", "Average Heart Rate");
	const heartRateMin = getNum(rows, "Heart", ["Heart Rate Min", "Min Heart Rate"]);
	const heartRateMax = getNum(rows, "Heart", ["Heart Rate Max", "Max Heart Rate"]);
	const heartRateSamples = getSamples(rows, "Heart", "Heart Rate Sample");
	const hrvSamples = getSamples(rows, "Heart", "HRV Sample");
	if (
		restingHR !== undefined ||
		avgHR !== undefined ||
		heartRateMin !== undefined ||
		heartRateMax !== undefined ||
		heartRateSamples.length > 0 ||
		hrvSamples.length > 0
	) {
		day.heart = {
			averageHeartRate: avgHR ?? restingHR ?? 0,
			heartRateMin: heartRateMin ?? 0,
			heartRateMax: heartRateMax ?? 0,
			heartRateSamples,
			restingHeartRate: restingHR,
			walkingHeartRateAverage: getNum(rows, "Heart", "Walking Heart Rate Average"),
			hrv: getNum(rows, "Heart", ["HRV", "HRV (RMSSD)"]),
			hrvSamples: hrvSamples.length > 0 ? hrvSamples : undefined,
		};
	}

	// Sleep
	const sleepTotal = getNum(rows, "Sleep", "Total Duration");
	if (sleepTotal !== undefined) {
		day.sleep = {
			sleepStages: parseSleepStageRows(rows),
			totalDuration: sleepTotal,
			deepSleep: getNum(rows, "Sleep", "Deep Sleep") ?? 0,
			remSleep: getNum(rows, "Sleep", "REM Sleep") ?? 0,
			coreSleep: getNum(rows, "Sleep", ["Core Sleep", "Light Sleep"]) ?? 0,
			awakeTime: getNum(rows, "Sleep", "Awake Time"),
			bedtime: getString(rows, "Sleep", "Bedtime") ?? "",
			wakeTime: getString(rows, "Sleep", "Wake Time") ?? "",
		};
	}

	// Vitals
	const respRate = getNum(rows, "Vitals", ["Respiratory Rate", "Respiratory Rate Avg"]);
	const respMin = getNum(rows, "Vitals", "Respiratory Rate Min");
	const respMax = getNum(rows, "Vitals", "Respiratory Rate Max");
	const bloodOx = maybePercentScale(getNum(rows, "Vitals", ["Blood Oxygen", "Blood Oxygen Avg"]));
	const bloodOxMin = maybePercentScale(getNum(rows, "Vitals", "Blood Oxygen Min"));
	const bloodOxMax = maybePercentScale(getNum(rows, "Vitals", "Blood Oxygen Max"));
	const bloodOxygenSamples = getSamples(
		rows,
		"Vitals",
		["Blood Oxygen Sample", "SpO2 Sample"],
		toPercentScale
	);
	const respiratoryRateSamples = getSamples(rows, "Vitals", "Respiratory Rate Sample");
	if (
		respRate !== undefined ||
		respMin !== undefined ||
		respMax !== undefined ||
		bloodOx !== undefined ||
		bloodOxMin !== undefined ||
		bloodOxMax !== undefined ||
		bloodOxygenSamples.length > 0 ||
		respiratoryRateSamples.length > 0
	) {
		day.vitals = {
			respiratoryRate: respRate,
			respiratoryRateAvg: respRate,
			respiratoryRateMin: respMin,
			respiratoryRateMax: respMax,
			bloodOxygenPercent: bloodOx,
			bloodOxygenAvg: bloodOx,
			bloodOxygenMin: bloodOxMin,
			bloodOxygenMax: bloodOxMax,
			bloodOxygenSamples: bloodOxygenSamples.length > 0 ? bloodOxygenSamples : undefined,
			respiratoryRateSamples: respiratoryRateSamples.length > 0 ? respiratoryRateSamples : undefined,
		};
	}

	// Mobility
	const walkSpeed = getNum(rows, "Mobility", "Walking Speed");
	if (walkSpeed !== undefined) {
		day.mobility = {
			walkingSpeed: walkSpeed,
			walkingAsymmetryPercentage: getNum(rows, "Mobility", [
				"Walking Asymmetry Percentage",
				"Walking Asymmetry Percent",
			]) ?? 0,
			walkingStepLength: getNum(rows, "Mobility", "Walking Step Length"),
			walkingDoubleSupportPercentage: getNum(rows, "Mobility", "Walking Double Support Percentage"),
		};
	}

	// Hearing
	const headphone = getNum(rows, "Hearing", "Headphone Audio Level");
	if (headphone !== undefined) {
		day.hearing = { headphoneAudioLevel: headphone };
	}

	return day;
}

/**
 * Parse a CSV file. A single CSV may contain multiple dates,
 * so this returns an array of HealthDay objects.
 */
export function parseCSV(content: string): HealthDay[] {
	const rows = parseRows(content);
	if (!rows.length) return [];

	// Group rows by date
	const byDate = new Map<string, CsvRow[]>();
	for (const row of rows) {
		const existing = byDate.get(row.date);
		if (existing) {
			existing.push(row);
		} else {
			byDate.set(row.date, [row]);
		}
	}

	const days: HealthDay[] = [];
	for (const [date, dateRows] of byDate) {
		days.push(buildDayFromRows(date, dateRows));
	}
	return days;
}
