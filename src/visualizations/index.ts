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
import { renderOxygenRange } from "./oxygen-range";
import { renderWorkoutHeartRate } from "./workout-heart-rate";
import { renderWorkoutZones } from "./workout-zones";
import { renderWorkoutTrends } from "./workout-trends";
import { renderWorkoutMap } from "./workout-map";
import { renderWorkoutIntervals } from "./workout-intervals";
import { renderMoodTrend } from "./mood-trend";
import {
	renderMedicationAdherenceSummary,
	renderMedicationAdherenceTrend,
	renderMedicationDoseStatus,
	renderMedicationInventory,
	renderMedicationOverview,
	renderMedicationRecentDoseEvents,
} from "./medication-overview";

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
	"oxygen-range": renderOxygenRange,
	"mood-trend": renderMoodTrend,
	"state-of-mind": renderMoodTrend,
	"workout-heart-rate": renderWorkoutHeartRate,
	"workout-zones": renderWorkoutZones,
	"workout-heart-rate-zones": renderWorkoutZones,
	"workout-trends": renderWorkoutTrends,
};

export const HTML_VISUALIZATIONS: Record<string, HtmlRenderFn> = {
	"intro-stats": renderIntroStats,
	"summary-card": renderSummaryCard,
	"trend-tile": renderTrendTile,
	"workout-map": renderWorkoutMap,
	"workout-intervals": renderWorkoutIntervals,
	"workout-laps": renderWorkoutIntervals,
	"medication-overview": renderMedicationOverview,
	"medications": renderMedicationOverview,
	"medication-adherence": renderMedicationOverview,
	"medication-inventory": renderMedicationInventory,
	"medication-adherence-summary": renderMedicationAdherenceSummary,
	"medication-dose-status": renderMedicationDoseStatus,
	"per-medication-dose-status": renderMedicationDoseStatus,
	"medication-adherence-trend": renderMedicationAdherenceTrend,
	"medication-daily-adherence-trend": renderMedicationAdherenceTrend,
	"medication-recent-dose-events": renderMedicationRecentDoseEvents,
	"medication-dose-events": renderMedicationRecentDoseEvents,
};
