import { RenderFn } from "../types";
import { renderHeartTerrain } from "./heart-terrain";
import { renderSleepPolar } from "./sleep-polar";
import { renderStepSpiral } from "./step-spiral";
import { renderOxygenRiver } from "./oxygen-river";
import { renderBreathingWave } from "./breathing-wave";
import { renderVitalsRings } from "./vitals-rings";
import { renderWalkingSymmetry } from "./walking-symmetry";
import { renderSleepArchitecture } from "./sleep-architecture";

export const VISUALIZATIONS: Record<string, RenderFn> = {
	"heart-terrain": renderHeartTerrain,
	"sleep-polar": renderSleepPolar,
	"step-spiral": renderStepSpiral,
	"oxygen-river": renderOxygenRiver,
	"breathing-wave": renderBreathingWave,
	"vitals-rings": renderVitalsRings,
	"walking-symmetry": renderWalkingSymmetry,
	"sleep-architecture": renderSleepArchitecture,
};
