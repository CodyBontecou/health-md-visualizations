import type { HealthDay, HitRegionDetail, RenderFn, ResolvedTheme } from "../types";
import { formatDate, formatDuration, hexToRgba } from "../canvas-utils";
import { renderStatBoxes } from "../dom-utils";
import { whoopForDay } from "../whoop-data";
import type { WhoopRecord } from "../whoop-types";
import {
	WHOOP_SLEEP_NEED_COMPONENTS, whoopCoverage, whoopIsScored, whoopRecoveryPairs,
	whoopSleepEntries, whoopSleepLabel, whoopSleepNeed, whoopWorkoutElapsed, whoopWorkoutEntries, whoopWorkoutZones,
} from "../whoop-viz-utils";

const SCORE_SERIES = [
	{ key: "sleep_performance_percent", label: "Performance", color: "#5b8ff9" },
	{ key: "sleep_consistency_percent", label: "Consistency", color: "#9270ca" },
	{ key: "sleep_efficiency_percent", label: "Efficiency", color: "#61d9a5" },
] as const;
const ZONE_COLORS = ["#9aa0ac", "#5b8ff9", "#61d9a5", "#f6bd16", "#e8684a", "#9270ca"];
const HOUR_MS = 3_600_000;

function limit(value: string | number | undefined, fallback: number, maximum = 365): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.min(maximum, Math.floor(parsed) || 1) : fallback;
}
function prepare(ctx: CanvasRenderingContext2D, W: number, H: number, minimum: number, theme: ResolvedTheme, stats: HTMLElement): number {
	if (H < minimum) {
		const dpr = typeof activeWindow === "undefined" ? 1 : activeWindow.devicePixelRatio || 1;
		ctx.canvas.width = W * dpr;
		ctx.canvas.height = minimum * dpr;
		ctx.canvas.style.width = `${W}px`;
		ctx.canvas.style.height = `${minimum}px`;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.scale(dpr, dpr);
		H = minimum;
	}
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	stats.empty();
	return H;
}
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color: string, align: CanvasTextAlign = "left", width?: number): void {
	ctx.fillStyle = color;
	ctx.font = "10px sans-serif";
	ctx.textAlign = align;
	ctx.textBaseline = "middle";
	if (width !== undefined) ctx.fillText(value, x, y, Math.max(1, width));
	else ctx.fillText(value, x, y);
}
function note(stats: HTMLElement, data: HealthDay[], extra?: string): void {
	stats.createDiv({ cls: "health-md-whoop-note", text: [extra, whoopCoverage(data)].filter(Boolean).join(" · ") });
}
function empty(ctx: CanvasRenderingContext2D, W: number, H: number, theme: ResolvedTheme, stats: HTMLElement, data: HealthDay[], message: string): void {
	text(ctx, message, W / 2, H / 2, theme.muted, "center", W - 24);
	note(stats, data);
}
function details(day: HealthDay, record: WhoopRecord): HitRegionDetail[] {
	return [
		{ label: "Source", value: "WHOOP" },
		{ label: "Capture", value: whoopForDay(day)?.captureStatus ?? "Unavailable" },
		...(record.id ? [{ label: "Provider ID", value: record.id }] : []),
		...(record.score_state ? [{ label: "Score state", value: record.score_state }] : []),
		...(record.start_time ? [{ label: "Start", value: record.start_time }] : []),
		...(record.end_time ? [{ label: "End", value: record.end_time }] : []),
		...(record.projection ? [{ label: "Fidelity", value: "Single-record scalar projection; identity/timing unavailable" }] : []),
	];
}
function grid(ctx: CanvasRenderingContext2D, W: number, top: number, bottom: number, left: number, right: number, max: number, theme: ResolvedTheme, suffix: string): void {
	for (let i = 0; i <= 4; i++) {
		const y = bottom - i / 4 * (bottom - top);
		ctx.strokeStyle = hexToRgba(theme.fg, 0.1);
		ctx.lineWidth = 1;
		ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(W - right, y); ctx.stroke();
		text(ctx, `${Number((max * i / 4).toFixed(1))}${suffix}`, left - 5, y, theme.muted, "right");
	}
}
function dateLabels(ctx: CanvasRenderingContext2D, dates: string[], x: (index: number) => number, y: number, theme: ResolvedTheme, W: number): void {
	const step = Math.max(1, Math.ceil(dates.length / Math.max(2, Math.floor(W / 80))));
	dates.forEach((date, index) => {
		if (index % step === 0 || index === dates.length - 1) text(ctx, date.slice(5), x(index), y, theme.muted, "center");
	});
}
function legend(ctx: CanvasRenderingContext2D, items: Array<{ label: string; color: string }>, W: number, y: number, theme: ResolvedTheme): void {
	const cols = W < 440 ? 3 : items.length;
	const colW = (W - 36) / cols;
	items.forEach((item, i) => {
		const x = 18 + (i % cols) * colW;
		const rowY = y + Math.floor(i / cols) * 16;
		ctx.fillStyle = item.color; ctx.fillRect(x, rowY - 3, 7, 7);
		text(ctx, item.label, x + 11, rowY, theme.muted, "left", colW - 16);
	});
}

/** Same-cycle scatter, not a causal or previous-day training recommendation. */
export const renderWhoopRecoveryStrain: RenderFn = (ctx, data, W, H, config, theme, stats, hits): void => {
	H = prepare(ctx, W, H, 220, theme, stats);
	const allPairs = whoopRecoveryPairs(data);
	const pairs = allPairs.slice(-limit(config.limit, 2000, 10_000));
	if (!pairs.length) return empty(ctx, W, H, theme, stats, data, "No scored WHOOP recovery / cycle-strain pairs");
	const left = 44, right = 18, top = 36, bottom = H - 42;
	text(ctx, "WHOOP recovery (%)", left, 15, theme.fg);
	grid(ctx, W, top, bottom, left, right, 100, theme, "%");
	const x = (strain: number): number => left + strain / 21 * Math.max(1, W - left - right);
	const y = (score: number): number => bottom - score / 100 * (bottom - top);
	[0, 7, 14, 21].forEach((value) => text(ctx, String(value), x(value), bottom + 13, theme.muted, "center"));
	text(ctx, "Cycle strain (0–21)", W / 2, H - 9, theme.muted, "center");
	pairs.forEach((pair) => {
		ctx.fillStyle = hexToRgba(theme.colors.accent, pair.recovery.user_calibrating ? 0.4 : 0.8);
		ctx.beginPath(); ctx.arc(x(pair.strain), y(pair.score), 5, 0, Math.PI * 2); ctx.fill();
		hits.add({ shape: "circle", cx: x(pair.strain), cy: y(pair.score), r: 8,
			title: `${formatDate(pair.day.date)} · WHOOP recovery`, payload: pair.day,
			details: [
				{ label: "Recovery", value: `${pair.score}%` }, { label: "Cycle strain", value: `${pair.strain} / 21` },
				...(pair.recovery.cycle_id ? [{ label: "Cycle ID", value: pair.recovery.cycle_id }] : []),
				...(pair.recovery.sleep_id ? [{ label: "Sleep ID", value: pair.recovery.sleep_id }] : []),
				...(pair.recovery.hrv_rmssd_ms !== undefined ? [{ label: "HRV (RMSSD)", value: `${pair.recovery.hrv_rmssd_ms} ms` }] : []),
				...(pair.recovery.user_calibrating !== undefined ? [{ label: "Calibrating", value: pair.recovery.user_calibrating ? "Yes" : "No" }] : []),
				...details(pair.day, pair.recovery),
			],
		});
	});
	const recoveries = data.reduce((sum, day) => sum + (whoopForDay(day)?.recoveries.length ?? 0), 0);
	renderStatBoxes(stats, [
		{ label: "Same-cycle pairs", value: String(pairs.length) },
		{ label: "Unpaired / unscored", value: String(recoveries - allPairs.length) },
	]);
	note(stats, data, `${allPairs.length} pairs in selection · Same-cycle association only; strain is not summed or averaged`);
};

/** Per-session achieved sleep beside positive need components and a signed subtractive nap adjustment. */
export const renderWhoopSleepNeed: RenderFn = (ctx, data, W, H, config, theme, stats, hits): void => {
	H = prepare(ctx, W, H, 260, theme, stats);
	const all = whoopSleepEntries(data, String(config.sleep ?? "all"));
	const entries = all.slice(-limit(config.limit, 30)).filter(({ sleep }) => whoopIsScored(sleep) &&
		[sleep.total_sleep_milliseconds, ...WHOOP_SLEEP_NEED_COMPONENTS.map(({ key }) => sleep[key])].some((value) => value !== undefined));
	if (!entries.length) return empty(ctx, W, H, theme, stats, data, "No scored WHOOP sleep duration or need components");
	legend(ctx, [...WHOOP_SLEEP_NEED_COMPONENTS, { label: "Achieved", color: theme.colors.secondary }], W, 16, theme);
	const top = W < 440 ? 58 : 42, left = 42, right = 16, bottom = H - 48;
	const positive = (sleep: typeof entries[number]["sleep"]): number => WHOOP_SLEEP_NEED_COMPONENTS.slice(0, 3).reduce((sum, { key }) => sum + (sleep[key] ?? 0), 0);
	const max = Math.max(1, ...entries.map(({ sleep }) => Math.max(positive(sleep), sleep.total_sleep_milliseconds ?? 0) / HOUR_MS));
	const maxHours = Math.ceil(max);
	grid(ctx, W, top, bottom, left, right, maxHours, theme, "h");
	const slot = Math.max(1, W - left - right) / entries.length;
	const bar = Math.max(0.5, Math.min(22, slot * 0.3));
	const y = (ms: number): number => bottom - ms / HOUR_MS / maxHours * (bottom - top);
	entries.forEach(({ day, sleep }, index) => {
		const center = left + (index + 0.5) * slot;
		let sum = 0;
		for (const component of WHOOP_SLEEP_NEED_COMPONENTS.slice(0, 3)) {
			const value = sleep[component.key];
			if (value === undefined) continue;
			ctx.fillStyle = component.color;
			ctx.fillRect(center - bar - 1, y(sum + value), bar, Math.max(0, y(sum) - y(sum + value)));
			sum += value;
		}
		const need = whoopSleepNeed(sleep);
		if (need !== undefined) {
			// A negative adjustment cuts DOWN from the positive stack; it is never made a positive credit.
			const adjustment = sleep.recent_nap_adjustment_milliseconds!;
			if (adjustment < 0) {
				ctx.fillStyle = hexToRgba("#9270ca", 0.65);
				ctx.fillRect(center - bar - 1, y(sum), bar, Math.max(0, y(need) - y(sum)));
			}
			ctx.strokeStyle = theme.fg; ctx.lineWidth = 2;
			ctx.beginPath(); ctx.moveTo(center - bar - 3, y(need)); ctx.lineTo(center + 1, y(need)); ctx.stroke();
		}
		if (sleep.total_sleep_milliseconds !== undefined) {
			ctx.fillStyle = theme.colors.secondary;
			ctx.fillRect(center + 2, y(sleep.total_sleep_milliseconds), bar, Math.max(0, bottom - y(sleep.total_sleep_milliseconds)));
		}
		hits.add({ shape: "rect", x: center - slot / 2, y: top, w: slot, h: bottom - top,
			title: `${formatDate(day.date)} · ${whoopSleepLabel(sleep)}`, payload: day,
			details: [
				{ label: "Achieved", value: sleep.total_sleep_milliseconds === undefined ? "Unavailable" : formatDuration(sleep.total_sleep_milliseconds / 1000) },
				...WHOOP_SLEEP_NEED_COMPONENTS.map(({ key, label }) => ({ label, value: sleep[key] === undefined ? "Unavailable" : `${sleep[key] < 0 ? "−" : ""}${formatDuration(Math.abs(sleep[key]) / 1000)} (${sleep[key]} ms)` })),
				{ label: "Need (component sum)", value: need === undefined ? "Unavailable — incomplete or invalid components" : formatDuration(need / 1000) },
				...(sleep.cycle_id ? [{ label: "Cycle ID", value: sleep.cycle_id }] : []), ...details(day, sleep),
			],
		});
	});
	dateLabels(ctx, entries.map(({ day }) => day.date), (i) => left + (i + 0.5) * slot, bottom + 16, theme, W);
	text(ctx, "Need stack / achieved · marker = net need", W / 2, H - 10, theme.muted, "center", W - 24);
	renderStatBoxes(stats, [
		{ label: "Sessions shown", value: String(entries.length) },
		{ label: "Complete need components", value: String(entries.filter(({ sleep }) => whoopSleepNeed(sleep) !== undefined).length) },
	]);
	note(stats, data, `Per-session totals, not stage timelines · ${all.length} sessions in selection · Incomplete need stacks are partial, not zero-filled`);
};

/** Provider-reported percentages; no ratios or scores are inferred from durations. */
export const renderWhoopSleepTrends: RenderFn = (ctx, data, W, H, config, theme, stats, hits): void => {
	H = prepare(ctx, W, H, 220, theme, stats);
	const entries = whoopSleepEntries(data, String(config.sleep ?? "all")).slice(-limit(config.limit, 180, 2000));
	if (!entries.some(({ sleep }) => whoopIsScored(sleep) && SCORE_SERIES.some(({ key }) => sleep[key] !== undefined))) {
		return empty(ctx, W, H, theme, stats, data, "No WHOOP sleep assessment percentages");
	}
	legend(ctx, [...SCORE_SERIES], W, 16, theme);
	const left = 42, right = 16, top = 40, bottom = H - 30;
	grid(ctx, W, top, bottom, left, right, 100, theme, "%");
	const x = (index: number): number => left + (entries.length === 1 ? 0.5 : index / (entries.length - 1)) * Math.max(1, W - left - right);
	const y = (value: number): number => bottom - value / 100 * (bottom - top);
	for (const series of SCORE_SERIES) {
		let previous: { index: number; value: number; date: string } | undefined;
		entries.forEach(({ day, sleep }, index) => {
			const value = whoopIsScored(sleep) ? sleep[series.key] : undefined;
			if (value === undefined) { previous = undefined; return; }
			ctx.strokeStyle = series.color; ctx.lineWidth = 1.6;
			const gap = previous ? Date.parse(`${day.date}T00:00:00Z`) - Date.parse(`${previous.date}T00:00:00Z`) : 0;
			if (previous && gap <= 86_400_000) {
				ctx.beginPath(); ctx.moveTo(x(previous.index), y(previous.value)); ctx.lineTo(x(index), y(value)); ctx.stroke();
			}
			ctx.fillStyle = series.color;
			ctx.beginPath(); ctx.arc(x(index), y(value), 3, 0, Math.PI * 2); ctx.fill();
			hits.add({ shape: "circle", cx: x(index), cy: y(value), r: 7,
				title: `${formatDate(day.date)} · ${whoopSleepLabel(sleep)}`, payload: day,
				details: [{ label: series.label, value: `${value}%` }, ...details(day, sleep)],
			});
			previous = { index, value, date: day.date };
		});
	}
	dateLabels(ctx, entries.map(({ day }) => day.date), x, bottom + 16, theme, W);
	renderStatBoxes(stats, SCORE_SERIES.map((series) => {
		const latest = [...entries].reverse().find(({ sleep }) => whoopIsScored(sleep) && sleep[series.key] !== undefined);
		return { label: `Latest ${series.label.toLowerCase()}`, value: latest ? `${latest.sleep[series.key]}%` : "Unavailable", color: series.color };
	}));
	note(stats, data, `Provider-reported percentages · ${entries.length} sessions shown · Lines break at missing scores and calendar gaps`);
};

/** Separate workout strain and six provider-reported zone shares, with original durations in tooltips. */
export const renderWhoopWorkoutStrain: RenderFn = (ctx, data, W, H, config, theme, stats, hits): void => {
	const all = whoopWorkoutEntries(data).filter(({ day }) => config.date === undefined || day.date === String(config.date));
	const entries = all.slice(-limit(config.limit, 12, 50));
	H = prepare(ctx, W, H, Math.max(200, 86 + entries.length * 44), theme, stats);
	if (!entries.length) return empty(ctx, W, H, theme, stats, data, "No WHOOP workouts in selection");
	legend(ctx, ZONE_COLORS.map((color, i) => ({ label: `WHOOP Z${i}`, color })), W, 13, theme);
	const labelW = Math.min(140, W * 0.27), strainX = labelW + 8, strainW = Math.max(26, W * 0.2);
	const zoneX = strainX + strainW + 16, zoneW = Math.max(1, W - zoneX - 16);
	const top = W < 440 ? 68 : 52;
	text(ctx, "Strain / 21", strainX, top - 12, theme.muted, "left", strainW);
	text(ctx, "Reported zone share", zoneX, top - 12, theme.muted, "left", zoneW);
	entries.forEach(({ day, workout }, index) => {
		const y = top + index * 44;
		text(ctx, workout.sport_name ?? "Workout", 12, y + 8, theme.fg, "left", labelW - 16);
		text(ctx, day.date, 12, y + 23, theme.muted, "left", labelW - 16);
		const strain = whoopIsScored(workout) ? workout.strain_score : undefined;
		const zones = whoopWorkoutZones(workout);
		const total = zones.reduce((sum, zone) => sum + zone.milliseconds, 0);
		ctx.fillStyle = hexToRgba(theme.fg, 0.08); ctx.fillRect(strainX, y, strainW, 15);
		if (strain !== undefined) {
			ctx.fillStyle = theme.colors.accent; ctx.fillRect(strainX, y, strainW * strain / 21, 15);
		}
		text(ctx, strain === undefined ? "Unscored / missing" : String(strain), strainX, y + 25, theme.muted, "left", strainW);
		const elapsed = whoopWorkoutElapsed(workout);
		const rowDetails: HitRegionDetail[] = [
			{ label: "Strain", value: strain === undefined ? "Unavailable" : `${strain} / 21` },
			{ label: "Elapsed", value: elapsed === undefined ? "Unavailable" : formatDuration(elapsed / 1000) },
			{ label: "Recording coverage", value: workout.percent_recorded === undefined ? "Unavailable" : `${workout.percent_recorded}%` },
			{ label: "Reported zone time", value: zones.length ? formatDuration(total / 1000) : "Unavailable" },
			{ label: "Zones reported", value: `${zones.length} / 6 (missing zones are not zero)` },
			...details(day, workout),
		];
		hits.add({ shape: "rect", x: 8, y: y - 4, w: Math.max(1, W - 16), h: 40,
			title: `${formatDate(day.date)} · ${workout.sport_name ?? "WHOOP workout"}`, payload: day, details: rowDetails });
		if (total > 0) {
			let x = zoneX;
			for (const zone of zones) {
				const width = zoneW * zone.milliseconds / total;
				ctx.fillStyle = ZONE_COLORS[zone.index]; ctx.fillRect(x, y, width, 15);
				if (width > 22) text(ctx, `Z${zone.index}`, x + width / 2, y + 8, theme.bg, "center");
				if (width > 0) hits.add({ shape: "rect", x, y, w: width, h: 15,
					title: `WHOOP zone ${zone.index}`, payload: day,
					details: [{ label: "Duration", value: `${formatDuration(zone.milliseconds / 1000)} (${zone.milliseconds} ms)` },
						{ label: "Share of reported zones", value: `${(zone.milliseconds / total * 100).toFixed(1)}%` }, ...rowDetails],
				});
				x += width;
			}
		} else text(ctx, zones.length ? "0 reported zone time" : "No zone data", zoneX, y + 8, theme.muted, "left", zoneW);
		text(ctx, workout.percent_recorded === undefined ? "Coverage unavailable" : `${workout.percent_recorded}% recorded`, zoneX, y + 25, theme.muted, "left", zoneW);
	});
	renderStatBoxes(stats, [
		{ label: "Workouts shown", value: String(entries.length) },
		{ label: "Scored strain", value: String(entries.filter(({ workout }) => whoopIsScored(workout) && workout.strain_score !== undefined).length) },
	]);
	note(stats, data, `${all.length} workouts in selection · Zone time is not elapsed duration · WHOOP zones are not Apple-derived zones · Strain is not additive`);
};
