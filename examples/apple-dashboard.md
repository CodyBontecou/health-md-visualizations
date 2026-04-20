# Apple Health Dashboard

A complete Apple Health-inspired summary. Each section mirrors a card from
Apple's own Summary tab, using the eight Apple-style visualizations bundled
with this plugin. The whole page auto-anchors to today — adjust `last: N`
values to widen or narrow any section's window.

> **Tip:** Apple Health's Summary tab is a vertical feed on iPhone, so the
> layout below stacks top-to-bottom. Side-by-side cards can be arranged with
> any column/grid plugin if you want a denser layout.

---

## Highlights

The four cards at the top of Apple Health's Summary: the headline number for
each pillar of health with a sparkline and a week-over-week trend delta.

```health-viz
type: summary-card
metric: heart-rate
last: 14
```

```health-viz
type: summary-card
metric: steps
last: 14
```

```health-viz
type: summary-card
metric: sleep-duration
last: 14
```

```health-viz
type: summary-card
metric: active-calories
last: 14
```

---

## Today's Activity

Apple's iconic three rings — Move (red), Exercise (green), Stand (blue) —
closing clockwise from the top. The min-to-max heart rate capsule to the
right shows how hard your heart worked on each of those days.

```health-viz
type: activity-rings
last: 7
height: 260
```

```health-viz
type: heart-range
last: 7
height: 220
```

---

## Steps & Sleep This Week

The latest day is highlighted; the rest of the week is muted for context.
Below, each night's bedtime-to-wake is drawn against a sunset→sunrise
backdrop so you can spot consistency at a glance.

```health-viz
type: bar-chart
metric: steps
last: 7
height: 220
goal: 10000
```

```health-viz
type: sleep-schedule
last: 7
height: 260
sleepGoal: 8
```

---

## Patterns

Apple's "Averages by Day of Week" next to SpO₂ / respiratory range bars.
Looking for the day you're consistently most (or least) active? Here.

```health-viz
type: weekday-average
metric: steps
last: 28
height: 220
```

```health-viz
type: oxygen-range
metric: blood-oxygen
last: 14
height: 200
```

---

## Trends — Last 90 Days

The Trends tab in Apple Health surfaces gradual shifts that day-to-day noise
hides. Green means you're improving on that metric's preferred direction:
rising HRV and active calories are good; rising resting HR is not.

```health-viz
type: trend-tile
metric: resting-heart-rate
last: 180
```

```health-viz
type: trend-tile
metric: hrv
last: 180
```

```health-viz
type: trend-tile
metric: active-calories
last: 180
```
