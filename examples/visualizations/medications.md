# Medications Visualization Reference

Medication inventory, adherence summaries, per-medication status, trends, and recent dose events.

[All visualization references](../visualization-reference.md) · Previous: [Workouts](workouts.md)

The examples are anchored to the bundled mock dataset with `to: 2026-05-17`
so they render consistently in a fresh clone. See the [main visualization
reference](../visualization-reference.md#code-block-argument-basics) for shared
`health-viz` arguments, date filtering, theming, and copy/paste notes.

## Visualization index

| Type | Best for | Data needed | Extra arguments |
| --- | --- | --- | --- |
| `medication-overview` | All medication sections in one component | schema v2 medication counts/details/dose events | `trend`, `limit` |
| `medication-inventory` | Medication inventory section | schema v2 medication counts/details | none |
| `medication-adherence-summary` | Taken/skipped adherence summary section | schema v2 medication dose counts/events | none |
| `medication-dose-status` | Per-medication dose status section | schema v2 medication details/dose events | none |
| `medication-adherence-trend` | Daily adherence trend section | schema v2 medication dose counts/events | `trend` |
| `medication-recent-dose-events` | Recent dose-event table section | schema v2 medication dose events | `limit` |

---

## Medication visualizations

Health.md schema v2 medication exports can render as one overview component or
as standalone section components. The parser accepts count-only daily notes
(`medication_count`, `medication_dose_count`, `medication_taken_count`,
`medication_skipped_count`), rich `medication_details`, and
`medication_dose_events`. If `medication_details` is absent, the legacy/simple
`medications` list is used for inventory labels.

### `medication-overview`

Shows latest inventory totals, active vs archived medication details,
taken/skipped adherence summary, per-medication status breakdown,
daily/weekly/monthly trend bars, and a recent dose-event table in one HTML
component. The aliases `medications` and `medication-adherence` render the same
component.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| `trend` | `auto`, `daily`, `weekly`, `monthly` | `auto` | Groups adherence trend bars. Auto uses daily for short ranges, weekly for medium ranges, and monthly for long ranges. |
| `limit` | positive integer | `12` | Maximum number of recent dose events to show in the table. |

```health-viz
# Medication adherence over the last month.
type: medication-overview
to: 2026-05-17
last: 30
trend: auto
limit: 12
```

### Standalone medication sections

Use these when you want dashboard layout control over each piece of the overview:

- `medication-inventory` — inventory totals and active/archived medication rows.
- `medication-adherence-summary` — taken/skipped/other counts and adherence rate.
- `medication-dose-status` — per-medication status bars and adherence rate.
- `medication-adherence-trend` — daily adherence trend bars by default; accepts `trend: weekly`, `trend: monthly`, or `trend: auto`.
- `medication-recent-dose-events` — recent dose-event table; accepts `limit`.

```health-viz
type: medication-inventory
to: 2026-05-17
last: 30
```

```health-viz
type: medication-adherence-summary
to: 2026-05-17
last: 30
```

```health-viz
type: medication-dose-status
to: 2026-05-17
last: 30
```

```health-viz
type: medication-adherence-trend
to: 2026-05-17
last: 30
trend: daily
```

```health-viz
type: medication-recent-dose-events
to: 2026-05-17
last: 30
limit: 8
```
