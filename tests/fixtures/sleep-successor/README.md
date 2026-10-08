# Native sleep successor fixtures

These are unedited public artifact bytes from Health.md producer commit `7c312e6be0322d58f21b784403ea8b98c8e0d8cb`. All data is synthetic. The provenance manifest records source and SHA-256 for each file.

Android captures a synthetic Health Connect record through `HealthConnectManager`, then the real Kotlin planner and explicitly built host Rust library. The overnight interval crosses the America/New_York DST fold. Summary output retains Light rather than Core, source instants retain nanoseconds, and the owner date is the full session's end date.

Apple uses synthetic `HealthData` with Foundation source instants through `AppleLooseDailyExportPlanner` and the packaged Rust library. The whole interval crosses the same DST fold and ends after noon. Core remains native Core. Apple does not fabricate nanoseconds beyond Foundation Date precision.

To regenerate from the producer checkout:

- Build the task-owned host Rust library using the producer core workspace.
- Set `HEALTHMD_HOST_CORE_LIBRARY` to that built library and `HEALTHMD_WAKE_DATE_CONSUMER_FIXTURE_DIR` to an empty task-owned directory. Run Android `:app:testPlayDebugUnitTest --tests '*HostCoreDailyAggregatePlannerTest'`.
- Set `TEST_RUNNER_HEALTHMD_WAKE_DATE_CONSUMER_FIXTURE_DIR` to that directory and run `xcodebuild test -project HealthMd.xcodeproj -scheme HealthMd-Tests-macOS -destination 'platform=macOS' -only-testing:HealthMdTests/AppleWakeDateExportPlannerTests -collect-test-diagnostics never CODE_SIGNING_ALLOWED=NO` from apps/apple.
- Copy the resulting daily files verbatim into the matching fixture directories and review producer behavior before regenerating the provenance digests.

The regression imports the production consumer parsers. A digest check prevents accidental fixture drift. These fixtures qualify summary daily exports; they do not prove granular/native stage, API, rollup, automation, or real Obsidian installation coverage.
