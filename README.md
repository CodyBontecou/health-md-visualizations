<img width="200" alt="CleanShot 2026-04-21 at 09 31 33@2x" src="https://github.com/user-attachments/assets/d4465c64-df4f-4bed-a48e-71ab4a3a2664" />

# Health.md Visualizations

An [Obsidian](https://obsidian.md) plugin that renders rich Apple Health visualizations from data files in your vault. Drop a fenced code block into any note (including a daily note) and the plugin renders an interactive canvas chart pulled from your local health data.

Supported data formats: **JSON**, **CSV**, **Markdown frontmatter**, and **Obsidian Bases** (YAML frontmatter).

Download [Health.md](https://apps.apple.com/us/app/health-md/id6757763969) on the app store to easily export and get access to your Apple Health data.

## Installation

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/CodyBontecou/health-md-visualizations/releases).
2. Copy them into `<your vault>/.obsidian/plugins/health-md/`.
3. Reload Obsidian and enable **Health.md Visualizations** in **Settings → Community plugins**.

### From source

```bash
git clone https://github.com/CodyBontecou/health-md-visualizations.git
cd health-md-visualizations
npm install
npm run build
```

Then copy `main.js`, `manifest.json`, and `styles.css` into your vault's plugin folder.

## Preparing an Obsidian community plugin submission

This repository includes a helper that validates the expected metadata and prepares a submission bundle for `obsidianmd/obsidian-releases`.

```bash
npm run prepare:submission
```

The command creates `release/obsidian-submission/<version>/` containing:

- release assets (`main.js`, `manifest.json`, `versions.json`, and `styles.css` when present)
- `community-plugin-entry.json` (copy this object into `community-plugins.json`)
- `SUBMISSION-CHECKLIST.md` (PR/release checklist)

## Quick start

1. Put your Apple Health export files in a folder inside your vault — by default the plugin looks at `Health/`.
2. In any note, add a fenced code block:

   ````markdown
   ```health-viz
   type: heart-terrain
   ```
   ````

3. Switch to reading view (or live preview) and the chart renders.

You can also run the **Insert health visualization** command from the command palette to drop a starter block at the cursor.

## Settings

Open **Settings → Health.md Visualizations**:

| Setting | Description |
| --- | --- |
| **Data folder** | Path inside the vault where the plugin looks for health files. Default `Health`. |
| **File pattern** | Glob to filter which files in that folder are loaded. Examples: `*` (all supported), `*.json`, `2026-*.md`, `health-*.csv`. |
| **Data format** | `auto` (detect by file extension), `json`, `csv`, `markdown`, or `bases`. |
| **Theme** | `auto` matches Obsidian, or force `dark` / `light`. |
| **Default width** | Default canvas width in pixels (charts shrink to container width). |
| **Default height** | Default canvas height in pixels. |

The plugin watches your data folder and automatically refreshes its cache when files are added, modified, or deleted.

## Visualization types

Specify one of these as the `type:` field in your code block:

| Type | What it shows |
| --- | --- |
| `heart-terrain` | Heart rate samples plotted as a terrain ridge over time. |
| `sleep-polar` | Polar clock view of sleep stages per night. |
| `sleep-architecture` | Linear timeline of sleep stages with depth bands. |
| `step-spiral` | Daily step counts arranged on a spiral. |
| `oxygen-river` | Blood oxygen samples as a flowing band. |
| `breathing-wave` | Respiratory rate samples as a wave. |
| `vitals-rings` | Concentric activity rings (steps, calories, heart rate) per day. |
| `walking-symmetry` | Walking asymmetry and gait metrics. |
| `intro-stats` | HTML summary card — totals, averages, and highlights for the dataset. |
| `summary-card` | Apple-style headline card: large KPI, sparkline, week-over-week delta. Configure with `metric` (`heart-rate`, `steps`, `sleep-duration`, `active-calories`, `hrv`, `blood-oxygen`, `respiratory-rate`) and optional `compareWindow` (`same-length`, `week`, `month`). |
| `activity-rings` | Apple's three concentric Move / Exercise / Stand rings. Single-day shows one large ring set; multi-day shows a small-multiples grid. Tune targets with `moveGoal`, `exerciseGoal`, `standGoal`. |
| `heart-range` | Per-day min-to-max heart rate capsule with an average dot. `metric`: `heart-rate` (default), `resting`, or `walking`. |
| `bar-chart` | Apple-style vertical bars with the latest day highlighted. `metric`: `steps`, `activeCalories`, `exerciseMinutes`, `distance`, `sleepHours`, `flightsClimbed`. Optional `goal` draws a dashed goal line; `showAverage` toggles the mean line. |
| `sleep-schedule` | Horizontal bedtime-to-wake bars against a sunset→night→sunrise backdrop. `sleepGoal` (hours), `windowStart` / `windowEnd` (`HH:MM`). |
| `weekday-average` | Seven bars showing a metric's average by day of week with an overall-mean dashed line. `metric`: `steps`, `activeCalories`, `exerciseMinutes`, `sleepHours`, `heartRate`, `hrv`. `weekStart`: `monday` (default) or `sunday`. |
| `trend-tile` | Compact HTML card for the Apple Health Trends tab: arrow + percent delta + narrative + two-period sparkline. `metric`: `resting-heart-rate`, `hrv`, `steps`, `vo2max`, `walking-speed`, `sleep-duration`, `active-calories`. Optional `currentWindow` and `priorWindow` (days). |
| `oxygen-range` | Per-day min/max capsule + average dot for SpO₂ or respiratory rate, with a warning-zone shade. `metric`: `blood-oxygen` (default) or `respiratory-rate`. |

All chart types support hover tooltips and click-to-pin. The `intro-stats`, `summary-card`, and `trend-tile` types are HTML/SVG (no canvas) for sharper typography.

### Bundled examples

Starter dashboards live in the `examples/` folder — copy any of them into your vault to see the code blocks render:

- `examples/apple-dashboard.md` — full Apple Health-style summary using the eight Apple visualizations (summary cards, activity rings, heart range, bar chart, sleep schedule, weekday average, oxygen range, trend tiles).
- `examples/daily-dashboard.md` — single-day overview for daily notes.
- `examples/weekly-overview.md` — rolling week-at-a-glance.
- `examples/sleep-analysis.md` — sleep-focused drill-down.

## Embedding charts in notes

A code block requires a `type` and accepts any of the optional config keys below. Each entry is a `key: value` line. Lines starting with `#` are comments.

````markdown
```health-viz
type: vitals-rings
width: 600
height: 400
```
````

### Common config keys

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | string | *(required)* | Visualization type — see the table above. |
| `width` | number | from settings | Canvas width in pixels (chart shrinks to container width). |
| `height` | number | from settings | Canvas height in pixels. |
| `from` | date or datetime | — | Start of the data window (inclusive). |
| `to` | date or datetime | — | End of the data window (inclusive). |
| `last` | number | — | Number of calendar days back to include. |

Individual visualization types may accept additional keys — values are passed through to the renderer as a free-form config object.

## Filtering by date or date+time

Every visualization can be scoped to a custom window using `from`, `to`, and/or `last`. The filter is applied uniformly across all chart types — no need to learn per-chart syntax.

### Just a date

`from` and `to` accept ISO calendar dates:

````markdown
```health-viz
type: step-spiral
from: 2026-01-01
to: 2026-03-31
```
````

Open-ended ranges are fine too:

````markdown
```health-viz
type: oxygen-river
from: 2026-04-01
```
````

### Last N days

`last: N` is a rolling window of `N` calendar days ending today. `last: 1` is just today; `last: 30` is today plus the previous 29 days.

````markdown
```health-viz
type: heart-terrain
last: 30
```
````

Combine `last` with `to` to anchor the window on a specific day instead of today:

````markdown
```health-viz
type: vitals-rings
to: 2026-03-31
last: 7
```
````

This shows the 7-day window ending **March 31, 2026**.

### Sub-day windows with datetimes

`from` and `to` also accept ISO datetimes — `YYYY-MM-DDTHH:MM` or `YYYY-MM-DDTHH:MM:SS`, with an optional `Z` or `±HH:MM` timezone suffix. When you provide a time component, the plugin slices sub-day samples on the boundary days so the chart only shows data inside the requested window.

````markdown
```health-viz
type: heart-terrain
from: 2026-04-09T06:00:00
to: 2026-04-09T12:00:00
```
````

The chart above renders only morning heart rate samples for April 9, 2026.

A multi-day window with precise endpoints:

````markdown
```health-viz
type: oxygen-river
from: 2026-04-01T22:00:00
to: 2026-04-08T07:00:00
```
````

Includes April 1 from 10 PM onward, the full days April 2 through 7, and April 8 up to 7 AM.

You can mix datetimes with `last`:

````markdown
```health-viz
type: breathing-wave
to: 2026-04-09T12:00:00
last: 7
```
````

A 7-day calendar window ending April 9, with samples after noon on April 9 trimmed.

Explicit timezones work too:

````markdown
```health-viz
type: sleep-architecture
from: 2026-04-09T22:00:00-07:00
to: 2026-04-10T08:00:00-07:00
```
````

If you omit the timezone, the time is interpreted in your local timezone (matching JavaScript's `Date.parse` semantics).

### Day-level aggregates are recomputed

When a sub-day window slices a boundary day's samples, day-level fields like `averageHeartRate`, `bloodOxygenAvg`, `totalDuration`, `deepSleep`, `bedtime`, etc. are **automatically recomputed from the sliced samples**. This means the stats shown alongside your charts (in `intro-stats`, sleep tooltips, vitals rings, and other panels) reflect the requested time window — not the full day.

The fields that are recomputed:

- **Heart**: `averageHeartRate`, `heartRateMin`, `heartRateMax`, `hrv`
- **Vitals**: `bloodOxygenAvg`/`Min`/`Max` (and the legacy `bloodOxygenPercent`), `respiratoryRateAvg`/`Min`/`Max` (and legacy `respiratoryRate`)
- **Sleep**: `totalDuration` (deep + REM + core), `deepSleep`, `remSleep`, `coreSleep`, `awakeTime`, `bedtime`, `wakeTime`, plus all formatted-string variants
- **Workouts**: filtered by `startTime`

A guard ensures aggregates aren't clobbered for days that were parsed from daily summaries without per-sample data — those days pass through unchanged.

#### Limitation: activity totals

Apple Health exports `activity.steps`, `activity.activeCalories`, `activity.exerciseMinutes`, `activity.flightsClimbed`, `activity.standHours`, `activity.basalEnergyBurned`, and `mobility.*` as **daily totals only**, with no underlying sub-day samples. There is no truthful way to slice those numbers for a partial day, so they pass through unchanged on boundary days. This affects the step ring in `vitals-rings`, the totals in `step-spiral`, and any walking/mobility metrics on a boundary day. Heart-rate–derived fields inside the same charts *are* recomputed correctly.

### Validation

The plugin validates the date range up front and renders an inline error if something is off:

- `Invalid "from" value: ... Use YYYY-MM-DD or YYYY-MM-DDTHH:MM[:SS].`
- `Invalid "last": ... Use a positive number of days.`
- `"from" (...) is after "to" (...).`
- `No health data in range (...).` — when the window is valid but produces an empty result.

## Daily-note tip

Add a `health-viz` block to your daily-note template (Templates or Templater plugin) and have a moving "last N days" view automatically appear in every new daily note:

````markdown
```health-viz
type: heart-terrain
last: 7
```
````

Because `last` is anchored on today by default, each new daily note shows the most recent 7 days at the moment you open it. The plugin's data cache invalidates whenever files in your data folder change, so the chart always reflects the latest export.

## Data format reference

The plugin auto-detects the data format from the file extension. Each file should represent **one day** of health data and live inside your configured data folder.

- `.json` — A `HealthDay` object (see `src/types.ts` for the full shape).
- `.csv` — Section headers (`Heart`, `Sleep`, `Vitals`, `Activity`, `Mobility`, …) followed by `Metric,Value` rows. See `src/parsers/csv-parser.ts`.
- `.md` — A markdown file with YAML frontmatter that uses fields like `heart_rate_avg`, `sleep_deep`, `steps`, etc. See `src/parsers/markdown-parser.ts`. This format is compatible with Obsidian Bases.

The top-level `date` field on each day must be a `YYYY-MM-DD` ISO date — the date filter does fast lexicographic comparisons against this field.

## Development

```bash
npm install
npm run dev      # esbuild watch mode
npm run build    # production build
```

Source layout:

- `src/main.ts` — plugin entry point and settings tab
- `src/renderer.ts` — code-block processor, config parsing, date range filtering, and aggregate recomputation
- `src/data-loader.ts` — vault-aware data loader with cache invalidation
- `src/parsers/` — JSON, CSV, and Markdown parsers
- `src/visualizations/` — one file per chart type, plus `intro-stats.ts` (HTML)
- `src/canvas-utils.ts` — shared canvas helpers and color palettes
- `src/types.ts` — `HealthDay`, `VizConfig`, `HitRegion`, render-fn signatures

## License

MIT — see `package.json`.
