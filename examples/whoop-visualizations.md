# WHOOP visualizations

These views read the reviewed `healthmd.provider.whoop_daily` v1 section in Apple daily v8 exports, or its provider-prefixed CSV / Markdown / Bases projections. Keep daily files under the configured Health data folder. The charts appear in the **WHOOP** category of the insertion wizard and generated Health Dashboard.

WHOOP stays separate from Apple Health and Health Connect metrics. Recovery HRV is RMSSD, not Apple's SDNN; cycle/workout strain is not additive. These views do not parse provider-native sidecars, Android Raw API Snapshots, or range roll-ups.

## Recovery versus cycle strain

```health-viz
type: whoop-recovery-strain
limit: 2000
last: 30
height: 280
```

A scatterplot of 0–100% recovery versus 0–21 strain, joined by the **same cycle ID**. This is an association, not a claim that the plotted strain caused that recovery or a training recommendation. Unpaired/unscored recoveries are counted but not plotted. `limit` selects the latest pairs, capped at 10000. JSON and structured CSV retain identity; Markdown/Bases can show a single-record scalar projection, explicitly labelled as lacking cycle identity.

## Sleep achieved versus sleep need

```health-viz
type: whoop-sleep-need
sleep: all
limit: 30
last: 30
height: 300
```

Each session gets a need stack and an achieved-sleep bar. Need has baseline, sleep-debt and recent-strain components. The recent-nap adjustment retains its **negative or zero** value and subtracts downward from the positive stack. A horizontal marker shows the display-only component sum when all four components are available; it is not another inferred WHOOP score. Tooltips preserve the exact signed millisecond values.

Full components require JSON or structured CSV. Incomplete stacks show only available positive components and no net-need marker; missing components are not filled with zero. Achieved sleep is light + slow-wave + REM duration. No stage transition timeline is invented.

`sleep` accepts `all`, `main` (explicitly non-nap), or `naps` (explicitly nap). `limit` selects the latest sessions, capped at 365. Multiple sessions on one owner day remain separate, rather than being added to one daily total.

## Sleep assessment trends

```health-viz
type: whoop-sleep-trends
sleep: all
limit: 180
last: 60
height: 260
```

Performance, consistency and efficiency are provider-reported percentages on 0–100, not ratios calculated by the plugin. Missing/unscored values and calendar gaps break lines; reported zero remains zero. Points are ordered by owner day and session start, with one point per session, not daily averages.

JSON/CSV retain naps and repeated sessions. Markdown/Bases support only single-session scalar projections. Since those lack nap identity, they appear with `sleep: all` only. `limit` is capped at 2000 sessions.

## Workout strain and zones

```health-viz
type: whoop-workout-strain
limit: 12
last: 30
height: 360
```

Each workout shows its strain on 0–21 and a stacked distribution of **WHOOP zones 0–5**. Zone widths are shares of available reported zone time, not percentages of elapsed workout duration. Tooltips show original durations, how many zones were reported, actual elapsed time from start/end, and `percent_recorded`. Missing zones are not zero; explicit all-zero zone time is labelled separately from absent zone data.

WHOOP zone definitions are not replaced with Apple's sample-derived zone boundaries. Markdown/Bases can show scalar workout strain but have no zone durations. `limit` selects the latest workouts, capped at 50. Optional `date: YYYY-MM-DD` selects an owner day. Canvas height expands to fit the rows.

## Capture and date semantics

- Partial captures keep successful resources and visibly report incomplete capture. Successful-empty, not-requested, unscored and missing data are distinct.
- Use `last` or date-only `from` / `to` boundaries. WHOOP uses daily **owner-day** filtering; records are not clipped or reassigned based on fetch time or a datetime boundary.
- Fetch time is not a health measurement timestamp. Body profile snapshots are not plotted as historical measurements.
- Unknown WHOOP nested schema versions are retained in the original JSON namespace, but are not interpreted as v1 chart data.
- When several export formats describe the same day, typed JSON beats structured CSV, which beats flat projections. Different captures are never unioned to manufacture a complete provider day. At equal fidelity, an explicit not-requested capture conservatively suppresses duplicate values because it has no fetch timestamp to establish freshness.

For development, the synthetic production-export fixtures in `tests/fixtures/schema-v8/provider-day.json` and `provider-day.csv` exercise all four charts. The test suite also covers naps, repeated events, partial/empty capture, zeros, missing values and narrow/light/dark rendering. No sample data is inserted into a user's vault.
