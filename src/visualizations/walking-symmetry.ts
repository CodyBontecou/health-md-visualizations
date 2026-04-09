import { HealthDay, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { lerp } from "../canvas-utils";

export const renderWalkingSymmetry: RenderFn = (
	ctx: CanvasRenderingContext2D,
	data: HealthDay[],
	W: number,
	H: number,
	_config: VizConfig,
	theme: ResolvedTheme,
	_statsEl: HTMLElement
): void => {
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);

	const days = data.filter((d) => d.mobility);
	if (!days.length) return;

	const maxSpeed = Math.max(
		...days.map((d) => d.mobility!.walkingSpeed || 0)
	);
	const maxAsym = Math.max(
		...days.map((d) => d.mobility!.walkingAsymmetryPercentage || 0)
	);

	const barW = (W - 20) / days.length;
	const leftPad = 10;
	const midY = H / 2;

	days.forEach((day, i) => {
		const speed = day.mobility!.walkingSpeed || 0;
		const asym = day.mobility!.walkingAsymmetryPercentage || 0;
		const x = leftPad + i * barW;

		// Speed bars (up)
		const speedH = maxSpeed > 0 ? (speed / maxSpeed) * (midY - 16) : 0;
		const sg = ctx.createLinearGradient(x, midY, x, midY - speedH);
		sg.addColorStop(0, "rgba(45, 212, 191, 0.08)");
		sg.addColorStop(1, "rgba(45, 212, 191, 0.75)");
		ctx.fillStyle = sg;
		ctx.beginPath();
		ctx.roundRect(x + 1, midY - speedH, barW - 2, speedH, [3, 3, 0, 0]);
		ctx.fill();

		// Asymmetry bars (down)
		const asymH = maxAsym > 0 ? (asym / maxAsym) * (midY - 16) : 0;
		const asymT = maxAsym > 0 ? asym / maxAsym : 0;
		const ag = ctx.createLinearGradient(x, midY, x, midY + asymH);
		ag.addColorStop(0, "rgba(245, 158, 11, 0.08)");
		ag.addColorStop(
			1,
			`rgba(${Math.round(lerp(245, 239, asymT))},${Math.round(lerp(158, 68, asymT))},${Math.round(lerp(11, 68, asymT))},0.75)`
		);
		ctx.fillStyle = ag;
		ctx.beginPath();
		ctx.roundRect(x + 1, midY, barW - 2, asymH, [0, 0, 3, 3]);
		ctx.fill();
	});

	// Center line
	ctx.strokeStyle = theme.isDark ? "#222" : "#ddd";
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(leftPad, midY);
	ctx.lineTo(W, midY);
	ctx.stroke();

	// Labels
	ctx.fillStyle = theme.muted;
	ctx.font = "8px sans-serif";
	ctx.textAlign = "center";
	ctx.fillText("↑ speed", W / 2, 12);
	ctx.fillText("↓ wobble", W / 2, H - 4);
};
