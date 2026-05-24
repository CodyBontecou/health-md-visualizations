# Health.md Visualization Reference

This example vault note documents every `health-viz` visualization and the
arguments you can use to adapt each chart. Copy a block into any Obsidian note,
then tweak the arguments shown in the tables.

The examples below are anchored to the bundled mock dataset with
`to: 2026-05-17` so they render consistently in a fresh clone. Remove `to` or
use `last` by itself when you want a dashboard that always follows today.

> **Tip:** Every canvas chart supports hover tooltips and click-to-pin. The
> HTML/SVG/Leaflet renderers (`intro-stats`, `summary-card`, `trend-tile`,
> `workout-map`) do not use the canvas tooltip layer.

---

## Code block argument basics

A visualization is a fenced code block where each non-empty line is `key: value`.
Lines beginning with `#` are comments and are ignored by the plugin.

| Argument | Applies to | Default | Description |
| --- | --- | --- | --- |
| `type` | all | required | Visualization id, for example `heart-terrain` or `summary-card`. |
| `width` | all canvas charts; `workout-map` fallback map | plugin setting | Maximum render width in pixels. Canvas charts shrink to the note width. |
| `height` | all canvas charts; `workout-map` | plugin setting | Render height in pixels. Some charts, such as `sleep-schedule`, may expand vertically to fit rows. |
| `from` | all | none | Start date or datetime, inclusive. Accepts `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM`, or `YYYY-MM-DDTHH:MM:SS` with optional timezone. |
| `to` | all | none | End date or datetime, inclusive. Also anchors `last`. |
| `last` | all | none | Number of calendar days ending at `to` when present, otherwise ending today. |

Notes:

- Argument names and metric ids are case-sensitive. Use the exact values shown.
- Numeric values are parsed as numbers; everything else is passed as a string.
- For `showAverage`, use `false` or `0` to disable the line.
- Date filtering happens before a renderer-specific argument like `date` selects
  a workout, so make sure the selected workout is inside the filtered window.

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
| `walking-symmetry` | Walking speed and asymmetry | mobility | none |
| `workout-log` | Workout list / duration bars | workouts | none |
| `workout-heart-rate` | Heart rate during one workout | workout heart-rate series | `date`, `workout`, `maxHeartRate` |
| `workout-map` | GPS route map for one workout | workout route | `date`, `workout`, `colorBy` |

---

## Summary and card visualizations

### `intro-stats`

A responsive HTML summary of the current data window: totals, averages, sleep
highlights, and available vitals. Use it as the top card on daily, weekly, and
monthly dashboards.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| *(extra)* | — | — | No renderer-specific arguments. Use common date/window arguments to change the summary period. |

```health-viz
# Summary of a reproducible 30-day window.
type: intro-stats
to: 2026-05-17
last: 30
```

### `summary-card`

An Apple Health-style KPI card with a large current value, sparkline, optional
range text, and percent delta against a prior period. The current period is
computed from the filtered data window.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| `metric` | `heart-rate`, `steps`, `sleep-duration`, `active-calories`, `hrv`, `blood-oxygen`, `respiratory-rate` | `heart-rate` | Chooses the KPI, unit, color, and underlying data extractor. |
| `compareWindow` | `same-length`, `week`, `month` | `same-length` | Chooses the comparison period. `same-length` splits the filtered data in half. `week` compares latest 7 days against the previous 7 and needs at least 14 days. `month` compares latest 30 against previous 30 and needs at least 60 days. |

```health-viz
# Weekly heart-rate card: latest 7 days vs previous 7 days.
type: summary-card
metric: heart-rate
compareWindow: week
to: 2026-05-17
last: 14
```

```health-viz
# Sleep-duration card using a same-length split of the 28-day window.
type: summary-card
metric: sleep-duration
compareWindow: same-length
to: 2026-05-17
last: 28
```

### `trend-tile`

A compact Trends-tab card with direction arrow, percentage change, narrative,
and a two-period sparkline. The renderer marks improvements green based on the
metric: higher is good for HRV, steps, VO₂ max, walking speed, sleep duration,
and active calories; lower is good for resting heart rate.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| `metric` | `resting-heart-rate`, `hrv`, `steps`, `vo2max`, `walking-speed`, `sleep-duration`, `active-calories` | `resting-heart-rate` | Chooses the trend metric and preferred direction. |
| `currentWindow` | positive number of days | `90` | Number of most-recent filtered days in the current period. |
| `priorWindow` | positive number of days | `90` | Number of days immediately before the current period used for comparison. |

```health-viz
# Apple-style trend using the latest 30 days vs the previous 30 days.
type: trend-tile
metric: hrv
currentWindow: 30
priorWindow: 30
to: 2026-05-17
last: 60
```

```health-viz
# Cardio fitness trend across a longer 90-day comparison.
type: trend-tile
metric: vo2max
currentWindow: 45
priorWindow: 45
to: 2026-05-17
last: 90
```

---

## Activity visualizations

### `activity-rings`

Apple-style Move / Exercise / Stand rings. A single-day window renders one large
ring set; a multi-day window renders a small-multiples grid with closure stats.

| Argument       | Values   | Default | Effect                                                           |
| -------------- | -------- | ------- | ---------------------------------------------------------------- |
| `moveGoal`     | calories | `500`   | Target for the red Move ring (`activity.activeCalories`).        |
| `exerciseGoal` | minutes  | `30`    | Target for the green Exercise ring (`activity.exerciseMinutes`). |
| `standGoal`    | hours    | `12`    | Target for the blue Stand ring (`activity.standHours`).          |

```health-viz
# Seven daily ring sets with custom goals.
type: activity-rings
moveGoal: 650
exerciseGoal: 45
standGoal: 12
to: 2026-05-17
last: 1
height: 260
```

### `vitals-rings`

A Health.md original radial chart: steps, active calories, and resting/average
heart-rate context for each day. Use it when you want activity and heart data in
one compact visualization.

| Argument  | Values | Default | Effect                                                                              |
| --------- | ------ | ------- | ----------------------------------------------------------------------------------- |
| *(extra)* | —      | —       | No renderer-specific arguments. Use `last`, `from`, and `to` to control the window. |

```health-viz
# Thirty days gives the ring chart enough history to show patterns.
type: vitals-rings
to: 2026-05-17
last: 30
height: 280
```

### `bar-chart`

Apple-style vertical bars with a highlighted latest day, KPI header, optional
average line, and optional goal line.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| `metric` | `steps`, `activeCalories`, `exerciseMinutes`, `distance`, `sleepHours`, `flightsClimbed` | `steps` | Selects the bar value, unit, label, and whether the headline is a sum or an average. |
| `goal` | number in the selected metric's units | none | Draws a dashed goal line and expands the y-axis if needed. |
| `showAverage` | `true`, `false`, `1`, `0` | `true` | Toggles the dashed average line. |

```health-viz
# Weekly steps with a 10k goal and mean line.
type: bar-chart
metric: steps
goal: 10000
showAverage: true
to: 2026-05-17
last: 7
height: 220
```

```health-viz
# Sleep bars without the average line.
type: bar-chart
metric: sleepHours
goal: 8
showAverage: false
to: 2026-05-17
last: 14
height: 220
```

### `activity-heatmap`

A GitHub-style calendar grid for activity intensity. It expands the filtered
range to complete Sunday–Saturday weeks and shades each cell relative to the
maximum value in the window.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| `metric` | `steps`, `calories`, `distance` | `steps` | Chooses the daily activity value. `calories` uses active calories; `distance` uses walking/running kilometers. |

```health-viz
# Three-month distance heatmap.
type: activity-heatmap
metric: distance
to: 2026-05-17
last: 90
height: 180
```

### `step-spiral`

A radial step-count history. Older days sit toward the center and newer days
spiral outward; longer arms mean more steps.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| *(extra)* | — | — | No renderer-specific arguments. Use a longer `last` window for denser spirals. |

```health-viz
type: step-spiral
to: 2026-05-17
last: 30
height: 300
```

### `weekday-average`

Seven bars showing a metric's average by day of week. It is best with at least
four weeks of data so each weekday has multiple samples.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| `metric` | `steps`, `activeCalories`, `exerciseMinutes`, `sleepHours`, `heartRate`, `hrv` | `steps` | Chooses the value to bucket by weekday. |
| `weekStart` | `monday`, `sunday` | `monday` | Controls bar order and x-axis labels. |

```health-viz
# Which weekdays are most active?
type: weekday-average
metric: steps
weekStart: monday
to: 2026-05-17
last: 56
height: 240
```

```health-viz
# Sleep by weekday with a Sunday-first calendar.
type: weekday-average
metric: sleepHours
weekStart: sunday
to: 2026-05-17
last: 56
height: 240
```

---

## Heart visualizations

### `heart-terrain`

A ridgeline / heatmap view of heart-rate samples over the day. With timestamped
samples, each row spans 24 hours; with only daily aggregates, it falls back to a
per-day average heatmap.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| *(extra)* | — | — | No renderer-specific arguments. Use `from`/`to` datetimes to zoom into part of a day. |

```health-viz
# Morning heart rate only; boundary-day aggregates are recomputed from samples.
type: heart-terrain
from: 2026-04-14T06:00
to: 2026-04-14T12:00
height: 140
```

```health-viz
# Week-long terrain, one row per day.
type: heart-terrain
to: 2026-05-17
last: 7
height: 220
```

### `heart-range`

Daily heart-rate min-to-max capsules with an average dot. The default
`heart-rate` metric also overlays the average resting heart rate as a dashed
reference line.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| `metric` | `heart-rate`, `resting`, `walking` | `heart-rate` | `heart-rate` uses min/max/average. `resting` and `walking` render single-value capsules from resting HR or walking HR average. |

```health-viz
# Daily min/max heart-rate ranges.
type: heart-range
metric: heart-rate
to: 2026-05-17
last: 14
height: 220
```

```health-viz
# Resting heart-rate trend as daily single-value capsules.
type: heart-range
metric: resting
to: 2026-05-17
last: 30
height: 220
```

### `hrv-trend`

A line chart of heart-rate variability. It uses `heart.hrv` when present and
falls back to averaging `heart.hrvSamples`.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| *(extra)* | — | — | No renderer-specific arguments. Pair with `last: 30` or `last: 90` for recovery trends. |

```health-viz
type: hrv-trend
to: 2026-05-17
last: 30
height: 180
```

---

## Respiratory and oxygen visualizations

### `oxygen-river`

A flowing band of SpO₂ samples across the selected window, plus summary stats.
Use sub-day windows when you want to inspect overnight oxygen.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| *(extra)* | — | — | No renderer-specific arguments. Use common date/datetime filters. |

```health-viz
# Overnight oxygen window.
type: oxygen-river
from: 2026-04-13T22:00
to: 2026-04-14T08:00
height: 120
```

### `oxygen-range`

Daily min/max capsules with average dots for either blood oxygen or respiratory
rate. The chart includes a warning zone: SpO₂ below 95% or respiratory rate above
20 breaths/min.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| `metric` | `blood-oxygen`, `respiratory-rate` | `blood-oxygen` | Chooses SpO₂ percentage or breaths/minute data. |

```health-viz
# Blood oxygen range with low SpO₂ warning zone.
type: oxygen-range
metric: blood-oxygen
to: 2026-05-17
last: 14
height: 220
```

```health-viz
# Respiratory-rate range with elevated-rate warning zone.
type: oxygen-range
metric: respiratory-rate
to: 2026-05-17
last: 14
height: 220
```

### `breathing-wave`

A respiratory-rate wave chart. It is useful for spotting overnight respiratory
changes, illness signals, or recovery stress.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| *(extra)* | — | — | No renderer-specific arguments. Use common date/datetime filters. |

```health-viz
type: breathing-wave
from: 2026-04-13T22:00
to: 2026-04-14T08:00
height: 120
```

---

## Sleep visualizations

### `sleep-schedule`

Horizontal bedtime-to-wake bars against a sunset → night → sunrise backdrop.
The inner band represents time asleep relative to the in-bed window, and bar
color indicates how close the night was to the sleep goal. This view needs
sleep timing: `sleep_bedtime` + `sleep_wake` (or Health.md camelCase
`sleepBedtime` + `sleepWake`), `bedtime` + `wakeTime`/`wake_time`, ISO
variants, or stage timestamps. 24-hour and 12-hour times are accepted.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| `sleepGoal` | hours | `8` | Sleep-duration goal used for the goal marker and bar coloring. |
| `windowStart` | `HH:MM` | `18:00` | Start of the x-axis window on each night's date. |
| `windowEnd` | `HH:MM` | `10:00` | End of the x-axis window on the next day. Use a later end for late wake times. |

```health-viz
# Two-week schedule with a 7.5-hour goal and a wide overnight window.
type: sleep-schedule
sleepGoal: 7.5
windowStart: 19:00
windowEnd: 11:00
to: 2026-05-17
last: 14
height: 360
```

### `sleep-quality-bars`

Stacked nightly bars showing deep, core, REM, and awake time. Use it for sleep
composition rather than exact timing.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| *(extra)* | — | — | No renderer-specific arguments. Use `last` to choose how many nights to compare. |

```health-viz
type: sleep-quality-bars
to: 2026-05-17
last: 30
height: 240
```

### `sleep-architecture`

A linear timeline of sleep stages with one row per night. Use it when exact
stage timing matters more than totals.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| *(extra)* | — | — | No renderer-specific arguments. Use `from` and `to` datetimes for one exact night. |

```health-viz
# One exact night.
type: sleep-architecture
from: 2026-04-13T21:00
to: 2026-04-14T08:00
height: 120
```

```health-viz
# Week of rows.
type: sleep-architecture
to: 2026-05-17
last: 7
height: 160
```

### `sleep-polar`

A polar clock view of sleep stages. It makes consistent bedtimes and wake times
easy to spot because each night is arranged around a clock face.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| *(extra)* | — | — | No renderer-specific arguments. Use 7–30 nights for best readability. |

```health-viz
type: sleep-polar
to: 2026-05-17
last: 14
height: 280
```

---

## Mobility visualization

### `walking-symmetry`

Shows walking speed and walking asymmetry together. Taller asymmetry bars can be
a useful prompt to inspect gait, footwear, injury recovery, or fatigue.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| *(extra)* | — | — | No renderer-specific arguments. Use a multi-week window for trend context. |

```health-viz
type: walking-symmetry
to: 2026-05-17
last: 30
height: 180
```

---

## Workout visualizations

### `workout-log`

A timeline of workouts in the filtered window. Bars are sized by workout
duration and colored by workout type, with inline stats below the chart.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| *(extra)* | — | — | No renderer-specific arguments. Use common date/window arguments to choose the workout range. |

```health-viz
type: workout-log
to: 2026-05-17
last: 30
height: 240
```

### `workout-heart-rate`

Heart-rate time series for one selected workout, including optional heart-rate
zone bands. If the workout lacks per-sample heart-rate data, the renderer falls
back to min/average/max summary stats when available.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| `date` | `YYYY-MM-DD` | most recent filtered workout day | Selects a specific workout day. The day must be inside the filtered data range. |
| `workout` | zero-based number | `0` | Selects which workout on that day to render. `0` means the first workout. |
| `maxHeartRate` | BPM | plugin setting | Enables and scales Z1–Z5 heart-rate zone bands. Overrides the plugin-level max HR setting for this block. |

```health-viz
# Cycling workout from the bundled data. The explicit date makes the example deterministic.
type: workout-heart-rate
date: 2026-05-16
workout: 0
maxHeartRate: 190
from: 2026-05-16
to: 2026-05-16
height: 260
```

### `workout-map`

GPS route map for one selected outdoor workout. When map tiles are enabled in
plugin settings it renders a Leaflet map; otherwise it falls back to a canvas
polyline. Indoor workouts without route data show an explanatory empty state.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| `date` | `YYYY-MM-DD` | most recent filtered workout day | Selects a specific workout day. The day must be inside the filtered data range. |
| `workout` | zero-based number | `0` | Selects which workout on that day to render. |
| `colorBy` | `speed`, `hr` | `speed` | Colors route segments by speed or nearest heart-rate sample. If `hr` is requested without HR samples, the map falls back to speed-derived values. |
| `height` | pixels | `360` | Map height. |
| `width` | pixels | `800` | Canvas fallback width; Leaflet mode stretches to the note width. |

```health-viz
# Route colored by speed.
type: workout-map
date: 2026-05-16
workout: 0
colorBy: speed
from: 2026-05-16
to: 2026-05-16
height: 360
```

```health-viz
# Same route colored by heart rate.
type: workout-map
date: 2026-05-16
workout: 0
colorBy: hr
from: 2026-05-16
to: 2026-05-16
height: 360
```

---

## Quick copy/paste templates

### Single-day vitals note

```health-viz
type: intro-stats
from: 2026-04-14
to: 2026-04-14
```

```health-viz
type: heart-terrain
from: 2026-04-14T00:00
to: 2026-04-14T23:59
height: 140
```

```health-viz
type: activity-rings
from: 2026-04-14
to: 2026-04-14
moveGoal: 650
exerciseGoal: 45
standGoal: 12
height: 260
```

### Rolling weekly activity card set

```health-viz
type: summary-card
metric: steps
compareWindow: week
to: 2026-05-17
last: 14
```

```health-viz
type: bar-chart
metric: steps
goal: 10000
to: 2026-05-17
last: 7
height: 220
```

```health-viz
type: weekday-average
metric: steps
to: 2026-05-17
last: 56
height: 240
```
