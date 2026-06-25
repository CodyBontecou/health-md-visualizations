import {
	ColorSchemeId,
	HealthMdSettings,
	ResolvedTheme,
	VizConfig,
} from "./types";

export interface ColorScheme {
	label: string;
	accent: string;
	secondary: string;
	heart: string;
	sleepDeep: string;
	sleepRem: string;
	sleepCore: string;
	sleepAwake: string;
}

export const COLOR_SCHEMES: Record<Exclude<ColorSchemeId, "custom" | "theme">, ColorScheme> = {
	default: {
		label: "Default",
		accent: "#2dd4bf",
		secondary: "#f59e0b",
		heart: "#ef4444",
		sleepDeep: "#312e81",
		sleepRem: "#7c3aed",
		sleepCore: "#2dd4bf",
		sleepAwake: "#f59e0b",
	},
	ocean: {
		label: "Ocean",
		accent: "#0ea5e9",
		secondary: "#38bdf8",
		heart: "#e11d48",
		sleepDeep: "#0c2461",
		sleepRem: "#1d4ed8",
		sleepCore: "#0ea5e9",
		sleepAwake: "#7dd3fc",
	},
	forest: {
		label: "Forest",
		accent: "#22c55e",
		secondary: "#84cc16",
		heart: "#ef4444",
		sleepDeep: "#14532d",
		sleepRem: "#15803d",
		sleepCore: "#4ade80",
		sleepAwake: "#bbf7d0",
	},
	sunset: {
		label: "Sunset",
		accent: "#f97316",
		secondary: "#ec4899",
		heart: "#ef4444",
		sleepDeep: "#7f1d1d",
		sleepRem: "#be185d",
		sleepCore: "#f97316",
		sleepAwake: "#fbbf24",
	},
	aurora: {
		label: "Aurora",
		accent: "#a855f7",
		secondary: "#06b6d4",
		heart: "#f43f5e",
		sleepDeep: "#1e1b4b",
		sleepRem: "#6d28d9",
		sleepCore: "#a855f7",
		sleepAwake: "#818cf8",
	},
	monochrome: {
		label: "Monochrome",
		accent: "#94a3b8",
		secondary: "#64748b",
		heart: "#475569",
		sleepDeep: "#0f172a",
		sleepRem: "#334155",
		sleepCore: "#64748b",
		sleepAwake: "#cbd5e1",
	},
};

export function setupCanvas(
	canvas: HTMLCanvasElement,
	w: number,
	h: number
): CanvasRenderingContext2D {
	const dpr = activeWindow.devicePixelRatio || 1;
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
	const normalized = normalizeColor(hex, "#000000");
	const r = parseInt(normalized.slice(1, 3), 16);
	const g = parseInt(normalized.slice(3, 5), 16);
	const b = parseInt(normalized.slice(5, 7), 16);
	return `rgba(${r},${g},${b},${alpha})`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const normalized = normalizeColor(hex, "#000000");
	return {
		r: parseInt(normalized.slice(1, 3), 16),
		g: parseInt(normalized.slice(3, 5), 16),
		b: parseInt(normalized.slice(5, 7), 16),
	};
}

function normalizeHexColor(value: string): string | null {
	const trimmed = value.trim();
	const short = /^#([0-9a-f]{3})$/i.exec(trimmed);
	if (short) {
		return `#${short[1]
			.split("")
			.map((c) => c + c)
			.join("")}`.toLowerCase();
	}
	if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
	return null;
}

function rgbToHex(r: number, g: number, b: number): string {
	return `#${[r, g, b]
		.map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0"))
		.join("")}`;
}

function parseRgbColor(value: string): string | null {
	const match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)$/i.exec(value.trim());
	if (!match) return null;
	return rgbToHex(Number(match[1]), Number(match[2]), Number(match[3]));
}

function cssColorToHex(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const hex = normalizeHexColor(trimmed);
	if (hex) return hex;
	const rgb = parseRgbColor(trimmed);
	if (rgb) return rgb;

	try {
		const probe = activeDocument.createElement("span");
		probe.style.color = trimmed;
		if (!probe.style.color && !trimmed.startsWith("var(")) return null;
		activeDocument.body.appendChild(probe);
		const computed = activeWindow.getComputedStyle(probe).color;
		probe.remove();
		return parseRgbColor(computed) ?? normalizeHexColor(computed);
	} catch {
		return null;
	}
}

function normalizeColor(value: unknown, fallback: string): string {
	if (typeof value !== "string") return fallback;
	return cssColorToHex(value) ?? fallback;
}

function getCssColor(name: string, fallback: string): string {
	try {
		const value = activeWindow
			.getComputedStyle(activeDocument.body)
			.getPropertyValue(name);
		return normalizeColor(value, fallback);
	} catch {
		return fallback;
	}
}

function configColor(
	config: VizConfig | undefined,
	keys: string[],
	fallback: string
): string {
	if (!config) return fallback;
	for (const key of keys) {
		const value = config[key];
		if (typeof value === "string") {
			const color = normalizeColor(value, "");
			if (color) return color;
		}
	}
	return fallback;
}

function normalizeThemeMode(value: unknown, fallback: HealthMdSettings["theme"]): HealthMdSettings["theme"] {
	if (typeof value !== "string") return fallback;
	const mode = value.trim().toLowerCase();
	return mode === "auto" || mode === "dark" || mode === "light" ? mode : fallback;
}

function normalizeColorScheme(value: unknown): ColorSchemeId | null {
	if (typeof value !== "string") return null;
	const scheme = value.trim().toLowerCase();
	if (scheme === "theme" || scheme === "custom") return scheme;
	if (Object.prototype.hasOwnProperty.call(COLOR_SCHEMES, scheme)) {
		return scheme as ColorSchemeId;
	}
	return null;
}

export function resolveTheme(settings: HealthMdSettings, config?: VizConfig): ResolvedTheme {
	const themeMode = normalizeThemeMode(config?.theme, settings.theme);
	let isDark: boolean;
	if (themeMode === "auto") {
		isDark = activeDocument.body.classList.contains("theme-dark");
	} else {
		isDark = themeMode === "dark";
	}

	const fallbackBase = isDark
		? { bg: "#0a0a0f", fg: "#e0e0e0", muted: "#555555", isDark: true }
		: { bg: "#ffffff", fg: "#1a1a1a", muted: "#999999", isDark: false };

	const obsidianBase = themeMode === "auto"
		? {
			bg: getCssColor("--background-primary", fallbackBase.bg),
			fg: getCssColor("--text-normal", fallbackBase.fg),
			muted: getCssColor("--text-muted", fallbackBase.muted),
			isDark,
		}
		: fallbackBase;

	const requestedScheme = normalizeColorScheme(config?.colorScheme ?? config?.palette);
	const scheme = requestedScheme ?? settings.colorScheme;
	const preset = scheme !== "custom" && scheme !== "theme" ? COLOR_SCHEMES[scheme] : undefined;
	const themeAccent = getCssColor("--interactive-accent", getCssColor("--color-accent", settings.colorAccent));
	const themeSecondary = getCssColor("--text-accent", getCssColor("--interactive-accent-hover", settings.colorSecondary));

	const palette = preset
		? {
			accent: preset.accent,
			secondary: preset.secondary,
			heart: preset.heart,
			sleepDeep: preset.sleepDeep,
			sleepRem: preset.sleepRem,
			sleepCore: preset.sleepCore,
			sleepAwake: preset.sleepAwake,
		}
		: scheme === "theme"
			? {
				accent: themeAccent,
				secondary: themeSecondary,
				heart: settings.colorHeart,
				sleepDeep: settings.colorSleepDeep,
				sleepRem: settings.colorSleepRem,
				sleepCore: themeAccent,
				sleepAwake: settings.colorSleepAwake,
			}
			: {
				accent: settings.colorAccent,
				secondary: settings.colorSecondary,
				heart: settings.colorHeart,
				sleepDeep: settings.colorSleepDeep,
				sleepRem: settings.colorSleepRem,
				sleepCore: settings.colorSleepCore,
				sleepAwake: settings.colorSleepAwake,
			};

	return {
		bg: configColor(config, ["background", "bg", "colorBackground"], obsidianBase.bg),
		fg: configColor(config, ["foreground", "fg", "text", "colorForeground"], obsidianBase.fg),
		muted: configColor(config, ["muted", "textMuted", "colorMuted"], obsidianBase.muted),
		isDark,
		colors: {
			accent: configColor(config, ["accent", "colorAccent"], palette.accent),
			secondary: configColor(config, ["secondary", "colorSecondary"], palette.secondary),
			heart: configColor(config, ["heart", "heartRate", "colorHeart"], palette.heart),
			sleep: {
				deep: configColor(config, ["sleepDeep", "colorSleepDeep"], palette.sleepDeep),
				rem: configColor(config, ["sleepRem", "colorSleepRem"], palette.sleepRem),
				core: configColor(config, ["sleepCore", "colorSleepCore"], palette.sleepCore),
				awake: configColor(config, ["sleepAwake", "colorSleepAwake"], palette.sleepAwake),
			},
			activity: {
				move: configColor(config, ["activityMove", "move", "colorActivityMove"], palette.heart),
				exercise: configColor(config, ["activityExercise", "exercise", "colorActivityExercise"], palette.accent),
				stand: configColor(config, ["activityStand", "stand", "colorActivityStand"], palette.secondary),
			},
		},
		maxHeartRate: settings.maxHeartRate,
		mapTilesEnabled: settings.mapTilesEnabled,
		mapTileUrl: settings.mapTileUrl,
		mapTileAttribution: settings.mapTileAttribution,
	};
}
