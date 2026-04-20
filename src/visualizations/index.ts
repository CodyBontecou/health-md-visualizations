import { HtmlRenderFn, RenderFn } from "../types";
import { renderHeartTerrain } from "./heart-terrain";
import { renderSleepPolar } from "./sleep-polar";
import { renderStepSpiral } from "./step-spiral";
import { renderOxygenRiver } from "./oxygen-river";
import { renderBreathingWave } from "./breathing-wave";
import { renderVitalsRings } from "./vitals-rings";
import { renderWalkingSymmetry } from "./walking-symmetry";
import { renderSleepArchitecture } from "./sleep-architecture";
import { renderHrvTrend } from "./hrv-trend";
import { renderActivityHeatmap } from "./activity-heatmap";
import { renderSleepQualityBars } from "./sleep-quality-bars";
import { renderWorkoutLog } from "./workout-log";
import { renderIntroStats } from "./intro-stats";
import { renderSummaryCard } from "./summary-card";
import { renderActivityRings } from "./activity-rings";

export const VISUALIZATIONS: Record<string, RenderFn> = {
	"heart-terrain": renderHeartTerrain,
	"sleep-polar": renderSleepPolar,
	"step-spiral": renderStepSpiral,
	"oxygen-river": renderOxygenRiver,
	"breathing-wave": renderBreathingWave,
	"vitals-rings": renderVitalsRings,
	"walking-symmetry": renderWalkingSymmetry,
	"sleep-architecture": renderSleepArchitecture,
	"hrv-trend": renderHrvTrend,
	"activity-heatmap": renderActivityHeatmap,
	"sleep-quality-bars": renderSleepQualityBars,
	"workout-log": renderWorkoutLog,
	"activity-rings": renderActivityRings,
};

export const HTML_VISUALIZATIONS: Record<string, HtmlRenderFn> = {
	"intro-stats": renderIntroStats,
	"summary-card": renderSummaryCard,
};
