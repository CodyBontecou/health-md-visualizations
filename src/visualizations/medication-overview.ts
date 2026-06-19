import { HealthDay, HtmlRenderFn, MedicationInventoryItem, VizConfig } from "../types";
import {
	doseEventMedicationName,
	doseStatusKind,
	getMedicationDaySummary,
	medicationDisplayName,
	medicationDoseQuantityLabel,
	medicationEventTimestamp,
	statusLabel,
} from "../medication-utils";

interface MedicationStatusCounts {
	taken: number;
	skipped: number;
	other: number;
}

interface MedicationBreakdown extends MedicationStatusCounts {
	name: string;
	total: number;
	detail?: MedicationInventoryItem;
}

interface TrendBucket extends MedicationStatusCounts {
	key: string;
	label: string;
	total: number;
}

function parsePositiveInt(value: string | number | undefined, defaultValue: number): number {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
	if (typeof value === "string") {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
	}
	return defaultValue;
}

function pct(value: number, total: number): string {
	return total > 0 ? `${Math.max(0, Math.min(100, (value / total) * 100)).toFixed(2)}%` : "0%";
}

function adherenceRate(taken: number, skipped: number): number | null {
	const denominator = taken + skipped;
	return denominator > 0 ? taken / denominator : null;
}

function formatPercent(value: number | null): string {
	return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function shortDate(iso: string): string {
	const d = new Date(`${iso}T00:00:00`);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateTime(value: string): string {
	if (!value) return "—";
	const ms = Date.parse(value);
	if (!Number.isFinite(ms)) return value;
	return new Date(ms).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function weekKey(dateIso: string): string {
	const d = new Date(`${dateIso}T00:00:00`);
	if (Number.isNaN(d.getTime())) return dateIso;
	const day = d.getDay();
	const mondayOffset = day === 0 ? -6 : 1 - day;
	const monday = new Date(d);
	monday.setDate(d.getDate() + mondayOffset);
	const y = monday.getFullYear();
	const m = String(monday.getMonth() + 1).padStart(2, "0");
	const dayOfMonth = String(monday.getDate()).padStart(2, "0");
	return `${y}-${m}-${dayOfMonth}`;
}

function monthKey(dateIso: string): string {
	return dateIso.slice(0, 7);
}

function trendMode(dataDays: number, config: VizConfig): "daily" | "weekly" | "monthly" {
	const requested = String(config.trend ?? "auto").trim().toLowerCase();
	if (requested === "daily" || requested === "weekly" || requested === "monthly") return requested;
	if (dataDays > 120) return "monthly";
	if (dataDays > 31) return "weekly";
	return "daily";
}

function addStat(host: HTMLElement, label: string, value: string, sublabel?: string): void {
	const card = host.createDiv({ cls: "health-md-med-stat" });
	card.createDiv({ cls: "health-md-med-stat-value", text: value });
	card.createDiv({ cls: "health-md-med-stat-label", text: label });
	if (sublabel) card.createDiv({ cls: "health-md-med-stat-sub", text: sublabel });
}

function statusClass(kind: string): string {
	if (kind === "taken") return "is-taken";
	if (kind === "skipped") return "is-skipped";
	return "is-other";
}

function statusPrefix(kind: string): string {
	if (kind === "taken") return "✓";
	if (kind === "skipped") return "↷";
	return "?";
}

function addStatusBadge(host: HTMLElement, rawStatus: string | undefined): void {
	const kind = doseStatusKind(rawStatus);
	const badge = host.createSpan({ cls: `health-md-med-status ${statusClass(kind)}` });
	badge.createSpan({ cls: "health-md-med-status-symbol", text: statusPrefix(kind) });
	badge.appendChild(activeDocument.createTextNode(` ${statusLabel(rawStatus)}`));
}

function renderEmpty(host: HTMLElement, message: string): void {
	host.createDiv({ cls: "health-md-workout-empty", text: message });
}

function renderInventory(host: HTMLElement, latest: ReturnType<typeof getMedicationDaySummary>): void {
	const section = host.createDiv({ cls: "health-md-med-section" });
	section.createEl("h4", { cls: "health-md-med-section-title", text: "Medication inventory" });
	const stats = section.createDiv({ cls: "health-md-med-stat-grid" });
	addStat(stats, "Total", String(latest.medicationCount));
	addStat(stats, "Active", String(latest.activeMedicationCount));
	addStat(stats, "Archived", String(latest.archivedMedicationCount));

	if (!latest.details.length) return;
	const list = section.createDiv({ cls: "health-md-med-inventory" });
	latest.details.forEach((item) => {
		const row = list.createDiv({ cls: "health-md-med-inventory-row" });
		const name = row.createDiv({ cls: "health-md-med-inventory-name" });
		name.textContent = medicationDisplayName(item);
		const meta = row.createDiv({ cls: "health-md-med-inventory-meta" });
		const pieces = [
			item.generalForm ?? item.general_form,
			(item.hasSchedule ?? item.has_schedule) === true ? "Scheduled" : (item.hasSchedule ?? item.has_schedule) === false ? "No schedule" : undefined,
			(item.isArchived ?? item.is_archived) ? "Archived" : "Active",
		].filter(Boolean);
		meta.textContent = pieces.join(" • ");
	});
}

function buildMedicationBreakdown(
	days: HealthDay[],
	latestDetails: MedicationInventoryItem[]
): MedicationBreakdown[] {
	const byName = new Map<string, MedicationBreakdown>();
	const ensure = (name: string, detail?: MedicationInventoryItem): MedicationBreakdown => {
		const key = name.toLowerCase();
		let row = byName.get(key);
		if (!row) {
			row = { name, total: 0, taken: 0, skipped: 0, other: 0, detail };
			byName.set(key, row);
		} else if (!row.detail && detail) {
			row.detail = detail;
		}
		return row;
	};

	latestDetails.forEach((detail) => ensure(medicationDisplayName(detail), detail));
	for (const day of days) {
		const summary = getMedicationDaySummary(day);
		for (const event of summary.doseEvents) {
			const name = doseEventMedicationName(event, summary.details.length ? summary.details : latestDetails);
			const row = ensure(name);
			const kind = doseStatusKind(event.status);
			row[kind] += 1;
			row.total += 1;
		}
	}
	return Array.from(byName.values()).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

function renderAdherence(host: HTMLElement, taken: number, skipped: number, other: number): void {
	const section = host.createDiv({ cls: "health-md-med-section" });
	section.createEl("h4", { cls: "health-md-med-section-title", text: "Adherence summary" });
	const total = taken + skipped + other;
	const stats = section.createDiv({ cls: "health-md-med-stat-grid" });
	addStat(stats, "Taken", String(taken));
	addStat(stats, "Skipped", String(skipped));
	if (other > 0) addStat(stats, "Other status", String(other));
	addStat(stats, "Adherence", formatPercent(adherenceRate(taken, skipped)), "taken ÷ taken+skipped");

	if (total <= 0) {
		renderEmpty(section, "No medication dose counts were included for this date range.");
		return;
	}
	const bar = section.createDiv({ cls: "health-md-med-stack", attr: { "aria-label": `${taken} taken, ${skipped} skipped, ${other} other medication doses` } });
	bar.createDiv({ cls: "health-md-med-stack-segment is-taken", attr: { style: `width:${pct(taken, total)}` } });
	bar.createDiv({ cls: "health-md-med-stack-segment is-skipped", attr: { style: `width:${pct(skipped, total)}` } });
	bar.createDiv({ cls: "health-md-med-stack-segment is-other", attr: { style: `width:${pct(other, total)}` } });
	const legend = section.createDiv({ cls: "health-md-med-legend" });
	[
		{ label: "Taken", value: taken, kind: "taken" },
		{ label: "Skipped", value: skipped, kind: "skipped" },
		...(other > 0 ? [{ label: "Other", value: other, kind: "other" }] : []),
	].forEach((item) => {
		const el = legend.createSpan({ cls: `health-md-med-legend-item ${statusClass(item.kind)}` });
		el.createSpan({ cls: "health-md-med-legend-swatch" });
		el.appendChild(activeDocument.createTextNode(`${item.label}: ${item.value}`));
	});
}

function renderBreakdown(host: HTMLElement, rows: MedicationBreakdown[]): void {
	const section = host.createDiv({ cls: "health-md-med-section" });
	section.createEl("h4", { cls: "health-md-med-section-title", text: "Per-medication dose status" });
	if (!rows.length) {
		renderEmpty(section, "No medication inventory or dose events were included.");
		return;
	}
	const list = section.createDiv({ cls: "health-md-med-breakdown" });
	rows.forEach((row) => {
		const item = list.createDiv({ cls: "health-md-med-breakdown-row" });
		const header = item.createDiv({ cls: "health-md-med-breakdown-header" });
		header.createDiv({ cls: "health-md-med-breakdown-name", text: row.name });
		const rate = adherenceRate(row.taken, row.skipped);
		header.createDiv({ cls: "health-md-med-breakdown-rate", text: row.total > 0 ? `${formatPercent(rate)} adherence` : "No doses" });
		const total = Math.max(row.total, 1);
		const bar = item.createDiv({ cls: "health-md-med-stack is-small", attr: { "aria-label": `${row.name}: ${row.taken} taken, ${row.skipped} skipped, ${row.other} other` } });
		bar.createDiv({ cls: "health-md-med-stack-segment is-taken", attr: { style: `width:${pct(row.taken, total)}` } });
		bar.createDiv({ cls: "health-md-med-stack-segment is-skipped", attr: { style: `width:${pct(row.skipped, total)}` } });
		bar.createDiv({ cls: "health-md-med-stack-segment is-other", attr: { style: `width:${pct(row.other, total)}` } });
		const counts = item.createDiv({ cls: "health-md-med-breakdown-counts" });
		counts.textContent = `${row.taken} taken • ${row.skipped} skipped${row.other ? ` • ${row.other} other` : ""}`;
	});
}

function buildTrend(days: HealthDay[], mode: "daily" | "weekly" | "monthly"): TrendBucket[] {
	const byKey = new Map<string, TrendBucket>();
	for (const day of days) {
		const summary = getMedicationDaySummary(day);
		if (!summary.hasMedicationData) continue;
		const key = mode === "monthly" ? monthKey(day.date) : mode === "weekly" ? weekKey(day.date) : day.date;
		const label = mode === "monthly" ? key : mode === "weekly" ? `Week of ${shortDate(key)}` : shortDate(day.date);
		let bucket = byKey.get(key);
		if (!bucket) {
			bucket = { key, label, total: 0, taken: 0, skipped: 0, other: 0 };
			byKey.set(key, bucket);
		}
		bucket.taken += summary.medicationTakenCount;
		bucket.skipped += summary.medicationSkippedCount;
		bucket.other += summary.medicationOtherDoseCount;
		bucket.total += summary.medicationDoseCount;
	}
	return Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function renderTrend(host: HTMLElement, days: HealthDay[], config: VizConfig): void {
	const mode = trendMode(days.length, config);
	const buckets = buildTrend(days, mode);
	const section = host.createDiv({ cls: "health-md-med-section" });
	section.createEl("h4", { cls: "health-md-med-section-title", text: `${mode.charAt(0).toUpperCase()}${mode.slice(1)} adherence trend` });
	const withDoses = buckets.filter((bucket) => bucket.total > 0 || bucket.taken > 0 || bucket.skipped > 0);
	if (withDoses.length < 2) {
		renderEmpty(section, "Add multiple days with medication dose counts to see a trend.");
		return;
	}
	const max = Math.max(...withDoses.map((bucket) => bucket.total), 1);
	const chart = section.createDiv({ cls: "health-md-med-trend" });
	withDoses.forEach((bucket) => {
		const col = chart.createDiv({ cls: "health-md-med-trend-col" });
		const bar = col.createDiv({ cls: "health-md-med-trend-bar", attr: { "aria-label": `${bucket.label}: ${bucket.taken} taken, ${bucket.skipped} skipped, ${bucket.other} other` } });
		bar.style.height = `${Math.max(8, (bucket.total / max) * 100)}%`;
		bar.createDiv({ cls: "health-md-med-trend-segment is-other", attr: { style: `height:${pct(bucket.other, bucket.total)}` } });
		bar.createDiv({ cls: "health-md-med-trend-segment is-skipped", attr: { style: `height:${pct(bucket.skipped, bucket.total)}` } });
		bar.createDiv({ cls: "health-md-med-trend-segment is-taken", attr: { style: `height:${pct(bucket.taken, bucket.total)}` } });
		col.createDiv({ cls: "health-md-med-trend-label", text: bucket.label });
	});
}

function renderRecentEvents(host: HTMLElement, days: HealthDay[], latestDetails: MedicationInventoryItem[], config: VizConfig): void {
	const limit = parsePositiveInt(config.limit ?? config.recent, 12);
	const events = days.flatMap((day) => {
		const summary = getMedicationDaySummary(day);
		const details = summary.details.length ? summary.details : latestDetails;
		return summary.doseEvents.map((event) => ({ day, event, details }));
	}).sort((a, b) => medicationEventTimestamp(b.event).localeCompare(medicationEventTimestamp(a.event))).slice(0, limit);

	const section = host.createDiv({ cls: "health-md-med-section" });
	section.createEl("h4", { cls: "health-md-med-section-title", text: "Recent dose events" });
	if (!events.length) {
		renderEmpty(section, "No medication dose events were included for this date range.");
		return;
	}

	const wrapper = section.createDiv({ cls: "health-md-workout-table-wrap" });
	const table = wrapper.createEl("table", { cls: "health-md-workout-table health-md-med-event-table" });
	const thead = table.createEl("thead");
	const headerRow = thead.createEl("tr");
	["Medication", "Status", "Time", "Dose", "Schedule"].forEach((heading) => headerRow.createEl("th", { text: heading }));
	const tbody = table.createEl("tbody");
	events.forEach(({ event, details }) => {
		const tr = tbody.createEl("tr");
		tr.createEl("td", { text: doseEventMedicationName(event, details) });
		const statusCell = tr.createEl("td");
		addStatusBadge(statusCell, event.status);
		tr.createEl("td", { text: formatDateTime(medicationEventTimestamp(event)) });
		tr.createEl("td", { text: medicationDoseQuantityLabel(event) });
		tr.createEl("td", { text: event.scheduleType ?? event.schedule_type ?? "—" });
	});
}

type MedicationDaySummary = ReturnType<typeof getMedicationDaySummary>;

interface MedicationRenderContext {
	latest: MedicationDaySummary;
	taken: number;
	skipped: number;
	other: number;
}

const MEDICATION_EMPTY_MESSAGE =
	"No medication data in range. Health.md schema v2 exports medication_count, medication_details, and medication_dose_events.";

function hasMedicationInventoryValues(summary: MedicationDaySummary): boolean {
	return summary.medicationCount > 0 ||
		summary.activeMedicationCount > 0 ||
		summary.archivedMedicationCount > 0 ||
		summary.details.length > 0 ||
		summary.medications.length > 0;
}

function getMedicationRenderContext(data: HealthDay[]): MedicationRenderContext | null {
	const summaries = data.map(getMedicationDaySummary).filter((summary) => summary.hasMedicationData);
	if (!summaries.length) return null;

	const latestMedicationSummary = [...summaries]
		.reverse()
		.find((summary) => summary.hasInventory || summary.hasDoseEvents || summary.hasDoseCounts) ??
		summaries[summaries.length - 1];
	const latest = [...summaries].reverse().find(hasMedicationInventoryValues) ?? latestMedicationSummary;
	const taken = summaries.reduce((sum, summary) => sum + summary.medicationTakenCount, 0);
	const skipped = summaries.reduce((sum, summary) => sum + summary.medicationSkippedCount, 0);
	const doseCount = summaries.reduce((sum, summary) => sum + summary.medicationDoseCount, 0);
	const other = Math.max(0, doseCount - taken - skipped);

	return { latest, taken, skipped, other };
}

function renderMedicationComponent(
	data: HealthDay[],
	el: HTMLElement,
	render: (context: MedicationRenderContext) => void
): void {
	el.addClass("health-md-med-container");
	const context = getMedicationRenderContext(data);
	if (!context) {
		renderEmpty(el, MEDICATION_EMPTY_MESSAGE);
		return;
	}
	render(context);
}

export const renderMedicationInventory: HtmlRenderFn = (
	data: HealthDay[],
	el: HTMLElement
): void => {
	renderMedicationComponent(data, el, ({ latest }) => renderInventory(el, latest));
};

export const renderMedicationAdherenceSummary: HtmlRenderFn = (
	data: HealthDay[],
	el: HTMLElement
): void => {
	renderMedicationComponent(data, el, ({ taken, skipped, other }) =>
		renderAdherence(el, taken, skipped, other)
	);
};

export const renderMedicationDoseStatus: HtmlRenderFn = (
	data: HealthDay[],
	el: HTMLElement
): void => {
	renderMedicationComponent(data, el, ({ latest }) =>
		renderBreakdown(el, buildMedicationBreakdown(data, latest.details))
	);
};

export const renderMedicationAdherenceTrend: HtmlRenderFn = (
	data: HealthDay[],
	el: HTMLElement,
	config: VizConfig
): void => {
	renderMedicationComponent(data, el, () =>
		renderTrend(el, data, { ...config, trend: config.trend ?? "daily" })
	);
};

export const renderMedicationRecentDoseEvents: HtmlRenderFn = (
	data: HealthDay[],
	el: HTMLElement,
	config: VizConfig
): void => {
	renderMedicationComponent(data, el, ({ latest }) =>
		renderRecentEvents(el, data, latest.details, config)
	);
};

export const renderMedicationOverview: HtmlRenderFn = (
	data: HealthDay[],
	el: HTMLElement,
	config: VizConfig,
	_theme
): void => {
	renderMedicationComponent(data, el, ({ latest, taken, skipped, other }) => {
		const header = el.createDiv({ cls: "health-md-med-header" });
		const title = header.createDiv({ cls: "health-md-med-title" });
		title.textContent = data.length > 1 ? "Medication overview" : `Medication overview — ${data[0].date}`;
		const subtitle = header.createDiv({ cls: "health-md-med-subtitle" });
		subtitle.textContent = data.length > 1
			? `${data[0].date} – ${data[data.length - 1].date}`
			: "Health.md schema v2 medication export";

		renderInventory(el, latest);
		renderAdherence(el, taken, skipped, other);
		renderBreakdown(el, buildMedicationBreakdown(data, latest.details));
		renderTrend(el, data, config);
		renderRecentEvents(el, data, latest.details, config);
	});
};
