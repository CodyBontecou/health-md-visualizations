# Health.md Visualization Reference

This example vault note is the landing page for every `health-viz`
visualization reference. Shared arguments and the full index live here;
category-specific copy/paste examples now live in the individual docs below.

The category examples are anchored to the bundled mock dataset with
`to: 2026-05-17` so they render consistently in a fresh clone. Remove `to` or
use `last` by itself when you want a dashboard that always follows today.

> **Tip:** Every canvas chart supports hover tooltips and click-to-pin. The
> HTML/SVG/Leaflet renderers (`intro-stats`, `summary-card`, `trend-tile`,
> `medication-overview`, individual `medication-*` section components, `workout-map`,
> `workout-intervals`) do not use the canvas tooltip layer.

---

## Category references

| Category | Reference | Includes |
| --- | --- | --- |
| Overview & trends | [Open](visualizations/overview-and-trends.md) | `intro-stats`, `summary-card`, `trend-tile` |
| Activity & fitness | [Open](visualizations/activity-and-fitness.md) | `activity-rings`, `vitals-rings`, `bar-chart`, `activity-heatmap`, `step-spiral`, `weekday-average` |
| Heart | [Open](visualizations/heart.md) | `heart-terrain`, `heart-range`, `hrv-trend` |
| Sleep | [Open](visualizations/sleep.md) | `sleep-schedule`, `sleep-quality-bars`, `sleep-architecture`, `sleep-polar` |
| Respiratory & vitals | [Open](visualizations/respiratory-and-vitals.md) | `oxygen-river`, `oxygen-range`, `breathing-wave` |
| Mobility | [Open](visualizations/mobility.md) | `walking-symmetry` |
| Mindfulness & mood | [Open](visualizations/mindfulness-and-mood.md) | `mood-trend`, `mood-calendar-heatmap`, `mood-sleep-scatter`, `mood-day-timeline`, `mood-association-breakdown`, `mood-label-cloud`, `mood-volatility`, `mood-kind-split`, `mood-circadian-clock`, `mood-recovery-tile`, `mood-association-matrix` |
| Workouts | [Open](visualizations/workouts.md) | `workout-log`, `workout-heart-rate`, `workout-zones`, `workout-trends`, `workout-intervals`, `workout-map` |
| Medications | [Open](visualizations/medications.md) | `medication-overview`, `medication-inventory`, `medication-adherence-summary`, `medication-dose-status`, `medication-adherence-trend`, `medication-recent-dose-events` |

---

## Code block argument basics

A visualization is a fenced code block where each non-empty line is `key: value`.
Lines beginning with `#` are comments and are ignored by the plugin.

| Argument | Applies to | Default | Description |
| --- | --- | --- | --- |
| `type` | all | required | Visualization id, for example `heart-terrain` or `summary-card`. |
| `width` | all canvas charts; `workout-map` fallback map | plugin setting | Maximum render width in pixels. Canvas charts shrink to the note width. |
| `height` | all canvas charts; `workout-map` | plugin setting | Render height in pixels. Some charts, such as `sleep-schedule`, may expand vertically to fit rows. |
| `from` | all | none | Start date or datetime, inclusive. Accepts literal ISO dates/datetimes, dynamic date variables, or note frontmatter references. |
| `to` | all | none | End date or datetime, inclusive. Accepts the same values as `from` and also anchors `last`. |
| `last` | all | none | Number of calendar days ending at `to` when present, otherwise ending today. |
| `theme` | all | plugin setting | `auto`, `dark`, or `light`. `auto` follows the active Obsidian theme. |
| `colorScheme` / `palette` | all | plugin setting | `theme`, `default`, `ocean`, `forest`, `sunset`, `aurora`, or `monochrome`. |
| `background` / `bg`, `foreground` / `fg`, `muted` | all | resolved theme | Override chart surface and label colors. |
| `accent`, `secondary`, `heart`, `sleepDeep`, `sleepRem`, `sleepCore`, `sleepAwake` | all | resolved palette | Override semantic health colors for one block. |

Notes:

- Argument names and metric ids are case-sensitive. Use the exact values shown.
- Numeric values are parsed as numbers; everything else is passed as a string.
- For `showAverage`, use `false` or `0` to disable the line.
- Date filtering happens before a renderer-specific argument like `date` selects
  a workout, so make sure the selected workout is inside the filtered window.
- Dynamic date variables are resolved by Health.md at render time. Use
  `{{monday:YYYY-MM-DD}}` / `{{today:YYYY-MM-DD}}` for current-week reports,
  `{{month-start}}` / `{{month-end}}` for current-month reports, or frontmatter
  references such as `${report_start}` when a periodic note stores fixed dates
  in its Properties.
- Avoid raw Templater or Dataview expressions inside `health-viz` code blocks;
  write those values to frontmatter first, then reference them from the block.
- Appearance overrides are optional; most users can use Settings → Health.md
  Visualizations → Theme / Color scheme to match their vault or website style.

Example themed block:

```health-viz
type: summary-card
metric: hrv
last: 14
colorScheme: theme
accent: #7c3aed
```

---

## Visualization index

| Type | Best for | Data needed | Extra arguments |
| --- | --- | --- | --- |
| `intro-stats` | Dataset summary card | activity, heart, sleep, vitals | none |
| `summary-card` | Apple-style headline KPI | chosen metric | `metric`, `compareWindow` |
| `trend-tile` | Apple Health Trends card | chosen metric over two periods | `metric`, `currentWindow`, `priorWindow` |
| `activity-rings` | Move / Exercise / Stand rings | `activity.activeCalories`, `exerciseMinutes`, `standHours` | `moveGoal`, `exerciseGoal`, `standGoal` |
| `vitals-rings` | Steps, calories, heart-rate daily rings | activity + heart | none |
| `bar-chart` | Daily bars with goal / average lines | chosen metric | `metric`, `goal`, `showAverage` |
| `activity-heatmap` | GitHub-style activity calendar | activity | `metric` |
| `step-spiral` | Radial step history | activity steps | none |
| `weekday-average` | Average by day of week | chosen metric | `metric`, `weekStart` |
| `heart-terrain` | Heart-rate ridgelines / heatmap | heart samples or daily heart aggregates | none |
| `heart-range` | Daily min / max / average heart range | heart aggregates | `metric` |
| `hrv-trend` | HRV line chart | `heart.hrv` or `hrvSamples` | none |
| `oxygen-river` | Blood oxygen sample band | SpO₂ samples | none |
| `oxygen-range` | Daily SpO₂ or respiratory min / max range | vitals aggregates | `metric` |
| `breathing-wave` | Respiratory-rate wave | respiratory samples | none |
| `sleep-schedule` | Bedtime → wake consistency | sleep bedtime / wakeTime | `sleepGoal`, `windowStart`, `windowEnd` |
| `sleep-quality-bars` | Nightly sleep-stage composition | sleep stages | none |
| `sleep-architecture` | Linear sleep-stage timeline | sleep stages | none |
| `sleep-polar` | Clock-face sleep stages | sleep stages | none |
| `mood-trend` | Mood valence with sleep/workout context | `mindfulness.stateOfMindEntries`, `mood.entries`, or State of Mind exports | `showContext` |
| `mood-calendar-heatmap` | Calendar grid colored by mood valence | State of Mind entries or mood summaries | none |
| `mood-sleep-scatter` | Mood vs sleep duration scatterplot | mood + sleep duration | none |
| `mood-day-timeline` | Time-of-day mood entry lanes | timestamped State of Mind entries | `maxDays` |
| `mood-association-breakdown` | Average mood by association | State of Mind associations | `limit`, `sort` |
| `mood-label-cloud` | Emotion label word cloud | State of Mind labels | `limit` |
| `mood-volatility` | Daily average with intraday mood spread | one or more mood entries per day | none |
| `mood-kind-split` | Daily Mood vs Momentary Emotion comparison | State of Mind kinds | none |
| `mood-circadian-clock` | 24-hour radial mood clock | timestamped mood entries | none |
| `mood-recovery-tile` | Mood/sleep/HRV/exercise recovery card | mood plus optional sleep/heart/activity | none |
| `mood-association-matrix` | Label × association matrix | labels + associations | `metric`, `labels`, `associations` |
| `medication-overview` | All medication sections in one component | schema v2 medication counts/details/dose events | `trend`, `limit` |
| `medication-inventory` | Medication inventory section | schema v2 medication counts/details | none |
| `medication-adherence-summary` | Taken/skipped adherence summary section | schema v2 medication dose counts/events | none |
| `medication-dose-status` | Per-medication dose status section | schema v2 medication details/dose events | none |
| `medication-adherence-trend` | Daily adherence trend section | schema v2 medication dose counts/events | `trend` |
| `medication-recent-dose-events` | Recent dose-event table section | schema v2 medication dose events | `limit` |
| `walking-symmetry` | Walking speed and asymmetry | mobility | none |
| `workout-log` | Workout list / duration bars | workouts | none |
| `workout-heart-rate` | Heart rate during one workout | workout heart-rate series or detailed HR zones | `date`, `workout`, `maxHeartRate` |
| `workout-zones` | Stacked heart-rate zone time | detailed workout `heart_rate_zones` or samples + max HR | `date`, `workout`, `maxHeartRate` |
| `workout-trends` | Workout metrics over time | workouts | `metric` |
| `workout-intervals` | Lap/split table | detailed workout laps/splits | `date`, `workout`, `kind` |
| `workout-map` | GPS route map for one workout | workout route | `date`, `workout`, `colorBy` |
