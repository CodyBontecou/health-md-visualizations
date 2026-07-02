const DEFAULT_DYNAMIC_DATE_FORMAT = "YYYY-MM-DD";

const DYNAMIC_DATE_VARIABLE = /^\{\{\s*([A-Za-z][A-Za-z0-9_-]*)\s*(?::\s*([^{}]*?)\s*)?\}\}$/;
const FRONTMATTER_VARIABLE = /^(?:\{([^{}]+)\}|\$\{([^{}]+)\})$/;

const WEEKDAY_TO_ISO_DAY: Record<string, number> = {
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6,
	sunday: 7,
};

export const DYNAMIC_DATE_VARIABLE_HELP =
	"today, now, yesterday, tomorrow, monday-sunday, week-start/week-end, month-start/month-end, or year-start/year-end";

export type DynamicDateVariableResolution =
	| { matched: false }
	| { matched: true; value: string }
	| { matched: true; error: string };

function cloneDate(date: Date): Date {
	return new Date(date.getTime());
}

function validDate(date: Date): boolean {
	return Number.isFinite(date.getTime());
}

function startOfDay(date: Date): Date {
	const out = cloneDate(date);
	out.setHours(0, 0, 0, 0);
	return out;
}

function endOfDay(date: Date): Date {
	const out = cloneDate(date);
	out.setHours(23, 59, 59, 999);
	return out;
}

function addDays(date: Date, days: number): Date {
	const out = cloneDate(date);
	out.setDate(out.getDate() + days);
	return out;
}

function startOfIsoWeek(date: Date): Date {
	const out = startOfDay(date);
	const day = out.getDay();
	const diffToMonday = day === 0 ? -6 : 1 - day;
	return addDays(out, diffToMonday);
}

function startOfMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
	return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function startOfYear(date: Date): Date {
	return new Date(date.getFullYear(), 0, 1);
}

function endOfYear(date: Date): Date {
	return endOfDay(new Date(date.getFullYear(), 11, 31));
}

function resolveDateVariableDate(name: string, now: Date): Date | null {
	const normalized = name.trim().toLowerCase().replace(/_/g, "-");
	const weekday = WEEKDAY_TO_ISO_DAY[normalized];
	if (weekday !== undefined) return addDays(startOfIsoWeek(now), weekday - 1);

	switch (normalized) {
		case "now":
			return cloneDate(now);
		case "today":
			return startOfDay(now);
		case "yesterday":
			return addDays(startOfDay(now), -1);
		case "tomorrow":
			return addDays(startOfDay(now), 1);
		case "week-start":
		case "current-week-start":
		case "start-of-week":
		case "start-of-current-week":
			return startOfIsoWeek(now);
		case "week-end":
		case "current-week-end":
		case "end-of-week":
		case "end-of-current-week":
			return endOfDay(addDays(startOfIsoWeek(now), 6));
		case "month-start":
		case "current-month-start":
		case "start-of-month":
		case "start-of-current-month":
			return startOfMonth(now);
		case "month-end":
		case "current-month-end":
		case "end-of-month":
		case "end-of-current-month":
			return endOfMonth(now);
		case "year-start":
		case "current-year-start":
		case "start-of-year":
		case "start-of-current-year":
			return startOfYear(now);
		case "year-end":
		case "current-year-end":
		case "end-of-year":
		case "end-of-current-year":
			return endOfYear(now);
		default:
			return null;
	}
}

function pad(value: number, length = 2): string {
	return String(value).padStart(length, "0");
}

function timezoneOffset(date: Date): string {
	const offsetMinutes = -date.getTimezoneOffset();
	const sign = offsetMinutes >= 0 ? "+" : "-";
	const abs = Math.abs(offsetMinutes);
	return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function formatDynamicDate(date: Date, format: string): string {
	return format.replace(/YYYY|YY|MM|M|DD|D|HH|H|mm|m|ss|s|Z/g, (token) => {
		switch (token) {
			case "YYYY":
				return String(date.getFullYear());
			case "YY":
				return pad(date.getFullYear() % 100);
			case "MM":
				return pad(date.getMonth() + 1);
			case "M":
				return String(date.getMonth() + 1);
			case "DD":
				return pad(date.getDate());
			case "D":
				return String(date.getDate());
			case "HH":
				return pad(date.getHours());
			case "H":
				return String(date.getHours());
			case "mm":
				return pad(date.getMinutes());
			case "m":
				return String(date.getMinutes());
			case "ss":
				return pad(date.getSeconds());
			case "s":
				return String(date.getSeconds());
			case "Z":
				return timezoneOffset(date);
			default:
				return token;
		}
	});
}

export function resolveDynamicDateVariable(
	raw: string,
	now = new Date()
): DynamicDateVariableResolution {
	const match = DYNAMIC_DATE_VARIABLE.exec(raw.trim());
	if (!match) return { matched: false };

	const referenceDate = cloneDate(now);
	if (!validDate(referenceDate)) {
		return { matched: true, error: "Invalid reference date for dynamic date variable." };
	}

	const name = match[1];
	const date = resolveDateVariableDate(name, referenceDate);
	if (!date) {
		return {
			matched: true,
			error: `Unknown dynamic date variable "${name}". Use ${DYNAMIC_DATE_VARIABLE_HELP}.`,
		};
	}

	const format = match[2]?.trim() || DEFAULT_DYNAMIC_DATE_FORMAT;
	return { matched: true, value: formatDynamicDate(date, format) };
}

export function parseFrontmatterVariableReference(raw: string): string | null {
	const match = FRONTMATTER_VARIABLE.exec(raw.trim());
	if (!match) return null;
	const variable = (match[1] ?? match[2] ?? "").trim();
	return variable || null;
}
