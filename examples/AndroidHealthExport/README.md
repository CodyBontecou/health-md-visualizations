# Mock Android Health.md export

This folder contains deterministic, privacy-safe mock data shaped like a full granular JSON export from `/Users/codybontecou/projects/health-md-android`. It is not real health data.

- Files: one Android-compatible `health-data` JSON document per day
- Range: `2026-01-01` through `2026-06-10`
- Includes: Health Connect-style sleep, activity, heart, vitals, body, nutrition, vitamins, minerals, mobility, reproductive health, mindfulness, detailed workouts, routes, and workout time series
- Android compatibility keys are included alongside iOS-parity aliases where the Android exporter supports both
- SpO₂ aggregate/sample values intentionally follow the Android/iOS contract (fractions such as `0.97`) while percent aliases such as `bloodOxygenPercent` are also present

This repo is an Obsidian vault. The checked-in local plugin settings point to `examples/AndroidHealthExport`, so opening the Android dashboard should use this Android-shaped mock export immediately.

Regenerate with:

```bash
npm run generate:mock-android
```

Override the date window if needed:

```bash
ANDROID_HEALTH_START=2026-03-01 ANDROID_HEALTH_END=2026-06-10 npm run generate:mock-android
```
