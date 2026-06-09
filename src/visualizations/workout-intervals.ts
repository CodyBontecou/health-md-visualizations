import { HealthDay, HtmlRenderFn, VizConfig, WorkoutEntry, WorkoutInterval } from "../types";
import { formatDuration } from "../canvas-utils";
import {
	formatWorkoutDistance,
	intervalRateDisplay,
	pickWorkout,
} from "../workout-utils";

function titleCase(value: string): string {
	return value
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function renderEmptyMessage(host: HTMLElement, message: string): void {
	const msg = host.createDiv({ cls: "health-md-workout-empty" });
	msg.textContent = message;
}

function renderHeader(host: HTMLElement, day: HealthDay, workout: WorkoutEntry): void {
	const header = host.createDiv({ cls: "health-md-workout-header" });
	const title = header.createDiv({ cls: "health-md-workout-title" });
	title.textContent = `${titleCase(workout.activityType ?? workout.type)} — ${day.date}`;

	const stats = header.createDiv({ cls: "health-md-workout-stats" });
	const addStat = (label: string, value: string | undefined) => {
		if (!value) return;
		const cell = stats.createDiv({ cls: "health-md-workout-stat" });
		cell.createDiv({ cls: "health-md-workout-stat-label", text: label });
		cell.createDiv({ cls: "health-md-workout-stat-value", text: value });
	};

	addStat("Duration", workout.durationFormatted ?? formatDuration(workout.duration));
	addStat("Distance", formatWorkoutDistance(workout, day));
	addStat("Avg HR", workout.avgHeartRate != null ? `${Math.round(workout.avgHeartRate)} BPM` : undefined);
	addStat("Avg Power", workout.avgPower != null ? `${Math.round(workout.avgPower)} W` : undefined);
}

function formatMaybeNumber(value: number | undefined, suffix: string): string {
	return value == null ? "—" : `${Math.round(value)} ${suffix}`;
}

function renderIntervalTable(host: HTMLElement, label: string, rows: WorkoutInterval[]): void {
	host.createEl("h4", { text: label, cls: "health-md-workout-table-heading" });
	const wrapper = host.createDiv({ cls: "health-md-workout-table-wrap" });
	const table = wrapper.createEl("table", { cls: "health-md-workout-table" });
	const thead = table.createEl("thead");
	const headerRow = thead.createEl("tr");
	["#", "Distance", "Time", "Pace / Speed", "Avg HR", "Max HR", "Avg Power", "Avg Cadence"].forEach((heading) => {
		headerRow.createEl("th", { text: heading });
	});

	const tbody = table.createEl("tbody");
	rows.forEach((row) => {
		const tr = tbody.createEl("tr");
		tr.createEl("td", { text: String(row.index) });
		tr.createEl("td", { text: row.distanceFormatted ?? (row.distance != null ? `${(row.distance / 1000).toFixed(2)} km` : "—") });
		tr.createEl("td", { text: row.duration ? formatDuration(row.duration) : "—" });
		tr.createEl("td", { text: intervalRateDisplay(row) ?? "—" });
		tr.createEl("td", { text: formatMaybeNumber(row.avgHeartRate, "BPM") });
		tr.createEl("td", { text: formatMaybeNumber(row.maxHeartRate, "BPM") });
		tr.createEl("td", { text: formatMaybeNumber(row.avgPower, "W") });
		tr.createEl("td", { text: row.avgCadence == null ? "—" : `${Math.round(row.avgCadence)} ${row.cadenceUnit ?? ""}`.trim() });
	});
}

export const renderWorkoutIntervals: HtmlRenderFn = (
	data: HealthDay[],
	el: HTMLElement,
	config: VizConfig,
	_theme
): void => {
	el.addClass("health-md-workout-container");
	const picked = pickWorkout(data, config);
	if (!picked) {
		renderEmptyMessage(el, "No workout found");
		return;
	}

	const { day, workout } = picked;
	renderHeader(el, day, workout);

	const kind = String(config.kind ?? config.table ?? "auto").trim().toLowerCase();
	const showLaps = kind === "auto" || kind === "laps" || kind === "lap";
	const showSplits = kind === "auto" || kind === "splits" || kind === "split";
	let rendered = false;
	if (showLaps && workout.laps?.length) {
		renderIntervalTable(el, "Laps", workout.laps);
		rendered = true;
	}
	if (showSplits && workout.splits?.length) {
		renderIntervalTable(el, "Splits", workout.splits);
		rendered = true;
	}
	if (!rendered) {
		renderEmptyMessage(el, "No laps or splits were included for this workout.");
	}
};
