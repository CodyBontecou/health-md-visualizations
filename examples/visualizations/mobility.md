# Mobility Visualization Reference

Walking speed and asymmetry trend views.

[All visualization references](../visualization-reference.md) · Previous: [Respiratory & vitals](respiratory-and-vitals.md) · Next: [Mindfulness & mood](mindfulness-and-mood.md)

The examples are anchored to the bundled mock dataset with `to: 2026-05-17`
so they render consistently in a fresh clone. See the [main visualization
reference](../visualization-reference.md#code-block-argument-basics) for shared
`health-viz` arguments, date filtering, theming, and copy/paste notes.

## Visualization index

| Type | Best for | Data needed | Extra arguments |
| --- | --- | --- | --- |
| `walking-symmetry` | Walking speed and asymmetry | mobility | none |

---

## Mobility visualizations

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
