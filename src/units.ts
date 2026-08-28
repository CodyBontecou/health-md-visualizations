// Unit-system helpers shared by every visualization. Canonical Health.md data
// is metric (km, kg, m, °C); imperial display converts values at render time.

export type UnitSystem = "metric" | "imperial";

/** User-facing choice. "auto" follows the unit system declared by each export. */
export type UnitPreference = UnitSystem | "auto";

export const KM_PER_MI = 1.609344;
export const LB_PER_KG = 2.2046226218487757;
export const CM_PER_IN = 2.54;
export const FT_PER_M = 3.280839895013123;
export const MPH_PER_KMH = 0.621371192237334;
export const MPH_PER_MS = 2.2369362920544;

export function kmToMi(km: number): number {
	return km / KM_PER_MI;
}

export function miToKm(mi: number): number {
	return mi * KM_PER_MI;
}

export function kgToLb(kg: number): number {
	return kg * LB_PER_KG;
}

export function cmToIn(cm: number): number {
	return cm / CM_PER_IN;
}

export function mToFt(m: number): number {
	return m * FT_PER_M;
}

export function kmhToMph(kmh: number): number {
	return kmh * MPH_PER_KMH;
}

export function msToMph(ms: number): number {
	return ms * MPH_PER_MS;
}

export function celsiusToFahrenheit(c: number): number {
	return (c * 9) / 5 + 32;
}

/**
 * Normalizes a raw unit preference ("metric", "imperial", "auto", plus common
 * aliases) to an explicit UnitSystem. Returns undefined for "auto", blanks, and
 * unrecognized values so callers can fall back to per-day or default behavior.
 */
export function normalizeUnitPreference(value: unknown): UnitSystem | undefined {
	if (typeof value !== "string") return undefined;
	switch (value.trim().toLowerCase()) {
		case "metric":
		case "si":
			return "metric";
		case "imperial":
		case "us":
		case "usa":
			return "imperial";
		case "auto":
		case "data":
		case "":
			return undefined;
		default:
			return undefined;
	}
}

/** Effective display system for canonical (metric) aggregates; metric by default. */
export function effectiveUnitSystem(preference?: UnitSystem): UnitSystem {
	return preference ?? "metric";
}

/** Formats a distance value already expressed in the target system's unit. */
export function formatDistanceValue(value: number, system: UnitSystem): string {
	const suffix = system === "imperial" ? "mi" : "km";
	return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${suffix}`;
}

/** Shared distance formatting for aggregate km values ("12.3 km" / "7.6 mi"). */
export function formatDistanceKm(km: number, system: UnitSystem): string {
	return formatDistanceValue(system === "imperial" ? kmToMi(km) : km, system);
}

/** Shared speed formatting for km/h values ("12.3 km/h" / "7.6 mph"). */
export function formatSpeedKmh(kmh: number, system: UnitSystem): string {
	return system === "imperial"
		? `${kmhToMph(kmh).toFixed(1)} mph`
		: `${kmh.toFixed(1)} km/h`;
}

export interface DisplayValue {
	value: number;
	unit: string;
}

// Canonical metric units with a well-defined imperial display equivalent.
// Keys are lowercased unit strings as they appear in Health.md exports.
const IMPERIAL_DISPLAY_CONVERSIONS: Record<string, (value: number) => DisplayValue> = {
	"kg": (value) => ({ value: kgToLb(value), unit: "lb" }),
	"cm": (value) => ({ value: cmToIn(value), unit: "in" }),
	"km": (value) => ({ value: kmToMi(value), unit: "mi" }),
	"m": (value) => ({ value: mToFt(value), unit: "ft" }),
	"m/s": (value) => ({ value: msToMph(value), unit: "mph" }),
	"km/h": (value) => ({ value: kmhToMph(value), unit: "mph" }),
	"°c": (value) => ({ value: celsiusToFahrenheit(value), unit: "°F" }),
};

/**
 * Converts a canonical metric value into display units. Metric values pass
 * through unchanged; imperial converts common mass/length/speed/temperature
 * units. Units without a conversion (percent, BPM, ms, …) are returned as-is.
 */
export function convertToDisplayUnit(value: number, unit: string, system: UnitSystem): DisplayValue {
	if (system !== "imperial") return { value, unit };
	const convert = IMPERIAL_DISPLAY_CONVERSIONS[unit.trim().toLowerCase()];
	return convert ? convert(value) : { value, unit };
}
