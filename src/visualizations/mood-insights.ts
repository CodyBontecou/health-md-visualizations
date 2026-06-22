import { RenderFn } from "../types";
import { formatDate, formatDuration, hexToRgba, lerp } from "../canvas-utils";
import { renderInlineStats, renderStatBoxes } from "../dom-utils";
import { formatMoodValence, moodLabelForValence } from "../mood-utils";
import {
	addDays,
	aggregate,
	average,
	bucketAverage,
	clamp,
	collectMoodDays,
	collectMoodEntries,
	configNumber,
	configString,
	dateToUtc,
	detailsForEntry,
	drawTitle,
	drawValenceGrid,
	emptyState,
	entryLabels,
	isoDate,
	moodDaysWithValues,
	moodHex,
	moodRgba,
	normalizeKind,
	parseHour,
	shortDate,
	valencePercent,
	yForValence,
} from "../mood-viz-utils";

export const renderMoodCalendarHeatmap: RenderFn = (ctx, data, W, H, config, theme, statsEl, hits): void => {
	const days = moodDaysWithValues(data);
	if (!days.length) return emptyState(ctx, W, H, theme, statsEl);
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);

	const first = days[0].date;
	const last = days[days.length - 1].date;
	const start = dateToUtc(first);
	start.setUTCDate(start.getUTCDate() - start.getUTCDay());
	const end = dateToUtc(last);
	end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
	const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
	const weeks = Math.ceil(totalDays / 7);
	const padL = 44;
	const padR = 18;
	const padT = 58;
	const padB = 24;
	const slotW = (W - padL - padR) / weeks;
	const slotH = (H - padT - padB) / 7;
	const cell = Math.max(3, Math.min(slotW, slotH) - 3);
	const byDate = new Map(days.map((day) => [day.date, day]));
	const avg = average(days.map((day) => day.averageValence!).filter(Number.isFinite)) ?? 0;
	drawTitle(ctx, theme, "Mood calendar", `${formatDate(first)} – ${formatDate(last)} • ${days.length} logged days`);

	ctx.font = "10px sans-serif";
	ctx.fillStyle = theme.muted;
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((label, i) => ctx.fillText(label, padL - 8, padT + i * slotH + slotH / 2));

	let previousMonth = "";
	for (let i = 0; i < totalDays; i++) {
		const date = addDays(isoDate(start), i);
		const d = dateToUtc(date);
		const week = Math.floor(i / 7);
		const dow = d.getUTCDay();
		const x = padL + week * slotW + (slotW - cell) / 2;
		const y = padT + dow * slotH + (slotH - cell) / 2;
		const moodDay = byDate.get(date);
		ctx.fillStyle = moodDay ? moodRgba(moodDay.averageValence, theme, 0.72) : hexToRgba(theme.fg, 0.05);
		ctx.beginPath();
		ctx.roundRect(x, y, cell, cell, 3);
		ctx.fill();
		if (!moodDay) {
			ctx.strokeStyle = hexToRgba(theme.fg, 0.05);
			ctx.stroke();
		}
		if (moodDay) {
			hits.add({
				shape: "rect", x, y, w: cell, h: cell,
				title: formatDate(date),
				details: [
					{ label: "Mood", value: `${moodLabelForValence(moodDay.averageValence)} (${formatMoodValence(moodDay.averageValence)})` },
					{ label: "Entries", value: String(moodDay.entries.length) },
					...(moodDay.sleepSeconds ? [{ label: "Sleep", value: formatDuration(moodDay.sleepSeconds) }] : []),
				],
				payload: moodDay.day,
			});
		}
		const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
		if (dow === 0 && month !== previousMonth) {
			ctx.fillStyle = theme.muted;
			ctx.font = "9px sans-serif";
			ctx.textAlign = "left";
			ctx.fillText(month, x, padT - 8);
			previousMonth = month;
		}
	}
	renderInlineStats(statsEl, [[{ text: "Avg mood " }, { text: `${moodLabelForValence(avg)} ${formatMoodValence(avg)}`, strong: true }], [{ text: "Mood entries " }, { text: String(days.reduce((sum, day) => sum + day.entries.length, 0)), strong: true }]]);
};

export const renderMoodSleepScatter: RenderFn = (ctx, data, W, H, _config, theme, statsEl, hits): void => {
	const days = moodDaysWithValues(data).filter((day) => (day.sleepSeconds ?? 0) > 0);
	if (!days.length) return emptyState(ctx, W, H, theme, statsEl, "No mood + sleep data in range");
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	const padL = 52, padR = 18, padT = 58, padB = 42;
	const plotW = W - padL - padR;
	const plotH = H - padT - padB;
	const sleepHours = days.map((day) => (day.sleepSeconds ?? 0) / 3600);
	const maxSleep = Math.max(9, Math.ceil(Math.max(...sleepHours)));
	const avgMood = average(days.map((day) => day.averageValence!)) ?? 0;
	drawTitle(ctx, theme, "Mood × sleep", `${days.length} days • color = mood, ring = exercise`);
	drawValenceGrid(ctx, theme, padL, padT, plotW, plotH);
	ctx.strokeStyle = hexToRgba(theme.fg, 0.18);
	ctx.beginPath();
	ctx.moveTo(padL, padT + plotH);
	ctx.lineTo(padL + plotW, padT + plotH);
	ctx.stroke();
	for (let h = 0; h <= maxSleep; h += 2) {
		const x = padL + (h / maxSleep) * plotW;
		ctx.strokeStyle = hexToRgba(theme.fg, 0.06);
		ctx.beginPath();
		ctx.moveTo(x, padT);
		ctx.lineTo(x, padT + plotH);
		ctx.stroke();
		ctx.fillStyle = theme.muted;
		ctx.font = "9px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		ctx.fillText(`${h}h`, x, padT + plotH + 8);
	}
	for (const day of days) {
		const x = padL + (((day.sleepSeconds ?? 0) / 3600) / maxSleep) * plotW;
		const y = yForValence(day.averageValence!, padT, plotH);
		const r = clamp(4 + day.entries.length * 1.2, 4, 9);
		if (day.exerciseMinutes > 0) {
			ctx.strokeStyle = hexToRgba(theme.colors.secondary, clamp(day.exerciseMinutes / 80, 0.25, 0.8));
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(x, y, r + 4, 0, Math.PI * 2);
			ctx.stroke();
		}
		ctx.fillStyle = moodRgba(day.averageValence, theme, 0.85);
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
		hits.add({
			shape: "circle", cx: x, cy: y, r: r + 6,
			title: formatDate(day.date),
			details: [
				{ label: "Mood", value: `${moodLabelForValence(day.averageValence)} (${formatMoodValence(day.averageValence)})` },
				{ label: "Sleep", value: formatDuration(day.sleepSeconds ?? 0) },
				{ label: "Exercise", value: `${Math.round(day.exerciseMinutes)} min` },
				{ label: "Entries", value: String(day.entries.length) },
			],
			payload: day.day,
		});
	}
	renderInlineStats(statsEl, [[{ text: "Avg mood " }, { text: `${moodLabelForValence(avgMood)} ${formatMoodValence(avgMood)}`, strong: true }], [{ text: "Avg sleep " }, { text: formatDuration((average(days.map((day) => day.sleepSeconds ?? 0)) ?? 0)), strong: true }]]);
};

export const renderMoodDayTimeline: RenderFn = (ctx, data, W, H, config, theme, statsEl, hits): void => {
	const maxDays = Math.max(1, Math.floor(configNumber(config.maxDays, 21)));
	const days = collectMoodDays(data).filter((day) => day.entries.length).slice(-maxDays);
	const entries = days.flatMap((day) => day.entries);
	if (!entries.length) return emptyState(ctx, W, H, theme, statsEl);
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	const padL = 72, padR = 18, padT = 58, padB = 30;
	const plotW = W - padL - padR;
	const rowH = (H - padT - padB) / days.length;
	drawTitle(ctx, theme, "Mood day timeline", `${days.length} days • entries placed by time of day`);
	for (const hour of [0, 6, 12, 18, 24]) {
		const x = padL + (hour / 24) * plotW;
		ctx.strokeStyle = hexToRgba(theme.fg, hour === 12 ? 0.16 : 0.08);
		ctx.beginPath();
		ctx.moveTo(x, padT);
		ctx.lineTo(x, H - padB);
		ctx.stroke();
		ctx.fillStyle = theme.muted;
		ctx.font = "9px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		ctx.fillText(hour === 24 ? "24" : `${hour}:00`, x, H - padB + 8);
	}
	days.forEach((day, row) => {
		const y = padT + row * rowH + rowH / 2;
		ctx.strokeStyle = hexToRgba(theme.fg, 0.08);
		ctx.beginPath();
		ctx.moveTo(padL, y);
		ctx.lineTo(padL + plotW, y);
		ctx.stroke();
		ctx.fillStyle = theme.muted;
		ctx.font = "9px sans-serif";
		ctx.textAlign = "right";
		ctx.textBaseline = "middle";
		ctx.fillText(shortDate(day.date), padL - 8, y);
		const bedtime = parseHour(day.day.sleep?.bedtime ?? day.day.sleep?.bedtimeISO, day.date);
		const wake = parseHour(day.day.sleep?.wakeTime ?? day.day.sleep?.wakeTimeISO, day.date);
		if (bedtime !== undefined && wake !== undefined) {
			const drawSpan = (start: number, end: number) => {
				const x = padL + (start / 24) * plotW;
				const w = Math.max(1, ((end - start) / 24) * plotW);
				ctx.fillStyle = hexToRgba(theme.colors.sleep.core, 0.14);
				ctx.fillRect(x, y - Math.max(2, rowH * 0.18), w, Math.max(4, rowH * 0.36));
			};
			if (bedtime <= wake) drawSpan(bedtime, wake);
			else { drawSpan(bedtime, 24); drawSpan(0, wake); }
		}
		for (const entry of day.entries) {
			const hour = parseHour(entry.timestamp ?? entry.startDate, day.date) ?? 12;
			const x = padL + (hour / 24) * plotW;
			const valence = entry.valence;
			const offset = valence !== undefined ? -valence * Math.min(rowH * 0.28, 8) : 0;
			ctx.fillStyle = moodRgba(valence, theme, 0.85);
			ctx.beginPath();
			ctx.arc(x, y + offset, 5, 0, Math.PI * 2);
			ctx.fill();
			hits.add({
				shape: "circle", cx: x, cy: y + offset, r: 8,
				title: `${formatDate(day.date)} ${entry.timestamp ?? ""}`,
				details: detailsForEntry({ day: day.day, date: day.date, entry, timestamp: entry.timestamp, hour, valence, label: entry.label, labels: entryLabels(entry), associations: entry.associations ?? [], kind: entry.kind }),
				payload: day.day,
			});
		}
	});
	renderInlineStats(statsEl, [[{ text: "Entries " }, { text: String(entries.length), strong: true }], [{ text: "Days " }, { text: String(days.length), strong: true }]]);
};

export const renderMoodAssociationBreakdown: RenderFn = (ctx, data, W, H, config, theme, statsEl, hits): void => {
	const entries = collectMoodEntries(data).filter((entry) => entry.valence !== undefined);
	if (!entries.length) return emptyState(ctx, W, H, theme, statsEl);
	const limit = Math.max(3, Math.floor(configNumber(config.limit, 10)));
	const sort = configString(config.sort, "count");
	const buckets = aggregate(entries.flatMap((entry) => (entry.associations.length ? entry.associations : ["Unspecified"]).map((key) => ({ key, valence: entry.valence }))));
	buckets.sort((a, b) => sort === "valence" ? (bucketAverage(b) ?? 0) - (bucketAverage(a) ?? 0) : b.count - a.count);
	const shown = buckets.slice(0, limit);
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	const padL = 120, padR = 26, padT = 60, padB = 24;
	const plotW = W - padL - padR;
	const rowH = (H - padT - padB) / shown.length;
	const mid = padL + plotW / 2;
	drawTitle(ctx, theme, "Mood by association", `${shown.length} associations • centered at neutral`);
	ctx.strokeStyle = hexToRgba(theme.fg, 0.18);
	ctx.beginPath();
	ctx.moveTo(mid, padT - 6);
	ctx.lineTo(mid, H - padB);
	ctx.stroke();
	shown.forEach((bucket, i) => {
		const avg = bucketAverage(bucket) ?? 0;
		const y = padT + i * rowH + rowH / 2;
		const barW = Math.abs(avg) * (plotW / 2);
		const x = avg >= 0 ? mid : mid - barW;
		ctx.fillStyle = moodRgba(avg, theme, 0.75);
		ctx.beginPath();
		ctx.roundRect(x, y - rowH * 0.25, barW, Math.max(4, rowH * 0.5), 4);
		ctx.fill();
		ctx.fillStyle = theme.fg;
		ctx.font = "11px sans-serif";
		ctx.textAlign = "right";
		ctx.textBaseline = "middle";
		ctx.fillText(bucket.key, padL - 10, y);
		ctx.textAlign = avg >= 0 ? "left" : "right";
		ctx.fillStyle = theme.muted;
		ctx.fillText(`${formatMoodValence(avg)} • ${bucket.count}`, avg >= 0 ? x + barW + 6 : x - 6, y);
		hits.add({ shape: "rect", x: padL, y: y - rowH / 2, w: plotW, h: rowH, title: bucket.key, details: [{ label: "Avg mood", value: `${moodLabelForValence(avg)} (${formatMoodValence(avg)})` }, { label: "Entries", value: String(bucket.count) }] });
	});
	const avgAll = average(entries.map((entry) => entry.valence!).filter(Number.isFinite)) ?? 0;
	renderInlineStats(statsEl, [[{ text: "Avg mood " }, { text: `${moodLabelForValence(avgAll)} ${formatMoodValence(avgAll)}`, strong: true }], [{ text: "Associations " }, { text: String(buckets.length), strong: true }]]);
};

export const renderMoodLabelCloud: RenderFn = (ctx, data, W, H, config, theme, statsEl, hits): void => {
	const entries = collectMoodEntries(data).filter((entry) => entry.valence !== undefined);
	if (!entries.length) return emptyState(ctx, W, H, theme, statsEl);
	const limit = Math.max(5, Math.floor(configNumber(config.limit, 28)));
	const buckets = aggregate(entries.flatMap((entry) => (entry.labels.length ? entry.labels : [entry.label ?? moodLabelForValence(entry.valence)]).map((key) => ({ key, valence: entry.valence }))));
	buckets.sort((a, b) => b.count - a.count);
	const shown = buckets.slice(0, limit);
	const maxCount = Math.max(...shown.map((bucket) => bucket.count));
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	drawTitle(ctx, theme, "Mood label cloud", `${shown.length} labels • size = frequency, color = average valence`);
	let x = 22;
	let y = 76;
	let lineH = 0;
	for (const bucket of shown) {
		const avg = bucketAverage(bucket) ?? 0;
		const size = 11 + Math.sqrt(bucket.count / maxCount) * 24;
		ctx.font = `700 ${size}px sans-serif`;
		const label = bucket.key;
		const w = ctx.measureText(label).width;
		if (x + w > W - 22) {
			x = 22;
			y += lineH + 12;
			lineH = 0;
		}
		if (y > H - 18) break;
		ctx.fillStyle = moodRgba(avg, theme, 0.9);
		ctx.textAlign = "left";
		ctx.textBaseline = "alphabetic";
		ctx.fillText(label, x, y);
		hits.add({ shape: "rect", x, y: y - size, w, h: size + 4, title: label, details: [{ label: "Avg mood", value: `${moodLabelForValence(avg)} (${formatMoodValence(avg)})` }, { label: "Entries", value: String(bucket.count) }] });
		x += w + 16;
		lineH = Math.max(lineH, size);
	}
	renderInlineStats(statsEl, [[{ text: "Labels " }, { text: String(buckets.length), strong: true }], [{ text: "Entries " }, { text: String(entries.length), strong: true }]]);
};

export const renderMoodVolatility: RenderFn = (ctx, data, W, H, _config, theme, statsEl, hits): void => {
	const days = moodDaysWithValues(data);
	if (!days.length) return emptyState(ctx, W, H, theme, statsEl);
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	const padL = 48, padR = 16, padT = 58, padB = 34;
	const plotW = W - padL - padR;
	const plotH = H - padT - padB;
	const slot = plotW / Math.max(days.length, 1);
	const volatilities = days.map((day) => day.minValence !== undefined && day.maxValence !== undefined ? day.maxValence - day.minValence : 0);
	const maxVol = Math.max(0.25, ...volatilities);
	const avgMood = average(days.map((day) => day.averageValence!)) ?? 0;
	drawTitle(ctx, theme, "Mood volatility", "Bars = intraday range, line = daily average mood");
	drawValenceGrid(ctx, theme, padL, padT, plotW, plotH);
	days.forEach((day, i) => {
		const x = padL + i * slot + slot / 2;
		const vol = volatilities[i];
		const barH = (vol / maxVol) * plotH * 0.45;
		ctx.fillStyle = hexToRgba(theme.colors.secondary, 0.35);
		ctx.beginPath();
		ctx.roundRect(x - Math.min(10, slot * 0.3), padT + plotH - barH, Math.max(2, Math.min(20, slot * 0.6)), barH, [3, 3, 0, 0]);
		ctx.fill();
	});
	ctx.strokeStyle = hexToRgba(theme.colors.accent, 0.75);
	ctx.lineWidth = 2;
	ctx.beginPath();
	days.forEach((day, i) => {
		const x = padL + i * slot + slot / 2;
		const y = yForValence(day.averageValence!, padT, plotH);
		if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
	});
	ctx.stroke();
	days.forEach((day, i) => {
		const x = padL + i * slot + slot / 2;
		const y = yForValence(day.averageValence!, padT, plotH);
		ctx.fillStyle = moodRgba(day.averageValence, theme, 0.85);
		ctx.beginPath();
		ctx.arc(x, y, 4.5, 0, Math.PI * 2);
		ctx.fill();
		if (days.length <= 14 || i % Math.ceil(days.length / 6) === 0 || i === days.length - 1) {
			ctx.fillStyle = theme.muted;
			ctx.font = "9px sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "top";
			ctx.fillText(shortDate(day.date), x, padT + plotH + 8);
		}
		hits.add({ shape: "rect", x: padL + i * slot, y: padT, w: slot, h: plotH + padB, title: formatDate(day.date), details: [{ label: "Avg mood", value: `${moodLabelForValence(day.averageValence)} (${formatMoodValence(day.averageValence)})` }, { label: "Volatility", value: formatMoodValence(volatilities[i]) }, { label: "Entries", value: String(day.entries.length) }], payload: day.day });
	});
	renderInlineStats(statsEl, [[{ text: "Avg mood " }, { text: `${moodLabelForValence(avgMood)} ${formatMoodValence(avgMood)}`, strong: true }], [{ text: "Avg volatility " }, { text: formatMoodValence(average(volatilities) ?? 0), strong: true }]]);
};

export const renderMoodKindSplit: RenderFn = (ctx, data, W, H, _config, theme, statsEl, hits): void => {
	const days = collectMoodDays(data).map((day) => {
		const dailyValues = day.entries.filter((entry) => normalizeKind(entry.kind) === "daily").map((entry) => entry.valence).filter((value): value is number => value !== undefined);
		const momentValues = day.entries.filter((entry) => normalizeKind(entry.kind) === "momentary").map((entry) => entry.valence).filter((value): value is number => value !== undefined);
		return { ...day, daily: average(dailyValues), momentary: average(momentValues), dailyCount: dailyValues.length, momentaryCount: momentValues.length };
	}).filter((day) => day.daily !== undefined || day.momentary !== undefined);
	if (!days.length) return emptyState(ctx, W, H, theme, statsEl);
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	const padL = 50, padR = 18, padT = 64, padB = 34;
	const plotW = W - padL - padR;
	const plotH = H - padT - padB;
	const slot = plotW / Math.max(days.length, 1);
	drawTitle(ctx, theme, "Daily mood vs momentary emotions", `${days.length} days with State of Mind entries`);
	drawValenceGrid(ctx, theme, padL, padT, plotW, plotH);
	const drawSeries = (key: "daily" | "momentary", color: string) => {
		ctx.strokeStyle = hexToRgba(color, 0.8);
		ctx.lineWidth = 2;
		ctx.beginPath();
		let active = false;
		days.forEach((day, i) => {
			const value = day[key];
			if (value === undefined) { active = false; return; }
			const x = padL + i * slot + slot / 2;
			const y = yForValence(value, padT, plotH);
			if (!active) { ctx.moveTo(x, y); active = true; } else ctx.lineTo(x, y);
		});
		ctx.stroke();
		days.forEach((day, i) => {
			const value = day[key];
			if (value === undefined) return;
			const x = padL + i * slot + slot / 2;
			const y = yForValence(value, padT, plotH);
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.arc(x, y, key === "daily" ? 5 : 3.8, 0, Math.PI * 2);
			ctx.fill();
		});
	};
	drawSeries("daily", theme.colors.accent);
	drawSeries("momentary", theme.colors.secondary);
	ctx.font = "10px sans-serif";
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	[{ label: "Daily mood", color: theme.colors.accent }, { label: "Momentary", color: theme.colors.secondary }].forEach((item, i) => {
		const x = padL + i * 96;
		ctx.fillStyle = item.color;
		ctx.fillRect(x, padT - 18, 10, 6);
		ctx.fillStyle = theme.muted;
		ctx.fillText(item.label, x + 14, padT - 15);
	});
	days.forEach((day, i) => {
		if (days.length <= 14 || i % Math.ceil(days.length / 6) === 0 || i === days.length - 1) {
			ctx.fillStyle = theme.muted;
			ctx.font = "9px sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "top";
			ctx.fillText(shortDate(day.date), padL + i * slot + slot / 2, padT + plotH + 8);
		}
		hits.add({ shape: "rect", x: padL + i * slot, y: padT, w: slot, h: plotH + padB, title: formatDate(day.date), details: [{ label: "Daily", value: day.daily !== undefined ? `${formatMoodValence(day.daily)} (${day.dailyCount})` : "—" }, { label: "Momentary", value: day.momentary !== undefined ? `${formatMoodValence(day.momentary)} (${day.momentaryCount})` : "—" }], payload: day.day });
	});
	renderInlineStats(statsEl, [[{ text: "Daily avg " }, { text: formatMoodValence(average(days.map((day) => day.daily).filter((value): value is number => value !== undefined))), strong: true }], [{ text: "Momentary avg " }, { text: formatMoodValence(average(days.map((day) => day.momentary).filter((value): value is number => value !== undefined))), strong: true }]]);
};

export const renderMoodCircadianClock: RenderFn = (ctx, data, W, H, _config, theme, statsEl, hits): void => {
	const entries = collectMoodEntries(data).filter((entry) => entry.hour !== undefined && entry.valence !== undefined);
	if (!entries.length) return emptyState(ctx, W, H, theme, statsEl);
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	const cx = W / 2;
	const cy = H / 2 + 12;
	const r = Math.min(W, H - 42) * 0.36;
	const r0 = r * 0.46;
	drawTitle(ctx, theme, "Circadian mood clock", `${entries.length} entries by time of day`, 18, 24);
	ctx.strokeStyle = hexToRgba(theme.fg, 0.08);
	for (const rr of [r0, (r + r0) / 2, r]) {
		ctx.beginPath();
		ctx.arc(cx, cy, rr, 0, Math.PI * 2);
		ctx.stroke();
	}
	const byHour = new Map<number, number[]>();
	for (const entry of entries) {
		const hour = Math.floor(entry.hour ?? 0);
		byHour.set(hour, [...(byHour.get(hour) ?? []), entry.valence!]);
	}
	for (let hour = 0; hour < 24; hour++) {
		const values = byHour.get(hour) ?? [];
		const avg = average(values);
		const a0 = ((hour / 24) * Math.PI * 2) - Math.PI / 2;
		const a1 = (((hour + 1) / 24) * Math.PI * 2) - Math.PI / 2;
		if (avg !== undefined) {
			ctx.fillStyle = moodRgba(avg, theme, clamp(0.18 + values.length * 0.12, 0.25, 0.85));
			ctx.beginPath();
			ctx.arc(cx, cy, r, a0, a1);
			ctx.arc(cx, cy, r0, a1, a0, true);
			ctx.closePath();
			ctx.fill();
			hits.add({ shape: "sector", cx, cy, r0, r1: r, a0, a1, title: `${hour}:00`, details: [{ label: "Avg mood", value: `${moodLabelForValence(avg)} (${formatMoodValence(avg)})` }, { label: "Entries", value: String(values.length) }] });
		}
		if (hour % 6 === 0) {
			const a = a0;
			ctx.fillStyle = theme.muted;
			ctx.font = "10px sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(String(hour), cx + Math.cos(a) * (r + 16), cy + Math.sin(a) * (r + 16));
		}
	}
	for (const entry of entries) {
		const a = ((entry.hour! / 24) * Math.PI * 2) - Math.PI / 2;
		const rr = lerp(r0 + 4, r - 5, (entry.valence! + 1) / 2);
		const x = cx + Math.cos(a) * rr;
		const y = cy + Math.sin(a) * rr;
		ctx.fillStyle = moodRgba(entry.valence, theme, 0.95);
		ctx.beginPath();
		ctx.arc(x, y, 3, 0, Math.PI * 2);
		ctx.fill();
	}
	const avgAll = average(entries.map((entry) => entry.valence!)) ?? 0;
	renderInlineStats(statsEl, [[{ text: "Avg mood " }, { text: `${moodLabelForValence(avgAll)} ${formatMoodValence(avgAll)}`, strong: true }], [{ text: "Most active hour " }, { text: `${Array.from(byHour.entries()).sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? 0}:00`, strong: true }]]);
};

export const renderMoodRecoveryTile: RenderFn = (ctx, data, W, H, _config, theme, statsEl, hits): void => {
	const days = moodDaysWithValues(data);
	if (!days.length) return emptyState(ctx, W, H, theme, statsEl);
	const latest = days[days.length - 1];
	const hrvValues = days.map((day) => day.hrv).filter((value): value is number => value !== undefined);
	const hrvMin = hrvValues.length ? Math.min(...hrvValues) : undefined;
	const hrvMax = hrvValues.length ? Math.max(...hrvValues) : undefined;
	const moodScore = ((latest.averageValence! + 1) / 2) * 100;
	const sleepScore = latest.sleepSeconds ? clamp((latest.sleepSeconds / 3600) / 7.5 * 100, 0, 110) : 0;
	const hrvScore = latest.hrv !== undefined && hrvMin !== undefined && hrvMax !== undefined && hrvMax !== hrvMin ? ((latest.hrv - hrvMin) / (hrvMax - hrvMin)) * 100 : latest.hrv !== undefined ? 60 : 0;
	const exerciseScore = clamp(latest.exerciseMinutes / 30 * 100, 0, 100);
	const score = clamp(moodScore * 0.4 + sleepScore * 0.3 + hrvScore * 0.2 + exerciseScore * 0.1, 0, 100);
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	ctx.fillStyle = hexToRgba(moodHex(latest.averageValence, theme), theme.isDark ? 0.12 : 0.08);
	ctx.beginPath();
	ctx.roundRect(14, 14, W - 28, H - 28, 18);
	ctx.fill();
	ctx.strokeStyle = hexToRgba(theme.fg, 0.1);
	ctx.stroke();
	ctx.fillStyle = theme.muted;
	ctx.font = "11px sans-serif";
	ctx.textAlign = "left";
	ctx.fillText(formatDate(latest.date), 30, 40);
	ctx.fillStyle = theme.fg;
	ctx.font = "700 40px sans-serif";
	ctx.fillText(`${Math.round(score)}`, 30, 86);
	ctx.font = "600 18px sans-serif";
	ctx.fillStyle = moodHex(latest.averageValence, theme);
	ctx.fillText(moodLabelForValence(latest.averageValence), 104, 78);
	ctx.fillStyle = theme.muted;
	ctx.font = "11px sans-serif";
	ctx.fillText("recovery + mindset score", 104, 94);
	const bars = [
		{ label: "Mood", value: moodScore, detail: formatMoodValence(latest.averageValence), color: moodHex(latest.averageValence, theme) },
		{ label: "Sleep", value: sleepScore, detail: latest.sleepSeconds ? formatDuration(latest.sleepSeconds) : "—", color: theme.colors.sleep.core },
		{ label: "HRV", value: hrvScore, detail: latest.hrv !== undefined ? `${Math.round(latest.hrv)} ms` : "—", color: theme.colors.accent },
		{ label: "Exercise", value: exerciseScore, detail: `${Math.round(latest.exerciseMinutes)} min`, color: theme.colors.secondary },
	];
	const startY = 124;
	bars.forEach((bar, i) => {
		const y = startY + i * 32;
		ctx.fillStyle = theme.fg;
		ctx.font = "11px sans-serif";
		ctx.textAlign = "left";
		ctx.fillText(bar.label, 30, y);
		ctx.fillStyle = theme.muted;
		ctx.textAlign = "right";
		ctx.fillText(bar.detail, W - 30, y);
		ctx.fillStyle = hexToRgba(theme.fg, 0.08);
		ctx.beginPath();
		ctx.roundRect(30, y + 8, W - 60, 8, 4);
		ctx.fill();
		ctx.fillStyle = hexToRgba(bar.color, 0.85);
		ctx.beginPath();
		ctx.roundRect(30, y + 8, (W - 60) * clamp(bar.value / 100, 0, 1), 8, 4);
		ctx.fill();
	});
	hits.add({ shape: "rect", x: 14, y: 14, w: W - 28, h: H - 28, title: formatDate(latest.date), details: [{ label: "Score", value: String(Math.round(score)) }, { label: "Mood", value: `${moodLabelForValence(latest.averageValence)} (${formatMoodValence(latest.averageValence)})` }, { label: "Entries", value: String(latest.entries.length) }], payload: latest.day });
	renderStatBoxes(statsEl, [
		{ value: String(Math.round(score)), label: "score", color: moodHex(latest.averageValence, theme) },
		{ value: valencePercent(latest.averageValence), label: "mood" },
		{ value: latest.sleepSeconds ? formatDuration(latest.sleepSeconds) : "—", label: "sleep" },
		{ value: latest.hrv !== undefined ? `${Math.round(latest.hrv)}ms` : "—", label: "HRV" },
	]);
};

export const renderMoodAssociationMatrix: RenderFn = (ctx, data, W, H, config, theme, statsEl, hits): void => {
	const entries = collectMoodEntries(data).filter((entry) => entry.valence !== undefined);
	if (!entries.length) return emptyState(ctx, W, H, theme, statsEl);
	const metric = configString(config.metric, "valence");
	const rowLimit = Math.max(3, Math.floor(configNumber(config.labels, 6)));
	const colLimit = Math.max(3, Math.floor(configNumber(config.associations, 6)));
	const labelBuckets = aggregate(entries.flatMap((entry) => (entry.labels.length ? entry.labels : [entry.label ?? moodLabelForValence(entry.valence)]).map((key) => ({ key, valence: entry.valence })))).sort((a, b) => b.count - a.count).slice(0, rowLimit);
	const associationBuckets = aggregate(entries.flatMap((entry) => (entry.associations.length ? entry.associations : ["Unspecified"]).map((key) => ({ key, valence: entry.valence })))).sort((a, b) => b.count - a.count).slice(0, colLimit);
	if (!labelBuckets.length || !associationBuckets.length) return emptyState(ctx, W, H, theme, statsEl, "No mood labels/associations in range");
	const labels = labelBuckets.map((bucket) => bucket.key);
	const associations = associationBuckets.map((bucket) => bucket.key);
	const cells = new Map<string, { count: number; values: number[] }>();
	for (const entry of entries) {
		const ls = (entry.labels.length ? entry.labels : [entry.label ?? moodLabelForValence(entry.valence)]).filter((label) => labels.includes(label));
		const as = (entry.associations.length ? entry.associations : ["Unspecified"]).filter((association) => associations.includes(association));
		for (const label of ls) for (const association of as) {
			const key = `${label}\u0000${association}`;
			const cell = cells.get(key) ?? { count: 0, values: [] };
			cell.count += 1;
			cell.values.push(entry.valence!);
			cells.set(key, cell);
		}
	}
	const maxCount = Math.max(1, ...Array.from(cells.values()).map((cell) => cell.count));
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	const padL = 112, padR = 18, padT = 82, padB = 24;
	const cellW = (W - padL - padR) / associations.length;
	const cellH = (H - padT - padB) / labels.length;
	drawTitle(ctx, theme, "Mood association matrix", metric === "count" ? "Cells show entry count" : "Cells show average valence; opacity = count");
	ctx.fillStyle = theme.muted;
	ctx.font = "9px sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "bottom";
	associations.forEach((association, col) => {
		ctx.save();
		ctx.translate(padL + col * cellW + cellW / 2, padT - 8);
		ctx.rotate(-Math.PI / 5);
		ctx.fillText(association.slice(0, 18), 0, 0);
		ctx.restore();
	});
	labels.forEach((label, row) => {
		const y = padT + row * cellH;
		ctx.fillStyle = theme.fg;
		ctx.font = "10px sans-serif";
		ctx.textAlign = "right";
		ctx.textBaseline = "middle";
		ctx.fillText(label.slice(0, 20), padL - 8, y + cellH / 2);
		associations.forEach((association, col) => {
			const x = padL + col * cellW;
			const cell = cells.get(`${label}\u0000${association}`);
			const avg = cell ? average(cell.values) ?? 0 : undefined;
			ctx.fillStyle = cell
				? (metric === "count" ? hexToRgba(theme.colors.secondary, clamp(cell.count / maxCount, 0.18, 0.88)) : moodRgba(avg, theme, clamp(0.16 + cell.count / maxCount * 0.7, 0.18, 0.86)))
				: hexToRgba(theme.fg, 0.04);
			ctx.beginPath();
			ctx.roundRect(x + 2, y + 2, Math.max(2, cellW - 4), Math.max(2, cellH - 4), 4);
			ctx.fill();
			if (cell && cellW > 34 && cellH > 18) {
				ctx.fillStyle = theme.isDark ? "#fff" : "#111";
				ctx.globalAlpha = 0.78;
				ctx.font = "9px sans-serif";
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillText(metric === "count" ? String(cell.count) : formatMoodValence(avg), x + cellW / 2, y + cellH / 2);
				ctx.globalAlpha = 1;
			}
			if (cell) hits.add({ shape: "rect", x, y, w: cellW, h: cellH, title: `${label} × ${association}`, details: [{ label: "Entries", value: String(cell.count) }, { label: "Avg mood", value: `${moodLabelForValence(avg)} (${formatMoodValence(avg)})` }] });
		});
	});
	renderInlineStats(statsEl, [[{ text: "Labels " }, { text: String(labels.length), strong: true }], [{ text: "Associations " }, { text: String(associations.length), strong: true }], [{ text: "Cells " }, { text: String(cells.size), strong: true }]]);
};
