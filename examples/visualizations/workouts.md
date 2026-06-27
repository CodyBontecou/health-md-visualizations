# Workouts Visualization Reference

Workout logs, in-workout heart rate, zones, trends, interval tables, and GPS route maps.

[All visualization references](../visualization-reference.md) · Previous: [Mindfulness & mood](mindfulness-and-mood.md) · Next: [Medications](medications.md)

The examples are anchored to the bundled mock dataset with `to: 2026-05-17`
so they render consistently in a fresh clone. See the [main visualization
reference](../visualization-reference.md#code-block-argument-basics) for shared
`health-viz` arguments, date filtering, theming, and copy/paste notes.

## Visualization index

| Type | Best for | Data needed | Extra arguments |
| --- | --- | --- | --- |
| `workout-log` | Workout list / duration bars | workouts | none |
| `workout-heart-rate` | Heart rate during one workout | workout heart-rate series or detailed HR zones | `date`, `workout`, `maxHeartRate` |
| `workout-zones` | Stacked heart-rate zone time | detailed workout `heart_rate_zones` or samples + max HR | `date`, `workout`, `maxHeartRate` |
| `workout-trends` | Workout metrics over time | workouts | `metric` |
| `workout-intervals` | Lap/split table | detailed workout laps/splits | `date`, `workout`, `kind` |
| `workout-map` | GPS route map for one workout | workout route | `date`, `workout`, `colorBy` |

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
zone bands. The renderer first uses per-workout `timeSeries.heartRate`; when that
is missing it renders detailed Health.md `heart_rate_zones` if present, then tries
daily `heart.heartRateSamples` that fall inside the workout start/end time. If no
sample series or zones are available, it renders a visible min/average/max summary
chart when those stats are present.

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

### `workout-zones`

Stacked heart-rate zone time for one selected workout. New detailed Health.md
workout notes include `heart_rate_zones` in frontmatter; older sample-based
workouts can still render zones when `maxHeartRate` is configured.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| `date` | `YYYY-MM-DD` | most recent filtered workout day | Selects a specific workout day. |
| `workout` | zero-based number | `0` | Selects which workout on that day to render. |
| `maxHeartRate` | BPM | plugin setting | Used only when zones must be derived from heart-rate samples. |

```health-viz
type: workout-zones
date: 2026-03-27
from: 2026-03-27
to: 2026-03-27
height: 180
```

### `workout-trends`

Small-multiple workout trends for duration, distance, calories, average heart
rate, and average power. Set `metric` to focus one panel.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| `metric` | `all`, `duration`, `distance`, `calories`, `hr_avg`, `power_avg` | `all` | Chooses all trend panels or one metric. |

```health-viz
type: workout-trends
last: 90
height: 420
```

```health-viz
type: workout-trends
metric: distance
last: 90
height: 240
```

### `workout-intervals`

HTML table for detailed workout laps and splits exported by Health.md.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| `date` | `YYYY-MM-DD` | most recent filtered workout day | Selects a specific workout day. |
| `workout` | zero-based number | `0` | Selects which workout on that day to render. |
| `kind` | `auto`, `laps`, `splits` | `auto` | Chooses which interval tables to show. |

```health-viz
type: workout-intervals
date: 2026-03-27
from: 2026-03-27
to: 2026-03-27
kind: auto
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
