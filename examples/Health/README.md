# Mock Health.md export

This folder contains deterministic, privacy-safe mock Apple Health data for the example dashboards in `examples/`. It is not real user data.

- Files: one daily `healthmd.health_data` v8 JSON document per day, one `healthmd.rollup_summary` v9 range summary, plus historical-compatible v8 weekly/monthly/yearly summaries under `Rollups/`
- Range: `2025-11-19` through `2026-12-31`
- Includes: activity, heart rate samples, HRV, sleep stages, blood oxygen, blood pressure, glucose, body composition, nutrition, symptoms, cycle summaries, hearing, running/cycling summaries, mood / State of Mind entries under `mindfulness.stateOfMindEntries`, medication inventory/dose events, sample workouts, capture status, and roll-up statistics
- Note: Floating local timestamps (no timezone) keep the sample vault portable.

To preview the bundled examples after cloning this repo, open the repo as an Obsidian vault, enable the plugin, and set **Settings → Health.md Visualizations → Data folder** to `examples/Health`.

Regenerate with:

```bash
npm run generate:mock-health
```
