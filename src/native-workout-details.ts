import type { HealthDay, WorkoutEntry } from "./types";
import { canonicalSourceInstant, exactSourceClockAgrees } from "./native-source-clock";
import { successorSleepDetails } from "./native-sleep-details";

export interface NativeWorkoutDetail {
    metric: "workout";
    sample: WorkoutEntry & Record<string, unknown>;
}
function object(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function sourceClocksAgree(value: unknown, path: string[] = []): boolean {
    if (Array.isArray(value)) return value.every(item => sourceClocksAgree(item, path));
    if (!object(value)) return true;
    const clocks = [["timestamp", "exactTime"], ["startTimeISO", "exactStartTime"], ["endTimeISO", "exactEndTime"]];
    if (path.at(-1) === "segments") clocks.push(["startTime", "exactStartTime"], ["endTime", "exactEndTime"]);
    for (const [clock, exact] of clocks) {
        if (value[clock] !== undefined && !exactSourceClockAgrees(value[clock], value[exact])) return false;
    }
    return Object.entries(value).every(([key, child]) =>
        ["metadata", "sourceRevision", "device", "identity", "correlatedSourceIds"].includes(key)
            || key.startsWith("exact") || sourceClocksAgree(child, [...path, key]));
}
export function nativeWorkoutDetails(value: unknown, profile: string | undefined): NativeWorkoutDetail[] | null {
    if (!successorSleepDetails(profile) || !Array.isArray(value)) return null;
    const result: NativeWorkoutDetail[] = [];
    for (const item of value) {
        if (!object(item) || item.metric !== "workout" || !object(item.sample)) return null;
        const sample = item.sample;
        const start = canonicalSourceInstant(sample.startTimeISO), end = canonicalSourceInstant(sample.endTimeISO);
        if (start === null || end === null || end < start || typeof sample.type !== "string" || !sample.type.trim()
            || typeof sample.duration !== "number" || !Number.isFinite(sample.duration) || sample.duration < 0
            || !sourceClocksAgree(sample)) return null;
        const delta = end - start;
        const elapsed = Number(delta / BigInt(1_000_000_000)) + Number(delta % BigInt(1_000_000_000)) / 1e9;
        if (typeof sample.elapsedDuration !== "number" || !Number.isFinite(sample.elapsedDuration)) return null;
        // Foundation Date intervals are binary floating-point. The successor writer retains
        // that native value while its round-trippable UTC endpoints use whole nanoseconds.
        // Endpoint rounding contributes at most one nanosecond; Android's exact instants do not.
        const tolerance = profile === "apple-v11" ? 1e-9 + Math.abs(elapsed) * Number.EPSILON : 0;
        if (Math.abs(sample.elapsedDuration - elapsed) > tolerance) return null;
        if (profile === "android-sleep-v6" && (sample.exactStartTime === undefined || sample.exactEndTime === undefined)) return null;
        result.push({metric: "workout", sample: {...sample, type: sample.type, duration: sample.duration}});
    }
    return result;
}
export function workoutsFromJSON(root: Record<string, unknown>, profile: string | undefined): NativeWorkoutDetail[] | null {
    if (root.workouts === undefined) return [];
    if (!Array.isArray(root.workouts)) return null;
    return nativeWorkoutDetails(root.workouts.map(sample => ({metric: "workout", sample})), profile);
}
export function attachNativeWorkoutDetails(day: HealthDay, records: NativeWorkoutDetail[]): void {
    if (!records.length) return;
    day.nativeWorkoutDetails = records;
    // Successor native workout distances are canonical meters. Never infer from rounded display strings.
    day.workouts = records.map(record => ({...record.sample,
        ...(typeof record.sample.distance === "number" ? {distanceMeters: record.sample.distance} : {})}));
}
