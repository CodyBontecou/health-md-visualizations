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
import { renderTrendTile } from "./trend-tile";
import { renderActivityRings } from "./activity-rings";
import { renderHeartRange } from "./heart-range";
import { renderBarChart } from "./bar-chart";
import { renderSleepSchedule } from "./sleep-schedule";
import { renderWeekdayAverage } from "./weekday-average";

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
	"heart-range": renderHeartRange,
	"bar-chart": renderBarChart,
	"sleep-schedule": renderSleepSchedule,
	"weekday-average": renderWeekdayAverage,
};

export const HTML_VISUALIZATIONS: Record<string, HtmlRenderFn> = {
	"intro-stats": renderIntroStats,
	"summary-card": renderSummaryCard,
	"trend-tile": renderTrendTile,
};
