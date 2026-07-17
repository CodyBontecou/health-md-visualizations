# Health.md Visualization Roadmap

This roadmap catalogs the visualization plugin's current renderers and the next visualizations that should be built to match the Health.md app export surface.

Source of truth checked in the app codebase:

- Daily export schema: `healthmd.health_data`
- Current daily schema version: `7`
- Current source-record archive: `healthmd.healthkit_records` v1
- App schema source: `/Users/codybontecou/projects/health-md/app/HealthMd/Shared/Export/HealthMetricsDictionary.swift`
- Plugin visualization registry / wizard: `src/visualizations/` and `src/insert-wizard.ts`

## Legend

- **Built** — implemented in the plugin today.
- **Gap / candidate** — data exists in Health.md exports but the plugin does not yet have a dedicated visualization.
- **Foundation** — infrastructure work that unlocks multiple visualization categories.

---

## Foundation / Schema Support

### Built

- **Schema compatibility detection**: recognizes legacy/unversioned exports, `healthmd.health_data` v1 through v7, `healthmd.healthkit_records` v1, roll-ups, and data dictionary files.
- **Lossless archive isolation**: retains compact capture diagnostics while skipping canonical record payloads so source records are not double counted as daily summary metrics.
- **Data dictionary support**: reads `_healthmd_data_dictionary.json` for canonical aliases, units, metric IDs, and metric types.
- **Multi-format loading**: supports JSON, RFC 4180 CSV, Markdown, and Obsidian Bases frontmatter.
- **Roll-up support**: indexes v7 JSON, CSV, Markdown, and Bases summaries separately from daily records and preserves all exported statistics.
- **Mixed-version loading**: keeps v5, v6, and v7 semantics distinct and preserves explicit zero values when duplicate formats are merged.
- **Bounded source previews**: large JSON/CSV lossless files show compact metadata rather than rendering full binary and canonical payloads.
- **Source-file navigation**: charts can link back to JSON/CSV/Markdown source data.
- **Canonical summary metric layer**: scalar v7 summary values from JSON, CSV, Markdown, and Bases are normalized by canonical key while lossless source payloads remain excluded.
- **Generic metric trend renderer**: `metric-trend` resolves labels, units, aliases, explicit zero values, optional rolling averages, and user-provided reference lines.
- **Roll-up visualization context**: renderers can consume filtered weekly/monthly/yearly roll-ups and dictionary metadata without mixing them into daily records.
- **Export coverage visualization**: `capture-coverage-calendar` uses compact status/count diagnostics only.

### Gaps / candidates

- **Generic metric bar renderer**
  - Broaden the current `bar-chart` beyond a fixed set of activity/sleep fields.
- **Generic calendar heatmap renderer**
  - Any numeric daily metric should be plottable as a calendar heatmap.
- **Schema coverage report panel**
  - Shows exported fields found vs fields visualized by the plugin.

---

## Summary / Overview

### Built

- `intro-stats` — dataset summary with totals, averages, sleep, and vitals.
- `summary-card` — Apple-style KPI card with sparkline and prior-period comparison.
- `trend-tile` — Trends-tab style comparison card.
- `metric-trend` — generic numeric trend by canonical Health.md summary key.
- `rollup-explorer` — exporter-authored period rules, coverage, and statistics.
- `capture-coverage-calendar` — compact lossless-export completeness status.

### Gaps / candidates

- **Health dashboard auto-layout**
  - Auto-generates cards based on fields present in the current data folder.
- **Schema v2 coverage dashboard**
  - Summarizes which categories are present: activity, sleep, heart, mood, medication, nutrition, symptoms, etc.
- **Correlation summary cards**
  - Examples: sleep vs mood, HRV vs workouts, symptoms vs medications, alcohol vs sleep.

---

## Activity

Exported data includes steps, active calories, basal calories, exercise minutes, stand hours, flights climbed, walking/running distance, swimming, wheelchair distance/pushes, downhill snow distance, move time, physical effort, and VO₂ max.

### Built

- `activity-rings` — Move, Exercise, Stand rings.
- `vitals-rings` — radial daily rings for steps, active calories, and heart context.
- `bar-chart` — currently supports steps, active calories, exercise minutes, distance, sleep hours, and flights climbed.
- `activity-heatmap` — calendar-style activity intensity.
- `step-spiral` — radial step-count history.
- `weekday-average` — average a metric by weekday.
- `cardio-fitness-freshness` — VO₂ Max trend with v7 measured/carried-forward provenance.

### Gaps / candidates

- **Activity load dashboard**
  - Steps, active calories, exercise minutes, stand hours, and physical effort in one view.
- **Move vs exercise vs stand consistency chart**
  - Calendar grid or stacked daily bars.
- **Distance mix chart**
  - Walking/running, cycling, swimming, wheelchair, snow sports.
- **Physical effort trend**
  - Good recovery/readiness companion chart.
- **Swimming activity chart**
  - Distance + stroke count.
- **Wheelchair activity chart**
  - Wheelchair distance + pushes.

---

## Sleep

Exported data includes total sleep, bedtime, wake time, deep/REM/core/awake/in-bed durations, and granular sleep stage intervals.

### Built

- `sleep-schedule` — bedtime-to-wake bars.
- `sleep-quality-bars` — stacked nightly stage bars.
- `sleep-architecture` — linear sleep-stage timeline.
- `sleep-polar` — clock-face sleep stages.

### Gaps / candidates

- **Sleep debt / consistency score**
  - Combines duration, bedtime variability, wake variability, and awake time.
- **Sleep stage ratio trend**
  - Deep/REM/core percentages over time.
- **Sleep regularity heatmap**
  - Calendar colored by bedtime/wake consistency.
- **Sleep vs recovery dashboard**
  - Sleep + HRV + resting HR + workouts.

---

## Heart

Exported data includes resting HR, walking HR average, average/min/max heart rate, HRV, heart-rate samples, HRV samples, heart-rate recovery, and AFib burden.

### Built

- `heart-terrain` — ridgeline/terrain heatmap for heart-rate samples or daily aggregates.
- `heart-range` — daily min/max/average heart-rate capsules.
- `hrv-trend` — heart-rate variability line chart.

### Gaps / candidates

- **Resting heart-rate trend**
- **Walking heart-rate trend**
- **Heart-rate recovery trend**
- **AFib burden chart**
- **HRV + resting HR recovery tile**
- **Heart-rate sample density / coverage chart**
- **Circadian heart-rate profile**
  - Average HR by time of day across selected range.

---

## Respiratory / Oxygen

Exported data includes blood oxygen average/min/max, blood oxygen samples, respiratory rate average/min/max, and respiratory-rate samples.

### Built

- `oxygen-river` — flowing band of blood oxygen samples.
- `oxygen-range` — daily oxygen or respiratory-rate min/max range.
- `breathing-wave` — respiratory-rate wave.

### Gaps / candidates

- **Respiratory range chart**
  - Dedicated equivalent of oxygen range for respiratory min/avg/max.
- **Oxygen desaturation event chart**
  - Highlights low SpO₂ samples or nights below threshold.
- **Overnight respiratory dashboard**
  - Sleep stages + oxygen + respiratory rate.

---

## Vitals

Exported data includes body temperature, blood pressure systolic/diastolic, blood glucose, basal body temperature, wrist temperature, electrodermal activity, forced vital capacity, FEV1, peak expiratory flow, and inhaler usage.

### Built

- `blood-pressure-bands` — paired systolic/diastolic min-average-max summaries without inferred diagnostic thresholds.
- `glucose-range` — daily glucose min-average-max with optional user-provided references.
- Any scalar vital can also use `metric-trend`.

### Gaps / candidates

- **Temperature trend chart**
  - Body, basal, and wrist temperature deviations.
- **Wrist temperature recovery tile**
  - Useful for illness/recovery insights.
- **Respiratory function dashboard**
  - FVC, FEV1, peak expiratory flow, inhaler usage.
- **Electrodermal activity / stress trend**
  - EDA over time, optionally compared with mood or sleep.

---

## Body Measurements

Exported data includes weight, height, BMI, body fat percentage, lean body mass, and waist circumference.

### Built

- `body-composition` — small multiples for weight, BMI, body fat, lean mass, and waist.
- `metric-trend` — individual body measurement trends.

### Gaps / candidates

- **Weight trend**
  - Rolling average, goal line, weekly delta.
- **BMI category chart**
  - BMI trend with category bands.
- **Body fat vs lean mass chart**
  - Dual trend or stacked composition view.
- **Waist circumference trend**

---

## Mobility / Gait / Running Form

Exported data includes walking speed, step length, double support, walking asymmetry, stair ascent/descent speed, six-minute walk, walking steadiness, running speed, running stride length, ground contact time, vertical oscillation, and running power.

### Built

- `walking-symmetry` — walking speed and asymmetry trend.
- `running-form` — speed, power, stride length, ground contact, and vertical oscillation small multiples.

### Gaps / candidates

- **Gait dashboard**
  - Walking speed, step length, double support, asymmetry, steadiness.
- **Walking steadiness gauge**
- **Six-minute walk trend**
- **Stair mobility chart**
  - Ascent/descent speeds.
- **Mobility risk / improvement tile**

---

## Workouts

Exported data includes workout count, minutes, calories, distance, workout types, heart-rate stats, running/cycling form metrics, power, elevation, laps, splits, route points, heart-rate zones, and time-series samples.

### Built

- `workout-log` — timeline of workouts.
- `workout-heart-rate` — heart-rate time series or summary for selected workout.
- `workout-zones` — stacked heart-rate zone time.
- `workout-trends` — duration, distance, calories, average HR, and power trends.
- `workout-intervals` — detailed workout laps/splits table.
- `workout-map` — GPS route map.
- `cycling-performance` — power, FTP, cadence, speed, and distance summary trends.

### Gaps / candidates

- **Workout calendar heatmap**
  - Color by workout duration/intensity/type.
- **Training load chart**
  - Duration × intensity / HR zone load.
- **Weekly workout distribution**
  - Type mix, distance, duration, calories.
- **Pace / speed trend by workout type**
- **Elevation gain/loss trend**
- **Route comparison / small multiples**
- **Power curve / best efforts**
- **Running form over workouts**
  - Cadence, stride, ground contact, vertical oscillation.

---

## Mindfulness / Mood / Mental Health

Exported data includes mindful minutes/sessions, State of Mind entries, average valence, valence percent, daily mood, momentary emotions, labels, and associations.

### Built

- `mood-trend` — mood valence over time with sleep/exercise context.
- `mood-calendar-heatmap` — calendar grid colored by average valence.
- `mood-sleep-scatter` — mood vs sleep duration and exercise context.
- `mood-day-timeline` — time-of-day lanes for mood entries.
- `mood-association-breakdown` — mood grouped by association.
- `mood-label-cloud` — emotion labels sized by frequency and colored by valence.
- `mood-volatility` — daily mood average with low/high spread.
- `mood-kind-split` — Daily Mood vs Momentary Emotion comparison.
- `mood-circadian-clock` — radial 24-hour mood-entry clock.
- `mood-recovery-tile` — mood + sleep + HRV + exercise recovery card.
- `mood-association-matrix` — labels by associations.

### Gaps / candidates

- **Mindful minutes trend**
- **Mindful session calendar / streak chart**
- **Mood vs medication adherence**
- **Mood vs nutrition/alcohol/caffeine**
- **Mood label timeline**
  - Shows changing emotional vocabulary over time.

---

## Medications

Schema v2 exports medication inventory, active/archived counts, dose event counts, taken/skipped counts, medication names/details, codings/RxNorm, dose quantities, schedule type, scheduled/start/end dates, statuses, and metadata.

### Built

- `medication-overview` — inventory, adherence summary, per-medication breakdown, trend, recent events.
- `medication-inventory` — active/archived/scheduled/unscheduled rows.
- `medication-adherence-summary` — taken/skipped/other counts and adherence percentage.
- `medication-dose-status` — per-medication dose-status breakdown.
- `medication-adherence-trend` — daily/weekly/monthly adherence bars.
- `medication-recent-dose-events` — recent dose-event table.
- `medication-schedule-timeline` — scheduled versus logged timing for top-level dose events.
- `medication-skip-reasons` — plain-text skipped-dose reason counts.

### Gaps / candidates

- **Medication adherence calendar**
  - Calendar heatmap by adherence percentage.
- **Dose quantity trend**
  - For dose changes over time.
- **Medication vs symptom/mood correlation**
- **RxNorm / coding detail view**

---

## Nutrition

Exported data includes dietary calories, protein, carbs, fat, saturated fat, monounsaturated fat, polyunsaturated fat, fiber, sugar, sodium, cholesterol, water, and caffeine.

### Built

- `nutrition-grid` — per-row normalized daily grids for macros, vitamins, minerals, or all supported nutrition summaries.
- `metric-trend` — individual nutrient trends using exported units.

### Gaps / candidates

- **Nutrition dashboard**
  - Combined calorie, macro, water, and caffeine cards.
- **Macro split chart**
  - Protein/carbs/fat stacked bars or donut.
- **Calories in vs active calories chart**
- **Hydration trend**
- **Caffeine timing / daily amount chart**
- **Sugar/sodium threshold chart**
- **Fiber/protein goal progress**
- **Weekly nutrition averages**

---

## Vitamins / Minerals / Micronutrients

Exported data includes vitamins A/B6/B12/C/D/E/K, thiamin, riboflavin, niacin, folate, biotin, pantothenic acid, calcium, iron, potassium, magnesium, phosphorus, zinc, selenium, copper, manganese, chromium, molybdenum, chloride, and iodine.

### Built

- `nutrition-grid` with `preset: vitamins` or `preset: minerals` — micronutrient rows by day.

### Gaps / candidates

- **% RDA progress grid**
  - Requires configurable recommended daily values.
- **Vitamin trend dashboard**
- **Mineral trend dashboard**
- **Deficiency/excess flag panel**
- **Nutrition completeness score**

---

## Hearing

Exported data includes headphone audio level and environmental sound level.

### Built

- `hearing-exposure` — headphone and environmental dB trends with an optional user reference line.

### Gaps / candidates

- **Loud-day calendar**
- **Threshold band chart**
  - Highlight days above safe exposure thresholds.
- **Weekly exposure summary**

---

## Reproductive Health / Cycle Tracking

Exported data includes menstrual flow, sexual activity, ovulation test result, cervical mucus quality, and intermenstrual bleeding.

### Built

- `cycle-timeline` — private opt-in menstrual flow, cervical mucus, ovulation-test, and spotting lanes; sexual activity is excluded.

### Gaps / candidates

- **Cycle calendar**
- **Menstrual flow heatmap**
- **Fertility signal timeline**
  - Ovulation test + cervical mucus + cycle day.
- **Cycle symptom overlay**
  - Combine reproductive health with symptom counts, mood, and sleep.
- **Spotting / intermenstrual bleeding timeline**

---

## Symptoms

Exported data includes daily counts for symptoms such as headache, fatigue, nausea, dizziness, mood changes, sleep changes, appetite changes, hot flashes, chills, fever, lower back pain, bloating, constipation, diarrhea, heartburn, coughing, sore throat, runny nose, shortness of breath, chest pain, skipped heartbeat, rapid heartbeat, acne, dry skin, hair loss, memory lapse, night sweats, vomiting, abdominal cramps, breast pain, pelvic pain, body ache, fainting, loss of smell, loss of taste, wheezing, sinus congestion, bladder incontinence, and vaginal dryness.

### Built

- `symptom-heatmap` — recorded daily symptom counts, with missing values distinct from explicit zero.

### Gaps / candidates

- **Symptom frequency leaderboard**
- **Symptom co-occurrence matrix**
- **Symptom flare timeline**
- **Symptom correlation explorer**
  - Symptoms vs sleep, HRV, mood, medications, nutrition, cycle.
- **Body-system grouped symptom dashboard**
  - Respiratory, GI, neurological, reproductive, skin, cardiac, etc.

---

## Other Health / Lifestyle / Environment

Exported data includes UV exposure, time in daylight, number of falls, blood alcohol, alcoholic beverages, insulin delivery, toothbrushing, handwashing, water temperature, and underwater depth.

### Built

- None dedicated.

### Gaps / candidates

- **Daylight / UV calendar**
- **Falls timeline**
- **Alcohol vs sleep / HRV chart**
- **Insulin delivery trend**
- **Hygiene habit streaks**
  - Toothbrushing and handwashing.
- **Water temperature / underwater depth chart**
  - Useful for swimming/diving exports.

---

## Recommended Next Priority

The schema-v7 foundation, generic metric trend, roll-up explorer, compact capture calendar, blood-pressure/glucose ranges, body composition, running/cycling summaries, nutrition/micronutrient grid, symptom heatmap, cycle timeline, hearing trend, and medication timing/reason views are now built.

Next candidates:

1. Broaden the existing generic bar and calendar charts to accept any canonical metric key.
2. Add temperature and respiratory-function presets on top of the canonical trend engine.
3. Add symptom co-occurrence and opt-in correlation views without causal claims.
4. Add an automatic dashboard layout based on observed summary fields.
5. Add lifestyle/environment presets for daylight, UV, falls, hygiene, and diving summaries.

---

## Notes

- The plugin already has strong coverage for activity, sleep, heart, respiratory/oxygen, mood, medications, and workouts.
- The largest gap is not one missing chart; it is that the plugin lacks a generic schema-v7 summary layer that can visualize any exported summary field without ingesting canonical source records.
- Once generic metric support exists, many candidate visualizations can be delivered as configuration presets rather than one-off renderers.
