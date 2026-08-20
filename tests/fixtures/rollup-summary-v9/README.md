# Health.md roll-up summary v9 fixtures

These synthetic fixtures are pinned, byte-for-byte copies of Health.md's public `healthmd.rollup_summary` v9 contract fixtures. They contain no user health data.

Upstream provenance:

- Repository: `https://github.com/CodyBontecou/health-md.git`
- Commit: `6cd6aa935327ecf111b300bf845d8a8a112e8b48`
- Path: `packages/contracts/rollup-summary/v9/fixtures/`

SHA-256 checksums:

```text
8c09db1a0af44294ef051476f2ac727ed42ae66e7c51b693d5dfdaa4d9e136ec  range-v9-bases.md
6e72ba48289c5302a44636427d3d9747fe9297eb86b482d544411b2167208eb7  range-v9.csv
3dbf93498ee3ecd1dafde2408c40ebb66c01d42b6107973c48176893c6668b2b  range-v9.json
1c9307fd17cd84bb3d99b6062a2de40718572a07ae891fb69c28b1eee14fe2a4  range-v9.md
```

V9 uses `rollup_period: range` and requires the requested range's `calendar_timezone`; historical weekly, monthly, and yearly artifacts remain on roll-up schema v8 and are covered separately by compatibility tests.
