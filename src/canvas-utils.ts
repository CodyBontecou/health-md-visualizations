import { ResolvedTheme } from "./types";

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

export function hsl(h: number, s: number, l: number): string {
	return `hsl(${h},${s}%,${l}%)`;
}

export const SLEEP_COLORS: Record<string, string> = {
	deep: "#312e81",
	rem: "#7c3aed",
	core: "#2dd4bf",
	awake: "#f59e0b",
};

export const SLEEP_GLOW: Record<string, string> = {
	deep: "#4338ca",
	rem: "#a78bfa",
	core: "#5eead4",
	awake: "#fbbf24",
};

export function resolveTheme(setting: "dark" | "light" | "auto"): ResolvedTheme {
	let isDark: boolean;
	if (setting === "auto") {
		isDark = document.body.classList.contains("theme-dark");
	} else {
		isDark = setting === "dark";
	}

	return isDark
		? { bg: "#0a0a0f", fg: "#e0e0e0", muted: "#555", isDark: true }
		: { bg: "#ffffff", fg: "#1a1a1a", muted: "#999", isDark: false };
}
