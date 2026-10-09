import { HealthDay, HitRegistry, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { lerp, hsl, formatDate } from "../canvas-utils";
import { renderStatBoxes } from "../dom-utils";
import { sampleMinutes } from "../time-utils";

function heartSummary(day: HealthDay) {
    const samples = (day.heart?.heartRateSamples ?? []).map(sample => sample.value).filter(Number.isFinite);
    const avg = day.heart?.averageHeartRate ?? (samples.length ? samples.reduce((a,b) => a+b,0)/samples.length : undefined);
    if (avg === undefined || !Number.isFinite(avg)) return null;
    return {avg,min:day.heart?.heartRateMin ?? (samples.length ? Math.min(...samples) : avg),
        max:day.heart?.heartRateMax ?? (samples.length ? Math.max(...samples) : avg)};
}

export const renderHeartTerrain: RenderFn = (
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	W: number,
	H: number,
	_config: VizConfig,
	theme: ResolvedTheme,
	statsEl: HTMLElement,
	hits: HitRegistry
): void => {
	const BUCKETS = 96;
	const days = data.filter((d) => d.heart?.heartRateSamples?.length);
	const grid: Array<{ date: string; col: (number | null)[] }> = [];
	let minBPM = 999,
		maxBPM = 0;

	days.forEach((day) => {
		const col: (number[] | null)[] = new Array<number[] | null>(BUCKETS).fill(null);
		day.heart!.heartRateSamples.forEach((s) => {
			const context = day.timeContext ?? day.time_context;
			const mins = sampleMinutes(s.timestamp, context?.calendarTimezone ?? context?.calendar_timezone);
			if (mins === undefined) return;
			const bucket = Math.floor(mins / 15);
			if (bucket >= 0 && bucket < BUCKETS) {
				if (!col[bucket]) col[bucket] = [];
				const bucketValues = col[bucket];
				if (bucketValues) {
					bucketValues.push(s.value);
				}
			}
		});

		const averaged = col.map((bucketValues) =>
			bucketValues
				? bucketValues.reduce((sum, value) => sum + value, 0) /
					bucketValues.length
				: null
		);

		averaged.forEach((v) => {
			if (v) {
				minBPM = Math.min(minBPM, v);
				maxBPM = Math.max(maxBPM, v);
			}
		});
		grid.push({ date: day.date, col: averaged });
	});

	if (grid.length === 0) {
		// Fallback: per-day average heatmap when no timestamped samples are available
		const heartDays = data.flatMap(day => {
            const summary = heartSummary(day);
            return summary && summary.avg > 0 ? [{...day,heart:{...day.heart,averageHeartRate:summary.avg,
                heartRateMin:summary.min,heartRateMax:summary.max,heartRateSamples:day.heart?.heartRateSamples ?? []}}] : [];
        });
		if (!heartDays.length) {
			statsEl.empty();
			statsEl.createEl("p", {
				text: "No heart rate data available.",
				cls: "health-md-muted",
			});
			return;
		}

		const allAvg = heartDays.map((d) => d.heart.averageHeartRate);
		const globalMin = Math.min(
			...heartDays.map((d) => d.heart.heartRateMin || d.heart.averageHeartRate)
		);
		const globalMax = Math.max(
			...heartDays.map((d) => d.heart.heartRateMax || d.heart.averageHeartRate)
		);
		const colW = W / heartDays.length;

		heartDays.forEach((day, x) => {
			const avg = day.heart.averageHeartRate;
			const lo = day.heart.heartRateMin || avg;
			const hi = day.heart.heartRateMax || avg;

			const grad = ctx.createLinearGradient(0, H, 0, 0);
			const tLo = (lo - globalMin) / (globalMax - globalMin || 1);
			const tHi = (hi - globalMin) / (globalMax - globalMin || 1);
			const tAvg = (avg - globalMin) / (globalMax - globalMin || 1);
			grad.addColorStop(
				0,
				`hsl(${lerp(220, 0, tLo)},70%,${theme.isDark ? 30 : 45}%)`
			);
			grad.addColorStop(
				0.5,
				`hsl(${lerp(220, 0, tAvg)},80%,${theme.isDark ? 45 : 55}%)`
			);
			grad.addColorStop(
				1,
				`hsl(${lerp(220, 0, tHi)},90%,${theme.isDark ? 55 : 65}%)`
			);
			ctx.fillStyle = grad;
			ctx.fillRect(x * colW, 0, colW + 1, H);

			hits.add({
				shape: "rect",
				x: x * colW,
				y: 0,
				w: colW,
				h: H,
				title: formatDate(day.date),
				details: [
					{ label: "Avg", value: `${Math.round(avg)} bpm` },
					{ label: "Min", value: `${lo} bpm` },
					{ label: "Max", value: `${hi} bpm` },
				],
				payload: day,
			});
		});

		const overallAvg = Math.round(
			allAvg.reduce((a, b) => a + b, 0) / allAvg.length
		);
		renderStatBoxes(statsEl, [
			{ value: String(globalMin), label: "Lowest", color: "#4488ff" },
			{ value: String(overallAvg), label: "Average", color: "#cc6666" },
			{ value: String(globalMax), label: "Highest", color: "#ff4444" },
		]);
		return;
	}

	const colW = W / grid.length;
	const rowH = H / BUCKETS;

	grid.forEach((day, x) => {
		day.col.forEach((bpm, y) => {
			if (bpm === null) return;
			const t = (bpm - minBPM) / (maxBPM - minBPM || 1);
			const h = lerp(220, 0, t);
			const s = lerp(60, 100, t);
			const l = lerp(theme.isDark ? 12 : 30, theme.isDark ? 55 : 65, t);
			ctx.fillStyle = hsl(h, s, l);
			ctx.fillRect(x * colW, y * rowH, colW + 1, rowH + 1);
		});

		const dayObj = days[x];
		const samples = dayObj.heart!.heartRateSamples;
        const summary = heartSummary(dayObj);
		hits.add({
			shape: "rect",
			x: x * colW,
			y: 0,
			w: colW,
			h: H,
			title: formatDate(day.date),
			details: [
				{ label: "Avg", value: summary ? `${Math.round(summary.avg)} bpm` : "Unavailable" },
				{ label: "Min", value: summary ? `${summary.min} bpm` : "Unavailable" },
				{ label: "Max", value: summary ? `${summary.max} bpm` : "Unavailable" },
				{ label: "Samples", value: `${samples.length}` },
			],
			payload: dayObj,
		});
	});

    const summaries = days.flatMap(day => { const summary = heartSummary(day); return summary ? [summary] : []; });
    const minHR = summaries.length ? Math.min(...summaries.map(summary => summary.min)) : undefined;
    const maxHR = summaries.length ? Math.max(...summaries.map(summary => summary.max)) : undefined;
    const avgHR = summaries.length ? Math.round(summaries.reduce((sum,summary) => sum+summary.avg,0)/summaries.length) : undefined;

	renderStatBoxes(statsEl, [
		{ value: minHR === undefined ? "Unavailable" : String(minHR), label: "Lowest", color: "#4488ff" },
		{ value: avgHR === undefined ? "Unavailable" : String(avgHR), label: "Average", color: "#cc6666" },
		{ value: maxHR === undefined ? "Unavailable" : String(maxHR), label: "Highest", color: "#ff4444" },
	]);
};
