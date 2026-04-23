import { HealthDay, VizConfig, ResolvedTheme, HtmlRenderFn } from "../types";
import { hexToRgba } from "../canvas-utils";
import { appendSvgFromMarkup } from "../dom-utils";

type MetricId =
	| "heart-rate"
	| "steps"
	| "sleep-duration"
	| "active-calories"
	| "hrv"
	| "blood-oxygen"
	| "respiratory-rate";

interface MetricMeta {
	category: string;
	color: string;
	unit: string;
	decimals: number;
	extract(day: HealthDay): number | null;
	min?(day: HealthDay): number | null;
	max?(day: HealthDay): number | null;
}

const METRICS: Record<MetricId, MetricMeta> = {
	"heart-rate": {
		category: "HEART",
		color: "#fa114f",
		unit: "BPM",
		decimals: 0,
		extract: (d) => {
			const v = d.heart?.averageHeartRate;
			return v && v > 0 ? v : null;
		},
		min: (d) => d.heart?.heartRateMin ?? null,
		max: (d) => d.heart?.heartRateMax ?? null,
	},
	"steps": {
		category: "ACTIVITY",
		color: "#ff8e00",
		unit: "STEPS",
		decimals: 0,
		extract: (d) => {
			const v = d.activity?.steps;
			return v != null && v > 0 ? v : null;
		},
	},
	"sleep-duration": {
		category: "SLEEP",
		color: "#715afc",
		unit: "H",
		decimals: 1,
		extract: (d) => {
			const v = d.sleep?.totalDuration;
			return v != null && v > 0 ? v / 3600 : null;
		},
	},
	"active-calories": {
		category: "ACTIVITY",
		color: "#ff8e00",
		unit: "CAL",
		decimals: 0,
		extract: (d) => {
			const v = d.activity?.activeCalories;
			return v != null && v > 0 ? v : null;
		},
	},
	"hrv": {
		category: "HEART",
		color: "#fa114f",
		unit: "MS",
		decimals: 0,
		extract: (d) => {
			if (d.heart?.hrv != null) return d.heart.hrv;
			const samples = d.heart?.hrvSamples;
			if (samples && samples.length > 0) {
				return samples.reduce((s, x) => s + x.value, 0) / samples.length;
			}
			return null;
		},
	},
	"blood-oxygen": {
		category: "RESPIRATORY",
		color: "#1eeaef",
		unit: "%",
		decimals: 1,
		extract: (d) => d.vitals?.bloodOxygenAvg ?? d.vitals?.bloodOxygenPercent ?? null,
		min: (d) => d.vitals?.bloodOxygenMin ?? null,
		max: (d) => d.vitals?.bloodOxygenMax ?? null,
	},
	"respiratory-rate": {
		category: "RESPIRATORY",
		color: "#3bb2c1",
		unit: "BRPM",
		decimals: 1,
		extract: (d) => d.vitals?.respiratoryRateAvg ?? d.vitals?.respiratoryRate ?? null,
		min: (d) => d.vitals?.respiratoryRateMin ?? null,
		max: (d) => d.vitals?.respiratoryRateMax ?? null,
	},
};

function splitWindows(
	data: HealthDay[],
	compareWindow: string
): { current: HealthDay[]; prior: HealthDay[]; label: string } {
	if (compareWindow === "week") {
		if (data.length < 14) return { current: data, prior: [], label: "vs prior week" };
		return { current: data.slice(-7), prior: data.slice(-14, -7), label: "vs prior week" };
	}
	if (compareWindow === "month") {
		if (data.length < 60) return { current: data, prior: [], label: "vs prior month" };
		return { current: data.slice(-30), prior: data.slice(-60, -30), label: "vs prior month" };
	}
	if (data.length < 2) return { current: data, prior: [], label: "vs prior period" };
	const mid = Math.floor(data.length / 2);
	return { current: data.slice(mid), prior: data.slice(0, mid), label: "vs prior period" };
}

function avg(nums: number[]): number {
	return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function formatValue(v: number, meta: MetricMeta): string {
	if (meta.unit === "STEPS" || meta.unit === "CAL") {
		return Math.round(v).toLocaleString();
	}
	if (meta.unit === "H") {
		const h = Math.floor(v);
		const m = Math.round((v - h) * 60);
		return `${h}h ${m}m`;
	}
	return v.toFixed(meta.decimals);
}

function buildSparkline(values: number[], color: string, isDark: boolean): string {
	if (values.length < 2) return "";
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min || 1;
	const W = 100;
	const H = 28;
	const padY = 3;
	const plotH = H - padY * 2;
	const xFor = (i: number) => (i / (values.length - 1)) * W;
	const yFor = (v: number) => padY + plotH - ((v - min) / range) * plotH;

	let linePath = `M ${xFor(0).toFixed(2)} ${yFor(values[0]).toFixed(2)}`;
	for (let i = 1; i < values.length; i++) {
		const x0 = xFor(i - 1), y0 = yFor(values[i - 1]);
		const x1 = xFor(i), y1 = yFor(values[i]);
		const mx = (x0 + x1) / 2;
		linePath += ` C ${mx.toFixed(2)} ${y0.toFixed(2)}, ${mx.toFixed(2)} ${y1.toFixed(2)}, ${x1.toFixed(2)} ${y1.toFixed(2)}`;
	}
	const fillPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;

	const gradId = `hmd-spark-${Math.random().toString(36).slice(2, 8)}`;
	const topAlpha = isDark ? 0.45 : 0.38;
	const botAlpha = 0.02;
	return `
		<svg class="health-md-summary-spark-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
			<defs>
				<linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="${color}" stop-opacity="${topAlpha}"/>
					<stop offset="100%" stop-color="${color}" stop-opacity="${botAlpha}"/>
				</linearGradient>
			</defs>
			<path d="${fillPath}" fill="url(#${gradId})"/>
			<path d="${linePath}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
		</svg>
	`;
}

export const renderSummaryCard: HtmlRenderFn = (
	data: HealthDay[],
	el: HTMLElement,
	config: VizConfig,
	theme: ResolvedTheme
): void => {
	const metricId = (config.metric as MetricId) || "heart-rate";
	const meta = METRICS[metricId];
	if (!meta) {
		el.createEl("p", {
			text: `Unknown metric: ${metricId}`,
			cls: "health-md-error",
		});
		return;
	}

	const compareWindow = String(config.compareWindow || "same-length");
	const { current, prior, label: compareLabel } = splitWindows(data, compareWindow);

	const currentVals = current
		.map((day) => meta.extract(day))
		.filter((v): v is number => v != null);
	if (!currentVals.length) {
		el.createEl("p", {
			text: `No ${metricId} data in range.`,
			cls: "health-md-error",
		});
		return;
	}
	const priorVals = prior
		.map((day) => meta.extract(day))
		.filter((v): v is number => v != null);

	const card = el.createDiv({ cls: "health-md-summary-card" });
	card.style.setProperty("--hmd-summary-color", meta.color);
	card.style.borderColor = hexToRgba(theme.fg, 0.12);

	const pill = card.createDiv({ cls: "health-md-summary-pill" });
	pill.textContent = meta.category;
	pill.style.color = meta.color;

	const mainAvg = avg(currentVals);
	const kpi = card.createDiv({ cls: "health-md-summary-kpi" });
	kpi.createSpan({
		cls: "health-md-summary-value",
		text: formatValue(mainAvg, meta),
	});
	if (meta.unit !== "H") {
		const unitEl = kpi.createSpan({
			cls: "health-md-summary-unit",
			text: meta.unit,
		});
		unitEl.style.color = theme.muted;
	}

	const sparkHtml = buildSparkline(currentVals, meta.color, theme.isDark);
	if (sparkHtml) {
		const sparkWrap = card.createDiv({ cls: "health-md-summary-spark" });
		appendSvgFromMarkup(sparkWrap, sparkHtml);
	}

	if (priorVals.length) {
		const priorAvg = avg(priorVals);
		const delta = priorAvg === 0 ? 0 : ((mainAvg - priorAvg) / priorAvg) * 100;
		const arrow = Math.abs(delta) < 0.5 ? "—" : delta > 0 ? "▲" : "▼";
		const trendColor =
			Math.abs(delta) < 0.5
				? theme.muted
				: delta > 0
				? "#30c26a"
				: "#ff3b30";
		const trend = card.createDiv({ cls: "health-md-summary-trend" });
		const arrowEl = trend.createSpan({
			cls: "health-md-summary-arrow",
			text: arrow,
		});
		arrowEl.style.color = trendColor;
		const deltaEl = trend.createSpan({
			cls: "health-md-summary-delta",
			text: `${Math.abs(delta).toFixed(Math.abs(delta) < 10 ? 1 : 0)}%`,
		});
		deltaEl.style.color = trendColor;
		const captionEl = trend.createSpan({
			cls: "health-md-summary-caption",
			text: compareLabel,
		});
		captionEl.style.color = theme.muted;
	}

	const minFn = meta.min ?? ((d: HealthDay) => meta.extract(d));
	const maxFn = meta.max ?? ((d: HealthDay) => meta.extract(d));
	const mins = current
		.map((day) => minFn(day))
		.filter((v): v is number => v != null && v > 0);
	const maxs = current
		.map((day) => maxFn(day))
		.filter((v): v is number => v != null && v > 0);
	if (mins.length && maxs.length) {
		const rangeEl = card.createDiv({ cls: "health-md-summary-meta" });
		rangeEl.style.color = theme.muted;
		const lo = Math.min(...mins);
		const hi = Math.max(...maxs);
		rangeEl.textContent = `Range ${formatValue(lo, meta)}–${formatValue(hi, meta)} ${meta.unit === "H" ? "" : meta.unit}`.trim();
	}
};
