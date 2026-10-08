# Morning ends range fixtures

`range-v11.*` are real shared Rust semantic/render artifacts from the Health.md `sleep_range_summary` integration test. They are synthetic core controls, not native exporter goldens.

`native-apple-v11.*` are byte-for-byte outputs from `AppleWakeDateExportPlannerTests.testWakeDateRangeSummaryPreservesFailedBoundsAndSuccessfulEmptyDay`: synthetic native SleepData enters the real Swift planner, native JSON preparation and packaged Rust renderer. Identity and generation time are fixed by the test. No physical provider or production export route was exercised.

Both sets retain the requested October 31 through November 3 range in America/New_York. November 1 contains an 8.25-hour whole session; November 2 is successfully captured empty. Failed requested bounds remain in the denominator: 4 expected days, 2 counted, 50% coverage. The native set also retains 4.25 hours of Apple Core, with no fabricated Android Light alias.

All four formats declare the independent apple-rollup-v11 profile, apple-v11 source and atomic Morning ends authority. JSON and Markdown/Bases retain explicit source dates. CSV carries counts and coverage without an explicit source-date list; readers must not invent one.

Artifacts must be regenerated through their producer test with HEALTHMD_WAKE_DATE_RANGE_FIXTURE_DIR set, copied verbatim and reviewed with provenance hashes. Historical v8/v9 fixtures remain unchanged.
