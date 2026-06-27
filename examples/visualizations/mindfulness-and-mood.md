# Mindfulness & mood Visualization Reference

State of Mind, mood valence, associations, labels, circadian timing, volatility, and recovery context.

[All visualization references](../visualization-reference.md) · Previous: [Mobility](mobility.md) · Next: [Workouts](workouts.md)

The examples are anchored to the bundled mock dataset with `to: 2026-05-17`
so they render consistently in a fresh clone. See the [main visualization
reference](../visualization-reference.md#code-block-argument-basics) for shared
`health-viz` arguments, date filtering, theming, and copy/paste notes.

## Visualization index

| Type | Best for | Data needed | Extra arguments |
| --- | --- | --- | --- |
| `mood-trend` | Mood valence with sleep/workout context | `mindfulness.stateOfMindEntries`, `mood.entries`, or State of Mind exports | `showContext` |
| `mood-calendar-heatmap` | Calendar grid colored by mood valence | State of Mind entries or mood summaries | none |
| `mood-sleep-scatter` | Mood vs sleep duration scatterplot | mood + sleep duration | none |
| `mood-day-timeline` | Time-of-day mood entry lanes | timestamped State of Mind entries | `maxDays` |
| `mood-association-breakdown` | Average mood by association | State of Mind associations | `limit`, `sort` |
| `mood-label-cloud` | Emotion label word cloud | State of Mind labels | `limit` |
| `mood-volatility` | Daily average with intraday mood spread | one or more mood entries per day | none |
| `mood-kind-split` | Daily Mood vs Momentary Emotion comparison | State of Mind kinds | none |
| `mood-circadian-clock` | 24-hour radial mood clock | timestamped mood entries | none |
| `mood-recovery-tile` | Mood/sleep/HRV/exercise recovery card | mood plus optional sleep/heart/activity | none |
| `mood-association-matrix` | Label × association matrix | labels + associations | `metric`, `labels`, `associations` |

---

## Mindfulness & mood visualizations

### `mood-trend`

Shows HealthKit State of Mind / mood valence on a -1 (unpleasant) to +1
(pleasant) scale. When `showContext` is enabled, faint sleep-duration and
exercise/workout bars render behind the mood dots so mood can be inspected
alongside recovery and training load.

The parser accepts Health.md JSON State of Mind entries under
`mindfulness.stateOfMindEntries` plus legacy JSON mood summaries
(`mood.entries`, `mood.samples`, or `stateOfMind`), CSV rows in `Mindfulness`,
`Mood`, or `State of Mind` categories, and daily-note frontmatter such as
`average_mood_valence`, `mood_valence`, `mood_score`, `mood_label`,
`mood_associations`, and `mood_kind`.

| Argument | Values | Default | Effect |
| --- | --- | --- | --- |
| `showContext` | `true`, `false` | `true` | Draws sleep and exercise/workout context columns behind the mood trend. |

```health-viz
# Mood trend with sleep and workout context.
type: mood-trend
to: 2026-05-17
last: 30
height: 260
showContext: true
```

### Additional mood insight charts

These charts use the same parsed State of Mind data as `mood-trend` and expose
complementary views for journaling, behavior review, and recovery analysis.

| Type | What it shows | Useful options |
| --- | --- | --- |
| `mood-calendar-heatmap` | Month-style calendar cells colored by average daily valence. | none |
| `mood-sleep-scatter` | Each day plotted by sleep duration and mood valence; exercise adds a ring. | none |
| `mood-day-timeline` | One row per day with mood entries positioned by time of day and sleep spans behind them. | `maxDays` |
| `mood-association-breakdown` | Horizontal bars for average valence by association (`Work`, `Fitness`, etc.). | `limit`, `sort: count` or `sort: valence` |
| `mood-label-cloud` | Labels sized by frequency and colored by average valence. | `limit` |
| `mood-volatility` | Daily average mood line with bars for intraday mood range. | none |
| `mood-kind-split` | Separate trend lines for Daily Mood and Momentary Emotion entries. | none |
| `mood-circadian-clock` | 24-hour radial clock showing mood timing and valence. | none |
| `mood-recovery-tile` | Latest mood combined with sleep, HRV, and exercise into a recovery/mindset card. | none |
| `mood-association-matrix` | Emotion labels by associations; cells show valence or counts. | `metric: valence` or `metric: count` |

```health-viz
# Mood calendar heatmap.
type: mood-calendar-heatmap
to: 2026-05-17
last: 120
height: 220
```

```health-viz
# Mood, sleep, and exercise scatterplot.
type: mood-sleep-scatter
to: 2026-05-17
last: 60
height: 280
```

```health-viz
# State of Mind entries through the day.
type: mood-day-timeline
to: 2026-05-17
last: 21
height: 320
maxDays: 21
```

```health-viz
# Mood by association.
type: mood-association-breakdown
to: 2026-05-17
last: 90
height: 320
limit: 10
```

```health-viz
# Label cloud.
type: mood-label-cloud
to: 2026-05-17
last: 120
height: 260
limit: 28
```

```health-viz
# Intraday mood spread.
type: mood-volatility
to: 2026-05-17
last: 45
height: 260
```

```health-viz
# Compare Daily Mood with Momentary Emotion.
type: mood-kind-split
to: 2026-05-17
last: 45
height: 260
```

```health-viz
# Mood by time of day.
type: mood-circadian-clock
to: 2026-05-17
last: 90
height: 320
```

```health-viz
# Recovery + mindset tile.
type: mood-recovery-tile
to: 2026-05-17
last: 30
height: 280
```

```health-viz
# Label/association matrix.
type: mood-association-matrix
to: 2026-05-17
last: 120
height: 340
metric: valence
```
