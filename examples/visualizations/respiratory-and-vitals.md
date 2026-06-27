# Respiratory & vitals Visualization Reference

Blood oxygen, respiratory-rate ranges, and overnight breathing-wave visualizations.

[All visualization references](../visualization-reference.md) · Previous: [Sleep](sleep.md) · Next: [Mobility](mobility.md)

The examples are anchored to the bundled mock dataset with `to: 2026-05-17`
so they render consistently in a fresh clone. See the [main visualization
reference](../visualization-reference.md#code-block-argument-basics) for shared
`health-viz` arguments, date filtering, theming, and copy/paste notes.

## Visualization index

| Type | Best for | Data needed | Extra arguments |
| --- | --- | --- | --- |
| `oxygen-river` | Blood oxygen sample band | SpO₂ samples | none |
| `oxygen-range` | Daily SpO₂ or respiratory min / max range | vitals aggregates | `metric` |
| `breathing-wave` | Respiratory-rate wave | respiratory samples | none |

---

## Respiratory & vitals visualizations

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
