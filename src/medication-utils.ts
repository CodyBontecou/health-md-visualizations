import type { HealthDay, MedicationDoseEvent, MedicationInventoryItem } from "./types";

export interface MedicationDaySummary {
	date: string;
	medicationCount: number;
	activeMedicationCount: number;
	archivedMedicationCount: number;
	medicationDoseCount: number;
	medicationTakenCount: number;
	medicationSkippedCount: number;
	medicationOtherDoseCount: number;
	medications: string[];
	details: MedicationInventoryItem[];
	doseEvents: MedicationDoseEvent[];
	hasInventory: boolean;
	hasDoseCounts: boolean;
	hasDoseEvents: boolean;
	hasMedicationData: boolean;
}

type MedicationFieldPatch = Partial<Pick<HealthDay,
	| "medicationCount"
	| "medication_count"
	| "activeMedicationCount"
	| "active_medication_count"
	| "archivedMedicationCount"
	| "archived_medication_count"
	| "medicationDoseCount"
	| "medication_dose_count"
	| "medicationTakenCount"
	| "medication_taken_count"
	| "medicationSkippedCount"
	| "medication_skipped_count"
	| "medications"
	| "medicationDetails"
	| "medication_details"
	| "medicationDoseEvents"
	| "medication_dose_events"
>>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNumberValue(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "string") return undefined;
	const normalized = value.trim().replace(/,/g, "");
	const match = /^[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i.exec(normalized);
	if (!match) return undefined;
	const num = Number(match[0]);
	return Number.isFinite(num) ? num : undefined;
}

function stringValue(value: unknown): string | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed ? trimmed : undefined;
	}
	if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
		return String(value);
	}
	return undefined;
}

function booleanValue(value: unknown): boolean | undefined {
	if (typeof value === "boolean") return value;
	if (typeof value === "number" && Number.isFinite(value)) return value !== 0;
	if (typeof value !== "string") return undefined;
	const normalized = value.trim().toLowerCase();
	if (["true", "yes", "y", "1"].includes(normalized)) return true;
	if (["false", "no", "n", "0"].includes(normalized)) return false;
	return undefined;
}

function firstRaw(source: Record<string, unknown>, ...keys: string[]): unknown {
	for (const key of keys) {
		if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
	}
	return undefined;
}

function firstString(source: Record<string, unknown>, ...keys: string[]): string | undefined {
	for (const key of keys) {
		const value = stringValue(source[key]);
		if (value !== undefined) return value;
	}
	return undefined;
}

function firstNumber(source: Record<string, unknown>, ...keys: string[]): number | undefined {
	for (const key of keys) {
		const value = parseNumberValue(source[key]);
		if (value !== undefined) return value;
	}
	return undefined;
}

function firstBoolean(source: Record<string, unknown>, ...keys: string[]): boolean | undefined {
	for (const key of keys) {
		const value = booleanValue(source[key]);
		if (value !== undefined) return value;
	}
	return undefined;
}

function splitInlineArray(inner: string): string[] {
	const parts: string[] = [];
	let current = "";
	let quote: string | null = null;
	let bracketDepth = 0;
	let braceDepth = 0;
	for (let i = 0; i < inner.length; i++) {
		const ch = inner[i];
		if ((ch === '"' || ch === "'") && inner[i - 1] !== "\\") {
			quote = quote === ch ? null : (quote ?? ch);
		}
		if (!quote) {
			if (ch === "[") bracketDepth++;
			else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);
			else if (ch === "{") braceDepth++;
			else if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
			else if (ch === "," && bracketDepth === 0 && braceDepth === 0) {
				parts.push(current.trim());
				current = "";
				continue;
			}
		}
		current += ch;
	}
	if (current.trim()) parts.push(current.trim());
	return parts;
}

function splitYamlKeyValue(text: string): [string, string] | null {
	const colonIdx = text.indexOf(":");
	if (colonIdx === -1) return null;
	const key = text.slice(0, colonIdx).trim();
	if (!key) return null;
	return [key, text.slice(colonIdx + 1).trim()];
}

function parseScalar(raw: string): unknown {
	let value = raw.trim();
	if (!value) return null;
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		value = value.slice(1, -1);
		return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
	}
	if (value.startsWith("[") && value.endsWith("]")) {
		return splitInlineArray(value.slice(1, -1)).map(parseScalar);
	}
	if (value.startsWith("{") && value.endsWith("}")) {
		try {
			return JSON.parse(value) as unknown;
		} catch {
			return value;
		}
	}
	const lower = value.toLowerCase();
	if (lower === "true") return true;
	if (lower === "false") return false;
	if (lower === "null" || lower === "~") return null;
	const num = Number(value.replace(/,/g, ""));
	if (Number.isFinite(num) && /^[-+]?\d/.test(value)) return num;
	return value;
}

function parseYamlishList(value: string): unknown[] | undefined {
	const lines = value
		.split(/\r?\n/)
		.map((line) => ({ indent: /^ */.exec(line)?.[0].length ?? 0, text: line.trim() }))
		.filter((line) => line.text && !line.text.startsWith("#"));
	if (!lines.length) return undefined;

	if (!lines.some((line) => line.text.startsWith("- "))) {
		const object: Record<string, unknown> = {};
		let hasKeys = false;
		for (const line of lines) {
			const pair = splitYamlKeyValue(line.text);
			if (!pair) return undefined;
			object[pair[0]] = parseScalar(pair[1]);
			hasKeys = true;
		}
		return hasKeys ? [object] : undefined;
	}

	const result: unknown[] = [];
	let current: Record<string, unknown> | null = null;
	let currentScalar: unknown;
	let hasCurrentScalar = false;
	for (const line of lines) {
		if (line.text.startsWith("- ")) {
			if (current) result.push(current);
			else if (hasCurrentScalar) result.push(currentScalar);
			current = null;
			currentScalar = undefined;
			hasCurrentScalar = false;
			const rest = line.text.slice(2).trim();
			if (!rest) {
				current = {};
				continue;
			}
			const pair = splitYamlKeyValue(rest);
			if (pair) {
				current = { [pair[0]]: parseScalar(pair[1]) };
				continue;
			}
			currentScalar = parseScalar(rest);
			hasCurrentScalar = true;
			continue;
		}

		if (current && line.indent > 0) {
			const pair = splitYamlKeyValue(line.text);
			if (pair) current[pair[0]] = parseScalar(pair[1]);
		}
	}
	if (current) result.push(current);
	else if (hasCurrentScalar) result.push(currentScalar);
	return result.length ? result : undefined;
}

function parseUnknownCollection(value: unknown): unknown[] {
	if (Array.isArray(value)) return value;
	if (value == null) return [];
	if (isRecord(value)) return [value];
	if (typeof value !== "string") return [];
	const trimmed = value.trim();
	if (!trimmed) return [];

	if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
		try {
			const parsed = JSON.parse(trimmed) as unknown;
			if (Array.isArray(parsed)) return parsed;
			if (isRecord(parsed)) return [parsed];
		} catch {
			// Fall through to YAML-ish parsing.
		}
	}

	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		return splitInlineArray(trimmed.slice(1, -1)).map(parseScalar);
	}

	const yamlish = parseYamlishList(trimmed);
	if (yamlish) return yamlish;

	return trimmed
		.split(/[,;\n]/)
		.map((item) => item.trim())
		.filter(Boolean);
}

function stringArrayFromUnknown(value: unknown): string[] {
	return parseUnknownCollection(value)
		.flatMap((item) => {
			if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
				const text = String(item).trim();
				return text ? [text] : [];
			}
			if (isRecord(item)) {
				const name = firstString(item, "display_name", "displayName", "name", "nickname");
				return name ? [name] : [];
			}
			return [];
		})
		.filter((item, index, all) => all.indexOf(item) === index);
}

export function normalizeMedicationDetails(value: unknown): MedicationInventoryItem[] {
	return parseUnknownCollection(value)
		.flatMap((item): MedicationInventoryItem[] => {
			if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
				const name = String(item).trim();
				return name ? [{ name, displayName: name, display_name: name }] : [];
			}
			if (!isRecord(item)) return [];
			const name = firstString(item, "name", "medication", "display_name", "displayName", "nickname");
			const displayName = firstString(item, "display_name", "displayName", "name", "nickname");
			const conceptIdentifier = firstString(item, "concept_identifier", "conceptIdentifier", "medication_concept_identifier", "medicationConceptIdentifier");
			const generalForm = firstString(item, "general_form", "generalForm", "form");
			const isArchived = firstBoolean(item, "is_archived", "isArchived", "archived");
			const hasSchedule = firstBoolean(item, "has_schedule", "hasSchedule", "scheduled");
			const nickname = firstString(item, "nickname", "nick_name", "nickName");
			const rxnormCodes = stringArrayFromUnknown(firstRaw(item, "rxnorm_codes", "rxnormCodes", "rxNormCodes", "rxnorm"));
			const relatedCodings = parseUnknownCollection(firstRaw(item, "related_codings", "relatedCodings", "codings"));
			return [{
				...item,
				name,
				conceptIdentifier,
				concept_identifier: conceptIdentifier,
				displayName,
				display_name: displayName,
				generalForm,
				general_form: generalForm,
				isArchived,
				is_archived: isArchived,
				hasSchedule,
				has_schedule: hasSchedule,
				nickname,
				relatedCodings: relatedCodings.length ? relatedCodings : undefined,
				related_codings: relatedCodings.length ? relatedCodings : undefined,
				rxnormCodes: rxnormCodes.length ? rxnormCodes : undefined,
				rxnorm_codes: rxnormCodes.length ? rxnormCodes : undefined,
			}];
		});
}

export function normalizeMedicationDoseEvents(value: unknown): MedicationDoseEvent[] {
	return parseUnknownCollection(value)
		.flatMap((item): MedicationDoseEvent[] => {
			if (!isRecord(item)) return [];
			const status = firstString(item, "status", "dose_status", "doseStatus", "log_status", "logStatus");
			const statusDisplay = firstString(item, "status_display", "statusDisplay", "log_status_display", "logStatusDisplay") ?? statusLabel(status);
			const startDate = firstString(item, "start_date", "startDate", "start", "started_at", "startedAt");
			const endDate = firstString(item, "end_date", "endDate", "end", "ended_at", "endedAt");
			const scheduledDate = firstString(item, "scheduled_date", "scheduledDate", "scheduled", "scheduled_at", "scheduledAt", "time", "timestamp");
			const doseQuantity = firstNumber(item, "dose_quantity", "doseQuantity", "quantity");
			const scheduledDoseQuantity = firstNumber(item, "scheduled_dose_quantity", "scheduledDoseQuantity", "scheduled_quantity", "scheduledQuantity");
			const scheduleType = firstString(item, "schedule_type", "scheduleType", "schedule");
			const conceptIdentifier = firstString(item, "medication_concept_identifier", "medicationConceptIdentifier", "concept_identifier", "conceptIdentifier");
			return [{
				...item,
				name: firstString(item, "name", "medication", "medication_name", "medicationName", "display_name", "displayName"),
				status,
				statusDisplay,
				status_display: statusDisplay,
				id: firstString(item, "id", "identifier", "uuid"),
				medicationConceptIdentifier: conceptIdentifier,
				medication_concept_identifier: conceptIdentifier,
				startDate,
				start_date: startDate,
				endDate,
				end_date: endDate,
				scheduledDate,
				scheduled_date: scheduledDate,
				doseQuantity,
				dose_quantity: doseQuantity,
				scheduledDoseQuantity,
				scheduled_dose_quantity: scheduledDoseQuantity,
				unit: firstString(item, "unit", "dose_unit", "doseUnit"),
				scheduleType,
				schedule_type: scheduleType,
				metadata: firstRaw(item, "metadata", "meta"),
			}];
		})
		.sort((a, b) => medicationEventTimestamp(a).localeCompare(medicationEventTimestamp(b)));
}

export function normalizeMedicationFields(source: Record<string, unknown>): MedicationFieldPatch {
	const detailsRaw = firstRaw(source, "medication_details", "medicationDetails");
	const legacyMedicationsRaw = firstRaw(source, "medications", "medication_names", "medicationNames");
	const doseEventsRaw = firstRaw(source, "medication_dose_events", "medicationDoseEvents");

	let details = normalizeMedicationDetails(detailsRaw);
	const medicationNames = stringArrayFromUnknown(legacyMedicationsRaw);
	if (!details.length && medicationNames.length) {
		details = medicationNames.map((name) => ({ name, displayName: name, display_name: name }));
	}
	const doseEvents = normalizeMedicationDoseEvents(doseEventsRaw);
	const derivedActive = details.filter((item) => item.isArchived !== true && item.is_archived !== true).length;
	const derivedArchived = details.filter((item) => item.isArchived === true || item.is_archived === true).length;
	const takenFromEvents = doseEvents.filter((event) => doseStatusKind(event.status) === "taken").length;
	const skippedFromEvents = doseEvents.filter((event) => doseStatusKind(event.status) === "skipped").length;

	const medicationCount = firstNumber(source, "medication_count", "medicationCount") ?? (details.length || medicationNames.length || undefined);
	const activeMedicationCount = firstNumber(source, "active_medication_count", "activeMedicationCount") ?? (details.length ? derivedActive : undefined);
	const archivedMedicationCount = firstNumber(source, "archived_medication_count", "archivedMedicationCount") ?? (details.length ? derivedArchived : undefined);
	const medicationDoseCount = firstNumber(source, "medication_dose_count", "medicationDoseCount") ?? (doseEvents.length || undefined);
	const medicationTakenCount = firstNumber(source, "medication_taken_count", "medicationTakenCount") ?? (doseEvents.length ? takenFromEvents : undefined);
	const medicationSkippedCount = firstNumber(source, "medication_skipped_count", "medicationSkippedCount") ?? (doseEvents.length ? skippedFromEvents : undefined);

	const patch: MedicationFieldPatch = {};
	if (medicationCount !== undefined) {
		patch.medicationCount = medicationCount;
		patch.medication_count = medicationCount;
	}
	if (activeMedicationCount !== undefined) {
		patch.activeMedicationCount = activeMedicationCount;
		patch.active_medication_count = activeMedicationCount;
	}
	if (archivedMedicationCount !== undefined) {
		patch.archivedMedicationCount = archivedMedicationCount;
		patch.archived_medication_count = archivedMedicationCount;
	}
	if (medicationDoseCount !== undefined) {
		patch.medicationDoseCount = medicationDoseCount;
		patch.medication_dose_count = medicationDoseCount;
	}
	if (medicationTakenCount !== undefined) {
		patch.medicationTakenCount = medicationTakenCount;
		patch.medication_taken_count = medicationTakenCount;
	}
	if (medicationSkippedCount !== undefined) {
		patch.medicationSkippedCount = medicationSkippedCount;
		patch.medication_skipped_count = medicationSkippedCount;
	}
	if (medicationNames.length) patch.medications = medicationNames;
	if (details.length) {
		patch.medicationDetails = details;
		patch.medication_details = details;
	}
	if (doseEvents.length) {
		patch.medicationDoseEvents = doseEvents;
		patch.medication_dose_events = doseEvents;
	}
	return patch;
}

export function medicationEventTimestamp(event: MedicationDoseEvent): string {
	return event.scheduledDate ?? event.scheduled_date ?? event.startDate ?? event.start_date ?? event.endDate ?? event.end_date ?? "";
}

export type MedicationDoseStatusKind = "taken" | "skipped" | "other";

export function doseStatusKind(status: string | undefined): MedicationDoseStatusKind {
	const normalized = (status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
	if (["taken", "completed", "complete", "logged", "administered", "consumed", "done"].includes(normalized)) return "taken";
	if ([
		"skipped", "missed", "not_taken", "not_taken_as_scheduled", "declined", "omitted",
		"snoozed", "not_interacted", "notification_not_sent", "not_logged",
	].includes(normalized)) return "skipped";
	return "other";
}

export function statusLabel(status: string | undefined): string {
	const kind = doseStatusKind(status);
	if (kind === "taken") return "Taken";
	if (kind === "skipped") return "Skipped";
	const raw = (status ?? "Unknown").trim();
	if (!raw) return "Unknown";
	return raw
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ")
		.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function medicationDisplayName(item: MedicationInventoryItem): string {
	return item.nickname ?? item.displayName ?? item.display_name ?? item.name ?? item.conceptIdentifier ?? item.concept_identifier ?? "Medication";
}

export function doseEventMedicationName(event: MedicationDoseEvent, details: MedicationInventoryItem[]): string {
	const direct = event.name ?? event.displayName ?? event.display_name;
	if (direct) return direct;
	const concept = event.medicationConceptIdentifier ?? event.medication_concept_identifier;
	if (concept) {
		const match = details.find((item) => item.conceptIdentifier === concept || item.concept_identifier === concept);
		if (match) return medicationDisplayName(match);
	}
	return "Medication";
}

export function medicationDoseQuantityLabel(event: MedicationDoseEvent): string {
	const quantity = event.doseQuantity ?? event.dose_quantity ?? event.scheduledDoseQuantity ?? event.scheduled_dose_quantity;
	const unit = event.unit;
	if (quantity === undefined) return unit ?? "—";
	const rounded = Number.isInteger(quantity) ? String(quantity) : String(Math.round(quantity * 100) / 100);
	return unit ? `${rounded} ${unit}` : rounded;
}

export function getMedicationDaySummary(day: HealthDay): MedicationDaySummary {
	const source = day as unknown as Record<string, unknown>;
	const hasExplicitMedicationField = [
		"medicationCount",
		"medication_count",
		"activeMedicationCount",
		"active_medication_count",
		"archivedMedicationCount",
		"archived_medication_count",
		"medicationDoseCount",
		"medication_dose_count",
		"medicationTakenCount",
		"medication_taken_count",
		"medicationSkippedCount",
		"medication_skipped_count",
		"medications",
		"medicationDetails",
		"medication_details",
		"medicationDoseEvents",
		"medication_dose_events",
	].some((key) => Object.prototype.hasOwnProperty.call(source, key));
	const normalized = normalizeMedicationFields(source);
	const details = normalized.medicationDetails ?? day.medicationDetails ?? day.medication_details ?? [];
	const doseEvents = normalized.medicationDoseEvents ?? day.medicationDoseEvents ?? day.medication_dose_events ?? [];
	const medications = normalized.medications ?? day.medications ?? details.map(medicationDisplayName);
	const takenFromEvents = doseEvents.filter((event) => doseStatusKind(event.status) === "taken").length;
	const skippedFromEvents = doseEvents.filter((event) => doseStatusKind(event.status) === "skipped").length;
	const otherFromEvents = doseEvents.filter((event) => doseStatusKind(event.status) === "other").length;
	const medicationCount = normalized.medicationCount ?? day.medicationCount ?? day.medication_count ?? details.length ?? medications.length ?? 0;
	const activeMedicationCount = normalized.activeMedicationCount ?? day.activeMedicationCount ?? day.active_medication_count ?? details.filter((item) => item.isArchived !== true && item.is_archived !== true).length;
	const archivedMedicationCount = normalized.archivedMedicationCount ?? day.archivedMedicationCount ?? day.archived_medication_count ?? details.filter((item) => item.isArchived === true || item.is_archived === true).length;
	const medicationDoseCount = normalized.medicationDoseCount ?? day.medicationDoseCount ?? day.medication_dose_count ?? doseEvents.length;
	const medicationTakenCount = normalized.medicationTakenCount ?? day.medicationTakenCount ?? day.medication_taken_count ?? takenFromEvents;
	const medicationSkippedCount = normalized.medicationSkippedCount ?? day.medicationSkippedCount ?? day.medication_skipped_count ?? skippedFromEvents;
	const medicationOtherDoseCount = Math.max(0, medicationDoseCount - medicationTakenCount - medicationSkippedCount, otherFromEvents);
	const hasInventory = medicationCount > 0 || details.length > 0 || medications.length > 0 || hasExplicitMedicationField;
	const hasDoseCounts = medicationDoseCount > 0 || medicationTakenCount > 0 || medicationSkippedCount > 0 || hasExplicitMedicationField;
	const hasDoseEvents = doseEvents.length > 0;
	const hasMedicationData = hasExplicitMedicationField || hasInventory || hasDoseCounts || hasDoseEvents;
	return {
		date: day.date,
		medicationCount,
		activeMedicationCount,
		archivedMedicationCount,
		medicationDoseCount,
		medicationTakenCount,
		medicationSkippedCount,
		medicationOtherDoseCount,
		medications,
		details,
		doseEvents,
		hasInventory,
		hasDoseCounts,
		hasDoseEvents,
		hasMedicationData,
	};
}

export function hasMedicationData(day: HealthDay): boolean {
	return getMedicationDaySummary(day).hasMedicationData;
}
