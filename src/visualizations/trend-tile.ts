import { HealthDay, VizConfig, ResolvedTheme, HtmlRenderFn } from "../types";
import { hexToRgba } from "../canvas-utils";
import { appendSvgFromMarkup } from "../dom-utils";

type Metric =
	| "resting-heart-rate"
	| "hrv"
	| "steps"
	| "vo2max"
	| "walking-speed"
	| "sleep-duration"
	| "active-calories";

interface MetricMeta {
	category: string;
	color: string;
	label: string;
	unit: string;
	decimals: number;
	/** `true` means rising values are good (green up). `false` means lower is better. */
	higherIsBetter: boolean;
	extract(day: HealthDay): number | null;
}

const METRICS: Record<Metric, MetricMeta> = {
	"resting-heart-rate": {
		category: "HEART",
		color: "#fa114f",
		label: "Resting Heart Rate",
		unit: "bpm",
		decimals: 0,
		higherIsBetter: false,
		extract: (d) => d.heart?.restingHeartRate ?? null,
	},
	"hrv": {
		category: "HEART",
		color: "#fa114f",
		label: "Heart Rate Variability",
		unit: "ms",
		decimals: 1,
		higherIsBetter: true,
		extract: (d) => {
			if (d.heart?.hrv != null) return d.heart.hrv;
			const s = d.heart?.hrvSamples;
			if (s && s.length) return s.reduce((acc, x) => acc + x.value, 0) / s.length;
			return null;
		},
	},
	"steps": {
		category: "ACTIVITY",
		color: "#ff8e00",
		label: "Steps",
		unit: "steps",
		decimals: 0,
		higherIsBetter: true,
		extract: (d) => (d.activity?.steps ?? 0) > 0 ? d.activity!.steps : null,
	},
	"vo2max": {
		category: "HEART",
		color: "#fa114f",
		label: "Cardio Fitness",
		unit: "ml/kg·min",
		decimals: 1,
		higherIsBetter: true,
		extract: (d) => d.activity?.vo2Max ?? null,
	},
	"walking-speed": {
		category: "ACTIVITY",
		color: "#ff8e00",
		label: "Walking Speed",
		unit: "m/s",
		decimals: 2,
		higherIsBetter: true,
		extract: (d) => d.mobility?.walkingSpeed ?? null,
	},
	"sleep-duration": {
		category: "SLEEP",
		color: "#715afc",
		label: "Sleep Duration",
		unit: "h",
		decimals: 1,
		higherIsBetter: true,
		extract: (d) => {
			const v = d.sleep?.totalDuration;
			return v != null && v > 0 ? v / 3600 : null;
		},
	},
	"active-calories": {
		category: "ACTIVITY",
		color: "#ff8e00",
		label: "Active Energy",
		unit: "CAL",
		decimals: 0,
		higherIsBetter: true,
		extract: (d) => (d.activity?.activeCalories ?? 0) > 0 ? d.activity!.activeCalories : null,
	},
};

function avg(nums: number[]): number {
	return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function formatValue(v: number, meta: MetricMeta): string {
	if (meta.unit === "steps") return Math.round(v).toLocaleString();
	if (meta.unit === "CAL") return `${Math.round(v)}`;
	if (meta.unit === "h") {
		const h = Math.floor(v);
		const m = Math.round((v - h) * 60);
		return `${h}h ${m}m`;
	}
	return v.toFixed(meta.decimals);
}

function buildSparkline(
	current: number[],
	prior: number[],
	color: string,
	isDark: boolean
): string {
	if (!current.length) return "";
	const W = 120, H = 36, padY = 3;
	const plotH = H - padY * 2;
	const combined = [...prior, ...current];
	const min = Math.min(...combined);
	const max = Math.max(...combined);
	const range = max - min || 1;

	function pathFor(values: number[], offsetFrac: number, widthFrac: number): string {
		if (values.length < 2) return "";
		const x0 = offsetFrac * W;
		const x1 = (offsetFrac + widthFrac) * W;
		const xFor = (i: number) => x0 + (i / (values.length - 1)) * (x1 - x0);
		const yFor = (v: number) => padY + plotH - ((v - min) / range) * plotH;
		let p = `M ${xFor(0).toFixed(2)} ${yFor(values[0]).toFixed(2)}`;
		for (let i = 1; i < values.length; i++) {
			const px0 = xFor(i - 1), py0 = yFor(values[i - 1]);
			const px1 = xFor(i), py1 = yFor(values[i]);
			const mx = (px0 + px1) / 2;
			p += ` C ${mx.toFixed(2)} ${py0.toFixed(2)}, ${mx.toFixed(2)} ${py1.toFixed(2)}, ${px1.toFixed(2)} ${py1.toFixed(2)}`;
		}
		return p;
	}

	const priorFrac = prior.length / (prior.length + current.length || 1);
	const priorPath = pathFor(prior, 0, priorFrac);
	const currentPath = pathFor(current, priorFrac, 1 - priorFrac);

	const priorAlpha = isDark ? 0.4 : 0.35;
	return `
		<svg class="health-md-summary-spark-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
			${priorPath ? `<path d="${priorPath}" fill="none" stroke="${color}" stroke-opacity="${priorAlpha}" stroke-width="1.25" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>` : ""}
			${currentPath ? `<path d="${currentPath}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>` : ""}
		</svg>
	`;
}

function splitWindows(
	data: HealthDay[],
	currentWindow: number,
	priorWindow: number
): { current: HealthDay[]; prior: HealthDay[] } {
	if (data.length < currentWindow + 1) {
		const mid = Math.floor(data.length / 2);
		return { current: data.slice(mid), prior: data.slice(0, mid) };
	}
	const current = data.slice(-currentWindow);
	const priorEnd = data.length - currentWindow;
	const priorStart = Math.max(0, priorEnd - priorWindow);
	const prior = data.slice(priorStart, priorEnd);
	return { current, prior };
}

function narrative(meta: MetricMeta, delta: number, windowDays: number): string {
	const absPct = Math.abs(delta);
	if (absPct < 1) {
		return `Your ${meta.label.toLowerCase()} has been steady over the past ${windowDays} days.`;
	}
	const direction = delta > 0 ? "higher" : "lower";
	return `Your ${meta.label.toLowerCase()} is ${direction} than it was ${windowDays} days ago.`;
}

export const renderTrendTile: HtmlRenderFn = (
	data: HealthDay[],
	el: HTMLElement,
	config: VizConfig,
	theme: ResolvedTheme
): void => {
	const metricId = (config.metric as Metric) || "resting-heart-rate";
	const meta = METRICS[metricId];
	if (!meta) {
		el.createEl("p", {
			text: `Unknown metric: ${metricId}`,
			cls: "health-md-error",
		});
		return;
	}

	const currentWindow = Number(config.currentWindow) || 90;
	const priorWindow = Number(config.priorWindow) || 90;
	const { current, prior } = splitWindows(data, currentWindow, priorWindow);

	const currentVals = current
		.map((day) => meta.extract(day))
		.filter((v): v is number => v != null);
	const priorVals = prior
		.map((day) => meta.extract(day))
		.filter((v): v is number => v != null);

	if (!currentVals.length) {
		el.createEl("p", {
			text: `No ${meta.label.toLowerCase()} data in range.`,
			cls: "health-md-error",
		});
		return;
	}

	const card = el.createDiv({ cls: "health-md-summary-card health-md-trend-tile" });
	card.style.setProperty("--hmd-summary-color", meta.color);
	card.style.borderColor = hexToRgba(theme.fg, 0.12);

	const header = card.createDiv({ cls: "health-md-trend-header" });
	const pill = header.createSpan({ cls: "health-md-summary-pill" });
	pill.textContent = meta.category;
	pill.style.color = meta.color;
	const nameEl = header.createSpan({ cls: "health-md-trend-name" });
	nameEl.textContent = meta.label;
	nameEl.style.color = theme.fg;

	const currentAvg = avg(currentVals);
	const priorAvg = priorVals.length ? avg(priorVals) : null;
	const delta = priorAvg == null || priorAvg === 0 ? 0 : ((currentAvg - priorAvg) / priorAvg) * 100;

	const isImprovement = Math.abs(delta) >= 0.5 && (meta.higherIsBetter ? delta > 0 : delta < 0);
	const isRegression = Math.abs(delta) >= 0.5 && (meta.higherIsBetter ? delta < 0 : delta > 0);
	const arrow = Math.abs(delta) < 0.5 ? "→" : delta > 0 ? "↑" : "↓";
	const arrowColor = isImprovement ? "#30c26a" : isRegression ? "#ff3b30" : theme.muted;

	const deltaRow = card.createDiv({ cls: "health-md-trend-delta-row" });
	const arrowEl = deltaRow.createSpan({ cls: "health-md-trend-arrow" });
	arrowEl.textContent = arrow;
	arrowEl.style.color = arrowColor;
	const pctEl = deltaRow.createSpan({ cls: "health-md-trend-pct" });
	pctEl.textContent = `${Math.abs(delta).toFixed(Math.abs(delta) < 10 ? 1 : 0)}%`;
	pctEl.style.color = arrowColor;

	if (priorAvg != null) {
		const absDelta = currentAvg - priorAvg;
		const deltaStr = `${absDelta >= 0 ? "+" : "−"}${formatValue(Math.abs(absDelta), meta)} ${meta.unit === "h" ? "" : meta.unit}`.trim();
		const absEl = deltaRow.createSpan({ cls: "health-md-trend-abs" });
		absEl.textContent = deltaStr;
		absEl.style.color = theme.muted;
	}

	const narr = card.createDiv({ cls: "health-md-trend-narrative" });
	narr.textContent = priorVals.length
		? narrative(meta, delta, currentWindow + priorWindow)
		: `Your ${meta.label.toLowerCase()}: ${formatValue(currentAvg, meta)} ${meta.unit === "h" ? "" : meta.unit}`.trim();
	narr.style.color = theme.muted;

	const spark = buildSparkline(currentVals, priorVals, meta.color, theme.isDark);
	if (spark) {
		const wrap = card.createDiv({ cls: "health-md-summary-spark" });
		appendSvgFromMarkup(wrap, spark);
	}

	// Consistency dot: based on coefficient of variation within current window
	if (currentVals.length >= 5) {
		const mean = currentAvg;
		const variance = currentVals.reduce((s, v) => s + (v - mean) ** 2, 0) / currentVals.length;
		const cv = mean !== 0 ? Math.sqrt(variance) / Math.abs(mean) : 0;
		const label = cv < 0.1 ? "Very consistent" : cv < 0.2 ? "Consistent" : cv < 0.35 ? "Variable" : "Irregular";
		const dotColor = cv < 0.1 ? "#30c26a" : cv < 0.2 ? "#9ecb3f" : cv < 0.35 ? "#ffa534" : "#ff3b30";
		const consistency = card.createDiv({ cls: "health-md-trend-consistency" });
		const dot = consistency.createSpan({ cls: "health-md-trend-dot" });
		dot.style.backgroundColor = dotColor;
		const txt = consistency.createSpan();
		txt.textContent = label;
		txt.style.color = theme.muted;
	}
};
