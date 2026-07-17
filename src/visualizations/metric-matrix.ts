import { formatDate, hexToRgba } from "../canvas-utils";
import { renderInlineStats } from "../dom-utils";
import {
	MINERAL_METRICS,
	NUTRITION_MACRO_METRICS,
	VITAMIN_METRICS,
} from "../metric-catalog";
import {
	formatMetricValue,
	observedCanonicalKeys,
	resolveMetricDefinition,
	resolveNumericMetric,
} from "../metric-resolver";
import type {
	HealthDay,
	RenderFn,
	ResolvedTheme,
	VisualizationContext,
	VizConfig,
} from "../types";

interface MatrixRow {
	key: string;
	label: string;
	unit?: string;
	values: Array<number | undefined>;
}

interface MatrixOptions {
	title: string;
	subtitle: string;
	zeroLabel: string;
}

function boundedRows(config: VizConfig): number {
	const raw = config.maxRows;
	const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : 15;
	return Math.max(1, Math.min(40, Math.floor(Number.isFinite(parsed) ? parsed : 15)));
}

function configText(value: string | number | undefined, fallback: string): string {
	return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : fallback;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function shortDate(iso: string): string {
	const date = new Date(`${iso}T00:00:00`);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function emptyState(
	ctx: CanvasRenderingContext2D,
	W: number,
	H: number,
	theme: ResolvedTheme,
	message: string
): void {
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	ctx.fillStyle = theme.muted;
	ctx.font = "12px sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(message, W / 2, H / 2);
}

function normalizedIntensity(value: number, present: number[]): number {
	const min = Math.min(...present);
	const max = Math.max(...present);
	if (max === min) return max === 0 ? 0 : 1;
	return clamp((value - min) / (max - min), 0, 1);
}

function renderMatrix(
	ctx: CanvasRenderingContext2D,
	days: HealthDay[],
	W: number,
	H: number,
	theme: ResolvedTheme,
	statsEl: HTMLElement,
	hits: Parameters<RenderFn>[7],
	rows: MatrixRow[],
	options: MatrixOptions,
	context?: VisualizationContext
): void {
	if (!days.length || !rows.length) {
		statsEl.empty();
		emptyState(ctx, W, H, theme, `No ${options.title.toLowerCase()} data`);
		return;
	}

	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	const padL = Math.min(150, Math.max(88, W * 0.27));
	const padR = 14;
	const padT = 68;
	const padB = 42;
	const plotW = Math.max(1, W - padL - padR);
	const plotH = Math.max(1, H - padT - padB);
	const cellW = plotW / days.length;
	const cellH = plotH / rows.length;

	ctx.fillStyle = theme.fg;
	ctx.font = "600 13px sans-serif";
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	ctx.fillText(options.title, 14, 22);
	ctx.fillStyle = theme.muted;
	ctx.font = "10px sans-serif";
	ctx.fillText(options.subtitle, 14, 39);

	rows.forEach((row, rowIndex) => {
		const y = padT + rowIndex * cellH;
		const present = row.values.filter((value): value is number => value !== undefined);
		ctx.fillStyle = theme.fg;
		ctx.font = "10px sans-serif";
		ctx.textAlign = "right";
		ctx.textBaseline = "middle";
		ctx.fillText(row.label.slice(0, 24), padL - 8, y + cellH / 2);

		row.values.forEach((value, columnIndex) => {
			const x = padL + columnIndex * cellW;
			const inset = Math.min(2, Math.max(0.5, Math.min(cellW, cellH) * 0.08));
			const drawX = x + inset;
			const drawY = y + inset;
			const drawW = Math.max(1, cellW - inset * 2);
			const drawH = Math.max(1, cellH - inset * 2);

			if (value === undefined) {
				ctx.fillStyle = hexToRgba(theme.fg, 0.035);
				ctx.fillRect(drawX, drawY, drawW, drawH);
				if (drawW >= 7 && drawH >= 7) {
					ctx.strokeStyle = hexToRgba(theme.muted, 0.18);
					ctx.lineWidth = 1;
					ctx.beginPath();
					ctx.moveTo(drawX + 2, drawY + drawH - 2);
					ctx.lineTo(drawX + drawW - 2, drawY + 2);
					ctx.stroke();
				}
			} else if (value === 0) {
				ctx.fillStyle = hexToRgba(theme.colors.accent, 0.06);
				ctx.fillRect(drawX, drawY, drawW, drawH);
				ctx.strokeStyle = hexToRgba(theme.colors.accent, 0.55);
				ctx.lineWidth = 1;
				ctx.strokeRect(drawX + 0.5, drawY + 0.5, Math.max(0, drawW - 1), Math.max(0, drawH - 1));
				if (drawW >= 8 && drawH >= 8) {
					ctx.fillStyle = hexToRgba(theme.colors.accent, 0.65);
					ctx.beginPath();
					ctx.arc(drawX + drawW / 2, drawY + drawH / 2, 1.5, 0, Math.PI * 2);
					ctx.fill();
				}
			} else {
				const intensity = normalizedIntensity(value, present);
				ctx.fillStyle = hexToRgba(theme.colors.accent, 0.2 + intensity * 0.68);
				ctx.fillRect(drawX, drawY, drawW, drawH);
			}

			const definition = resolveMetricDefinition(row.key, context?.dictionary, days);
			const displayValue = value === undefined
				? "Missing"
				: formatMetricValue(value, { ...definition, unit: row.unit ?? definition.unit });
			hits.add({
				shape: "rect",
				x,
				y,
				w: cellW,
				h: cellH,
				title: `${row.label} — ${formatDate(days[columnIndex].date)}`,
				details: [{ label: value === 0 ? options.zeroLabel : "Value", value: displayValue }],
				payload: days[columnIndex],
			});
		});
	});

	const dateStep = Math.max(1, Math.ceil(days.length / 7));
	ctx.fillStyle = theme.muted;
	ctx.font = "9px sans-serif";
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	days.forEach((day, index) => {
		if (index % dateStep !== 0 && index !== days.length - 1) return;
		const x = padL + index * cellW + cellW / 2;
		ctx.save();
		ctx.translate(x, H - padB + 9);
		ctx.rotate(-Math.PI / 4);
		ctx.fillText(shortDate(day.date), 0, 0);
		ctx.restore();
	});

	const recorded = rows.reduce(
		(sum, row) => sum + row.values.filter((value) => value !== undefined).length,
		0
	);
	const zeros = rows.reduce(
		(sum, row) => sum + row.values.filter((value) => value === 0).length,
		0
	);
	renderInlineStats(statsEl, [
		[{ text: "Rows " }, { text: String(rows.length), strong: true }],
		[{ text: "Recorded cells " }, { text: String(recorded), strong: true }],
		[{ text: "Explicit zeros " }, { text: String(zeros), strong: true }],
	]);
}

function rowsForKeys(
	keys: readonly string[],
	days: HealthDay[],
	context?: VisualizationContext
): MatrixRow[] {
	return keys.flatMap((key): MatrixRow[] => {
		const definition = resolveMetricDefinition(key, context?.dictionary, days);
		const values = days.map((day) => resolveNumericMetric(day, key, context?.dictionary));
		return values.some((value) => value !== undefined)
			? [{ key, label: definition.label, unit: definition.unit, values }]
			: [];
	});
}

export const renderNutritionGrid: RenderFn = (
	ctx,
	data,
	W,
	H,
	config,
	theme,
	statsEl,
	hits,
	context
): void => {
	const days = [...data].sort((a, b) => a.date.localeCompare(b.date));
	const preset = configText(config.preset, "macros");
	let keys: readonly string[];
	if (preset === "vitamins") keys = VITAMIN_METRICS;
	else if (preset === "minerals") keys = MINERAL_METRICS;
	else if (preset === "all") keys = [...NUTRITION_MACRO_METRICS, ...VITAMIN_METRICS, ...MINERAL_METRICS];
	else keys = NUTRITION_MACRO_METRICS;
	const rows = rowsForKeys(keys, days, context).slice(0, boundedRows(config));
	renderMatrix(ctx, days, W, H, theme, statsEl, hits, rows, {
		title: "Nutrition grid",
		subtitle: `${preset === "all" || preset === "vitamins" || preset === "minerals" ? preset : "macros"} • each row uses its own scale`,
		zeroLabel: "Recorded zero",
	}, context);
};

export const renderSymptomHeatmap: RenderFn = (
	ctx,
	data,
	W,
	H,
	config,
	theme,
	statsEl,
	hits,
	context
): void => {
	const days = [...data].sort((a, b) => a.date.localeCompare(b.date));
	const keys = observedCanonicalKeys(days).filter((key) => key.startsWith("symptom_"));
	let rows = rowsForKeys(keys, days, context);
	const sort = configText(config.sort, "total");
	if (sort === "alphabetical") {
		rows.sort((a, b) => a.label.localeCompare(b.label));
	} else {
		rows.sort((a, b) => {
			const totalA = a.values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
			const totalB = b.values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
			return totalB - totalA || a.label.localeCompare(b.label);
		});
	}
	rows = rows.slice(0, boundedRows(config));
	renderMatrix(ctx, days, W, H, theme, statsEl, hits, rows, {
		title: "Symptom records",
		subtitle: "Cell values are recorded counts, not severity",
		zeroLabel: "Recorded count",
	}, context);
};
