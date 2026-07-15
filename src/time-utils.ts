export function parseHour(timestamp: string | undefined, fallbackDate?: string): number | undefined {
	if (!timestamp) return undefined;
	const trimmed = timestamp.trim();
	const timeOnly = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(trimmed);
	const dateTime = /T(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(trimmed);
	const match = dateTime ?? timeOnly;
	if (!match) {
		if (fallbackDate && trimmed === fallbackDate) return 12;
		return undefined;
	}
	let h = Number(match[1]);
	const m = Number(match[2]);
	const s = Number(match[3] ?? 0);
	const meridiem = match === timeOnly
		? /\s+([ap])\.?m\.?\s*$/i.exec(trimmed)?.[1]?.toLowerCase()
		: undefined;
	if (meridiem) {
		if (h < 1 || h > 12) return undefined;
		h = h % 12 + (meridiem === "p" ? 12 : 0);
	}
	if (h > 23 || m > 59 || s > 59) return undefined;
	return h + m / 60 + s / 3600;
}

export function formatClockTime(timestamp: string | undefined): string | undefined {
	const hour = parseHour(timestamp);
	if (hour === undefined) return undefined;

	// Anchor parsed clock components to a local date so time-only values do not
	// depend on the host's implementation of Date.parse.
	const totalMinutes = Math.floor(hour * 60 + 1e-7);
	const date = new Date(2000, 0, 1, Math.floor(totalMinutes / 60), totalMinutes % 60);
	return date.toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
	});
}
