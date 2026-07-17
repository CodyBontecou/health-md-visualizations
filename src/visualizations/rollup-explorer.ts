import type {
	HealthRollupMetric,
	HealthRollupPeriod,
	HealthRollupSummary,
	HtmlRenderFn,
	VisualizationContext,
	VizConfig,
} from "../types";

const PERIODS = new Set<HealthRollupPeriod>(["weekly", "monthly", "yearly"]);
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 100;
const MAX_VALUE_LENGTH = 500;

function appendElement<K extends keyof HTMLElementTagNameMap>(
	host: HTMLElement,
	tag: K,
	text?: string,
	className?: string
): HTMLElementTagNameMap[K] {
	const element = host.ownerDocument.createElement(tag);
	if (className) element.className = className;
	if (text !== undefined) element.textContent = text;
	host.appendChild(element);
	return element;
}

function boundedLimit(value: string | number | undefined): number {
	const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
	if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
	return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

function requestedPeriod(config: VizConfig): HealthRollupPeriod | "all" {
	const value = typeof config.period === "string" ? config.period.trim().toLowerCase() : "all";
	return PERIODS.has(value as HealthRollupPeriod) ? value as HealthRollupPeriod : "all";
}

function safeValue(value: unknown): string {
	if (value === null) return "null";
	if (value === undefined) return "—";
	if (typeof value === "string") return truncate(value);
	if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
	if (typeof value === "boolean" || typeof value === "bigint") return String(value);
	try {
		const serialized = JSON.stringify(value);
		return truncate(serialized ?? "[Unsupported value]");
	} catch {
		return "[Unserializable value]";
	}
}

function truncate(value: string): string {
	return value.length > MAX_VALUE_LENGTH
		? `${value.slice(0, MAX_VALUE_LENGTH - 1)}…`
		: value;
}

function canonicalMetricFilter(config: VizConfig, context: VisualizationContext | undefined): string | undefined {
	if (typeof config.metric !== "string") return undefined;
	const requested = config.metric.trim();
	if (!requested) return undefined;
	return context?.dictionary?.aliases[requested] ?? requested;
}

function statisticFilter(config: VizConfig): string | undefined {
	if (typeof config.statistic !== "string") return undefined;
	const statistic = config.statistic.trim();
	return statistic || undefined;
}

function rollupDateKey(rollup: HealthRollupSummary): string {
	return rollup.endDate ?? rollup.end_date ?? rollup.startDate ?? rollup.start_date ?? rollup.periodId;
}

function periodMetrics(
	rollup: HealthRollupSummary,
	metricFilter: string | undefined
): HealthRollupMetric[] {
	const metrics = Object.values(rollup.metrics ?? {});
	return metrics
		.filter((metric) => !metricFilter || metric.canonicalKey === metricFilter)
		.sort((left, right) => {
			const category = (left.category ?? "").localeCompare(right.category ?? "");
			return category || left.canonicalKey.localeCompare(right.canonicalKey);
		});
}

function displayNameFor(
	metric: HealthRollupMetric,
	context: VisualizationContext | undefined
): string {
	if (metric.displayName) return metric.displayName;
	const dictionaryEntry = context?.dictionary?.entries.find(
		(entry) => entry.canonicalKey === metric.canonicalKey
	);
	return dictionaryEntry?.displayName ?? metric.canonicalKey;
}

function metricUnit(metric: HealthRollupMetric, rollup: HealthRollupSummary): string {
	return metric.unit ?? rollup.units?.[metric.canonicalKey] ?? "—";
}

function coverageText(rollup: HealthRollupSummary): string {
	const coverage = rollup.coveragePercent ?? rollup.coverage_percent;
	return typeof coverage === "number" && Number.isFinite(coverage)
		? `${Math.round(coverage * 10) / 10}%`
		: "—";
}

function addDefinition(list: HTMLElement, term: string, detail: string): void {
	const group = appendElement(list, "div", undefined, "health-md-rollup-definition");
	appendElement(group, "dt", term, "health-md-rollup-term");
	appendElement(group, "dd", detail, "health-md-rollup-detail");
}

function renderStatistics(
	host: HTMLElement,
	metric: HealthRollupMetric,
	selectedStatistic: string | undefined
): void {
	const entries = Object.entries(metric.statistics ?? {});
	const section = appendElement(host, "div", undefined, "health-md-rollup-statistics");
	appendElement(section, "h5", "Exported statistics", "health-md-rollup-statistics-title");
	if (!entries.length) {
		appendElement(section, "p", "No statistics were exported for this metric.", "health-md-rollup-empty");
		return;
	}

	const table = appendElement(section, "table", undefined, "health-md-rollup-statistics-table");
	const head = appendElement(table, "thead");
	const headerRow = appendElement(head, "tr");
	for (const heading of ["Statistic", "Exported value"]) {
		const th = appendElement(headerRow, "th", heading);
		th.scope = "col";
	}
	const body = appendElement(table, "tbody");
	for (const [name, value] of entries) {
		const selected = selectedStatistic !== undefined && name.toLowerCase() === selectedStatistic.toLowerCase();
		const row = appendElement(body, "tr", undefined, selected ? "is-selected-statistic" : undefined);
		const nameCell = appendElement(row, "th", name);
		nameCell.scope = "row";
		appendElement(row, "td", safeValue(value));
	}
}

function renderMetric(
	host: HTMLElement,
	metric: HealthRollupMetric,
	rollup: HealthRollupSummary,
	selectedStatistic: string | undefined,
	context: VisualizationContext | undefined
): void {
	const article = appendElement(host, "article", undefined, "health-md-rollup-metric");

	appendElement(article, "h4", displayNameFor(metric, context), "health-md-rollup-metric-title");
	appendElement(article, "div", metric.canonicalKey, "health-md-rollup-metric-key");

	const primary = appendElement(article, "div", undefined, "health-md-rollup-primary");
	appendElement(primary, "strong", safeValue(metric.primaryValue ?? metric.value), "health-md-rollup-primary-value");
	appendElement(primary, "span", metricUnit(metric, rollup), "health-md-rollup-unit");

	const details = appendElement(article, "dl", undefined, "health-md-rollup-metric-details");
	addDefinition(details, "Exporter rule", metric.rule ?? "—");
	addDefinition(details, "Days counted", metric.daysCounted === undefined ? "—" : String(metric.daysCounted));
	if (metric.notes) addDefinition(details, "Exporter notes", metric.notes);

	if (selectedStatistic) {
		const match = Object.entries(metric.statistics ?? {}).find(
			([name]) => name.toLowerCase() === selectedStatistic.toLowerCase()
		);
		if (match) {
			const selected = appendElement(article, "p", undefined, "health-md-rollup-selected-statistic");
			selected.textContent = `${match[0]}: ${safeValue(match[1])}`;
		}
	}

	renderStatistics(article, metric, selectedStatistic);
}

function renderRollupCard(
	host: HTMLElement,
	rollup: HealthRollupSummary,
	metrics: HealthRollupMetric[],
	index: number,
	selectedStatistic: string | undefined,
	context: VisualizationContext | undefined
): void {
	const card = appendElement(host, "section", undefined, `health-md-rollup-card${index === 0 ? " is-first" : ""}`);

	appendElement(card, "h3", rollup.periodId, "health-md-rollup-period-title");
	appendElement(card, "div", rollup.rollupPeriod, "health-md-rollup-period-kind");

	const start = rollup.startDate ?? rollup.start_date ?? "—";
	const end = rollup.endDate ?? rollup.end_date ?? "—";
	const counted = rollup.daysCounted ?? rollup.days_counted;
	const expected = rollup.daysExpected ?? rollup.days_expected;
	const metadata = appendElement(card, "dl", undefined, "health-md-rollup-period-details");
	addDefinition(metadata, "Date span", `${start} – ${end}`);
	addDefinition(metadata, "Coverage", coverageText(rollup));
	addDefinition(
		metadata,
		"Period days",
		counted === undefined && expected === undefined
			? "—"
			: `${counted === undefined ? "—" : counted} / ${expected === undefined ? "—" : expected}`
	);

	if (!metrics.length) {
		appendElement(card, "p", "No metrics were exported for this period.", "health-md-rollup-empty");
		return;
	}
	for (const metric of metrics) renderMetric(card, metric, rollup, selectedStatistic, context);
}

export const renderRollupExplorer: HtmlRenderFn = (
	_data,
	el,
	config,
	_theme,
	context
): void => {
	el.classList.add("health-md-rollup-explorer");
	const period = requestedPeriod(config);
	const metricFilter = canonicalMetricFilter(config, context);
	const selectedStatistic = statisticFilter(config);
	const limit = boundedLimit(config.limit);

	const matching = [...(context?.rollups ?? [])]
		.filter((rollup) => period === "all" || rollup.rollupPeriod === period)
		.filter((rollup) => !metricFilter || periodMetrics(rollup, metricFilter).length > 0)
		.sort((left, right) => rollupDateKey(right).localeCompare(rollupDateKey(left)))
		.slice(0, limit);

	const header = appendElement(el, "header", undefined, "health-md-rollup-header");
	appendElement(header, "h2", "Roll-up explorer", "health-md-rollup-title");
	const summaryParts = [period === "all" ? "All periods" : period, `${matching.length} shown`];
	if (metricFilter) summaryParts.push(metricFilter);
	appendElement(header, "p", summaryParts.join(" · "), "health-md-rollup-subtitle");

	if (!matching.length) {
		appendElement(
			el,
			"p",
			metricFilter
				? "No exported roll-ups match this period and canonical metric."
				: "No exported roll-up summaries match this period.",
			"health-md-rollup-empty"
		);
		return;
	}

	for (const [index, rollup] of matching.entries()) {
		renderRollupCard(
			el,
			rollup,
			periodMetrics(rollup, metricFilter),
			index,
			selectedStatistic,
			context
		);
	}
};
