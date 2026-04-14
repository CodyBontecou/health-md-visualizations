import { HealthDay, HitRegistry, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { lerp, hsl, hexToRgba, formatDate } from "../canvas-utils";

export const renderVitalsRings: RenderFn = (
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	W: number,
	H: number,
	_config: VizConfig,
	theme: ResolvedTheme,
	_statsEl: HTMLElement,
	hits: HitRegistry
): void => {
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);

	const cx = W / 2,
		cy = H / 2;
	const days = data.filter((d) => d.activity && d.heart);
	if (!days.length) return;

	const maxSteps = Math.max(...days.map((d) => d.activity!.steps || 0));
	const maxCal = Math.max(
		...days.map((d) => d.activity!.activeCalories || 0)
	);
	const maxHR = Math.max(
		...days.map(
			(d) =>
				d.heart!.restingHeartRate || d.heart!.averageHeartRate || 80
		)
	);
	const minHR = Math.min(
		...days.map(
			(d) =>
				d.heart!.restingHeartRate || d.heart!.averageHeartRate || 60
		)
	);

	const maxRx = W / 2 - 16;
	const maxRy = H / 2 - 16;
	const ringGap = Math.min(maxRx, maxRy) / days.length;
	const sx = maxRx / Math.max(maxRx, maxRy);
	const sy = maxRy / Math.max(maxRx, maxRy);

	days.forEach((day, i) => {
		const baseR = 16 + i * ringGap;
		const steps = day.activity!.steps || 0;
		const cal = day.activity!.activeCalories || 0;
		const hr =
			day.heart!.restingHeartRate ||
			day.heart!.averageHeartRate ||
			70;

		const stepsAngle = (steps / maxSteps) * Math.PI * 2;

		ctx.save();
		ctx.translate(cx, cy);
		ctx.scale(
			sx > sy ? 1 : maxRx / maxRy,
			sy > sx ? 1 : maxRy / maxRx
		);

		// Steps arc (accent)
		ctx.strokeStyle = hexToRgba(theme.colors.accent, 0.25 + (steps / maxSteps) * 0.55);
		ctx.lineWidth = ringGap * 0.4;
		ctx.lineCap = "round";
		ctx.beginPath();
		ctx.arc(0, 0, baseR, -Math.PI / 2, -Math.PI / 2 + stepsAngle);
		ctx.stroke();

		// Calories arc (secondary)
		const calAngle = (cal / maxCal) * Math.PI * 2;
		ctx.strokeStyle = hexToRgba(theme.colors.secondary, 0.25 + (cal / maxCal) * 0.55);
		ctx.lineWidth = ringGap * 0.22;
		ctx.beginPath();
		ctx.arc(
			0,
			0,
			baseR + ringGap * 0.15,
			-Math.PI / 2,
			-Math.PI / 2 + calAngle
		);
		ctx.stroke();

		ctx.restore();

		// HR dot at end of steps arc
		const hrT = (hr - minHR) / (maxHR - minHR || 1);
		const dotAngle = -Math.PI / 2 + stepsAngle;
		const scaleX = sx > sy ? 1 : maxRx / maxRy;
		const scaleY = sy > sx ? 1 : maxRy / maxRx;
		const dx = cx + Math.cos(dotAngle) * baseR * scaleX;
		const dy = cy + Math.sin(dotAngle) * baseR * scaleY;
		ctx.fillStyle = hsl(lerp(200, 0, hrT), 80, 50);
		ctx.beginPath();
		ctx.arc(dx, dy, 3, 0, Math.PI * 2);
		ctx.fill();

		hits.add({
			shape: "circle",
			cx: dx,
			cy: dy,
			r: 8,
			title: formatDate(day.date),
			details: [
				{ label: "Steps", value: steps.toLocaleString() },
				{
					label: "Calories",
					value: `${Math.round(cal)} kcal`,
				},
				{ label: "Resting HR", value: `${Math.round(hr)} bpm` },
				...(day.activity!.exerciseMinutes
					? [
							{
								label: "Exercise",
								value: `${day.activity!.exerciseMinutes} min`,
							},
					  ]
					: []),
			],
			payload: day,
		});
	});

	ctx.fillStyle = theme.muted;
	ctx.font = "9px sans-serif";
	ctx.textAlign = "center";
	ctx.fillText("inner → outer", cx, cy - 3);
	ctx.fillText("oldest → newest", cx, cy + 9);
};
