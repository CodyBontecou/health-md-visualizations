# Overview & trends Visualization Reference

Dataset summaries, Apple-style KPI cards, and trend tiles for high-level dashboards.

[All visualization references](../visualization-reference.md) · Next: [Activity & fitness](activity-and-fitness.md)

The examples are anchored to the bundled mock dataset with `to: 2026-05-17`
so they render consistently in a fresh clone. See the [main visualization
reference](../visualization-reference.md#code-block-argument-basics) for shared
`health-viz` arguments, date filtering, theming, and copy/paste notes.

## Visualization index

| Type | Best for | Data needed | Extra arguments |
| --- | --- | --- | --- |
| `intro-stats` | Dataset summary card | activity, heart, sleep, vitals | none |
| `summary-card` | Apple-style headline KPI | chosen metric | `metric`, `compareWindow` |
| `trend-tile` | Apple Health Trends card | chosen metric over two periods | `metric`, `currentWindow`, `priorWindow` |

---

## Overview & trends visualizations

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

| Argument        | Values                                                                                               | Default              | Effect                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------- |
| `metric`        | `resting-heart-rate`, `hrv`, `steps`, `vo2max`, `walking-speed`, `sleep-duration`, `active-calories` | `resting-heart-rate` | Chooses the trend metric and preferred direction.                         |
| `currentWindow` | positive number of days                                                                              | `90`                 | Number of most-recent filtered days in the current period.                |
| `priorWindow`   | positive number of days                                                                              | `90`                 | Number of days immediately before the current period used for comparison. |

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
