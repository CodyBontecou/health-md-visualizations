import { HealthDay, HitRegistry, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { hexToRgba, formatDate, formatDuration } from "../canvas-utils";

// Map workout type names to short display labels
const TYPE_LABELS: Record<string, string> = {
	running: "Run",
	cycling: "Bike",
	walking: "Walk",
	swimming: "Swim",
	hiking: "Hike",
	yoga: "Yoga",
	strength: "Lift",
	"strength training": "Lift",
	elliptical: "Elli",
	rowing: "Row",
	pilates: "Pil",
	"high intensity interval training": "HIIT",
	hiit: "HIIT",
	tennis: "Ten",
	basketball: "Bball",
	soccer: "Soccer",
	dance: "Dance",
	"core training": "Core",
	"functional strength training": "Func",
};

function shortLabel(type: string): string {
	const lower = type.toLowerCase().trim();
	return TYPE_LABELS[lower] ?? type.slice(0, 5);
}

// Stable color index for a workout type string
function typeColorIndex(type: string): number {
	let hash = 0;
	for (let i = 0; i < type.length; i++) hash = (hash * 31 + type.charCodeAt(i)) & 0xffff;
	return hash % 6;
}

const HUE_OFFSETS = [0, 40, 80, 160, 210, 280];

export const renderWorkoutLog: RenderFn = (
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

	// Collect all workouts with their day date
	interface Entry {
		date: string;
		type: string;
		duration: number;
		calories: number;
		distance?: number;
		durationFormatted?: string;
		distanceFormatted?: string;
	}
	const entries: Entry[] = [];
	for (const day of data) {
		if (!day.workouts) continue;
		for (const w of day.workouts) {
			if (!w.duration) continue;
			entries.push({
				date: day.date,
				type: w.type || "Workout",
				duration: w.duration,
				calories: w.calories || 0,
				distance: w.distance,
				durationFormatted: w.durationFormatted,
				distanceFormatted: w.distanceFormatted,
			});
		}
	}

	if (!entries.length) {
		ctx.fillStyle = theme.muted;
		ctx.font = "12px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText("No workouts in range", W / 2, H / 2);
		return;
	}

	const padL = 40, padR = 16, padT = 12, padB = 8;
	const plotW = W - padL - padR;

	const maxDuration = Math.max(...entries.map((e) => e.duration));
	const rowH = Math.min(28, (H - padT - padB) / entries.length);
	const barH = rowH * 0.55;
	const gap = (rowH - barH) / 2;
	const radius = barH / 3;

	// If entries overflow height, cap and show count
	const visibleCount = Math.floor((H - padT - padB) / rowH);
	const visible = entries.slice(0, visibleCount);

	// X-axis tick: max duration in minutes
	const maxMin = Math.ceil(maxDuration / 60);
	const tickStep = maxMin <= 60 ? 15 : maxMin <= 120 ? 30 : 60;
	ctx.strokeStyle = hexToRgba(theme.fg, 0.07);
	ctx.lineWidth = 1;
	ctx.fillStyle = theme.muted;
	ctx.font = "8px sans-serif";
	ctx.textAlign = "center";
	for (let t = 0; t <= maxMin; t += tickStep) {
		const x = padL + (t / maxMin) * plotW;
		ctx.beginPath();
		ctx.moveTo(x, padT);
		ctx.lineTo(x, padT + visible.length * rowH);
		ctx.stroke();
		ctx.fillText(`${t}m`, x, padT - 2);
	}

	visible.forEach((entry, i) => {
		const y = padT + i * rowH + gap;
		const barW = (entry.duration / (maxMin * 60)) * plotW;

		// Color by workout type
		const ci = typeColorIndex(entry.type);
		const hue = HUE_OFFSETS[ci];
		const barColor = `hsl(${hue},60%,${theme.isDark ? 55 : 42}%)`;

		// Bar
		ctx.fillStyle = hexToRgba(barColor, 0.8);
		ctx.beginPath();
		ctx.roundRect(padL, y, Math.max(barW, 4), barH, radius);
		ctx.fill();

		// Workout type label on left
		ctx.fillStyle = theme.muted;
		ctx.font = "8px sans-serif";
		ctx.textAlign = "right";
		const d = new Date(entry.date + "T00:00:00");
		const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
		ctx.fillText(dateStr, padL - 3, y + barH / 2 + 3);

		// Type badge inside or after bar
		ctx.fillStyle = barW > 30 ? hexToRgba(theme.bg, 0.8) : theme.fg;
		ctx.font = `bold 7px sans-serif`;
		ctx.textAlign = barW > 30 ? "left" : "left";
		ctx.fillText(shortLabel(entry.type), barW > 30 ? padL + 4 : padL + barW + 4, y + barH / 2 + 2.5);

		hits.add({
			shape: "rect",
			x: padL,
			y,
			w: Math.max(barW, 24),
			h: barH,
			title: `${formatDate(entry.date)} — ${entry.type}`,
			details: [
				{ label: "Duration", value: entry.durationFormatted ?? formatDuration(entry.duration) },
				...(entry.calories ? [{ label: "Calories", value: `${Math.round(entry.calories)} kcal` }] : []),
				...(entry.distance != null
					? [{ label: "Distance", value: entry.distanceFormatted ?? `${entry.distance.toFixed(2)} km` }]
					: []),
			],
			payload: entry,
		});
	});

	if (entries.length > visibleCount) {
		ctx.fillStyle = theme.muted;
		ctx.font = "8px sans-serif";
		ctx.textAlign = "left";
		ctx.fillText(`+${entries.length - visibleCount} more — increase height to see all`, padL, H - 2);
	}

	// Stats strip
	const totalDur = entries.reduce((s, e) => s + e.duration, 0);
	const totalCal = entries.reduce((s, e) => s + e.calories, 0);
	const types = [...new Set(entries.map((e) => e.type))];
	statsEl.innerHTML =
		`<span>${entries.length} workouts</span>` +
		`<span>Total time <strong>${formatDuration(totalDur)}</strong></span>` +
		(totalCal ? `<span>Total cal <strong>${Math.round(totalCal).toLocaleString()} kcal</strong></span>` : "") +
		`<span>Types: <strong>${types.slice(0, 4).join(", ")}${types.length > 4 ? "…" : ""}</strong></span>`;
};
