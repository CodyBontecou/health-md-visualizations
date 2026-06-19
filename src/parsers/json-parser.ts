import { HEALTHMD_HEALTH_DATA_SCHEMA, HEALTHMD_ROLLUP_SCHEMA, isUnitMap, schemaVersionOf } from "../healthmd-schema";
import { normalizeMedicationFields } from "../medication-utils";
import { HealthDay } from "../types";

export function parseJSON(content: string): HealthDay | null {
	try {
		const parsed = JSON.parse(content) as {
			type?: unknown;
			date?: unknown;
			schema?: unknown;
			schema_version?: unknown;
			unit_system?: unknown;
			units?: unknown;
		} & Partial<HealthDay>;

		if (parsed.schema === HEALTHMD_ROLLUP_SCHEMA || parsed.type === "health_rollup") return null;
		if (parsed.type !== "health-data" || !parsed.date) return null;
		if (typeof parsed.schema === "string" && parsed.schema !== HEALTHMD_HEALTH_DATA_SCHEMA) return null;

		const day = { ...parsed } as HealthDay;
		if (typeof parsed.schema === "string") day.schema = parsed.schema;
		const schemaVersion = schemaVersionOf(parsed);
		if (schemaVersion > 0) {
			day.schemaVersion = schemaVersion;
			day.schema_version = schemaVersion;
		}

		if (typeof parsed.unit_system === "string") {
			day.unitSystem = parsed.unit_system;
			day.unit_system = parsed.unit_system;
		} else if (day.schema === HEALTHMD_HEALTH_DATA_SCHEMA && schemaVersion >= 1) {
			day.unitSystem = "metric";
			day.unit_system = "metric";
		}

		if (isUnitMap(parsed.units)) {
			day.units = parsed.units;
		}

		Object.assign(day, normalizeMedicationFields(parsed as Record<string, unknown>));

		return day;
	} catch {
		return null;
	}
}
