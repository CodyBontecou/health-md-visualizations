<img width="200" alt="CleanShot 2026-04-21 at 09 31 33@2x" src="https://github.com/user-attachments/assets/d4465c64-df4f-4bed-a48e-71ab4a3a2664" />

# Health.md Visualizations

An [Obsidian](https://obsidian.md) plugin that renders rich Apple Health visualizations from data files in your vault. Drop a fenced code block into any note (including a daily note) and the plugin renders an interactive canvas chart pulled from your local health data.

Supported data formats: **JSON**, **CSV**, **Markdown frontmatter**, and **Obsidian Bases** (YAML frontmatter).

Download [Health.md](https://apps.apple.com/us/app/health-md/id6757763969) on the app store to easily export and get access to your Apple Health data.

## Visualization gallery

A quick preview of the latest bundled visualization screenshots. Click any image to open the full-size version.

<p align="center">
  <a href="examples/images/visualizations/summary-card.png"><img src="examples/images/visualizations/summary-card.png" alt="Summary card visualization" width="31%"></a>
  <a href="examples/images/visualizations/activity-rings.png"><img src="examples/images/visualizations/activity-rings.png" alt="Activity rings visualization" width="31%"></a>
  <a href="examples/images/visualizations/heart-range.png"><img src="examples/images/visualizations/heart-range.png" alt="Heart range visualization" width="31%"></a>
  <a href="examples/images/visualizations/sleep-schedule.png"><img src="examples/images/visualizations/sleep-schedule.png" alt="Sleep schedule visualization" width="31%"></a>
  <a href="examples/images/visualizations/oxygen-range.png"><img src="examples/images/visualizations/oxygen-range.png" alt="Oxygen range visualization" width="31%"></a>
  <a href="examples/images/visualizations/workout-map.png"><img src="examples/images/visualizations/workout-map.png" alt="Workout map visualization" width="31%"></a>
  <a href="examples/images/visualizations/activity-heatmap.png"><img src="examples/images/visualizations/activity-heatmap.png" alt="Activity heatmap visualization" width="31%"></a>
  <a href="examples/images/visualizations/step-spiral.png"><img src="examples/images/visualizations/step-spiral.png" alt="Step spiral visualization" width="31%"></a>
  <a href="examples/images/visualizations/workout-log.png"><img src="examples/images/visualizations/workout-log.png" alt="Workout log visualization" width="31%"></a>
</p>

See the full per-type gallery in [Visualization types](#visualization-types).

## Installation

Install Health.md from the Obsidian Community Plugins directory:

[https://community.obsidian.md/plugins/health-md](https://community.obsidian.md/plugins/health-md)

### Manual

If you prefer to install manually:

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

## Quick start

1. Put your Apple Health export files in a folder inside your vault — by default the plugin looks at `Health/`.
2. In any note, add a fenced code block:

   ````markdown
   ```health-viz
   type: heart-terrain
   ```
   ````

3. Switch to reading view (or live preview) and the chart renders.

You can also run the **Insert health visualization** command from the command palette to open an insertion wizard. Pick a visualization category and type, then fill in the date range, renderer-specific options, and optional size before the plugin inserts the `health-viz` block at the cursor.

## Settings

Open **Settings → Health.md Visualizations**:

| Setting | Description |
| --- | --- |
| **Data folder** | Path inside the vault where the plugin looks for health files. Default `Health`. Includes folder autocomplete in settings to reduce path typos. |
| **Data folder structure** | Opt-in folder nesting. Default `Flat` keeps the historical behavior of loading files directly under the data folder. `Year`, `Month`, `Week`, and `Day` scan up to those subfolder depths for layouts like `Health/2026/`, `Health/2026/06/`, `Health/2026/W23/`, or `Health/2026/06/03/`. Choose `Custom template` to scan folders using your own pattern. |
| **Custom folder path template** | Used when structure is `Custom template`. Supports predefined variables `{year}`, `{month}`, `{week}` (for example `W23`), `{day}`, and `{date}` plus static folder names. Example: `{year}/{month}/{day}`. |
| **File pattern** | Glob to filter which files in that folder are loaded. Examples: `*` (all supported), `*.json`, `2026-*.md`, `health-*.csv`, `2026/**/*.json` for nested paths. |
| **Data format** | `auto` (detect by file extension), `json`, `csv`, `markdown`, or `bases`. Markdown support requires YAML frontmatter (Bases-style). |
| **Theme** | `auto` matches the active Obsidian theme (including custom CSS colors), or force `dark` / `light`. |
| **Color scheme** | Pick a built-in palette, choose `Match Obsidian theme` to use the theme accent, or set individual custom colors. |
| **Default width** | Default canvas width in pixels (charts shrink to container width). |
| **Default height** | Default canvas height in pixels. |
| **Data point click action** | What clicking a hoverable canvas point does: pin the tooltip, open the source health data file, or open the matching Daily Note. |

Nested folders are opt-in so existing vaults keep working unchanged. In any nested mode, including custom templates, files directly under the data folder are still loaded, which lets you migrate from flat exports gradually.

The plugin watches your data folder and automatically refreshes its cache when files are added, modified, or deleted.

### Visualization appearance

Global appearance is controlled from settings, and each `health-viz` block can override it when a specific chart needs its own style:

```health-viz
type: bar-chart
metric: steps
colorScheme: theme
accent: #7c3aed
background: #111827
foreground: #f9fafb
muted: #9ca3af
```

Supported appearance keys are `theme` (`auto`, `dark`, `light`), `colorScheme`/`palette` (`theme`, `default`, `ocean`, `forest`, `sunset`, `aurora`, `monochrome`), `background`/`bg`, `foreground`/`fg`, `muted`, `accent`, `secondary`, `heart`, `sleepDeep`, `sleepRem`, `sleepCore`, and `sleepAwake`.

### Health.md schema compatibility

The plugin supports legacy/unversioned Health.md daily exports as schema `v0` and all published `healthmd.health_data` versions through `schema_version: 7`. Versions 5 and 6 remain valid historical files. A mixed vault can load v0 through v7 without relabeling older exports, while versions newer than v7 are reported as best-effort.

Health.md v6 and v7 can include a `healthmd.healthkit_records` v1 source archive. The plugin reads only its compact capture status, schema version, record counts, query status counts, and warning counts. Canonical records, UUID relationships, routes, waveforms, clinical payloads, and binary data do not enter dashboard metric summaries or the in-memory day cache. This avoids double counting the daily summary layer and keeps large lossless exports usable.

Health.md roll-up files under `Health/Rollups/` are indexed separately from daily records. The plugin supports v7 JSON, Markdown, and Bases roll-ups, including every statistic and the v7 VO2 Max `latest` rule. Roll-up CSV is accepted as an unversioned structural format because its public header does not contain a schema-version column. The plugin also reads `_healthmd_data_dictionary.json` for canonical aliases, units, metric IDs, and metric types.

The v7 visualization suite uses only ordinary daily summary fields, exported roll-up summaries, top-level medication dose events, and compact capture diagnostics. It does **not** require Apple's Health Records or Verifiable Health Records entitlement and never reads clinical/FHIR/CDA records from the lossless archive. Blood pressure, blood glucose, body composition, activity, nutrition, symptoms, reproductive summaries, and hearing levels are ordinary HealthKit summary data whose availability still depends on the user's selected metrics and authorization.

Markdown without frontmatter can still provide supported granular tables, but it cannot declare a schema, canonical units, timezone context, or capture completeness. Large JSON and CSV files receive a bounded source preview instead of rendering every canonical record or base64 payload in Obsidian.

If charts look incomplete after changing Health.md export settings, open **Settings → Health.md Visualizations → Health.md schema compatibility** and click **Scan now**. For consistent historical charts, update the plugin and re-export older dates only when you need corrected v7 summary or roll-up semantics.

## Platform support

For Health.md app exports, visualization support depends on whether the underlying data exists in both Apple HealthKit and Android Health Connect.

### iOS and Android

These visualizations map to shared HealthKit / Health Connect export fields:

| Category | Visualization types |
| --- | --- |
| Overview | `intro-stats`, `summary-card`, `trend-tile`, `metric-trend`, `rollup-explorer`, `capture-coverage-calendar` |
| Activity | `activity-rings`, `vitals-rings`, `bar-chart`, `activity-heatmap`, `step-spiral`, `weekday-average` |
| Heart | `heart-terrain`, `heart-range`, `hrv-trend` |
| Respiratory and vitals | `oxygen-river`, `oxygen-range`, `breathing-wave`, `blood-pressure-bands`, `glucose-range` |
| Sleep | `sleep-schedule`, `sleep-quality-bars`, `sleep-architecture`, `sleep-polar` |
| Mobility | `walking-symmetry`*, `running-form`* |
| Workouts | `workout-log`, `workout-heart-rate`, `workout-zones`, `workout-trends`, `workout-intervals`, `workout-map`, `cycling-performance`* |
| Body, nutrition, and hearing | `body-composition`, `nutrition-grid`*, `hearing-exposure`* |

Notes:

- A `*` marks summary fields whose availability differs between HealthKit and Health Connect; charts render only metrics actually present and never substitute zero for missing data.
- `walking-symmetry` is partial on Android: Android has walking speed, but not Apple-only asymmetry or double-support details.
- `activity-rings` is partial on Android for Stand: the plugin falls back to a steps-derived stand proxy when `standHours` is missing.
- Workout route and sample charts require granular workout data and route permission/consent.

### iOS-only

HealthKit State of Mind / mood visualizations:

- `mood-trend` / `state-of-mind`
- `mood-calendar-heatmap`
- `mood-sleep-scatter`
- `mood-day-timeline`
- `mood-association-breakdown`
- `mood-label-cloud`
- `mood-volatility`
- `mood-kind-split`
- `mood-circadian-clock`
- `mood-recovery-tile`
- `mood-association-matrix`

Medication catalog / dose-event visualizations:

- `medication-overview` / `medications` / `medication-adherence`
- `medication-inventory`
- `medication-adherence-summary`
- `medication-dose-status` / `per-medication-dose-status`
- `medication-adherence-trend` / `medication-daily-adherence-trend`
- `medication-recent-dose-events` / `medication-dose-events`
- `medication-schedule-timeline`
- `medication-skip-reasons`

Android Health Connect does not expose equivalent HealthKit State of Mind records or HealthKit-style medication catalog / dose-event records. `symptom-heatmap` and the private, opt-in `cycle-timeline` use Apple Health summary fields when available; `cycle-timeline` intentionally excludes sexual activity.

### Schema v7 summary visualizations

The following types are backed by the canonical summary metric layer and data dictionary:

- `metric-trend` — any observed numeric canonical key, with optional rolling average and user reference line
- `cardio-fitness-freshness` — VO₂ Max measured-vs-carried-forward provenance
- `rollup-explorer` — exported weekly/monthly/yearly rules, coverage, and statistics
- `capture-coverage-calendar` — compact export completeness only
- `blood-pressure-bands`, `glucose-range`, and `body-composition`
- `running-form`, `cycling-performance`, and `hearing-exposure`
- `nutrition-grid`, `symptom-heatmap`, and private opt-in `cycle-timeline`

No built-in medical target, diagnosis, nutrient recommendation, or safe/unsafe threshold is inferred. Reference lines are shown only when the code block explicitly supplies one. Copy/paste examples are available in [`examples/v7-summary-visualizations.md`](examples/v7-summary-visualizations.md).

### Android-only

None in the current plugin visualization registry. Android does export Android-native data such as PHR/FHIR resources, planned workouts, and activity intensity, but no current visualization type targets those fields yet.

## Visualization types

Specify one of these as the `type:` field in your code block. The gallery below shows each renderer with a short description; start at `examples/visualization-reference.md` for the category-specific argument tables, defaults, and copy/paste examples.

<table>
<tr>
<td width="46%"><a href="examples/images/visualizations/intro-stats.png"><img src="examples/images/visualizations/intro-stats.png" alt="intro-stats visualization" width="420"></a></td>
<td width="54%"><p><strong><code>intro-stats</code></strong></p><p>HTML summary card — totals, averages, and highlights for the selected dataset.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/summary-card.png"><img src="examples/images/visualizations/summary-card.png" alt="summary-card visualization" width="420"></a></td>
<td><p><strong><code>summary-card</code></strong></p><p>Apple-style headline card with large KPI, sparkline, range, and comparison delta.</p><p><strong>Extra arguments:</strong> <code>metric</code>, <code>compareWindow</code>.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/trend-tile.png"><img src="examples/images/visualizations/trend-tile.png" alt="trend-tile visualization" width="420"></a></td>
<td><p><strong><code>trend-tile</code></strong></p><p>Apple Health Trends-style HTML card with direction arrow, percent delta, narrative, and two-period sparkline.</p><p><strong>Extra arguments:</strong> <code>metric</code>, <code>currentWindow</code>, <code>priorWindow</code>.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/activity-rings.png"><img src="examples/images/visualizations/activity-rings.png" alt="activity-rings visualization" width="420"></a></td>
<td><p><strong><code>activity-rings</code></strong></p><p>Apple's Move / Exercise / Stand rings; single-day large ring set or multi-day small multiples.</p><p><strong>Extra arguments:</strong> <code>moveGoal</code>, <code>exerciseGoal</code>, <code>standGoal</code>.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/vitals-rings.png"><img src="examples/images/visualizations/vitals-rings.png" alt="vitals-rings visualization" width="420"></a></td>
<td><p><strong><code>vitals-rings</code></strong></p><p>Health.md radial activity/vitals rings: steps, calories, and heart-rate context per day.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/bar-chart.png"><img src="examples/images/visualizations/bar-chart.png" alt="bar-chart visualization" width="420"></a></td>
<td><p><strong><code>bar-chart</code></strong></p><p>Apple-style vertical bars with latest day highlight, optional goal line, and optional average line.</p><p><strong>Extra arguments:</strong> <code>metric</code>, <code>goal</code>, <code>showAverage</code>.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/activity-heatmap.png"><img src="examples/images/visualizations/activity-heatmap.png" alt="activity-heatmap visualization" width="420"></a></td>
<td><p><strong><code>activity-heatmap</code></strong></p><p>GitHub-style activity calendar shaded by daily steps, calories, or distance.</p><p><strong>Extra arguments:</strong> <code>metric</code>.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/step-spiral.png"><img src="examples/images/visualizations/step-spiral.png" alt="step-spiral visualization" width="420"></a></td>
<td><p><strong><code>step-spiral</code></strong></p><p>Daily step counts arranged on a spiral, with older days near the center and newer days spiraling outward.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/weekday-average.png"><img src="examples/images/visualizations/weekday-average.png" alt="weekday-average visualization" width="420"></a></td>
<td><p><strong><code>weekday-average</code></strong></p><p>Seven bars showing a metric's average by weekday with an overall-mean line.</p><p><strong>Extra arguments:</strong> <code>metric</code>, <code>weekStart</code>.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/heart-terrain.png"><img src="examples/images/visualizations/heart-terrain.png" alt="heart-terrain visualization" width="420"></a></td>
<td><p><strong><code>heart-terrain</code></strong></p><p>Heart-rate samples plotted as daily terrain / ridgeline rows over time.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/heart-range.png"><img src="examples/images/visualizations/heart-range.png" alt="heart-range visualization" width="420"></a></td>
<td><p><strong><code>heart-range</code></strong></p><p>Per-day min-to-max heart-rate capsule with an average dot and optional resting-HR reference line.</p><p><strong>Extra arguments:</strong> <code>metric</code>.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/hrv-trend.png"><img src="examples/images/visualizations/hrv-trend.png" alt="hrv-trend visualization" width="420"></a></td>
<td><p><strong><code>hrv-trend</code></strong></p><p>HRV trend line from daily HRV or HRV samples.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/oxygen-river.png"><img src="examples/images/visualizations/oxygen-river.png" alt="oxygen-river visualization" width="420"></a></td>
<td><p><strong><code>oxygen-river</code></strong></p><p>Blood oxygen samples as a flowing band with summary stats.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/oxygen-range.png"><img src="examples/images/visualizations/oxygen-range.png" alt="oxygen-range visualization" width="420"></a></td>
<td><p><strong><code>oxygen-range</code></strong></p><p>Daily SpO₂ or respiratory min/max capsule with warning-zone shading.</p><p><strong>Extra arguments:</strong> <code>metric</code>.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/breathing-wave.png"><img src="examples/images/visualizations/breathing-wave.png" alt="breathing-wave visualization" width="420"></a></td>
<td><p><strong><code>breathing-wave</code></strong></p><p>Respiratory-rate samples as a wave.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/sleep-schedule.png"><img src="examples/images/visualizations/sleep-schedule.png" alt="sleep-schedule visualization" width="420"></a></td>
<td><p><strong><code>sleep-schedule</code></strong></p><p>Horizontal bedtime-to-wake bars against a sunset→night→sunrise backdrop. Requires bedtime/wake timing or stage timestamps; 24-hour and 12-hour times are supported.</p><p><strong>Extra arguments:</strong> <code>sleepGoal</code>, <code>windowStart</code>, <code>windowEnd</code>.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/sleep-quality-bars.png"><img src="examples/images/visualizations/sleep-quality-bars.png" alt="sleep-quality-bars visualization" width="420"></a></td>
<td><p><strong><code>sleep-quality-bars</code></strong></p><p>Stacked nightly bars for deep, core, REM, and awake time.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/sleep-architecture.png"><img src="examples/images/visualizations/sleep-architecture.png" alt="sleep-architecture visualization" width="420"></a></td>
<td><p><strong><code>sleep-architecture</code></strong></p><p>Linear timeline of sleep stages with depth bands.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/sleep-polar.png"><img src="examples/images/visualizations/sleep-polar.png" alt="sleep-polar visualization" width="420"></a></td>
<td><p><strong><code>sleep-polar</code></strong></p><p>Polar clock view of sleep stages per night.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td colspan="2"><h3>Mindfulness &amp; mood visualizations</h3><p>These charts render HealthKit State of Mind entries, Health.md mood summaries, and compatible daily-note mood frontmatter.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/mood-trend.png"><img src="examples/images/visualizations/mood-trend.png" alt="mood-trend visualization" width="420"></a></td>
<td><p><strong><code>mood-trend</code></strong> (alias: <code>state-of-mind</code>)</p><p>State of Mind / mood valence over time on a -1 to +1 scale, with optional sleep and exercise context columns behind the trend.</p><p><strong>Extra arguments:</strong> <code>showContext</code>.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/mood-calendar-heatmap.png"><img src="examples/images/visualizations/mood-calendar-heatmap.png" alt="mood-calendar-heatmap visualization" width="420"></a></td>
<td><p><strong><code>mood-calendar-heatmap</code></strong></p><p>Month-style calendar cells colored by each day's average mood valence.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/mood-sleep-scatter.png"><img src="examples/images/visualizations/mood-sleep-scatter.png" alt="mood-sleep-scatter visualization" width="420"></a></td>
<td><p><strong><code>mood-sleep-scatter</code></strong></p><p>Scatterplot comparing sleep duration with mood valence; exercise adds a contextual ring around each day.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/mood-day-timeline.png"><img src="examples/images/visualizations/mood-day-timeline.png" alt="mood-day-timeline visualization" width="420"></a></td>
<td><p><strong><code>mood-day-timeline</code></strong></p><p>One row per day with mood entries placed by time of day and sleep spans shown behind the entries.</p><p><strong>Extra arguments:</strong> <code>maxDays</code>.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/mood-association-breakdown.png"><img src="examples/images/visualizations/mood-association-breakdown.png" alt="mood-association-breakdown visualization" width="420"></a></td>
<td><p><strong><code>mood-association-breakdown</code></strong></p><p>Horizontal bars showing average mood valence by State of Mind association such as Work, Fitness, Leisure, or Family.</p><p><strong>Extra arguments:</strong> <code>limit</code>, <code>sort</code>.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/mood-label-cloud.png"><img src="examples/images/visualizations/mood-label-cloud.png" alt="mood-label-cloud visualization" width="420"></a></td>
<td><p><strong><code>mood-label-cloud</code></strong></p><p>Emotion labels sized by frequency and colored by their average mood valence.</p><p><strong>Extra arguments:</strong> <code>limit</code>.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/mood-volatility.png"><img src="examples/images/visualizations/mood-volatility.png" alt="mood-volatility visualization" width="420"></a></td>
<td><p><strong><code>mood-volatility</code></strong></p><p>Daily average mood trend with bars showing the intraday range between lowest and highest entries.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/mood-kind-split.png"><img src="examples/images/visualizations/mood-kind-split.png" alt="mood-kind-split visualization" width="420"></a></td>
<td><p><strong><code>mood-kind-split</code></strong></p><p>Compares Daily Mood entries with Momentary Emotion entries over time.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/mood-circadian-clock.png"><img src="examples/images/visualizations/mood-circadian-clock.png" alt="mood-circadian-clock visualization" width="420"></a></td>
<td><p><strong><code>mood-circadian-clock</code></strong></p><p>Radial 24-hour clock showing when mood entries happen and how pleasant or unpleasant they are.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/mood-recovery-tile.png"><img src="examples/images/visualizations/mood-recovery-tile.png" alt="mood-recovery-tile visualization" width="420"></a></td>
<td><p><strong><code>mood-recovery-tile</code></strong></p><p>Recovery and mindset card combining latest mood, sleep, HRV, and exercise context into a single score.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/mood-association-matrix.png"><img src="examples/images/visualizations/mood-association-matrix.png" alt="mood-association-matrix visualization" width="420"></a></td>
<td><p><strong><code>mood-association-matrix</code></strong></p><p>Emotion label × association grid; cells can show average valence or entry counts.</p><p><strong>Extra arguments:</strong> <code>metric</code>, <code>labels</code>, <code>associations</code>.</p></td>
</tr>
<tr>
<td colspan="2"><h3>Medication visualizations</h3><p>These HTML components support historical schema v2 medication fields and the nested medication inventory, dose counts, and dose events in schema v7. The overview aliases are <code>medications</code> and <code>medication-adherence</code>.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/medication-overview.png"><img src="examples/images/visualizations/medication-overview.png" alt="medication-overview visualization" width="420"></a></td>
<td><p><strong><code>medication-overview</code></strong></p><p>Full medication dashboard with inventory totals, adherence summary, per-medication dose status, trend bars, and recent dose events.</p><p><strong>Extra arguments:</strong> <code>trend</code>, <code>limit</code>.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/medication-inventory.png"><img src="examples/images/visualizations/medication-inventory.png" alt="medication-inventory visualization" width="420"></a></td>
<td><p><strong><code>medication-inventory</code></strong></p><p>Standalone inventory totals with active, archived, scheduled, and unscheduled medication rows.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/medication-adherence-summary.png"><img src="examples/images/visualizations/medication-adherence-summary.png" alt="medication-adherence-summary visualization" width="420"></a></td>
<td><p><strong><code>medication-adherence-summary</code></strong></p><p>Taken, skipped, and other dose counts with a stacked adherence bar and adherence percentage.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/medication-dose-status.png"><img src="examples/images/visualizations/medication-dose-status.png" alt="medication-dose-status visualization" width="420"></a></td>
<td><p><strong><code>medication-dose-status</code></strong> (alias: <code>per-medication-dose-status</code>)</p><p>Per-medication adherence bars and dose counts for taken, skipped, and other statuses.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/medication-adherence-trend.png"><img src="examples/images/visualizations/medication-adherence-trend.png" alt="medication-adherence-trend visualization" width="420"></a></td>
<td><p><strong><code>medication-adherence-trend</code></strong> (alias: <code>medication-daily-adherence-trend</code>)</p><p>Daily, weekly, or monthly adherence trend bars grouped by dose status.</p><p><strong>Extra arguments:</strong> <code>trend</code>.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/medication-recent-dose-events.png"><img src="examples/images/visualizations/medication-recent-dose-events.png" alt="medication-recent-dose-events visualization" width="420"></a></td>
<td><p><strong><code>medication-recent-dose-events</code></strong> (alias: <code>medication-dose-events</code>)</p><p>Standalone table of the most recent medication dose events in the selected date range.</p><p><strong>Extra arguments:</strong> <code>limit</code>.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/walking-symmetry.png"><img src="examples/images/visualizations/walking-symmetry.png" alt="walking-symmetry visualization" width="420"></a></td>
<td><p><strong><code>walking-symmetry</code></strong></p><p>Walking speed and asymmetry / gait metrics.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/workout-log.png"><img src="examples/images/visualizations/workout-log.png" alt="workout-log visualization" width="420"></a></td>
<td><p><strong><code>workout-log</code></strong></p><p>Workout timeline with duration bars and workout-type colors.</p><p><strong>Extra arguments:</strong> none.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/workout-heart-rate.png"><img src="examples/images/visualizations/workout-heart-rate.png" alt="workout-heart-rate visualization" width="420"></a></td>
<td><p><strong><code>workout-heart-rate</code></strong></p><p>Heart-rate time series and optional zone bands for one workout. Falls back to detailed Health.md zone exports, daily samples in the workout window, then a min/avg/max summary chart.</p><p><strong>Extra arguments:</strong> <code>date</code>, <code>workout</code>, <code>maxHeartRate</code>.</p></td>
</tr>
<tr>
<td><a href="examples/images/visualizations/workout-map.png"><img src="examples/images/visualizations/workout-map.png" alt="workout-map visualization" width="420"></a></td>
<td><p><strong><code>workout-map</code></strong></p><p>GPS route map for one outdoor workout, colored by speed or heart rate.</p><p><strong>Extra arguments:</strong> <code>date</code>, <code>workout</code>, <code>colorBy</code>.</p></td>
</tr>
</table>

Detailed Health.md individual workout notes are discovered from `type: workout`, `metric: workouts`, or workout/healthmd tags. The plugin normalizes their frontmatter, heart-rate zones, laps, and splits for `workout-log`, `workout-heart-rate`, `workout-zones`, `workout-trends`, and the HTML `workout-intervals` table.

All canvas chart types support hover tooltips. Click behavior is configurable: keep the default click-to-pin tooltip behavior, open the source health data file for a point, or open the matching Daily Note. JSON and CSV source files open in a built-in Health.md read-only viewer inside Obsidian. Large lossless files show compact metadata and a bounded table preview instead of placing complete base64 or canonical JSON payloads in the DOM. Aggregate canvas regions that cover multiple dates, such as `weekday-average` bars, navigate to the latest matching date in the rendered range. The `intro-stats`, `summary-card`, `trend-tile`, `medication-overview`, individual `medication-*` section components, `workout-map`, and `workout-intervals` types are HTML/SVG/Leaflet renderers (no canvas tooltip layer) for sharper typography and interactive map rendering.

### Bundled examples

Starter dashboards live in the `examples/` folder — copy any of them into your vault to see the code blocks render:

- `examples/visualization-reference.md` — landing page for category-specific visualization references, shared arguments, the full type index, and copy/paste templates.
- `examples/apple-dashboard.md` — full Apple Health-style summary using the Apple-inspired visualizations (summary cards, activity rings, heart range, bar chart, sleep schedule, mood trend, weekday average, oxygen range, trend tiles).
- `examples/daily-dashboard.md` — single-day overview for daily notes.
- `examples/weekly-overview.md` — rolling week-at-a-glance across activity, heart, respiratory, sleep, mood, mobility, and workouts.
- `examples/sleep-analysis.md` — sleep-focused drill-down.

This repo also ships deterministic mock data in `examples/Health/` (one JSON file per day from 2025-11-19 through 2026-12-31) for the example dashboards. The generator now covers v7 body composition, nutrition, symptoms, reproductive summaries, hearing, running/cycling summaries, blood pressure, glucose, medication events, and VO₂ provenance in addition to the existing activity, heart, sleep, mood, and workout data. When the default `Health/` folder is empty or missing, the plugin falls back to the bundled dataset; run `npm run generate:mock-health` to refresh it with the latest schema coverage.

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
| `type` | string | *(required)* | Visualization type — see the gallery above. |
| `width` | number | from settings | Canvas width in pixels (chart shrinks to container width). |
| `height` | number | from settings | Canvas height in pixels. |
| `from` | date, datetime, dynamic variable, or frontmatter variable | — | Start of the data window (inclusive). |
| `to` | date, datetime, dynamic variable, or frontmatter variable | — | End of the data window (inclusive). |
| `last` | number | — | Number of calendar days back to include. |
| `clickAction` | `pin`, `source`, `daily` | from settings | Optional per-chart override for data point clicks: pin tooltip, open source data file, or open matching Daily Note. |

Individual visualization types may accept additional keys — start at `examples/visualization-reference.md` for links to every category-specific renderer argument, default, and accepted value.

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

### Dynamic date variables

`from`, `to`, and chart-specific `date` fields can use built-in variables. They are resolved by Health.md when the chart renders, so they do not depend on Templater or Dataview.

````markdown
```health-viz
type: workout-log
from: {{monday:YYYY-MM-DD}}
to: {{today:YYYY-MM-DD}}
```
````

The format is optional and defaults to `YYYY-MM-DD`:

````markdown
```health-viz
type: step-spiral
from: {{month-start}}
to: {{month-end}}
```
````

Supported variables include `today`, `now`, `yesterday`, `tomorrow`, weekdays (`monday` through `sunday`, using the current Monday-start week), `week-start`, `week-end`, `month-start`, `month-end`, `year-start`, and `year-end`. Underscore aliases such as `month_start` also work. Supported format tokens are `YYYY`, `YY`, `MM`, `M`, `DD`, `D`, `HH`, `H`, `mm`, `m`, `ss`, `s`, and `Z`.

> **Templater/Dataview note:** Do not put raw Templater (`<% ... %>`) or Dataview expressions inside a `health-viz` block. Obsidian code block processors run in their own lifecycle, so Health.md may see those expressions before another plugin replaces them. Use the built-in variables above, or write Templater output into note frontmatter and reference it with `${property-name}`.

### Frontmatter date variables

`from`, `to`, and chart-specific `date` fields can also reference top-level frontmatter properties from the current note using `{property-name}` or `${property-name}`. This is useful for weekly or monthly journal templates that should stay pinned to the journal's dates instead of moving with `last`.

````markdown
---
journal-start: 2026-06-01
journal-end: 2026-06-07
---

```health-viz
type: step-spiral
from: ${journal-start}
to: ${journal-end}
```
````

The frontmatter value must resolve to a supported date or datetime. Existing literal dates and `last` windows continue to work unchanged. If a variable is missing or resolves to an invalid value, the chart renders an inline error.

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
- `Unknown dynamic date variable "..."...`
- `Missing frontmatter variable "journal-start" for "from"...`
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

- `.json`: A `healthmd.health_data` daily object. Summary sections feed charts. A v1 `healthkit_record_archive`, when present, contributes only compact capture diagnostics and is otherwise skipped during parsing.
- `.csv`: Health.md row exports (`Date,Category,Metric,Value,Unit[,Timestamp]`). Parsing follows RFC 4180, including quoted JSON cells with commas, quotes, and embedded newlines. Canonical source-record rows are counted but not ingested as health metrics.
- `.md`: Markdown with Health.md YAML frontmatter, or metadata-free Markdown containing supported granular tables and an ISO date. Schema v7 capture fields and timezone context are retained when present. Human-readable prose is not guessed into canonical units.
- Obsidian Bases: YAML frontmatter using the same daily schema. The parser reads v7 `workout_details`, medication details, compact capture diagnostics, and canonical units.

Weekly, monthly, and yearly `healthmd.rollup_summary` files under `Health/Rollups/` are indexed separately and never treated as daily chart points.

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
