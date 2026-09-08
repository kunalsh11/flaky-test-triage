# Decision Log

This document records the architectural, data modeling, and algorithmic decisions made during the Flaky Test Triage project.

---

## DECISION-001: Logical Execution Definition (`run_id + test_id`)
* **Date**: 2026-09-08
* **Context**: The `ci_runs.jsonl` dataset contains 55,364 attempt records across 447 CI pipeline runs. CI retries are emitted as separate lines with `attempt: 2`.
* **Decision**: Group all attempt records sharing the same `(run_id, test_id)` into a single **Logical Execution**.
* **Rationale**:
  * If Attempt 1 and Attempt 2 were treated as independent executions, a test retried in CI would be counted as two executions, artificially lowering its perceived failure rate and masking retry behavior.
  * Preserving retry attempts as an ordered sequence within the logical execution allows computing retry-recovery transitions accurately.
* **Status**: Accepted.

---

## DECISION-002: Deduplication of Candidate Records
* **Date**: 2026-09-08
* **Context**: 1,085 records in `ci_runs.jsonl` contain identical `(run_id, test_id, attempt)` composite keys.
* **Decision**: Deduplicate records by composite key `(run_id, test_id, attempt)` during the initial stream processing.
* **Rationale**: Prevents duplicate log flushes or network retries from inflating execution or failure statistics.
* **Status**: Accepted.

---

## DECISION-003: Definition of Retry-Recovery Event
* **Date**: 2026-09-08
* **Context**: Need an objective, mathematical definition for test flakiness.
* **Decision**: Define a **Retry-Recovery Event** as any logical execution where `attempt 1` has status `failed` or `error` and a subsequent attempt (`attempt > 1`) has status `passed`.
* **Rationale**:
  * In modern CI, retries happen on the identical commit, codebase, and environment. A test failing and then passing without any code change is direct proof of non-deterministic (flaky) behavior.
  * In the dataset, 592 out of 652 retried executions (~90.8%) recovered, validating retry-recovery as the primary flakiness signal.
* **Status**: Accepted.

---

## DECISION-004: Explicit Separation of "Flaky" vs. "Likely Broken" Tests
* **Date**: 2026-09-09
* **Context**: `tests/payments/test_payments_idempotency` had the highest failure count in the dataset (192 failures, 46.1% failure rate) but **0 retry recoveries**.
* **Decision**: Do not classify persistently failing tests as "flaky". Classify tests with high failure rates and zero recoveries as **"Likely Broken"**.
* **Rationale**:
  * Flaky tests are non-deterministic and pass on retry.
  * Persistently failing tests represent genuine software regressions or broken test fixtures. Mixing them confuses triage engineers and misguides remediation efforts.
* **Status**: Accepted.

---

## DECISION-005: Rejection of Initial 4-Factor Additive Scoring Model
* **Date**: 2026-09-09
* **Context**: We evaluated a formula: $40\% \text{ Recovery Rate} + 25\% \text{ Fail Rate} + 20\% \text{ Impact} + 15\% \text{ Confidence}$.
* **Decision**: Reject this model.
* **Rationale**:
  1. **Additive Baseline Distortion**: Standard tests running in all 447 runs received $+35$ base points purely for running, causing non-flaky tests with 0 recoveries to outrank actual flaky tests.
  2. **Test Migration Penalization**: `test_checkout_flow` (v1) and `test_checkout_flow_v2` (v2) ran ~200 times each because of a mid-month migration. Their lower volume lowered their Impact score, incorrectly burying them at ranks #120 and #121 despite ~11% flake rates.
  3. **Misranking Broken Tests**: The broken test `test_payments_idempotency` ranked #4 flaky due to failure rate and volume points.
* **Status**: Rejected & Replaced.

---

## DECISION-006: Adoption of Simplified 60/40 Flakiness Score & Classification Badges
* **Date**: 2026-09-09
* **Context**: Need a transparent, explainable ranking metric tailored to the triage task.
* **Decision**:
  * **Formula**: $\text{Flakiness Score} = (0.60 \times \text{Retry Recovery Rate} + 0.40 \times \text{Failure/Error Rate}) \times 100$
  * **Classification Rules**:
    * **Likely Broken**: $\text{Recoveries} = 0 \text{ AND } \text{Failure Rate} \ge 10\%$
    * **Likely Flaky**: $\text{Recovery Rate} \ge 5\%$
    * **Possible Flake**: $\text{Recoveries} > 0 \text{ AND } \text{Recovery Rate} < 5\%$
    * **Stable**: All others
* **Rationale**:
  * Gives 60% priority to non-deterministic recovery while accounting for CI failure impact (40%).
  * Eliminates artificial score floors.
  * Restores migrated tests (`test_checkout_flow` v1 & v2) to ranks #5 and #7.
  * Easy to explain to engineers and stakeholders during triage meetings.
* **Status**: Accepted.

---

## DECISION-007: Explainable Heuristics Over Machine Learning
* **Date**: 2026-09-09
* **Context**: Whether to use complex statistical models, clustering, or machine learning for triage ranking.
* **Decision**: Use deterministic, arithmetic formulas with explicit classification rules.
* **Rationale**:
  * Flaky test triage requires transparent reasoning: developers must know *why* a test is flagged (e.g., "109 retries passed on attempt 2").
  * Black-box ML models reduce trust, require extensive training pipelines, and add unnecessary complexity for a deterministic CI dataset.
* **Status**: Accepted.

---

## DECISION-008: SQLite Database Storage & Schema Architecture
* **Date**: 2026-09-09
* **Context**: Need a fast, persistent, self-contained relational storage solution for 55,364 test runs and 121 test summaries.
* **Decision**: Use SQLite with two core tables:
  1. `tests`: Aggregated test-level metrics (`test_id`, `flakiness_score`, `retry_recovery_rate`, `failure_error_rate`, `total_executions`, `retry_recoveries`, `classification`, `triage_status`, `updated_at`).
  2. `test_runs`: Raw attempt-level execution history (`id`, `run_id`, `test_id`, `commit_sha`, `branch`, `worker`, `attempt`, `status`, `duration_ms`, `started_at`, `message`).
* **Rationale**:
  * **Zero Setup**: Embedded, single-file database (`flaky_test_triage.db`) requiring no external database servers or daemon processes.
  * **Separation of Concerns**: `test_runs` retains the complete audit trail and raw attempt evidence, while `tests` provides instant $O(1)$ indexed reads for triage ranking.
  * **Performance**: Indexing on `test_runs(test_id)` and `test_runs(run_id)` provides sub-millisecond retrieval for single-test historical deep-dives.
* **Status**: Accepted.

---

## DECISION-009: Ingestion Data Quality & Duplicate Handling
* **Date**: 2026-09-09
* **Context**: Raw dataset contains negative durations, null durations, and 1,085 duplicate composite keys.
* **Decision**:
  * Every raw line is assigned an autoincrementing integer `id` in `test_runs` so all 55,364 records are preserved without collision.
  * Negative durations are sanitized to `null` on insertion.
  * During summary calculation, candidate duplicate records sharing `(run_id, test_id, attempt)` are deduplicated to ensure logical metrics precisely match verified dataset counts.
* **Status**: Accepted.
