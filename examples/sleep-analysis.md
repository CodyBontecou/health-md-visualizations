# Sleep Analysis Dashboard

A focused view of sleep health over the past 30 days. Adjust `last` to zoom
in or out.

---

## Sleep Summary

```health-viz
type: intro-stats
last: 30
```

---

## Sleep Schedule (Apple style)

Horizontal bars showing bedtime → wake time against a 24-hour axis.
Inner band is time actually asleep; outer band is total in-bed.

```health-viz
type: sleep-schedule
last: 14
height: 360
sleepGoal: 8
```

---

## Nightly Stage Breakdown

Stacked bars — each column is one night. Colors: deep (darkest) at the base,
then core, REM, and awake on top.

```health-viz
type: sleep-quality-bars
last: 30
height: 220
```

---

## Polar Clock

Each night occupies a clock-face arc. Useful for spotting consistent
sleep/wake times and stage patterns at a glance.

```health-viz
type: sleep-polar
last: 30
height: 280
```

---

## Architecture Timeline

Linear stage timeline — one row per night. Drag the tooltip over a segment
to see exact stage and duration.

```health-viz
type: sleep-architecture
last: 30
height: 180
```

---

## HRV — Recovery Signal

HRV typically rises after good sleep and falls with poor recovery. Compare
dips here against the sleep bars above.

```health-viz
type: hrv-trend
last: 30
height: 160
```

---

## Overnight Blood Oxygen

SpO2 during sleep hours. Dips below 94 % may indicate apnea events or
altitude effects.

```health-viz
type: oxygen-river
last: 30
height: 100
```

---

## Overnight Respiratory Rate

Resting respiratory rate during sleep. A sustained increase of 2+ breaths/min
from your baseline is often an early sign of illness.

```health-viz
type: breathing-wave
last: 30
height: 100
```

---

## Resting Heart Rate Context

Resting HR ring chart — useful to see how workout days (longer arcs)
relate to nights with fragmented sleep.

```health-viz
type: vitals-rings
last: 30
height: 260
```
