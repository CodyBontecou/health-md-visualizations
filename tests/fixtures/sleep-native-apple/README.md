# Native Apple wake-date sleep details

These eight files are unedited output from the concrete Apple-v11 planner at the producer revision recorded in `provenance.json`. All source data is synthetic. The fixture records a New York DST fold and a session extending past local noon. `selected-stages` selects Total, Core, In Bed, Bedtime and Wake Time; `total-only` selects only Total Sleep, retaining unspecified intervals while excluding Core and In Bed.

JSON, CSV and Bases retain complete native stage objects. Markdown is a timing table and carries no fabricated source metadata. Apple has no Health Connect parent-session objects and Core is distinct from Android Light.

To capture again, run the named producer test with `TEST_RUNNER_HEALTHMD_WAKE_DATE_CONSUMER_FIXTURE_DIR` set to an output directory through `xcodebuild test`. Copy the resulting `apple-v11-concrete-stages/Health` and `apple-v11-concrete-total/Health` artifacts verbatim into the matching directories, review any producer changes, and record the exact source revision and byte digests. These are historical producer fixtures; advancing the plugin pin does not require updating them.
