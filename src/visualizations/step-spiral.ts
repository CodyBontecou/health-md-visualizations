import { HealthDay, HitRegistry, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { lerp, hexToRgba, formatDate } from "../canvas-utils";
import { renderStatBoxes } from "../dom-utils";

export const renderStepSpiral: RenderFn = (
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	W: number,
	H: number,
	_config: VizConfig,
	theme: ResolvedTheme,
	statsEl: HTMLElement,
	hits: HitRegistry
): void => {
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);

	const cx = W / 2,
		cy = H / 2;
	const rx = W / 2 - 24;
	const ry = H / 2 - 24;

	const days = data.filter((d) => d.activity?.steps);
	if (!days.length) return;

	const maxSteps = Math.max(...days.map((d) => d.activity!.steps));
	const maxDist = Math.max(
		...days.map((d) => d.activity!.walkingRunningDistanceKm || 0)
	);
	let totalSteps = 0;
	let bestDay = days[0];

	days.forEach((day, i) => {
		totalSteps += day.activity!.steps;
		if (day.activity!.steps > bestDay.activity!.steps) bestDay = day;

		const t = i / days.length;
		const angle = t * Math.PI * 3.5 - Math.PI / 2;
		const spiralT = 0.15 + t * 0.85;
		const x = cx + Math.cos(angle) * rx * spiralT;
		const y = cy + Math.sin(angle) * ry * spiralT;
		const steps = day.activity!.steps;
		const dist = day.activity!.walkingRunningDistanceKm || 0;
		const dotSize = 10 + (steps / maxSteps) * 30;
		const distT = maxDist > 0 ? dist / maxDist : 0;
		const dotAlpha = lerp(0.35, 0.9, distT);

		ctx.shadowColor = hexToRgba(theme.colors.accent, 0.7);
		ctx.shadowBlur = dotSize;
		ctx.fillStyle = hexToRgba(theme.colors.accent, dotAlpha);
		ctx.beginPath();
		ctx.arc(x, y, dotSize / 2, 0, Math.PI * 2);
		ctx.fill();
		ctx.shadowBlur = 0;

		// Connecting line
		if (i > 0) {
			const pt = (i - 1) / days.length;
			const pa = pt * Math.PI * 3.5 - Math.PI / 2;
			const pst = 0.15 + pt * 0.85;
			const px = cx + Math.cos(pa) * rx * pst;
			const py = cy + Math.sin(pa) * ry * pst;
			ctx.strokeStyle = hexToRgba(theme.colors.accent, lerp(0.08, 0.25, distT));
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(px, py);
			ctx.lineTo(x, y);
			ctx.stroke();
		}

		// Day number label
		ctx.fillStyle = theme.muted;
		ctx.font = "9px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText(
			String(new Date(day.date + "T00:00:00").getDate()),
			x,
			y + dotSize / 2 + 11
		);

		hits.add({
			shape: "circle",
			cx: x,
			cy: y,
			r: Math.max(dotSize / 2 + 4, 8),
			title: formatDate(day.date),
			details: [
				{ label: "Steps", value: steps.toLocaleString() },
				{ label: "Distance", value: `${dist.toFixed(2)} km` },
				...(day.activity!.activeCalories
					? [
							{
								label: "Calories",
								value: `${Math.round(day.activity!.activeCalories)} kcal`,
							},
					  ]
					: []),
				...(day.activity!.exerciseMinutes
					? [
							{
								label: "Exercise",
								value: `${day.activity!.exerciseMinutes} min`,
							},
					  ]
					: []),
				...(day.activity!.flightsClimbed
					? [
							{
								label: "Flights",
								value: `${day.activity!.flightsClimbed}`,
							},
					  ]
					: []),
			],
			payload: day,
		});
	});

	const avgSteps = Math.round(totalSteps / days.length);
	renderStatBoxes(statsEl, [
		{
			value: avgSteps.toLocaleString(),
			label: "Avg/day",
			color: theme.colors.accent,
		},
		{
			value: bestDay.activity!.steps.toLocaleString(),
			label: "Best day",
			color: theme.colors.accent,
		},
	]);
};
