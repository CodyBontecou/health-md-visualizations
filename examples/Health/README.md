# Mock Health.md export

This folder contains deterministic, privacy-safe mock Apple Health data for the example dashboards in `examples/`. It is not real user data.

- Files: one `health-data` JSON document per day
- Range: `2025-11-19` through `2026-12-31`
- Includes: activity, heart rate samples, HRV, sleep stages, blood oxygen, respiratory rate, mobility, mood / State of Mind entries (`mood.entries`, `stateOfMind`, and `state_of_mind`), schema v2 medication inventory/dose events, and sample workouts
- Note: Floating local timestamps (no timezone) keep the sample vault portable.

To preview the bundled examples after cloning this repo, open the repo as an Obsidian vault, enable the plugin, and set **Settings → Health.md Visualizations → Data folder** to `examples/Health`.

Regenerate with:

```bash
npm run generate:mock-health
```
