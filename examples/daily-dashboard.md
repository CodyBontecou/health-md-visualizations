# Daily Health Dashboard

A single-day deep-dive. Set `from` and `to` to the same date to focus on one day,
or use a time window to zoom into a specific block of hours.

> **Tip:** Hover over any chart element to see details. Click to pin the tooltip.

---

## At a Glance

```health-viz
type: intro-stats
from: 2026-04-14
to: 2026-04-14
```

---

## Heart Rate — Full Day

Heart rate terrain for today. Each column is a 15-minute bucket; intensity
encodes rate (cool = resting, warm = elevated).

```health-viz
type: heart-terrain
from: 2026-04-14T00:00
to: 2026-04-14T23:59
height: 120
```

---

## Heart Rate Variability

Daily HRV trend over the past two weeks. Higher is generally better; dips
often correlate with stress, illness, or a hard workout the day before.

```health-viz
type: hrv-trend
last: 14
height: 160
```

---

## Blood Oxygen

SpO2 readings across the day. The band width reflects variability; values
below 95 % may warrant attention.

```health-viz
type: oxygen-river
from: 2026-04-14T00:00
to: 2026-04-14T23:59
height: 100
```

---

## Respiratory Rate

Breathing rate samples for today. Elevated rates during rest can signal
recovery stress.

```health-viz
type: breathing-wave
from: 2026-04-14T00:00
to: 2026-04-14T23:59
height: 100
```

---

## Sleep — Last Night

Sleep architecture for the night ending today.

```health-viz
type: sleep-architecture
from: 2026-04-13
to: 2026-04-14
height: 80
```

---

## Activity

Steps, calories, and resting heart rate ring chart for today.

```health-viz
type: vitals-rings
from: 2026-04-14
to: 2026-04-14
height: 220
```

---

## Workouts

Any workouts logged today.

```health-viz
type: workout-log
from: 2026-04-14
to: 2026-04-14
height: 120
```
