import { HealthDay, HitRegistry, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { hexToRgba, formatDate, formatDuration } from "../canvas-utils";
import { renderStatBoxes } from "../dom-utils";

interface Night {
	date: string;
	day: HealthDay;
	bedMs: number;
	wakeMs: number;
	totalSeconds: number;
}

type SleepWithTiming = NonNullable<HealthDay["sleep"]> & {
	bedtimeISO?: string;
	wakeTimeISO?: string;
	sessionStart?: string;
	sessionEnd?: string;
};

interface ClockTime {
	h: number;
	m: number;
	s: number;
}

const DAY_MS = 86400000;

function parseWindow(str: string): { h: number; m: number } {
	const clock = parseClockTime(str);
	if (!clock) return { h: 0, m: 0 };
	return { h: clock.h, m: clock.m };
}

function parseClockTime(raw: string | undefined): ClockTime | null {
	const value = raw?.trim();
	if (!value) return null;

	let m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
	if (m) {
		const h = Number(m[1]);
		const min = Number(m[2]);
		const sec = Number(m[3] ?? 0);
		if (h <= 23 && min <= 59 && sec <= 59) return { h, m: min, s: sec };
		return null;
	}

	m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i.exec(value);
	if (m) {
		let h = Number(m[1]);
		const min = Number(m[2]);
		const sec = Number(m[3] ?? 0);
		if (h < 1 || h > 12 || min > 59 || sec > 59) return null;
		const meridiem = m[4].toLowerCase();
		if (meridiem === "p" && h !== 12) h += 12;
		if (meridiem === "a" && h === 12) h = 0;
		return { h, m: min, s: sec };
	}

	return null;
}

function clockMsOnDate(dateIso: string, clock: ClockTime): number {
	return new Date(
		`${dateIso}T${String(clock.h).padStart(2, "0")}:${String(clock.m).padStart(2, "0")}:${String(clock.s).padStart(2, "0")}`
	).getTime();
}

function parseAbsoluteMs(raw: string | undefined): number {
	if (!raw?.trim()) return NaN;
	return Date.parse(raw.trim());
}

function resolveExplicitBedWake(night: HealthDay, sleep: SleepWithTiming): { bedMs: number; wakeMs: number } | null {
	const bedRaw = sleep.bedtimeISO ?? sleep.sessionStart ?? sleep.bedtime;
	const wakeRaw = sleep.wakeTimeISO ?? sleep.sessionEnd ?? sleep.wakeTime;
	if (!bedRaw || !wakeRaw) return null;

	const bedClock = parseClockTime(bedRaw);
	const wakeClock = parseClockTime(wakeRaw);
	let bedMs = bedClock ? clockMsOnDate(night.date, bedClock) : parseAbsoluteMs(bedRaw);
	let wakeMs = wakeClock ? clockMsOnDate(night.date, wakeClock) : parseAbsoluteMs(wakeRaw);

	if (!isFinite(bedMs) || !isFinite(wakeMs)) return null;
	if (wakeMs <= bedMs && (bedClock || wakeClock)) wakeMs += DAY_MS;
	if (wakeMs <= bedMs) return null;
	return { bedMs, wakeMs };
}

function resolveStageBedWake(sleep: SleepWithTiming): { bedMs: number; wakeMs: number } | null {
	const stages = sleep.sleepStages ?? [];
	let bedMs = Infinity;
	let wakeMs = -Infinity;

	for (const stage of stages) {
		const startMs = Date.parse(stage.startDate);
		const endMs = Date.parse(stage.endDate);
		if (isFinite(startMs) && startMs < bedMs) bedMs = startMs;
		if (isFinite(endMs) && endMs > wakeMs) wakeMs = endMs;
	}

	if (!isFinite(bedMs) || !isFinite(wakeMs) || wakeMs <= bedMs) return null;
	return { bedMs, wakeMs };
}

function resolveBedWake(night: HealthDay): { bedMs: number; wakeMs: number } | null {
	const sleep = night.sleep;
	if (!sleep) return null;
	return resolveExplicitBedWake(night, sleep) ?? resolveStageBedWake(sleep);
}

function formatHour(ms: number): string {
	return new Date(ms).toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
	});
}

function hourLabel(h: number): string {
	const hr = ((h % 24) + 24) % 24;
	if (hr === 0) return "12A";
	if (hr === 12) return "12P";
	if (hr < 12) return `${hr}A`;
	return `${hr - 12}P`;
}

export const renderSleepSchedule: RenderFn = (
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	W: number,
	H: number,
	config: VizConfig,
	theme: ResolvedTheme,
	statsEl: HTMLElement,
	hits: HitRegistry
): void => {
	const canvas = ctx.canvas;
	const sleepGoalHours = Number(config.sleepGoal) || 8;
	const windowStart = parseWindow(String(config.windowStart || "18:00"));
	const windowEnd = parseWindow(String(config.windowEnd || "10:00"));

	// Window spans from (start hour) on night date → (end hour) on next day.
	// Total duration in ms, and a helper that converts an absolute ms into a fraction [0..1] of the window.
	const nights: Night[] = [];
	for (const d of data) {
		if (!d.sleep) continue;
		const stageCount = d.sleep.sleepStages?.length ?? 0;
		const totalDuration = d.sleep.totalDuration ?? 0;
		if (!(stageCount > 0 || totalDuration > 0)) continue;
		const bw = resolveBedWake(d);
		if (!bw) continue;
		nights.push({
			date: d.date,
			day: d,
			bedMs: bw.bedMs,
			wakeMs: bw.wakeMs,
			totalSeconds: totalDuration || (bw.wakeMs - bw.bedMs) / 1000,
		});
	}

	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);

	if (!nights.length) {
		ctx.fillStyle = theme.muted;
		ctx.textAlign = "center";
		ctx.font = "12px sans-serif";
		ctx.fillText("No sleep schedule data", W / 2, H / 2 - 8);
		ctx.font = "10px sans-serif";
		ctx.fillText("Requires bedtime/wake or stage timestamps", W / 2, H / 2 + 10);
		return;
	}

	const rowH = 26;
	const rowGap = 6;
	const padT = 10;
	const axisH = 20;
	const gutterW = 104;
	const rightPad = 16;
	const barAreaX = gutterW;
	const barAreaW = W - gutterW - rightPad;

	const neededH = padT + nights.length * (rowH + rowGap) + axisH + 8;
	if (neededH !== H) {
		const dpr = activeWindow.devicePixelRatio || 1;
		canvas.width = W * dpr;
		canvas.height = neededH * dpr;
		canvas.style.width = W + "px";
		canvas.style.height = neededH + "px";
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.scale(dpr, dpr);
		ctx.fillStyle = theme.bg;
		ctx.fillRect(0, 0, W, neededH);
	}

	// Window math per night
	function windowBoundsFor(dateIso: string): { startMs: number; endMs: number } {
		const startMs = new Date(`${dateIso}T${String(windowStart.h).padStart(2, "0")}:${String(windowStart.m).padStart(2, "0")}:00`).getTime();
		// End at next day's windowEnd
		const base = new Date(`${dateIso}T00:00:00`).getTime();
		let endMs = base + 86400000 + windowEnd.h * 3600000 + windowEnd.m * 60000;
		if (endMs <= startMs) endMs += 86400000;
		return { startMs, endMs };
	}

	// Draw x-axis hour labels (uniform because all rows share the same window shape)
	const sampleBounds = windowBoundsFor(nights[0].date);
	const windowSpan = sampleBounds.endMs - sampleBounds.startMs;
	const windowHours = windowSpan / 3600000;

	// Darkness gradient behind the bar area (approximate sunset→night→sunrise)
	const plotTop = padT;
	const plotH = nights.length * (rowH + rowGap) - rowGap;
	const bgGrad = ctx.createLinearGradient(barAreaX, 0, barAreaX + barAreaW, 0);
	// sunset (warm) → deep night → sunrise (light)
	const cSunset = theme.isDark ? "#3a1a3a" : "#f5dccc";
	const cNight = theme.isDark ? "#0b0b22" : "#d6dbe8";
	const cSunrise = theme.isDark ? "#3a2a14" : "#fee7c8";
	bgGrad.addColorStop(0, cSunset);
	bgGrad.addColorStop(0.45, cNight);
	bgGrad.addColorStop(0.65, cNight);
	bgGrad.addColorStop(1, cSunrise);
	ctx.fillStyle = bgGrad;
	ctx.beginPath();
	ctx.roundRect(barAreaX, plotTop, barAreaW, plotH, 8);
	ctx.fill();

	// Hour grid lines
	ctx.strokeStyle = hexToRgba(theme.fg, 0.08);
	ctx.lineWidth = 1;
	const startHour = windowStart.h;
	const numTicks = Math.max(2, Math.round(windowHours / 2));
	for (let k = 0; k <= numTicks; k++) {
		const frac = k / numTicks;
		const x = barAreaX + frac * barAreaW;
		ctx.beginPath();
		ctx.moveTo(x, plotTop);
		ctx.lineTo(x, plotTop + plotH);
		ctx.stroke();
		const h = startHour + frac * windowHours;
		ctx.fillStyle = theme.muted;
		ctx.font = "9px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		ctx.fillText(hourLabel(h), x, plotTop + plotH + 4);
	}

	// Horizontal dashed goal line: draw a vertical span corresponding to sleepGoal hours,
	// anchored at the mean bedtime across the set for visual reference.
	const meanBedOffset =
		nights.reduce((s, nn) => {
			const wb = windowBoundsFor(nn.date);
			return s + (nn.bedMs - wb.startMs);
		}, 0) / nights.length;
	const goalSpan = sleepGoalHours * 3600000;
	const goalStartFrac = meanBedOffset / windowSpan;
	const goalEndFrac = (meanBedOffset + goalSpan) / windowSpan;
	if (goalEndFrac > 0 && goalStartFrac < 1) {
		const gx0 = barAreaX + Math.max(0, goalStartFrac) * barAreaW;
		const gx1 = barAreaX + Math.min(1, goalEndFrac) * barAreaW;
		ctx.save();
		ctx.strokeStyle = hexToRgba(theme.colors.sleep.rem, 0.8);
		ctx.lineWidth = 1;
		ctx.setLineDash([3, 3]);
		ctx.beginPath();
		ctx.moveTo(gx0, plotTop + plotH + 10);
		ctx.lineTo(gx1, plotTop + plotH + 10);
		ctx.stroke();
		ctx.restore();
		ctx.fillStyle = theme.colors.sleep.rem;
		ctx.font = "9px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		ctx.fillText(`goal ${sleepGoalHours}h`, (gx0 + gx1) / 2, plotTop + plotH + 14);
	}

	// Bars per night
	nights.forEach((n, i) => {
		const wb = windowBoundsFor(n.date);
		const y = padT + i * (rowH + rowGap);

		// Gutter label: weekday + date
		const d = new Date(n.date + "T00:00:00");
		const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
		const datepart = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
		ctx.fillStyle = theme.fg;
		ctx.font = "600 11px sans-serif";
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";
		ctx.fillText(weekday, 10, y + rowH / 2 - 6);
		ctx.fillStyle = theme.muted;
		ctx.font = "10px sans-serif";
		ctx.fillText(datepart, 10, y + rowH / 2 + 7);

		// Clamp bed/wake into the window
		const bedFrac = Math.max(0, Math.min(1, (n.bedMs - wb.startMs) / windowSpan));
		const wakeFrac = Math.max(0, Math.min(1, (n.wakeMs - wb.startMs) / windowSpan));
		if (wakeFrac <= bedFrac) return;

		const bx = barAreaX + bedFrac * barAreaW;
		const bw2 = (wakeFrac - bedFrac) * barAreaW;

		// Color by goal achievement: met goal = sleep.rem (purple); short = awake (muted); long = deep
		const sleptHours = n.totalSeconds / 3600;
		let barColor = theme.colors.sleep.core;
		if (sleptHours >= sleepGoalHours * 0.95 && sleptHours <= sleepGoalHours * 1.15) {
			barColor = theme.colors.sleep.rem;
		} else if (sleptHours < sleepGoalHours * 0.85) {
			barColor = theme.colors.sleep.awake;
		} else {
			barColor = theme.colors.sleep.deep;
		}

		// Outer "in bed" band
		ctx.fillStyle = hexToRgba(barColor, 0.45);
		ctx.beginPath();
		ctx.roundRect(bx, y + 3, bw2, rowH - 6, 4);
		ctx.fill();

		// Inner "asleep" band, proportional to totalDuration / (wake - bed)
		const bedWindowSec = (n.wakeMs - n.bedMs) / 1000;
		const asleepFrac = bedWindowSec > 0 ? Math.min(1, n.totalSeconds / bedWindowSec) : 1;
		if (asleepFrac < 1 && asleepFrac > 0) {
			const innerW = bw2 * asleepFrac;
			ctx.fillStyle = barColor;
			ctx.beginPath();
			ctx.roundRect(bx, y + 6, innerW, rowH - 12, 3);
			ctx.fill();
		} else {
			ctx.fillStyle = barColor;
			ctx.beginPath();
			ctx.roundRect(bx, y + 6, bw2, rowH - 12, 3);
			ctx.fill();
		}

		hits.add({
			shape: "rect",
			x: bx,
			y: y,
			w: bw2,
			h: rowH,
			title: formatDate(n.date),
			details: [
				{ label: "Bedtime", value: formatHour(n.bedMs) },
				{ label: "Wake", value: formatHour(n.wakeMs) },
				{ label: "Total sleep", value: formatDuration(n.totalSeconds) },
				{ label: "Goal", value: `${sleepGoalHours}h` },
			],
			payload: n.day,
		});
	});

	// Stats: average bedtime, average wake, schedule consistency (stdev of bedtime offset)
	const bedOffsets = nights.map((n) => {
		const wb = windowBoundsFor(n.date);
		return (n.bedMs - wb.startMs) / 3600000; // hours from windowStart
	});
	const wakeOffsets = nights.map((n) => {
		const wb = windowBoundsFor(n.date);
		return (n.wakeMs - wb.startMs) / 3600000;
	});
	const meanBedH = bedOffsets.reduce((s, v) => s + v, 0) / bedOffsets.length;
	const meanWakeH = wakeOffsets.reduce((s, v) => s + v, 0) / wakeOffsets.length;
	const variance =
		bedOffsets.reduce((s, v) => s + (v - meanBedH) ** 2, 0) / bedOffsets.length;
	const stdev = Math.sqrt(variance);

	function offsetToHourStr(offsetH: number): string {
		const abs = new Date(windowBoundsFor(nights[0].date).startMs + offsetH * 3600000);
		return abs.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
	}

	const consistencyLabel =
		stdev < 0.5 ? "Very consistent" : stdev < 1 ? "Consistent" : stdev < 2 ? "Variable" : "Irregular";
	renderStatBoxes(statsEl, [
		{ value: offsetToHourStr(meanBedH), label: "Avg bedtime" },
		{ value: offsetToHourStr(meanWakeH), label: "Avg wake" },
		{ value: consistencyLabel, label: `±${stdev.toFixed(1)}h stdev` },
	]);
};
