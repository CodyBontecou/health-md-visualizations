# Weekly Health Overview

A rolling 7-day summary across all health domains. Change `last: 7` to any
number of days you want.

> **Tip:** `last: N` always anchors to today, so this page stays current
> without editing dates.

---

## Summary Stats

```health-viz
type: intro-stats
last: 7
```

---

## Activity Heatmap — Steps

GitHub-style grid showing daily step counts. Deeper color = more steps.
Switch `metric` to `calories` or `distance` to change the underlying measure.

```health-viz
type: activity-heatmap
last: 7
metric: steps
height: 120
```

---

## Activity Heatmap — Calories

```health-viz
type: activity-heatmap
last: 7
metric: calories
height: 120
```

---

## Step Spiral

Each arm of the spiral is one day. Inner arms are oldest; outer arms newest.
A longer arm means more steps.

```health-viz
type: step-spiral
last: 7
height: 240
```

---

## Activity Rings

Concentric rings per day — steps (outer arc), calories (thin inner arc),
and a resting HR dot. Inner ring = oldest day.

```health-viz
type: vitals-rings
last: 7
height: 240
```

---

## Heart Rate Terrain

All 7 days of heart rate stacked as ridgeline rows. Earlier days sit at the
top; each row spans 24 hours.

```health-viz
type: heart-terrain
last: 7
height: 200
```

---

## HRV Trend

```health-viz
type: hrv-trend
last: 7
height: 160
```

---

## Sleep — Quality Bars

Stacked bars showing sleep stage breakdown each night.

```health-viz
type: sleep-quality-bars
last: 7
height: 200
```

---

## Sleep Architecture

Detailed stage timeline across the week.

```health-viz
type: sleep-architecture
last: 7
height: 120
```

---

## Sleep Polar Clock

Each night arranged as a polar segment. Stage colors match the legend.

```health-viz
type: sleep-polar
last: 7
height: 240
```

---

## Blood Oxygen

```health-viz
type: oxygen-river
last: 7
height: 100
```

---

## Respiratory Rate

```health-viz
type: breathing-wave
last: 7
height: 100
```

---

## Walking Symmetry

Top bars = walking speed; bottom bars = asymmetry %. Taller asymmetry bars
may indicate gait issues.

```health-viz
type: walking-symmetry
last: 7
height: 160
```

---

## Workouts This Week

```health-viz
type: workout-log
last: 7
height: 200
```
