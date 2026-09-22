# Architecture & Design Decision Log

This log records the key engineering decisions made during the design and implementation of the Flaky Test Triage project.

---

### Decision 1: Inspect Dataset Before Building
Before writing schemas or APIs, we profiled `data/ci_runs.jsonl` using standalone scripts. This revealed data quality realities—such as 5,377 missing durations, 158 negative durations, and three timestamp formats—ensuring our ingestion and database logic were built defensively from day one.

---

### Decision 2: Treat `run_id + test_id` as One Logical Execution
CI retries of failing tests create multiple attempt records within the same run. We grouped all attempts sharing `(run_id, test_id)` into a single logical execution, preserving retries as retry evidence rather than inflating overall test counts.

---

### Decision 3: Preserve Raw Attempts and Handle Duplicate Candidates Conservatively
Rather than aggressively deleting the 1,085 duplicate composite keys `(run_id, test_id, attempt)` during ingestion, we preserved all raw rows in `test_runs` with unique IDs and only skipped exact full-row duplicates, maintaining a complete audit trail.

---

### Decision 4: Choose SQLite for Persistence
We selected embedded SQLite (`node:sqlite`) instead of an external database like PostgreSQL or MongoDB. For a 55,000-record dataset and an internal tool, SQLite provides sub-millisecond query performance with zero setup overhead.

---

### Decision 5: Precomputed Summaries with Dynamic Filter Recalculation
We store precomputed test metrics in a `tests` table to provide instant $O(1)$ reads for the default dashboard, while dynamically re-aggregating raw `test_runs` when execution-level filters (`branch`, `from`, `to`) are applied.

---

### Decision 6: Normalize Timestamps to UTC
The dataset contained UTC timestamps ending in `Z`, explicit timezone offsets (`+05:30`), and 7,411 suffix-less timestamps. We explicitly treat suffix-less timestamps as UTC, preventing timezone shifts across different host machines.

---

### Decision 7: Simplify the Scoring Model to 60/40
We rejected a complex 4-factor scoring model after empirical validation showed its secondary factors flattened rankings. We simplified the formula to `60% Retry Recovery Rate + 40% Failure/Error Rate`, ensuring high explainability.

---

### Decision 8: Separate "Likely Broken" from "Likely Flaky"
Tests with high failure rates but zero retry recoveries (such as `test_payments_idempotency` at 34% failure rate) were categorized as "Likely Broken" rather than flaky, helping engineers immediately distinguish persistent bugs from intermittent non-determinism.

---

### Decision 9: Exclude Skipped Executions from Rate Denominators
CI skips tests for reasons unrelated to reliability (tags, shard assignment, conditional suites). Counting a skipped execution in the denominator treats "did not run" as evidence of stability, which systematically deflated the `admin` suite — skipped in up to 38% of its executions. We now divide by executed executions only, while retaining `total_executions` for auditing. This moved `test_bulk_export` from rank #9 to #4 and left the 101 tests with no skips completely unchanged.
