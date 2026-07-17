import { formatDate, hexToRgba } from "../canvas-utils";
import { renderInlineStats } from "../dom-utils";
import type {
	HealthDay,
	HealthMdCaptureSummary,
	HitRegionDetail,
	RawCaptureStatus,
	RenderFn,
	ResolvedTheme,
} from "../types";

interface CoverageDay {
	day: HealthDay;
	status: RawCaptureStatus;
	summary?: HealthMdCaptureSummary;
}

const STATUS_LABELS: Record<RawCaptureStatus, string> = {
	complete: "Complete",
	partial: "Partial",
	not_requested: "Not requested",
	legacy_unavailable: "Legacy / unknown",
};

function statusFor(day: HealthDay): CoverageDay {
	if (day.rawCapture) return { day, status: day.rawCapture.status, summary: day.rawCapture };
	if (day.raw_capture_status) return { day, status: day.raw_capture_status };
	// A missing status is unknown. Never infer that the user disabled capture.
	return { day, status: "legacy_unavailable" };
}

function statusColor(status: RawCaptureStatus, theme: ResolvedTheme): string {
	if (status === "complete") return theme.colors.accent;
	if (status === "partial") return theme.colors.secondary;
	if (status === "not_requested") return theme.muted;
	return theme.colors.sleep.rem;
}

function utcDate(iso: string): Date {
	return new Date(`${iso}T00:00:00Z`);
}

function isoDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function addDays(iso: string, amount: number): string {
	const date = utcDate(iso);
	date.setUTCDate(date.getUTCDate() + amount);
	return isoDate(date);
}

function tooltipDetails(item: CoverageDay): HitRegionDetail[] {
	const details: HitRegionDetail[] = [{ label: "Status", value: STATUS_LABELS[item.status] }];
	const summary = item.summary;
	if (!summary) return details;
	if (summary.recordCount !== undefined) details.push({ label: "Records", value: String(summary.recordCount) });
	if (summary.externalRecordCount !== undefined) details.push({ label: "External records", value: String(summary.externalRecordCount) });
	if (summary.queryFailureCount !== undefined) details.push({ label: "Query failures", value: String(summary.queryFailureCount) });
	if (summary.partialFailureCount !== undefined) details.push({ label: "Partial failures", value: String(summary.partialFailureCount) });
	if (summary.warningCount !== undefined) details.push({ label: "Warnings", value: String(summary.warningCount) });
	if (summary.queryStatusCounts) {
		const counts = summary.queryStatusCounts;
		details.push({
			label: "Queries",
			value: `success ${counts.success}, failure ${counts.failure}, cancelled ${counts.cancelled}, skipped ${counts.skipped}, unsupported ${counts.unsupported}, other ${counts.other}`,
		});
	}
	if (summary.validationIssues) {
		details.push({ label: "Validation issues", value: String(summary.validationIssues.length) });
	}
	return details;
}

function emptyState(ctx: CanvasRenderingContext2D, W: number, H: number, theme: ResolvedTheme): void {
	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	ctx.fillStyle = theme.muted;
	ctx.font = "12px sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText("No capture coverage data", W / 2, H / 2);
}

export const renderCaptureCoverageCalendar: RenderFn = (
	ctx,
	data,
	W,
	H,
	_config,
	theme,
	statsEl,
	hits
): void => {
	const days = [...data]
		.filter((day) => !Number.isNaN(utcDate(day.date).getTime()))
		.sort((a, b) => a.date.localeCompare(b.date));
	if (!days.length) {
		statsEl.empty();
		emptyState(ctx, W, H, theme);
		return;
	}

	ctx.fillStyle = theme.bg;
	ctx.fillRect(0, 0, W, H);
	const byDate = new Map(days.map((day) => [day.date, statusFor(day)]));
	const first = utcDate(days[0].date);
	const last = utcDate(days[days.length - 1].date);
	const start = new Date(first);
	start.setUTCDate(start.getUTCDate() - start.getUTCDay());
	const end = new Date(last);
	end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
	const totalDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
	const weeks = Math.max(1, Math.ceil(totalDays / 7));
	const padL = 42;
	const padR = 14;
	const padT = 70;
	const padB = 18;
	const slotW = Math.max(1, (W - padL - padR) / weeks);
	const slotH = Math.max(1, (H - padT - padB) / 7);
	const cell = Math.max(2, Math.min(slotW, slotH) - 3);

	ctx.fillStyle = theme.fg;
	ctx.font = "600 13px sans-serif";
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	ctx.fillText("Capture coverage", 14, 21);
	ctx.fillStyle = theme.muted;
	ctx.font = "9px sans-serif";
	ctx.textBaseline = "middle";
	let legendX = 14;
	(["complete", "partial", "not_requested", "legacy_unavailable"] as RawCaptureStatus[]).forEach((status) => {
		ctx.fillStyle = hexToRgba(statusColor(status, theme), status === "not_requested" ? 0.45 : 0.8);
		ctx.fillRect(legendX, 34, 8, 8);
		ctx.fillStyle = theme.muted;
		const label = STATUS_LABELS[status];
		ctx.fillText(label, legendX + 12, 38);
		legendX += 20 + ctx.measureText(label).width;
	});

	ctx.font = "9px sans-serif";
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((label, row) => {
		ctx.fillStyle = theme.muted;
		ctx.fillText(label, padL - 7, padT + row * slotH + slotH / 2);
	});

	let previousMonth = "";
	for (let index = 0; index < totalDays; index++) {
		const date = addDays(isoDate(start), index);
		const parsed = utcDate(date);
		const week = Math.floor(index / 7);
		const row = parsed.getUTCDay();
		const x = padL + week * slotW + (slotW - cell) / 2;
		const y = padT + row * slotH + (slotH - cell) / 2;
		const item = byDate.get(date);
		if (item) {
			const color = statusColor(item.status, theme);
			ctx.fillStyle = hexToRgba(color, item.status === "not_requested" ? 0.35 : 0.78);
			ctx.beginPath();
			ctx.roundRect(x, y, cell, cell, Math.min(3, cell / 4));
			ctx.fill();
			if (item.status === "legacy_unavailable") {
				ctx.strokeStyle = hexToRgba(color, 0.8);
				ctx.lineWidth = 1;
				ctx.stroke();
			}
			hits.add({
				shape: "rect",
				x,
				y,
				w: cell,
				h: cell,
				title: formatDate(date),
				details: tooltipDetails(item),
				payload: item.day,
			});
		} else {
			ctx.fillStyle = hexToRgba(theme.fg, 0.025);
			ctx.fillRect(x, y, cell, cell);
		}

		const month = parsed.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
		if (row === 0 && month !== previousMonth) {
			ctx.fillStyle = theme.muted;
			ctx.font = "9px sans-serif";
			ctx.textAlign = "left";
			ctx.textBaseline = "bottom";
			ctx.fillText(month, x, padT - 7);
			previousMonth = month;
		}
	}

	const counts: Record<RawCaptureStatus, number> = {
		complete: 0,
		partial: 0,
		not_requested: 0,
		legacy_unavailable: 0,
	};
	for (const item of byDate.values()) counts[item.status] += 1;
	renderInlineStats(statsEl, [
		[{ text: "Complete " }, { text: String(counts.complete), strong: true }],
		[{ text: "Partial " }, { text: String(counts.partial), strong: true }],
		[{ text: "Not requested " }, { text: String(counts.not_requested), strong: true }],
		[{ text: "Legacy / unknown " }, { text: String(counts.legacy_unavailable), strong: true }],
	]);
};
