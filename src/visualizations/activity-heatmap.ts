import { HealthDay, HitRegistry, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { hexToRgba, formatDate } from "../canvas-utils";
import { renderInlineStats } from "../dom-utils";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const renderActivityHeatmap: RenderFn = (
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	W: number,
	H: number,
	config: VizConfig,
	theme: ResolvedTheme,
	statsEl: HTMLElement,
	hits: HitRegistry
): void => {
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);

	const days = data.filter((d) => d.activity);
	if (!days.length) return;

	// Which metric to display (steps | calories | distance)
	const metric = (config.metric as string | undefined) ?? "steps";

	const getValue = (d: HealthDay): number => {
		if (!d.activity) return 0;
		if (metric === "calories") return d.activity.activeCalories || 0;
		if (metric === "distance") return d.activity.walkingRunningDistanceKm || 0;
		return d.activity.steps || 0;
	};

	// Build a map of date→value and figure out week grid
	const byDate: Record<string, number> = {};
	let firstDate = days[0].date;
	let lastDate = days[days.length - 1].date;
	for (const d of days) {
		byDate[d.date] = getValue(d);
		if (d.date < firstDate) firstDate = d.date;
		if (d.date > lastDate) lastDate = d.date;
	}

	// Expand range to full weeks (Sunday–Saturday)
	const startDay = new Date(firstDate + "T00:00:00");
	startDay.setDate(startDay.getDate() - startDay.getDay()); // rewind to Sunday
	const endDay = new Date(lastDate + "T00:00:00");
	endDay.setDate(endDay.getDate() + (6 - endDay.getDay())); // forward to Saturday

	const totalDays = Math.round((endDay.getTime() - startDay.getTime()) / 86400000) + 1;
	const totalWeeks = Math.ceil(totalDays / 7);

	const padL = 28, padR = 8, padT = 20, padB = 8;
	const cellW = (W - padL - padR) / totalWeeks;
	const cellH = (H - padT - padB) / 7;
	const gap = Math.max(1.5, Math.min(cellW, cellH) * 0.12);
	const radius = Math.max(1, Math.min(cellW, cellH) * 0.18);

	const maxVal = Math.max(...Object.values(byDate), 1);

	// Day-of-week labels
	ctx.fillStyle = theme.muted;
	ctx.font = "8px sans-serif";
	ctx.textAlign = "right";
	for (let dow = 0; dow < 7; dow++) {
		if (dow % 2 === 1) continue; // only Mon/Wed/Fri/Sun to avoid clutter
		const y = padT + dow * cellH + cellH / 2 + 3;
		ctx.fillText(DOW[dow], padL - 3, y);
	}

	// Month labels
	let lastMonth = -1;
	ctx.textAlign = "center";
	for (let w = 0; w < totalWeeks; w++) {
		const weekStart = new Date(startDay);
		weekStart.setDate(weekStart.getDate() + w * 7);
		const mo = weekStart.getMonth();
		if (mo !== lastMonth) {
			lastMonth = mo;
			const label = weekStart.toLocaleDateString("en-US", { month: "short" });
			ctx.fillText(label, padL + w * cellW + cellW / 2, padT - 5);
		}
	}

	// Cells
	for (let w = 0; w < totalWeeks; w++) {
		for (let dow = 0; dow < 7; dow++) {
			const cellDate = new Date(startDay);
			cellDate.setDate(cellDate.getDate() + w * 7 + dow);
			const iso = cellDate.toISOString().slice(0, 10);
			const val = byDate[iso] ?? null;

			const x = padL + w * cellW + gap / 2;
			const y = padT + dow * cellH + gap / 2;
			const cw = cellW - gap;
			const ch = cellH - gap;

			if (val === null) {
				// Out-of-data cell — faint outline only
				ctx.strokeStyle = hexToRgba(theme.fg, 0.06);
				ctx.lineWidth = 0.5;
				ctx.beginPath();
				ctx.roundRect(x, y, cw, ch, radius);
				ctx.stroke();
				continue;
			}

			const t = Math.pow(val / maxVal, 0.6); // gamma-compress so low values are visible
			ctx.fillStyle = hexToRgba(theme.colors.accent, 0.1 + t * 0.85);
			ctx.beginPath();
			ctx.roundRect(x, y, cw, ch, radius);
			ctx.fill();

			hits.add({
				shape: "rect",
				x,
				y,
				w: cw,
				h: ch,
				title: formatDate(iso),
				details: [
					{ label: metric.charAt(0).toUpperCase() + metric.slice(1), value: formatMetric(metric, val) },
					...(byDate[iso] != null && metric !== "steps" && days.find(d => d.date === iso)?.activity?.steps
						? [{ label: "Steps", value: (days.find(d => d.date === iso)!.activity!.steps || 0).toLocaleString() }]
						: []),
				],
				payload: iso,
			});
		}
	}

	// Stats
	const total = Object.values(byDate).reduce((s, v) => s + v, 0);
	const avg = total / Object.keys(byDate).length;
	const metricLabel = metric.charAt(0).toUpperCase() + metric.slice(1);
	renderInlineStats(statsEl, [
		[
			{ text: `${metricLabel} — Avg ` },
			{ text: formatMetric(metric, avg), strong: true },
			{ text: " · Max " },
			{ text: formatMetric(metric, maxVal), strong: true },
			{ text: " · Total " },
			{ text: formatMetric(metric, total), strong: true },
		],
	]);
};

function formatMetric(metric: string, val: number): string {
	if (metric === "calories") return `${Math.round(val).toLocaleString()} kcal`;
	if (metric === "distance") return `${val.toFixed(1)} km`;
	return Math.round(val).toLocaleString();
}
