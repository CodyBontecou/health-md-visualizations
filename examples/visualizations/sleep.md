# Sleep Visualization Reference

Sleep schedule consistency, stage composition, architecture timelines, and clock-style polar views.

[All visualization references](../visualization-reference.md) · Previous: [Heart](heart.md) · Next: [Respiratory & vitals](respiratory-and-vitals.md)

The examples are anchored to the bundled mock dataset with `to: 2026-05-17`
so they render consistently in a fresh clone. See the [main visualization
reference](../visualization-reference.md#code-block-argument-basics) for shared
`health-viz` arguments, date filtering, theming, and copy/paste notes.

## Visualization index

| Type | Best for | Data needed | Extra arguments |
| --- | --- | --- | --- |
| `sleep-schedule` | Bedtime → wake consistency | sleep bedtime / wakeTime | `sleepGoal`, `windowStart`, `windowEnd` |
| `sleep-quality-bars` | Nightly sleep-stage composition | sleep stages | none |
| `sleep-architecture` | Linear sleep-stage timeline | sleep stages | none |
| `sleep-polar` | Clock-face sleep stages | sleep stages | none |

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
