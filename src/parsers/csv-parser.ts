import { HealthDay } from "../types";

interface CsvRow {
	date: string;
	category: string;
	metric: string;
	value: string;
	unit: string;
}

function parseRows(content: string): CsvRow[] {
	const lines = content.split("\n").filter((l) => l.trim());
	if (lines.length < 2) return [];

	// Skip header row
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
			});
		}
	}
	return rows;
}

function getNum(rows: CsvRow[], category: string, metric: string): number | undefined {
	const row = rows.find(
		(r) =>
			r.category.toLowerCase() === category.toLowerCase() &&
			r.metric.toLowerCase() === metric.toLowerCase()
	);
	if (!row) return undefined;
	const num = parseFloat(row.value);
	return isNaN(num) ? undefined : num;
}

function getString(rows: CsvRow[], category: string, metric: string): string | undefined {
	const row = rows.find(
		(r) =>
			r.category.toLowerCase() === category.toLowerCase() &&
			r.metric.toLowerCase() === metric.toLowerCase()
	);
	return row?.value;
}

function buildDayFromRows(date: string, rows: CsvRow[]): HealthDay {
	const day: HealthDay = {
		type: "health-data",
		date,
	};

	// Activity
	const steps = getNum(rows, "Activity", "Steps");
	if (steps !== undefined) {
		day.activity = {
			steps,
			walkingRunningDistanceKm: getNum(rows, "Activity", "Walking Running Distance") ?? 0,
			activeCalories: getNum(rows, "Activity", "Active Calories") ?? 0,
			exerciseMinutes: getNum(rows, "Activity", "Exercise Minutes") ?? 0,
			vo2Max: getNum(rows, "Activity", "VO2 Max"),
			basalEnergyBurned: getNum(rows, "Activity", "Basal Energy Burned"),
			standHours: getNum(rows, "Activity", "Stand Hours"),
			flightsClimbed: getNum(rows, "Activity", "Flights Climbed"),
		};
		// Handle distance in meters - convert to km
		const distM = getNum(rows, "Activity", "Walking Running Distance");
		if (distM !== undefined && distM > 100) {
			day.activity.walkingRunningDistanceKm = distM / 1000;
		}
	}

	// Heart
	const restingHR = getNum(rows, "Heart", "Resting Heart Rate");
	const avgHR = getNum(rows, "Heart", "Average Heart Rate");
	if (restingHR !== undefined || avgHR !== undefined) {
		day.heart = {
			averageHeartRate: avgHR ?? restingHR ?? 0,
			heartRateMin: getNum(rows, "Heart", "Heart Rate Min") ?? 0,
			heartRateMax: getNum(rows, "Heart", "Heart Rate Max") ?? 0,
			heartRateSamples: [],
			restingHeartRate: restingHR,
			walkingHeartRateAverage: getNum(rows, "Heart", "Walking Heart Rate Average"),
			hrv: getNum(rows, "Heart", "HRV"),
		};
	}

	// Sleep
	const sleepTotal = getNum(rows, "Sleep", "Total Duration");
	if (sleepTotal !== undefined) {
		day.sleep = {
			sleepStages: [],
			totalDuration: sleepTotal,
			deepSleep: getNum(rows, "Sleep", "Deep Sleep") ?? 0,
			remSleep: getNum(rows, "Sleep", "REM Sleep") ?? 0,
			coreSleep: getNum(rows, "Sleep", "Core Sleep") ?? 0,
			awakeTime: getNum(rows, "Sleep", "Awake Time"),
			bedtime: getString(rows, "Sleep", "Bedtime") ?? "",
			wakeTime: getString(rows, "Sleep", "Wake Time") ?? "",
		};
	}

	// Vitals
	const respRate = getNum(rows, "Vitals", "Respiratory Rate");
	const bloodOx = getNum(rows, "Vitals", "Blood Oxygen");
	if (respRate !== undefined || bloodOx !== undefined) {
		day.vitals = {
			respiratoryRate: respRate,
			bloodOxygenPercent: bloodOx,
			bloodOxygenAvg: bloodOx,
		};
	}

	// Mobility
	const walkSpeed = getNum(rows, "Mobility", "Walking Speed");
	if (walkSpeed !== undefined) {
		day.mobility = {
			walkingSpeed: walkSpeed,
			walkingAsymmetryPercentage: getNum(rows, "Mobility", "Walking Asymmetry Percentage") ?? 0,
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
