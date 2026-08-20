# Health.md daily schema v8 fixtures

These synthetic fixtures are pinned, byte-for-byte copies of Health.md's generated public Apple provider-day reference. They contain no user health data.

Source repository: `CodyBontecou/health-md`

Source paths: `apps/apple/docs/reference/generated/core/provider-day.*`

Source revision when copied: `695f6c3a9414aad5d179e59c4ad50e7ce23bdd74`

- Daily schema: `healthmd.health_data` v8
- Provider section: `providers.whoop` schema v1 in JSON; canonical flattened WHOOP fields in CSV, Markdown, and Bases
- Source-record archive: not requested

SHA-256 checksums:

```text
da3e5520aa73c2a12623957354596505a241ed861a5a2b2b17049a30705da559  provider-day-bases.md
4de16a7b0d40729ebe83fc2ca8ba3fd9fe8c35e045b9d84acde111547758abe9  provider-day.csv
067736bf621aa3620aa99f39442526d99752f6da25325a72939937c8fc96bb41  provider-day.json
81ffc3ef864489c072172b9a7ce8e409174e116fda5fbfc46d36128e52496f91  provider-day.md
```

Schema v7 fixtures remain frozen under `tests/fixtures/schema-v7` for historical compatibility coverage.
