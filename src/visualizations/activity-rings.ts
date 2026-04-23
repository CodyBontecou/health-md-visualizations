import { HealthDay, HitRegistry, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { hexToRgba, formatDate } from "../canvas-utils";
import { renderStatBoxes } from "../dom-utils";

const RING_COLORS = {
	move: "#fa114f",
	exercise: "#92e82a",
	stand: "#1eeaef",
};

interface RingValues {
	move: number;
	exercise: number;
	stand: number;
}

interface RingGoals {
	move: number;
	exercise: number;
	stand: number;
}

function extractValues(day: HealthDay): RingValues {
	const act = day.activity;
	if (!act) return { move: 0, exercise: 0, stand: 0 };
	const steps = act.steps ?? 0;
	const standProxy = Math.min(12, Math.floor(steps / 1000));
	return {
		move: act.activeCalories ?? 0,
		exercise: act.exerciseMinutes ?? 0,
		stand: act.standHours ?? standProxy,
	};
}

function drawRingSet(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	outerR: number,
	stroke: number,
	values: RingValues,
	goals: RingGoals,
	theme: ResolvedTheme,
	hits: HitRegistry,
	day: HealthDay,
	label: string
): void {
	const rings: Array<{
		key: "move" | "exercise" | "stand";
		color: string;
		value: number;
		goal: number;
		unit: string;
	}> = [
		{ key: "move", color: RING_COLORS.move, value: values.move, goal: goals.move, unit: "CAL" },
		{ key: "exercise", color: RING_COLORS.exercise, value: values.exercise, goal: goals.exercise, unit: "MIN" },
		{ key: "stand", color: RING_COLORS.stand, value: values.stand, goal: goals.stand, unit: "HR" },
	];

	const gap = Math.max(2, stroke * 0.18);

	rings.forEach((ring, i) => {
		const r = outerR - i * (stroke + gap);
		if (r < stroke) return;

		const progress = ring.goal > 0 ? ring.value / ring.goal : 0;

		// Background track
		ctx.strokeStyle = hexToRgba(ring.color, theme.isDark ? 0.18 : 0.15);
		ctx.lineWidth = stroke;
		ctx.lineCap = "round";
		ctx.beginPath();
		ctx.arc(cx, cy, r, 0, Math.PI * 2);
		ctx.stroke();

		if (progress <= 0) return;

		const startA = -Math.PI / 2;
		const clamped = Math.min(progress, 1);
		const endA = startA + clamped * Math.PI * 2;

		// Main arc with gradient from color → lighter tint to emulate Apple's sheen
		const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
		grad.addColorStop(0, ring.color);
		grad.addColorStop(1, hexToRgba(ring.color, 0.75));
		ctx.strokeStyle = grad;
		ctx.lineWidth = stroke;
		ctx.lineCap = "round";
		ctx.beginPath();
		ctx.arc(cx, cy, r, startA, endA);
		ctx.stroke();

		// Overshoot: draw the overshoot arc at reduced opacity, layered on top.
		if (progress > 1) {
			const excess = Math.min(progress - 1, 1);
			const excessEnd = startA + excess * Math.PI * 2;
			ctx.strokeStyle = hexToRgba(ring.color, 0.55);
			ctx.beginPath();
			ctx.arc(cx, cy, r, startA, excessEnd);
			ctx.stroke();
		}

		hits.add({
			shape: "sector",
			cx,
			cy,
			r0: r - stroke / 2,
			r1: r + stroke / 2,
			a0: 0,
			a1: Math.PI * 2,
			title: `${label} — ${ring.key.toUpperCase()}`,
			details: [
				{ label: "Value", value: `${Math.round(ring.value)} ${ring.unit}` },
				{ label: "Goal", value: `${ring.goal} ${ring.unit}` },
				{ label: "Progress", value: `${Math.round(progress * 100)}%` },
			],
			payload: day,
		});
	});
}

export const renderActivityRings: RenderFn = (
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
	if (!days.length) {
		ctx.fillStyle = theme.muted;
		ctx.font = "12px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText("No activity data", W / 2, H / 2);
		return;
	}

	const goals: RingGoals = {
		move: Number(config.moveGoal) || 500,
		exercise: Number(config.exerciseGoal) || 30,
		stand: Number(config.standGoal) || 12,
	};

	if (days.length === 1) {
		// Single-day: large ring set, centered, with stat text in middle.
		const day = days[0];
		const values = extractValues(day);
		const cx = W / 2;
		const cy = H / 2;
		const outerR = Math.min(W, H) / 2 - 12;
		const stroke = Math.max(10, outerR * 0.14);
		drawRingSet(ctx, cx, cy, outerR, stroke, values, goals, theme, hits, day, formatDate(day.date));

		// Center labels
		const innerR = outerR - 3 * (stroke + stroke * 0.18) - stroke;
		const lines = [
			{ text: `${Math.round(values.move)}/${goals.move} CAL`, color: RING_COLORS.move },
			{ text: `${Math.round(values.exercise)}/${goals.exercise} MIN`, color: RING_COLORS.exercise },
			{ text: `${Math.round(values.stand)}/${goals.stand} HR`, color: RING_COLORS.stand },
		];
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		const lineH = Math.max(12, innerR * 0.42);
		const fontSize = Math.max(9, Math.min(14, innerR * 0.28));
		ctx.font = `600 ${fontSize}px sans-serif`;
		const startY = cy - ((lines.length - 1) * lineH) / 2;
		lines.forEach((l, i) => {
			ctx.fillStyle = l.color;
			ctx.fillText(l.text, cx, startY + i * lineH);
		});

		renderStatBoxes(statsEl, [
			{
				value: String(Math.round(values.move)),
				label: `Move / ${goals.move}`,
				color: RING_COLORS.move,
			},
			{
				value: String(Math.round(values.exercise)),
				label: `Exercise / ${goals.exercise}`,
				color: RING_COLORS.exercise,
			},
			{
				value: String(Math.round(values.stand)),
				label: `Stand / ${goals.stand}`,
				color: RING_COLORS.stand,
			},
		]);
		return;
	}

	// Multi-day: small multiples grid
	const canvas = ctx.canvas;
	const n = days.length;
	const cols = Math.min(n, Math.max(3, Math.round(Math.sqrt(n * (W / H)))));
	const rows = Math.ceil(n / cols);
	const gap = 10;
	const cellW = (W - gap * (cols - 1)) / cols;
	const dateLabelH = 16;
	const cellH = cellW + dateLabelH;

	const neededH = rows * cellH + (rows - 1) * gap + 8;
	if (neededH > H) {
		const dpr = activeWindow.devicePixelRatio || 1;
		canvas.width = W * dpr;
		canvas.height = neededH * dpr;
		canvas.style.width = W + "px";
		canvas.style.height = neededH + "px";
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.scale(dpr, dpr);
		ctx.fillStyle = theme.bg;
		ctx.fillRect(0, 0, W, neededH);
	}

	days.forEach((day, idx) => {
		const row = Math.floor(idx / cols);
		const col = idx % cols;
		const x0 = col * (cellW + gap);
		const y0 = row * (cellH + gap);
		const cx = x0 + cellW / 2;
		const cy = y0 + cellW / 2;
		const outerR = cellW / 2 - 4;
		const stroke = Math.max(4, outerR * 0.18);

		const values = extractValues(day);
		drawRingSet(ctx, cx, cy, outerR, stroke, values, goals, theme, hits, day, formatDate(day.date));

		// Date label under ring
		const d = new Date(day.date + "T00:00:00");
		const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
		ctx.fillStyle = theme.muted;
		ctx.font = "10px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(label, cx, y0 + cellW + dateLabelH / 2 + 1);
	});

	// Aggregate stats strip
	const totalMove = days.reduce((s, d) => s + extractValues(d).move, 0);
	const totalEx = days.reduce((s, d) => s + extractValues(d).exercise, 0);
	const closedMove = days.filter((d) => extractValues(d).move >= goals.move).length;
	const closedEx = days.filter((d) => extractValues(d).exercise >= goals.exercise).length;
	const closedStand = days.filter((d) => extractValues(d).stand >= goals.stand).length;
	renderStatBoxes(statsEl, [
		{
			value: `${closedMove}/${days.length}`,
			label: "Move closed",
			color: RING_COLORS.move,
		},
		{
			value: `${closedEx}/${days.length}`,
			label: "Exercise closed",
			color: RING_COLORS.exercise,
		},
		{
			value: `${closedStand}/${days.length}`,
			label: "Stand closed",
			color: RING_COLORS.stand,
		},
		{
			value: Math.round(totalMove).toLocaleString(),
			label: "Total CAL",
		},
		{
			value: String(Math.round(totalEx)),
			label: "Total min",
		},
	]);
};
