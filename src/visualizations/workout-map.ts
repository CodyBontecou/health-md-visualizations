import * as L from "leaflet";
import { HealthDay, HtmlRenderFn, ResolvedTheme, RoutePoint, VizConfig } from "../types";
import {
	formatDistance,
	formatElevation,
	formatPace,
	pickWorkout,
} from "../workout-utils";
import { formatDuration } from "../canvas-utils";

const MAX_POINTS = 1500;

function downsample<T>(arr: T[], max: number): T[] {
	if (arr.length <= max) return arr;
	const stride = arr.length / max;
	const out: T[] = [];
	for (let i = 0; i < max - 1; i++) {
		out.push(arr[Math.floor(i * stride)]);
	}
	out.push(arr[arr.length - 1]);
	return out;
}

// Haversine distance in meters between two route points.
function haversine(a: RoutePoint, b: RoutePoint): number {
	const R = 6371000;
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(b.latitude - a.latitude);
	const dLon = toRad(b.longitude - a.longitude);
	const lat1 = toRad(a.latitude);
	const lat2 = toRad(b.latitude);
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
	return 2 * R * Math.asin(Math.sqrt(h));
}

interface PointValues {
	values: number[];
	min: number;
	max: number;
}

// Compute per-point coloring values (speed in m/s, or HR in BPM) along the route.
// Speed source preference: route[i].speedMps → derived from haversine + elapsed.
function computeValues(
	route: RoutePoint[],
	colorBy: "speed" | "hr",
	hrSamples: { timestamp: string; value: number }[] | undefined
): PointValues {
	const values = new Array<number>(route.length).fill(0);
	let min = Infinity;
	let max = -Infinity;

	if (colorBy === "hr" && hrSamples && hrSamples.length) {
		const hrTimes = hrSamples.map((s) => Date.parse(s.timestamp));
		for (let i = 0; i < route.length; i++) {
			const t = Date.parse(route[i].timestamp);
			let lo = 0;
			let hi = hrTimes.length - 1;
			while (lo < hi) {
				const mid = (lo + hi) >> 1;
				if (hrTimes[mid] < t) lo = mid + 1;
				else hi = mid;
			}
			let idx = lo;
			if (idx > 0 && Math.abs(hrTimes[idx - 1] - t) < Math.abs(hrTimes[idx] - t)) {
				idx = idx - 1;
			}
			values[i] = hrSamples[idx].value;
			if (values[i] < min) min = values[i];
			if (values[i] > max) max = values[i];
		}
	} else {
		for (let i = 0; i < route.length; i++) {
			const p = route[i];
			let v = p.speedMps;
			if (v == null && i > 0) {
				const prev = route[i - 1];
				const dt =
					(Date.parse(p.timestamp) - Date.parse(prev.timestamp)) / 1000;
				if (dt > 0) v = haversine(prev, p) / dt;
			}
			values[i] = v ?? 0;
			if (values[i] < min) min = values[i];
			if (values[i] > max) max = values[i];
		}
	}

	if (!Number.isFinite(min) || !Number.isFinite(max)) {
		return { values, min: 0, max: 1 };
	}
	if (max - min < 0.0001) max = min + 1;
	return { values, min, max };
}

function colorForValue(t: number): string {
	// Blue (slow/cool) → green → yellow → red (fast/hot). t in [0,1].
	const hue = (1 - Math.max(0, Math.min(1, t))) * 240;
	return `hsl(${hue},75%,50%)`;
}

function totalRouteDistance(route: RoutePoint[]): number {
	let d = 0;
	for (let i = 1; i < route.length; i++) {
		d += haversine(route[i - 1], route[i]);
	}
	return d;
}

function renderHeader(
	host: HTMLElement,
	day: HealthDay,
	workout: import("../types").WorkoutEntry
): void {
	const header = host.createDiv({ cls: "health-md-workout-header" });

	const title = header.createDiv({ cls: "health-md-workout-title" });
	title.textContent = workout.type
		? workout.type.charAt(0).toUpperCase() + workout.type.slice(1)
		: "Workout";

	const stats = header.createDiv({ cls: "health-md-workout-stats" });
	const addStat = (label: string, value: string) => {
		const cell = stats.createDiv({ cls: "health-md-workout-stat" });
		cell.createDiv({ cls: "health-md-workout-stat-label", text: label });
		cell.createDiv({ cls: "health-md-workout-stat-value", text: value });
	};

	if (workout.distance != null) {
		addStat("Distance", formatDistance(workout.distance, day, workout.distanceFormatted));
	}
	addStat("Duration", workout.durationFormatted ?? formatDuration(workout.duration));
	if (workout.distance != null && workout.duration > 0) {
		addStat(
			"Avg pace",
			formatPace(workout.distance, workout.duration, day, workout.avgPaceFormatted)
		);
	}
	if (workout.elevationGainMeters != null) {
		addStat("Elev gain", formatElevation(workout.elevationGainMeters, day));
	}
	if (workout.elevationLossMeters != null) {
		addStat("Elev loss", formatElevation(workout.elevationLossMeters, day));
	}
	if (workout.avgHeartRate != null) {
		addStat("Avg HR", `${Math.round(workout.avgHeartRate)} BPM`);
	}
}

function renderEmptyMessage(host: HTMLElement, message: string): void {
	const msg = host.createDiv({ cls: "health-md-workout-empty" });
	msg.textContent = message;
}

function renderLeafletMap(
	host: HTMLElement,
	route: RoutePoint[],
	colorBy: "speed" | "hr",
	hrSamples: { timestamp: string; value: number }[] | undefined,
	theme: ResolvedTheme,
	configHeight: number
): void {
	const mapEl = host.createDiv({ cls: "health-md-workout-map" });
	mapEl.style.height = `${configHeight}px`;

	const map = L.map(mapEl, {
		zoomControl: true,
		attributionControl: true,
		scrollWheelZoom: false,
	});

	L.tileLayer(theme.mapTileUrl, {
		attribution: theme.mapTileAttribution,
		maxZoom: 19,
	}).addTo(map);

	const sampled = downsample(route, MAX_POINTS);
	const { values: valuesArr, min: vMin, max: vMax } = computeValues(
		sampled,
		colorBy,
		hrSamples
	);

	for (let i = 1; i < sampled.length; i++) {
		const t = (valuesArr[i] - vMin) / (vMax - vMin || 1);
		L.polyline(
			[
				[sampled[i - 1].latitude, sampled[i - 1].longitude],
				[sampled[i].latitude, sampled[i].longitude],
			],
			{
				color: colorForValue(t),
				weight: 4,
				opacity: 0.95,
				lineCap: "round",
				lineJoin: "round",
			}
		).addTo(map);
	}

	// Start / end markers
	const start = sampled[0];
	const end = sampled[sampled.length - 1];
	L.circleMarker([start.latitude, start.longitude], {
		radius: 6,
		color: "#22c55e",
		fillColor: "#22c55e",
		fillOpacity: 1,
		weight: 2,
	}).addTo(map);
	L.circleMarker([end.latitude, end.longitude], {
		radius: 6,
		color: "#ef4444",
		fillColor: "#ef4444",
		fillOpacity: 1,
		weight: 2,
	}).addTo(map);

	// Fit bounds with padding.
	const bounds = L.latLngBounds(
		sampled.map((p) => [p.latitude, p.longitude] as L.LatLngTuple)
	);
	map.fitBounds(bounds, { padding: [20, 20] });

	// Legend (color scale)
	const legend = mapEl.createDiv({ cls: "health-md-workout-map-legend" });
	const label = colorBy === "hr" ? "HR" : "Speed";
	const lo =
		colorBy === "hr"
			? `${Math.round(vMin)} BPM`
			: `${(vMin * 3.6).toFixed(1)} km/h`;
	const hi =
		colorBy === "hr"
			? `${Math.round(vMax)} BPM`
			: `${(vMax * 3.6).toFixed(1)} km/h`;
	legend.textContent = `${label} ${lo} – ${hi}`;
}

// Polyline-only fallback when tiles are disabled. Equirectangular projection.
function renderCanvasPolyline(
	host: HTMLElement,
	route: RoutePoint[],
	colorBy: "speed" | "hr",
	hrSamples: { timestamp: string; value: number }[] | undefined,
	theme: ResolvedTheme,
	width: number,
	height: number
): void {
	const wrapper = host.createDiv({
		cls: "health-md-workout-map health-md-workout-map-canvas",
	});
	wrapper.style.height = `${height}px`;

	const canvas = wrapper.createEl("canvas");
	const dpr = activeWindow.devicePixelRatio || 1;
	canvas.width = width * dpr;
	canvas.height = height * dpr;
	canvas.style.width = `${width}px`;
	canvas.style.height = `${height}px`;
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	ctx.scale(dpr, dpr);

	const sampled = downsample(route, MAX_POINTS);
	const lats = sampled.map((p) => p.latitude);
	const lons = sampled.map((p) => p.longitude);
	const minLat = Math.min(...lats);
	const maxLat = Math.max(...lats);
	const minLon = Math.min(...lons);
	const maxLon = Math.max(...lons);
	const midLat = (minLat + maxLat) / 2;
	const lonScale = Math.cos((midLat * Math.PI) / 180);

	const padding = 14;
	const plotW = width - padding * 2;
	const plotH = height - padding * 2;
	const lonSpan = (maxLon - minLon) * lonScale || 1e-6;
	const latSpan = maxLat - minLat || 1e-6;
	const scale = Math.min(plotW / lonSpan, plotH / latSpan);
	const offX = padding + (plotW - lonSpan * scale) / 2;
	const offY = padding + (plotH - latSpan * scale) / 2;

	const project = (p: RoutePoint): [number, number] => [
		offX + (p.longitude - minLon) * lonScale * scale,
		offY + (maxLat - p.latitude) * scale,
	];

	const { values: valuesArr, min: vMin, max: vMax } = computeValues(
		sampled,
		colorBy,
		hrSamples
	);

	ctx.lineWidth = 3;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	for (let i = 1; i < sampled.length; i++) {
		const [x0, y0] = project(sampled[i - 1]);
		const [x1, y1] = project(sampled[i]);
		const t = (valuesArr[i] - vMin) / (vMax - vMin || 1);
		ctx.strokeStyle = colorForValue(t);
		ctx.beginPath();
		ctx.moveTo(x0, y0);
		ctx.lineTo(x1, y1);
		ctx.stroke();
	}

	// Start / end dots
	const drawDot = (p: RoutePoint, fill: string) => {
		const [x, y] = project(p);
		ctx.fillStyle = fill;
		ctx.beginPath();
		ctx.arc(x, y, 5, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = theme.bg;
		ctx.lineWidth = 2;
		ctx.stroke();
	};
	drawDot(sampled[0], "#22c55e");
	drawDot(sampled[sampled.length - 1], "#ef4444");
}

export const renderWorkoutMap: HtmlRenderFn = (
	data: HealthDay[],
	el: HTMLElement,
	config: VizConfig,
	theme: ResolvedTheme
): void => {
	el.addClass("health-md-workout-container");

	const picked = pickWorkout(data, config);
	if (!picked) {
		renderEmptyMessage(el, "No workout found");
		return;
	}

	const { day, workout } = picked;
	renderHeader(el, day, workout);

	const route = workout.route ?? [];
	if (!route.length) {
		renderEmptyMessage(
			el,
			"Indoor workout — no GPS route available for this session."
		);
		return;
	}

	if (totalRouteDistance(route) < 5) {
		// Effectively a stationary recording; nothing meaningful to plot.
		renderEmptyMessage(el, "GPS route is too short to display.");
		return;
	}

	const colorBy: "speed" | "hr" =
		String(config.colorBy ?? "speed").toLowerCase() === "hr" ? "hr" : "speed";
	const hrSamples = workout.timeSeries?.heartRate;

	const widthCfg = typeof config.width === "number" ? config.width : 800;
	const heightCfg = typeof config.height === "number" ? config.height : 360;

	if (theme.mapTilesEnabled) {
		renderLeafletMap(el, route, colorBy, hrSamples, theme, heightCfg);
	} else {
		renderCanvasPolyline(el, route, colorBy, hrSamples, theme, widthCfg, heightCfg);
	}
};
