# Decision Log

This document records the architectural, data modeling, algorithmic, and API design decisions made during the Flaky Test Triage project (Steps 1–7D).

---

## DECISION-001: Inspect Dataset Before Implementation
* **Date**: 2026-09-08
* **Context**: Before writing database schemas or APIs, we performed an in-depth data profiling step on `data/ci_runs.jsonl`.
* **Decision**: Inspect the raw dataset thoroughly using standalone Node.js streaming scripts.
* **Rationale**:
  * Real-world CI logs contain anomalies: 5,377 missing durations, 158 negative durations, 1,085 duplicate-key candidates, and three distinct timestamp formats.
  * Auditing the dataset first prevented building assumptions on "clean" data and guided defensive ingestion logic.
* **Status**: Accepted.

---

## DECISION-002: Logical Execution Definition (`run_id + test_id`)
* **Date**: 2026-09-08
* **Context**: CI pipelines retry failing tests within the same run, creating multiple attempt records.
* **Decision**: Group all attempts sharing `(run_id, test_id)` into a single **Logical Execution**.
* **Rationale**:
  * If Attempt 1 (failed) and Attempt 2 (passed) were treated as two independent executions, the test's failure rate would be artificially halved, and the retry recovery would be lost.
  * Preserving attempts as an ordered sequence within the logical execution allows accurate retry-recovery detection.
* **Status**: Accepted.

---

## DECISION-003: Defensive Duplicate Candidate Handling
* **Date**: 2026-09-08
* **Context**: 1,085 records in `ci_runs.jsonl` share the composite key `(run_id, test_id, attempt)`.
* **Decision**: Do not blindly delete records based solely on the composite key. Store all raw attempt rows in `test_runs` with unique row IDs, and only deduplicate when records are verified to be exact duplicates across all fields.
* **Rationale**: Repeated composite keys in CI logs can represent distinct attempt events or log retries. Preserving raw evidence prevents unintentional data loss.
* **Status**: Accepted.

---

## DECISION-004: SQLite for Persistence
* **Date**: 2026-09-09
* **Context**: Selecting the database engine for storing 55,364 execution attempts and 121 test summaries.
* **Decision**: Use SQLite (`backend/data/flaky_test_triage.db`) with native Node.js support (`node:sqlite`).
* **Rationale**:
  * **Zero Setup**: Embedded, single-file database requiring no daemon or external server.
  * **Performance**: Sub-millisecond indexed queries over 55k rows.
  * **Simplicity**: Completely self-contained and interview-friendly.
* **Status**: Accepted.

---

## DECISION-005: Precomputed Summaries in `tests` Table
* **Date**: 2026-09-09
* **Context**: How to serve the ranked leaderboard efficiently.
* **Decision**: Maintain a precomputed `tests` summary table containing pre-calculated flakiness scores, rates, and classifications.
* **Rationale**:
  * The unfiltered `GET /api/tests` dashboard query performs an instantaneous $O(1)$ indexed table scan rather than aggregating 55,000 rows on every HTTP request.
* **Status**: Accepted.

---

## DECISION-006: Execution-Level Filtering from `test_runs`
* **Date**: 2026-09-09
* **Context**: Supporting optional filters (`branch`, `from`, `to`) on `GET /api/tests`.
* **Decision**: When execution-level filters (`branch` or date range) are provided, dynamically compute test metrics from the matching `test_runs` records while preserving complete logical executions.
* **Rationale**:
  * Branch and timestamp belong to individual executions. Filtering the precomputed summary table would return inaccurate static metrics.
  * Grouping attempts into logical executions *before* applying date boundaries prevents retry-recovery events from being severed across midnight/date thresholds.
* **Status**: Accepted.

---

## DECISION-007: Explicit UTC Timestamp Normalization
* **Date**: 2026-09-09
* **Context**: The dataset contains UTC timestamps ending in `Z`, timestamps with offsets (`+05:30`), and 7,411 suffix-less timestamps.
* **Decision**: Explicitly parse any suffix-less timestamp as **UTC** (appending `'Z'`), and convert query parameter bounds (`from`, `to`) to exact UTC epoch millisecond boundaries.
* **Rationale**: Eliminates reliance on the server host machine's local timezone, ensuring identical filtering results across any environment.
* **Status**: Accepted.

---

## DECISION-008: Simplification to 60/40 Flakiness Scoring Formula
* **Date**: 2026-09-09
* **Context**: We evaluated an initial 4-factor model ($40\% \text{ Recovery} + 25\% \text{ Fail} + 20\% \text{ Impact} + 15\% \text{ Confidence}$).
* **Decision**: Reject the 4-factor model in favor of $\text{Flakiness Score} = (0.60 \times \text{Recovery Rate} + 0.40 \times \text{Failure Rate}) \times 100$.
* **Rationale**:
  * Execution Impact and Evidence Confidence normalized to ~1.0 for almost all tests, creating an artificial $+35$ point floor that caused stable tests to outrank genuine flakes.
  * The simplified 60/40 formula gives primary weight (60%) to non-deterministic recovery while capturing CI disruption (40%), and restores migrated tests (`test_checkout_flow` v1 and v2) to the top tier.
* **Status**: Accepted.

---

## DECISION-009: Explicit Separation of "Likely Broken" vs. "Likely Flaky" Tests
* **Date**: 2026-09-09
* **Context**: `tests/payments/test_payments_idempotency` has a 46.09% failure rate but **0 retry recoveries**.
* **Decision**: Categorize tests with high failure rates and zero recoveries as **"Likely Broken"** rather than "Likely Flaky".
* **Rationale**: Persistently failing tests represent genuine software regressions or broken test fixtures. Separating them prevents triage engineers from misdiagnosing persistent bugs as intermittent flakes.
* **Status**: Accepted.

---

## DECISION-010: REST API Design & Query Parameter for `test_id`
* **Date**: 2026-09-09
* **Context**: Designing `GET /api/tests` and `GET /api/tests/detail`.
* **Decision**:
  * `GET /api/tests`: Returns ranked list and accepts query filters (`branch`, `from`, `to`, `classification`).
  * `GET /api/tests/detail?test_id=...`: Returns summary metrics and execution history.
* **Rationale**:
  * Test IDs contain slashes (e.g. `tests/auth/test_oauth_callback_timeout`). Using a query parameter (`?test_id=...`) avoids URL routing conflicts in Express without needing URL encoding hacks or wildcard route regexes.
* **Status**: Accepted.

---

## DECISION-011: Independent Postman & Script Validation
* **Date**: 2026-09-09
* **Context**: Verifying database and API correctness.
* **Decision**: Validate database queries (`validate_db.js`) and API HTTP endpoints using dedicated automated test scripts and Postman test collections.
* **Rationale**: Decouples API verification from internal implementation and provides proof of correct HTTP status codes, error payloads, and data formatting.
* **Status**: Accepted.
