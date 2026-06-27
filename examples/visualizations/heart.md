# Heart Visualization Reference

Heart-rate terrain, daily heart ranges, resting/walking heart context, and HRV trends.

[All visualization references](../visualization-reference.md) · Previous: [Activity & fitness](activity-and-fitness.md) · Next: [Sleep](sleep.md)

The examples are anchored to the bundled mock dataset with `to: 2026-05-17`
so they render consistently in a fresh clone. See the [main visualization
reference](../visualization-reference.md#code-block-argument-basics) for shared
`health-viz` arguments, date filtering, theming, and copy/paste notes.

## Visualization index

| Type | Best for | Data needed | Extra arguments |
| --- | --- | --- | --- |
| `heart-terrain` | Heart-rate ridgelines / heatmap | heart samples or daily heart aggregates | none |
| `heart-range` | Daily min / max / average heart range | heart aggregates | `metric` |
| `hrv-trend` | HRV line chart | `heart.hrv` or `hrvSamples` | none |

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
