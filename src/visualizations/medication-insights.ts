import { doseStatusKind } from "../medication-utils";
import type { HealthDay, HtmlRenderFn, MedicationDoseEvent } from "../types";

const TIMELINE_DEFAULT_LIMIT = 24;
const REASONS_DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_LABEL_LENGTH = 120;

interface DayDoseEvent {
	day: HealthDay;
	event: MedicationDoseEvent;
}

type ScheduleGroup = "scheduled" | "as-needed" | "other";

function appendElement<K extends keyof HTMLElementTagNameMap>(
	host: HTMLElement,
	tag: K,
	text?: string,
	className?: string
): HTMLElementTagNameMap[K] {
	const element = host.ownerDocument.createElement(tag);
	if (className) element.className = className;
	if (text !== undefined) element.textContent = text;
	host.appendChild(element);
	return element;
}

function boundedLimit(value: string | number | undefined, fallback: number): number {
	const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function primitiveText(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	if (typeof value === "boolean") return String(value);
	return undefined;
}

function safeLabel(value: unknown, fallback: string): string {
	const primitive = primitiveText(value);
	if (primitive === undefined) return fallback;
	const normalized = Array.from(primitive, (character) => {
		const code = character.charCodeAt(0);
		return code < 32 || code === 127 ? " " : character;
	}).join("").replace(/\s+/g, " ").trim();
	if (!normalized) return fallback;
	return normalized.length > MAX_LABEL_LENGTH
		? `${normalized.slice(0, MAX_LABEL_LENGTH - 1)}…`
		: normalized;
}

function eventRecord(event: MedicationDoseEvent): Record<string, unknown> {
	return event;
}

function firstPrimitive(record: Record<string, unknown>, ...keys: string[]): string | undefined {
	for (const key of keys) {
		const value = primitiveText(record[key]);
		if (value !== undefined && value.trim()) return value;
	}
	return undefined;
}

function eventStatus(event: MedicationDoseEvent): string | undefined {
	return firstPrimitive(
		eventRecord(event),
		"status",
		"logStatus",
		"log_status",
		"doseStatus",
		"dose_status"
	);
}

function eventStatusLabel(event: MedicationDoseEvent): string {
	const record = eventRecord(event);
	const exported = event.statusDisplay ?? event.status_display ??
		firstPrimitive(record, "logStatusDisplay", "log_status_display");
	if (exported) return safeLabel(exported, "Unknown");
	const raw = eventStatus(event);
	const kind = doseStatusKind(raw);
	if (kind === "taken") return "Taken";
	if (kind === "skipped") return "Skipped";
	return safeLabel(raw, "Unknown").replace(/[_-]+/g, " ");
}

function eventMedicationName(event: MedicationDoseEvent): string {
	const record = eventRecord(event);
	return safeLabel(
		event.name ?? event.displayName ?? event.display_name ??
		firstPrimitive(
			record,
			"medicationName",
			"medication_name",
			"medicationConceptIdentifier",
			"medication_concept_identifier"
		),
		"Medication"
	);
}

function scheduledTimestamp(event: MedicationDoseEvent): string | undefined {
	return event.scheduledDate ?? event.scheduled_date;
}

function actualTimestamp(event: MedicationDoseEvent): string | undefined {
	return event.startDate ?? event.start_date;
}

function displayTimestamp(value: string | undefined): string {
	return safeLabel(value, "—");
}

function validTimestamp(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function latenessLabel(event: MedicationDoseEvent): string {
	const scheduled = validTimestamp(scheduledTimestamp(event));
	const actual = validTimestamp(actualTimestamp(event));
	if (scheduled === undefined || actual === undefined) return "—";
	const minutes = Math.round((actual - scheduled) / 60_000);
	if (minutes > 0) return `${minutes} min late`;
	if (minutes < 0) return `${Math.abs(minutes)} min early`;
	return "0 min";
}

function scheduleGroup(event: MedicationDoseEvent): ScheduleGroup {
	const raw = (event.scheduleType ?? event.schedule_type ?? "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	if (["as_needed", "asneeded", "prn"].includes(raw)) return "as-needed";
	if (["scheduled", "schedule", "daily", "weekly", "breakfast", "lunch", "dinner", "bedtime"].includes(raw)) return "scheduled";
	if (scheduledTimestamp(event)) return "scheduled";
	return "other";
}

function eventsForDay(day: HealthDay): MedicationDoseEvent[] {
	const events = day.medicationDoseEvents ?? day.medication_dose_events;
	return Array.isArray(events) ? events : [];
}

function allDoseEvents(data: HealthDay[]): DayDoseEvent[] {
	return data.flatMap((day) => eventsForDay(day).map((event) => ({ day, event })));
}

function eventSortKey(item: DayDoseEvent): string {
	return scheduledTimestamp(item.event) ?? actualTimestamp(item.event) ?? item.day.date;
}

function calendarTimezones(data: HealthDay[]): string[] {
	const timezones = new Set<string>();
	for (const day of data) {
		const context = day.timeContext ?? day.time_context;
		const value = context?.calendarTimezone ?? context?.calendar_timezone;
		if (value) timezones.add(safeLabel(value, ""));
	}
	return Array.from(timezones).filter(Boolean).sort();
}

function statusClass(event: MedicationDoseEvent): string {
	const kind = doseStatusKind(eventStatus(event));
	if (kind === "taken") return "is-taken";
	if (kind === "skipped") return "is-skipped";
	return "is-other";
}

function groupTitle(group: ScheduleGroup): string {
	if (group === "scheduled") return "Scheduled doses";
	if (group === "as-needed") return "As-needed doses";
	return "Other or unspecified schedule";
}

function renderTimelineGroup(host: HTMLElement, group: ScheduleGroup, items: DayDoseEvent[]): void {
	const section = appendElement(host, "section", undefined, `health-md-med-timeline-group is-${group}`);
	appendElement(section, "h3", `${groupTitle(group)} (${items.length})`, "health-md-med-timeline-group-title");

	const wrapper = appendElement(section, "div", undefined, "health-md-med-timeline-table-wrap");
	const table = appendElement(wrapper, "table", undefined, "health-md-med-timeline-table");
	const head = appendElement(table, "thead");
	const headerRow = appendElement(head, "tr");
	for (const label of ["Date", "Medication", "Scheduled", "Actual / start", "Lateness", "Status"]) {
		const th = appendElement(headerRow, "th", label);
		th.scope = "col";
	}

	const body = appendElement(table, "tbody");
	for (const { day, event } of items) {
		const row = appendElement(body, "tr");
		for (const value of [
			safeLabel(day.date, "—"),
			eventMedicationName(event),
			displayTimestamp(scheduledTimestamp(event)),
			displayTimestamp(actualTimestamp(event)),
			latenessLabel(event),
		]) {
			appendElement(row, "td", value);
		}
		const statusCell = appendElement(row, "td");
		appendElement(statusCell, "span", eventStatusLabel(event), `health-md-med-status ${statusClass(event)}`);
	}
}

export const renderMedicationScheduleTimeline: HtmlRenderFn = (
	data,
	el,
	config
): void => {
	el.classList.add("health-md-med-schedule-timeline");
	const limit = boundedLimit(config.limit, TIMELINE_DEFAULT_LIMIT);
	const allEvents = allDoseEvents(data);
	const events = allEvents
		.sort((left, right) => eventSortKey(right).localeCompare(eventSortKey(left)))
		.slice(0, limit);

	const header = appendElement(el, "header", undefined, "health-md-med-timeline-header");
	appendElement(header, "h2", "Medication schedule timeline", "health-md-med-timeline-title");
	appendElement(
		header,
		"p",
		`${events.length} of ${allEvents.length} dose events shown`,
		"health-md-med-timeline-subtitle"
	);
	const timezones = calendarTimezones(data);
	if (timezones.length) {
		const displayedTimezones = timezones.slice(0, 3);
		const remainder = timezones.length - displayedTimezones.length;
		const timezoneText = `${displayedTimezones.join(", ")}${remainder ? `, plus ${remainder} more` : ""}`;
		appendElement(
			header,
			"p",
			`Exported calendar timezone${timezones.length === 1 ? "" : "s"}: ${timezoneText}. Timestamps are displayed as exported.`,
			"health-md-med-timeline-timezone"
		);
	}

	if (!events.length) {
		appendElement(
			el,
			"p",
			"No top-level medication dose events were included for this date range.",
			"health-md-med-empty"
		);
		return;
	}

	for (const group of ["scheduled", "as-needed", "other"] as ScheduleGroup[]) {
		const items = events.filter(({ event }) => scheduleGroup(event) === group);
		if (items.length) renderTimelineGroup(el, group, items);
	}
};

function skipReason(event: MedicationDoseEvent): string {
	const metadata = event.metadata;
	if (!isRecord(metadata)) return "No reason provided";
	for (const key of ["reason", "skip_reason", "skipReason"]) {
		if (!Object.prototype.hasOwnProperty.call(metadata, key)) continue;
		const primitive = primitiveText(metadata[key]);
		if (primitive !== undefined && primitive.trim()) {
			return safeLabel(primitive, "No reason provided");
		}
	}
	return "No reason provided";
}

interface ReasonCount {
	label: string;
	count: number;
}

function countSkipReasons(data: HealthDay[]): ReasonCount[] {
	const counts = new Map<string, ReasonCount>();
	for (const { event } of allDoseEvents(data)) {
		if (doseStatusKind(eventStatus(event)) !== "skipped") continue;
		const label = skipReason(event);
		const key = label.toLocaleLowerCase();
		const current = counts.get(key);
		if (current) current.count += 1;
		else counts.set(key, { label, count: 1 });
	}
	return Array.from(counts.values()).sort(
		(left, right) => right.count - left.count || left.label.localeCompare(right.label)
	);
}

export const renderMedicationSkipReasons: HtmlRenderFn = (
	data,
	el,
	config
): void => {
	el.classList.add("health-md-med-skip-reasons");
	const limit = boundedLimit(config.limit, REASONS_DEFAULT_LIMIT);
	const allReasons = countSkipReasons(data);
	const reasons = allReasons.slice(0, limit);
	const skippedCount = allReasons.reduce((sum, reason) => sum + reason.count, 0);

	const header = appendElement(el, "header", undefined, "health-md-med-skip-reasons-header");
	appendElement(header, "h2", "Medication skip reasons", "health-md-med-skip-reasons-title");
	appendElement(
		header,
		"p",
		`${skippedCount} skipped dose event${skippedCount === 1 ? "" : "s"}`,
		"health-md-med-skip-reasons-subtitle"
	);

	if (!reasons.length) {
		appendElement(
			el,
			"p",
			"No skipped top-level medication dose events were included for this date range.",
			"health-md-med-empty"
		);
		return;
	}

	if (allReasons.length > reasons.length) {
		appendElement(
			el,
			"p",
			`Showing ${reasons.length} of ${allReasons.length} exported reason labels.`,
			"health-md-med-skip-reasons-limit"
		);
	}

	const maxCount = Math.max(...reasons.map((reason) => reason.count), 1);
	const list = appendElement(el, "ol", undefined, "health-md-med-skip-reasons-list");
	for (const reason of reasons) {
		const item = appendElement(list, "li", undefined, "health-md-med-skip-reason");
		const row = appendElement(item, "div", undefined, "health-md-med-skip-reason-label-row");
		appendElement(row, "span", reason.label, "health-md-med-skip-reason-label");
		appendElement(row, "strong", String(reason.count), "health-md-med-skip-reason-count");
		const track = appendElement(item, "div", undefined, "health-md-med-skip-reason-track");
		const bar = appendElement(track, "div", undefined, "health-md-med-skip-reason-bar");
		bar.style.setProperty("--health-md-skip-reason-width", `${(reason.count / maxCount) * 100}%`);
	}
};
