# Sleep attribution reader compatibility

These changes prepare the plugin for Health.md issue #104. They do not release the plugin or enable Morning ends in the producer apps.

| Daily profile | Ownership | Native stage identity |
| --- | --- | --- |
| Apple historical exports, including WHOOP daily v10 | Existing Night begins contract | Core |
| Android historical v4/v5 | Existing Night begins contract and historical aliases | Historical mappings retained |
| `apple-v11` / daily 11 | Morning ends, whole sessions on their end date | Core |
| `android-sleep-v6` / daily 6 | Morning ends, whole sessions on their end date | Light; Core is unavailable |

JSON, CSV, Markdown and Bases retain the successor profile and its complete calendar/timestamp timezone, attribution, owner rule and clipping metadata. Partial, conflicting, invalid-clock and retired v10 Morning ends authority is rejected. Canonical and camelCase aliases must agree. Metadata-off Markdown recognizes the exact visible declaration emitted by the successor renderer, rather than treating it as an unversioned Night begins note.

CSV bedtime/wake source instants retain their original strings, including nanoseconds. Human clock labels remain separate from source instants. Native Light quantities and stages remain Light through normalized data, canonical metrics and chart labels. Sharing a chart color does not turn Light into Core.

Mixed versions on different dates are supported. Conflicting attribution, successor profiles or successor clocks on the same date cause that date to be omitted with a loader warning, independent of file enumeration order. Compatible duplicate formats retain the existing merge behavior.

Summary-only records can omit stages and unrecorded statistics. Aggregate charts can display recorded Light totals; timeline/polar charts do not invent stage timing for successor records. They require recorded stages and report unavailable timing when those are absent. Historical approximation behavior remains unchanged.

## Qualification

- `TZ=UTC npm test`: parser, mixed-vault and actual production-renderer controls, plus immutable historical/WHOOP fixtures.
- `npm run typecheck`
- `npx eslint src`
- `npm run build` regenerates `main.js` through its owner.

The existing mock-data generator's date-range filename test depends on UTC (it fails under Europe/Lisbon on the unchanged baseline); successor parser/renderer tests also run under Europe/Lisbon. Literal tests are reader controls. Verbatim synthetic native-producer fixtures cover all four summary daily formats on both platforms across DST; their source and byte digests are recorded in `tests/fixtures/sleep-successor/provenance.json`. Website pin updates, successor roll-up v11 support, product release and installation in a real Obsidian vault remain separate qualification work.

## Native sleep details

Successor CSV `Sleep Detail` rows read the complete native stage/session JSON objects; Bases reads the corresponding `sleep_stage_details` and Android-only `sleep_session_details` JSON flow maps. Exact clocks, fractional stage durations, supplied or absent original offsets, metadata and identities survive without conversion to display clocks. Markdown's `Sleep Stage Details` and `Sleep Session Details` UTC tables retain their original timestamp strings; table-derived durations use nanosecond interval arithmetic. Markdown tables contain timing only and cannot supply absent metadata or source identities. Apple Core stays distinct from Android Light, and Android parent records are not admitted as Apple native parents.

Malformed native arrays, invalid calendar dates, reversed intervals and conflicting CSV start timestamps reject rather than silently dropping details. Historical detail parsing remains unchanged. Duplicate-format loading retains the complete native array when the display-only array describes the same intervals; it does not invent fields or combine unrelated sessions.

Verbatim four-format parent/stage fixtures come from producer revision `868018383e04fc37b5e7e52d9ec85fd5f3a96ad6`; `tests/fixtures/sleep-native-parents/provenance.json` records their byte digests. Synthetic Health Connect SDK-boundary input spans the New York DST fold/local noon and a separate nap. Real native/host Rust writers produced the fixtures. This qualifies reader preparation and mock-vault loading, not installation in a real vault, physical-provider execution or production enablement.
