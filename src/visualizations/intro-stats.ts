import { HealthDay, VizConfig, ResolvedTheme, HtmlRenderFn } from "../types";

export const renderIntroStats: HtmlRenderFn = (
	data: HealthDay[],
	el: HTMLElement,
	_config: VizConfig,
	theme: ResolvedTheme
): void => {
	const totalSteps = data.reduce((s, d) => s + (d.activity?.steps || 0), 0);
	const totalDist = data.reduce(
		(s, d) => s + (d.activity?.walkingRunningDistanceKm || 0),
		0
	);
	const heartDays = data.filter((d) => d.heart);
	const avgHR = heartDays.length
		? heartDays.reduce((s, d) => s + (d.heart!.averageHeartRate || 0), 0) /
		  heartDays.length
		: 0;
	const sleepNights = data.filter(
		(d) => d.sleep?.sleepStages && d.sleep.sleepStages.length > 0
	).length;

	el.addClass("health-md-intro-grid");

	const stats = [
		{ value: `${Math.round(avgHR)}`, label: "Avg BPM", color: "#ef4444" },
		{
			value: `${(totalSteps / 1000).toFixed(0)}k`,
			label: "Total Steps",
			color: "#2dd4bf",
		},
		{
			value: `${sleepNights}`,
			label: "Nights Tracked",
			color: "#7c3aed",
		},
		{
			value: `${totalDist.toFixed(0)}km`,
			label: "Distance",
			color: "#f59e0b",
		},
	];

	stats.forEach((stat) => {
		const box = el.createDiv({ cls: "health-md-intro-stat" });
		const valEl = box.createDiv({ cls: "health-md-intro-value" });
		valEl.style.color = stat.color;
		valEl.textContent = stat.value;
		const labelEl = box.createDiv({ cls: "health-md-intro-label" });
		labelEl.style.color = theme.muted;
		labelEl.textContent = stat.label;
	});
};
