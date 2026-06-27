# Activity & fitness Visualization Reference

Move/exercise/stand rings, daily bars, heatmaps, spirals, and weekday activity patterns.

[All visualization references](../visualization-reference.md) · Previous: [Overview & trends](overview-and-trends.md) · Next: [Heart](heart.md)

The examples are anchored to the bundled mock dataset with `to: 2026-05-17`
so they render consistently in a fresh clone. See the [main visualization
reference](../visualization-reference.md#code-block-argument-basics) for shared
`health-viz` arguments, date filtering, theming, and copy/paste notes.

## Visualization index

| Type | Best for | Data needed | Extra arguments |
| --- | --- | --- | --- |
| `activity-rings` | Move / Exercise / Stand rings | `activity.activeCalories`, `exerciseMinutes`, `standHours` | `moveGoal`, `exerciseGoal`, `standGoal` |
| `vitals-rings` | Steps, calories, heart-rate daily rings | activity + heart | none |
| `bar-chart` | Daily bars with goal / average lines | chosen metric | `metric`, `goal`, `showAverage` |
| `activity-heatmap` | GitHub-style activity calendar | activity | `metric` |
| `step-spiral` | Radial step history | activity steps | none |
| `weekday-average` | Average by day of week | chosen metric | `metric`, `weekStart` |

---

## Activity & fitness visualizations

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
