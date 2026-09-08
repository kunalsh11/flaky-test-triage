# Flaky Test Triage

## Problem Statement
In modern continuous integration (CI) pipelines, flaky tests—tests that exhibit both passing and failing results on the exact same commit without code changes—create severe developer friction. They cause false-alarm build failures, waste compute resources on unnecessary rebuilds, and erode engineering trust in the CI test suite.

The goal of this internal engineering tool is to help an engineer systematically triage CI test runs and decide **which flaky test should be investigated and fixed first**, rather than naively ranking tests by raw failure counts.

---

## Dataset
The project analyzes the CI execution dataset located at `data/ci_runs.jsonl`. Exploration revealed the following concrete statistics:

* **Format**: JSON Lines (`.jsonl`), with each line representing an attempt of a test execution.
* **Total Records**: 55,364 records.
* **Unique Test IDs (`test_id`)**: 121 distinct test cases.
* **Unique CI Runs (`run_id`)**: 447 CI pipeline runs.
* **Unique Branches**: 18 branches (including `main` and 17 feature branches like `feature/PLAT-101` to `feature/PLAT-117`).
* **Unique CI Workers**: 10 runners (`runner-01` through `runner-10`).
* **Observation Period**: 30 days (July 1, 2026 to July 31, 2026).
* **Execution Statuses**:
  * `passed`: 49,397 records (89.2%)
  * `failed`: 1,105 records (2.0%)
  * `error`: 1,610 records (2.9%)
  * `skipped`: 3,252 records (5.9%)
* **Attempt Tracking**: Test retries are tracked via the `attempt` integer field (`1` or `2`).

---

## Data Quality Findings
Exploratory analysis on the dataset surfaced several real-world, production-like data quality anomalies that the downstream pipeline and ingestion logic must handle:

1. **Missing `duration_ms`**: 5,377 records (~9.7% of rows) have `null` or missing duration values.
2. **Negative `duration_ms`**: 158 records have negative execution durations (e.g., `-250ms`), likely caused by worker clock drift or timing calculation bugs.
3. **Duplicate-Key Candidates**: 1,085 records share the identical composite key `(run_id, test_id, attempt)`. These are duplicate-key candidates emitted during network retries or logging flushes and must be deduplicated prior to aggregation.
4. **Mixed Timestamp Formats / Timezones**:
   * 33,597 timestamps use UTC standard format with a `Z` suffix (e.g., `2026-07-01T06:25:27.000Z`).
   * 14,356 timestamps use an explicit offset suffix (e.g., `+05:30`).
   * 7,411 timestamps have **no timezone suffix** at all (e.g., `2026-07-29T15:14:55.000`), requiring explicit UTC parsing to prevent host machine timezone shifting.

---

## Logical Execution Definition
A foundational architectural decision in this analysis is the definition of a **Logical Execution**:

$$\text{Logical Execution} = \text{run\_id} + \text{test\_id}$$

* Multiple attempts within the same CI run (e.g., `attempt: 1` followed by `attempt: 2`) belong to the **same logical test execution**.
* Counting attempt 1 and attempt 2 as independent test executions would artificially inflate total execution counts and distort failure rates.
* Deduplicating duplicate keys and grouping by `run_id + test_id` yields **53,635 unique logical executions** across the 447 CI runs.

---

## Retry Recovery
A **Retry-Recovery Event** occurs when:
1. `attempt: 1` results in `failed` or `error`.
2. A subsequent attempt (`attempt: 2`) on the same `run_id` + `test_id` results in `passed`.

### Dataset Findings:
* **652 records** in the dataset have `attempt > 1`.
* **592 retry-recovery events** were identified across all tests.
* **~90.8% of all retries recovered to pass**, demonstrating that retry-recovery is the single strongest empirical signal of non-deterministic (flaky) behavior in this CI suite.

---

## Flakiness Analysis
For each of the 121 unique tests, the analysis calculated:
* Total logical executions
* Total passes, failures, errors, and skips
* Failure/Error rate: $\frac{\text{Failures} + \text{Errors}}{\text{Total Logical Executions}}$
* Total retry-recovery count and Retry-Recovery rate: $\frac{\text{Retry Recoveries}}{\text{Total Logical Executions}}$
* Executions with retries and unrecovered failures
* Average duration (calculated over valid positive `duration_ms` records)

### Behavioral Categories:
1. **Flaky Tests**: Tests that alternate between pass and fail on the same commit/run, frequently recovering on retry.
2. **Consistently Broken Tests**: Tests that fail repeatedly without recovering on retry.
   * *Example*: `tests/payments/test_payments_idempotency` had 192 failures and 52 retries, but **0 retry recoveries** (46.09% failure rate). Retrying never fixed it; it is a persistently broken regression, not a flake.
3. **Stable Tests**: Tests with consistent passes, high execution volume, and 0 retry recoveries.

---

## Pattern Analysis
Retry recoveries were analyzed across environmental dimensions:
* **By Branch**: 39.0% of all recoveries occurred on `main` (231 recoveries), proportional to `main` receiving the highest CI volume, with the remaining recoveries distributed across 17 feature branches.
* **By Worker**: Recoveries occurred across all 10 runners (`runner-01` through `runner-10`).
* **By Date**: Recoveries were steady across all 30 days of July 2026.

### Specific Observations:
* **Broad Environmental Spread**: Top flaky tests (`test_oauth_callback_timeout`, `test_session_refresh_race`, `test_email_batch_send`) exhibited flakiness across all 10 runners, nearly all branches, and throughout the month.
* **Worker Concentration**: For `tests/payments/test_webhook_signature`, all **45 of its 45 retry recoveries occurred on `runner-07`**. *(Note: This is an observed concentration pattern in the dataset for engineers to investigate worker environment differences, not a causal claim).*

---

## Flakiness Score

### Initial Model (Rejected)
We evaluated a 4-factor linear model:
$$\text{Score} = 40\% \times \text{Recovery Rate} + 25\% \times \text{Failure Rate} + 20\% \times \text{Execution Impact} + 15\% \times \text{Evidence Confidence}$$

**Why it was rejected**:
1. **Additive Base Inflation**: Tests running across all 447 runs received $+35$ base points purely for running, causing completely stable tests to outrank actual flaky tests.
2. **Penalization of Test Migrations**: `test_checkout_flow` (v1) and `test_checkout_flow_v2` (v2) ran ~200 times each due to a mid-month test migration. Their lower individual volume reduced their Impact score, incorrectly burying them at ranks #120 and #121 despite 10%+ flakiness.
3. **Misranking Broken Tests**: The broken test `test_payments_idempotency` ranked #4 flaky because of high failure rate + 35 base points.

### Final Proposed Model (Validated)
$$\text{Flakiness Score} = (60\% \times \text{Retry Recovery Rate} + 40\% \text{Failure/Error Rate}) \times 100$$

**Classification Rules**:
* **Likely Broken**: Retry Recovery Count $= 0$ AND Failure/Error Rate $\ge 10\%$
* **Likely Flaky**: Retry Recovery Count $> 0$
* **Low Evidence**: Logical Executions $< 50$
* **Stable**: All other tests

**Why this model works**:
* Strongly prioritizes retry recovery (the core hallmark of flakiness) while capturing overall CI failure disruption.
* Transparent, explainable, and free of artificial score floors.
* Distinct classification badges clearly separate broken regressions from flaky tests.

---

## Important Ranking Findings

| Rank | Test ID | Execs | Recoveries | Recovery Rate | Failure Rate | Flakiness Score | Classification |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **#1** | `tests/auth/test_oauth_callback_timeout` | 447 | 109 | 24.4% | 32.4% | **27.61** | Likely Flaky |
| **#2** | `tests/auth/test_session_refresh_race` | 447 | 96 | 21.5% | 28.2% | **24.16** | Likely Flaky |
| **#3** | `tests/notifications/test_email_batch_send` | 447 | 90 | 20.1% | 28.0% | **23.27** | Likely Flaky |
| **#4** | `tests/payments/test_payments_idempotency` | 447 | 0 | 0.0% | 46.1% | **18.43** | **Likely Broken** |
| **#5** | `tests/checkout/test_checkout_flow` | 198 | 23 | 11.6% | 18.2% | **14.24** | Likely Flaky |
| **#6** | `tests/checkout/test_cart_merge_concurrent` | 447 | 50 | 11.2% | 15.9% | **13.06** | Likely Flaky |
| **#7** | `tests/checkout/test_checkout_flow_v2` | 244 | 25 | 10.2% | 15.6% | **12.38** | Likely Flaky |
| **#8** | `tests/payments/test_webhook_signature` | 447 | 45 | 10.1% | 15.0% | **12.04** | Likely Flaky |
| **#9** | `tests/admin/test_bulk_export` | 447 | 45 | 10.1% | 12.1% | **10.87** | Likely Flaky |
| **#10** | `tests/search/test_fuzzy_ranking` | 447 | 33 | 7.4% | 11.2% | **8.90** | Likely Flaky |

### Notable Highlights:
* **#1 `test_oauth_callback_timeout`**: Fails and recovers on ~1 out of every 4 CI runs (109 recoveries).
* **#2 `test_session_refresh_race` & #3 `test_email_batch_send`**: Exhibit persistent concurrency/timeout flakiness across all workers.
* **#4 `test_payments_idempotency`**: Clearly demarcated as **Likely Broken** (0 recoveries), preventing engineers from misdiagnosing it as a flake.
* **#5 & #7 `test_checkout_flow` (v1 & v2)**: Successfully identified as top flaky tests despite lower individual execution counts resulting from test suite refactoring.

---

## Current Project Structure

```text
flaky-test-triage/
├── data/
│   └── ci_runs.jsonl                 # Raw CI runs dataset (55,364 JSONL lines)
├── analysis/
│   ├── explore_data.js               # Dataset profiling, statistics & data quality detection
│   ├── analyze_flakiness.js          # Logical execution grouping & per-test flakiness metrics
│   ├── analyze_flake_patterns.js     # Environmental pattern analysis (branch, worker, date)
│   ├── design_flakiness_score.js     # Initial 4-factor scoring model evaluation
│   └── validate_flakiness_score.js   # Validated 60/40 scoring model & test classification
├── backend/                          # Backend application directory (Step 6)
├── frontend/                         # Frontend application directory
├── AI_WORK_LOG.md                    # Record of AI delegation, accepted outputs & rejected suggestions
├── DECISION_LOG.md                   # Architectural, data-analysis, and scoring decisions
├── README.md                         # Project documentation and analysis findings
└── .gitignore                        # Git ignore configuration
```

---

## How To Run The Analysis

All analysis scripts use standard Node.js built-in modules with zero external package dependencies.

```bash
# 1. Inspect dataset counts and data quality anomalies
node analysis/explore_data.js

# 2. Analyze per-test logical executions and retry recovery rates
node analysis/analyze_flakiness.js

# 3. Analyze branch, worker, and date patterns
node analysis/analyze_flake_patterns.js

# 4. Evaluate initial scoring model and edge cases
node analysis/design_flakiness_score.js

# 5. Run validated 60/40 scoring formula and classification
node analysis/validate_flakiness_score.js
```

---

## Current Status
* **Completed**: Data exploration, data quality audit, logical execution modeling, retry recovery analysis, environmental pattern detection, and scoring formula validation.
* **Pending**: Backend database ingestion, REST API endpoints, automated tests, and frontend dashboard.
* **Next Step**: **Step 6 — Database & Data Model Design**.
