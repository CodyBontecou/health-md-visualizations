import { HealthDay, HitRegistry, VizConfig, ResolvedTheme, RenderFn } from "../types";
import { hexToRgba, formatDate, formatDuration } from "../canvas-utils";

export const renderSleepQualityBars: RenderFn = (
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

	const days = data.filter((d) => d.sleep && d.sleep.totalDuration > 0);
	if (!days.length) return;

	const padL = 40, padR = 16, padT = 20, padB = 28;
	const plotW = W - padL - padR;
	const plotH = H - padT - padB;

	const maxTotal = Math.max(...days.map((d) => d.sleep!.totalDuration));

	const barW = plotW / days.length;
	const gap = Math.max(1, barW * 0.15);

	// Y-axis labels (hours)
	const maxHours = Math.ceil(maxTotal / 3600);
	const gridStep = maxHours <= 8 ? 2 : 4;
	ctx.strokeStyle = hexToRgba(theme.fg, 0.07);
	ctx.lineWidth = 1;
	for (let h = 0; h <= maxHours; h += gridStep) {
		const y = padT + plotH - (h / maxHours) * plotH;
		ctx.beginPath();
		ctx.moveTo(padL, y);
		ctx.lineTo(W - padR, y);
		ctx.stroke();
		ctx.fillStyle = theme.muted;
		ctx.font = "9px sans-serif";
		ctx.textAlign = "right";
		ctx.fillText(`${h}h`, padL - 4, y + 3);
	}

	// Legend
	const legend = [
		{ label: "Deep", color: theme.colors.sleep.deep },
		{ label: "REM", color: theme.colors.sleep.rem },
		{ label: "Core", color: theme.colors.sleep.core },
		{ label: "Awake", color: theme.colors.sleep.awake },
	];
	let lx = padL;
	ctx.font = "8px sans-serif";
	ctx.textAlign = "left";
	for (const item of legend) {
		ctx.fillStyle = item.color;
		ctx.fillRect(lx, padT - 12, 8, 6);
		ctx.fillStyle = theme.muted;
		ctx.fillText(item.label, lx + 10, padT - 7);
		lx += 44;
	}

	// Stacked bars
	days.forEach((day, i) => {
		const sl = day.sleep!;
		const x = padL + i * barW + gap / 2;
		const bw = barW - gap;

		const segments: Array<{ secs: number; color: string; label: string }> = [
			{ secs: sl.deepSleep || 0, color: theme.colors.sleep.deep, label: "Deep" },
			{ secs: sl.remSleep || 0, color: theme.colors.sleep.rem, label: "REM" },
			{ secs: sl.coreSleep || 0, color: theme.colors.sleep.core, label: "Core" },
			{ secs: sl.awakeTime || 0, color: theme.colors.sleep.awake, label: "Awake" },
		].filter((s) => s.secs > 0);

		let stackY = padT + plotH;

		segments.forEach(({ secs, color, label }, si) => {
			const segH = (secs / maxTotal) * plotH;
			stackY -= segH;
			const isTop = si === segments.length - 1;
			const r = isTop ? Math.min(3, bw / 4) : 0;

			ctx.fillStyle = hexToRgba(color, 0.85);
			ctx.beginPath();
			if (isTop) {
				ctx.roundRect(x, stackY, bw, segH, [r, r, 0, 0]);
			} else {
				ctx.rect(x, stackY, bw, segH);
			}
			ctx.fill();

			// Segment label if tall enough
			if (segH > 14) {
				ctx.fillStyle = hexToRgba(theme.bg, 0.7);
				ctx.font = "7px sans-serif";
				ctx.textAlign = "center";
				ctx.fillText(label, x + bw / 2, stackY + segH / 2 + 2.5);
			}
		});

		// Date label
		const d = new Date(day.date + "T00:00:00");
		const lbl = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
		ctx.fillStyle = theme.muted;
		ctx.font = "8px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText(lbl, x + bw / 2, H - 6);

		// Hit region
		const barTop = padT + plotH - (sl.totalDuration / maxTotal) * plotH;
		hits.add({
			shape: "rect",
			x,
			y: barTop,
			w: bw,
			h: plotH - (barTop - padT),
			title: formatDate(day.date),
			details: [
				{ label: "Total", value: formatDuration(sl.totalDuration) },
				...(sl.deepSleep ? [{ label: "Deep", value: formatDuration(sl.deepSleep) }] : []),
				...(sl.remSleep ? [{ label: "REM", value: formatDuration(sl.remSleep) }] : []),
				...(sl.coreSleep ? [{ label: "Core", value: formatDuration(sl.coreSleep) }] : []),
				...(sl.awakeTime ? [{ label: "Awake", value: formatDuration(sl.awakeTime) }] : []),
				...(sl.bedtime
					? [{
						label: "Bedtime",
						value: new Date(sl.bedtime).toLocaleTimeString("en-US", {
							hour: "numeric", minute: "2-digit",
						}),
					  }]
					: []),
			],
			payload: day,
		});
	});

	// Stats strip
	const avgTotal = days.reduce((s, d) => s + d.sleep!.totalDuration, 0) / days.length;
	const avgDeep = days.reduce((s, d) => s + (d.sleep!.deepSleep || 0), 0) / days.length;
	const avgRem = days.reduce((s, d) => s + (d.sleep!.remSleep || 0), 0) / days.length;
	statsEl.innerHTML =
		`<span>Avg sleep <strong>${formatDuration(avgTotal)}</strong></span>` +
		`<span>Avg deep <strong>${formatDuration(avgDeep)}</strong></span>` +
		`<span>Avg REM <strong>${formatDuration(avgRem)}</strong></span>`;
};
