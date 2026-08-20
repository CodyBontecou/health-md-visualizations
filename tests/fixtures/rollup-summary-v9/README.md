# Health.md roll-up summary v9 fixtures

These synthetic fixtures are pinned, byte-for-byte copies of Health.md's public `healthmd.rollup_summary` v9 contract fixtures. They contain no user health data.

Upstream provenance:

- Repository: `https://github.com/CodyBontecou/health-md.git`
- Commit: `f7eca2d44bb80110aa00a91efebe45dfc60cd689`
- Path: `packages/contracts/rollup-summary/v9/fixtures/`

SHA-256 checksums:

```text
7e33a665d18f0b671dea1548e7e11d5c03d420ae0ad308857754256a378eee78  range-v9-bases.md
05a49bae67ef5e5eccec43262ce556d23fc57ecc91a5cc04f3940bb54da27809  range-v9.csv
70ad121e1bd5cb1de03415792eed863e2060c5e20b266a67b4ef8d5edd7f40f3  range-v9.json
0ff95a7c634f63f79e5e82f1652202ac159bf8fe158a7494a27daef68a06af31  range-v9.md
```

V9 uses `rollup_period: range`; historical weekly, monthly, and yearly artifacts remain on roll-up schema v8 and are covered separately by compatibility tests.
