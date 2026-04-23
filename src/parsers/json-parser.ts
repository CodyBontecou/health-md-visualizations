import { HealthDay } from "../types";

export function parseJSON(content: string): HealthDay | null {
	try {
		const parsed = JSON.parse(content) as { type?: unknown; date?: unknown } & Partial<HealthDay>;
		if (parsed.type === "health-data" && parsed.date) return parsed as HealthDay;
		return null;
	} catch {
		return null;
	}
}
