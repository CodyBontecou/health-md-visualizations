# Health.md schema v7 summary visualizations

These dashboards use daily summary fields, roll-up summaries, top-level medication dose events, and compact export diagnostics. They do not read clinical Health Records or canonical lossless archive payloads and do not require Apple's Health Records entitlement.

## Canonical metric and VO₂ Max

```health-viz
type: metric-trend
metric: weight_kg
last: 180
rollingAverage: 7
```

```health-viz
type: cardio-fitness-freshness
last: 180
```

```health-viz
type: rollup-explorer
period: monthly
metric: vo2_max
limit: 12
```

```health-viz
type: capture-coverage-calendar
last: 180
```

## Vitals and body composition

```health-viz
type: blood-pressure-bands
last: 90
```

```health-viz
type: glucose-range
last: 90
```

```health-viz
type: body-composition
last: 180
metrics: weight_kg,bmi,body_fat_percent,lean_body_mass_kg,waist_circumference_cm
height: 520
```

## Performance and hearing

```health-viz
type: running-form
last: 90
height: 520
```

```health-viz
type: cycling-performance
last: 90
height: 520
```

```health-viz
type: hearing-exposure
last: 90
```

## Nutrition, symptoms, and cycle summaries

```health-viz
type: nutrition-grid
preset: vitamins
last: 30
maxRows: 15
height: 460
```

```health-viz
type: symptom-heatmap
last: 60
sort: total
maxRows: 15
height: 480
```

`cycle-timeline` is private and opt-in. It excludes sexual activity from its default lanes.

```health-viz
type: cycle-timeline
last: 90
showSymptoms: false
showMood: false
height: 300
```

## Medication timing

```health-viz
type: medication-schedule-timeline
last: 30
limit: 30
```

```health-viz
type: medication-skip-reasons
last: 90
```

Reference lines such as `goal`, `reference`, `minReference`, and `maxReference` are optional user-provided values. The plugin does not supply diagnostic, nutrition, or safe-exposure thresholds.
