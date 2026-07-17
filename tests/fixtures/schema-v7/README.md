# Health.md schema v7 fixtures

These synthetic fixtures are pinned copies of Health.md's generated public export reference. They contain no user health data.

Source repository: `health-md/app`

- Daily fixtures: `docs/reference/generated/core/lossless-day.*`
- Roll-up fixtures: `docs/reference/generated/rollups/weekly.*`
- Daily schema: `healthmd.health_data` v7
- Source-record archive: `healthmd.healthkit_records` v1

Update these fixtures only when the plugin intentionally adopts a newer public Health.md contract. Keep historical parser tests for older schema versions.
