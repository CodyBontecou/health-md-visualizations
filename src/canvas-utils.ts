import { HealthMdSettings, ResolvedTheme } from "./types";

export function setupCanvas(
	canvas: HTMLCanvasElement,
	w: number,
	h: number
): CanvasRenderingContext2D {
	const dpr = window.devicePixelRatio || 1;
	canvas.width = w * dpr;
	canvas.height = h * dpr;
	canvas.style.width = w + "px";
	canvas.style.height = h + "px";
	const ctx = canvas.getContext("2d")!;
	ctx.scale(dpr, dpr);
	return ctx;
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

export function formatDate(iso: string): string {
	const d = new Date(iso + "T00:00:00");
	return d.toLocaleDateString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.round((seconds % 3600) / 60);
	if (h === 0) return `${m}m`;
	return `${h}h ${m}m`;
}

export function hsl(h: number, s: number, l: number): string {
	return `hsl(${h},${s}%,${l}%)`;
}

export function hexToRgba(hex: string, alpha: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgba(${r},${g},${b},${alpha})`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
	return {
		r: parseInt(hex.slice(1, 3), 16),
		g: parseInt(hex.slice(3, 5), 16),
		b: parseInt(hex.slice(5, 7), 16),
	};
}

export function resolveTheme(settings: HealthMdSettings): ResolvedTheme {
	let isDark: boolean;
	if (settings.theme === "auto") {
		isDark = document.body.classList.contains("theme-dark");
	} else {
		isDark = settings.theme === "dark";
	}

	const base = isDark
		? { bg: "#0a0a0f", fg: "#e0e0e0", muted: "#555", isDark: true }
		: { bg: "#ffffff", fg: "#1a1a1a", muted: "#999", isDark: false };

	return {
		...base,
		colors: {
			accent: settings.colorAccent,
			secondary: settings.colorSecondary,
			heart: settings.colorHeart,
			sleep: {
				deep: settings.colorSleepDeep,
				rem: settings.colorSleepRem,
				core: settings.colorSleepCore,
				awake: settings.colorSleepAwake,
			},
		},
	};
}
