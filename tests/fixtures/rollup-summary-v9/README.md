# Health.md roll-up summary v9 fixtures

These synthetic fixtures are pinned, byte-for-byte copies of Health.md's public `healthmd.rollup_summary` v9 contract fixtures. They contain no user health data.

Upstream provenance:

- Repository: `https://github.com/CodyBontecou/health-md.git`
- Commit: `c9df9bd04fd3ac406faf3037c458a5d94eb59ecd`
- Path: `packages/contracts/rollup-summary/v9/fixtures/`

SHA-256 checksums:

```text
7e33a665d18f0b671dea1548e7e11d5c03d420ae0ad308857754256a378eee78  range-v9-bases.md
05a49bae67ef5e5eccec43262ce556d23fc57ecc91a5cc04f3940bb54da27809  range-v9.csv
8efdbb90936085add36db515a9f1a66c1bf611941fc8ab5d3ef022b6dc499438  range-v9.json
0ff95a7c634f63f79e5e82f1652202ac159bf8fe158a7494a27daef68a06af31  range-v9.md
```

V9 uses `rollup_period: range`; historical weekly, monthly, and yearly artifacts remain on roll-up schema v8 and are covered separately by compatibility tests.
