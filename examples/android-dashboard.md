# Android Health.md Mock Export Dashboard

This dashboard is tuned for the Android-shaped mock export in `Health/`. The data mirrors a full granular JSON export from `health-md-android` with Android compatibility keys enabled.

## Overview

```health-viz
type: intro-stats
last: 30
height: 280
```

```health-viz
type: activity-rings
last: 7
height: 360
```

## Android / Health Connect metrics

```health-viz
type: summary-card
metric: steps
last: 14
```

```health-viz
type: summary-card
metric: heart-rate
last: 14
```

```health-viz
type: summary-card
metric: respiratory-rate
last: 14
```

```health-viz
type: summary-card
metric: blood-oxygen
last: 14
```

## Trends

```health-viz
type: heart-terrain
last: 14
height: 420
```

```health-viz
type: sleep-quality-bars
last: 14
height: 360
```

```health-viz
type: workout-log
last: 45
height: 520
```

## Latest detailed workout

```health-viz
type: workout-heart-rate
last: 30
height: 360
```

```health-viz
type: workout-map
last: 30
colorBy: hr
height: 420
```
