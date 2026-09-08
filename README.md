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
2. **Negative `duration_ms`**: 158 records have negative execution durations (e.g., `-250ms`), sanitized to `null` on ingestion.
3. **Duplicate-Key Candidates**: 1,085 records share the identical composite key `(run_id, test_id, attempt)`. These are duplicate-key candidates emitted during network retries or logging flushes and are deduplicated prior to logical aggregation.
4. **Mixed Timestamp Formats / Timezones**:
   * 33,597 timestamps use UTC standard format with a `Z` suffix.
   * 14,356 timestamps use an explicit offset suffix (`+05:30`).
   * 7,411 timestamps have no timezone suffix, parsed safely as UTC ISO strings.

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

## Database Architecture (Step 6)
The application uses **SQLite** (`backend/data/flaky_test_triage.db`) with two primary tables:

### 1. `tests` (Triage & Summary View)
Stores test-level flakiness metrics, classifications, and mutable triage state:
* `test_id` (TEXT PRIMARY KEY)
* `flakiness_score` (REAL)
* `retry_recovery_rate` (REAL)
* `failure_error_rate` (REAL)
* `total_executions` (INTEGER)
* `retry_recoveries` (INTEGER)
* `classification` (TEXT): `'Likely Broken'`, `'Likely Flaky'`, `'Possible Flake'`, or `'Stable'`
* `triage_status` (TEXT DEFAULT `'untriaged'`): Can be updated to `'quarantined'`, `'acknowledged'`, or `'resolved'`
* `updated_at` (TEXT)

### 2. `test_runs` (Execution History & Attempt Evidence)
Stores raw execution history and attempt evidence:
* `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
* `run_id` (TEXT), `test_id` (TEXT), `commit_sha` (TEXT), `branch` (TEXT), `worker` (TEXT)
* `attempt` (INTEGER), `status` (TEXT), `duration_ms` (INTEGER / NULL), `started_at` (TEXT), `message` (TEXT / NULL)

---

## Flakiness Score & Classification

### Formula
$$\text{Flakiness Score} = (60\% \times \text{Retry Recovery Rate} + 40\% \times \text{Failure/Error Rate}) \times 100$$

### Classification Rules
* **Likely Broken**: Retry Recovery Count $= 0$ AND Failure/Error Rate $\ge 10\%$
* **Likely Flaky**: Retry Recovery Rate $\ge 5\%$
* **Possible Flake**: Retry Recovery Count $> 0$ AND Retry Recovery Rate $< 5\%$
* **Stable**: All other tests

---

## Top 10 Ranked Tests in SQLite

| Rank | Test ID | Execs | Recoveries | Recovery Rate | Failure Rate | Score | Classification | Triage Status |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| **#1** | `tests/auth/test_oauth_callback_timeout` | 447 | 109 | 24.4% | 32.4% | **27.61** | Likely Flaky | untriaged |
| **#2** | `tests/auth/test_session_refresh_race` | 447 | 96 | 21.5% | 28.2% | **24.16** | Likely Flaky | untriaged |
| **#3** | `tests/notifications/test_email_batch_send` | 447 | 90 | 20.1% | 28.0% | **23.27** | Likely Flaky | untriaged |
| **#4** | `tests/payments/test_payments_idempotency` | 447 | 0 | 0.0% | 46.1% | **18.43** | **Likely Broken** | untriaged |
| **#5** | `tests/checkout/test_checkout_flow` | 198 | 23 | 11.6% | 18.2% | **14.24** | Likely Flaky | untriaged |
| **#6** | `tests/checkout/test_cart_merge_concurrent` | 447 | 50 | 11.2% | 15.9% | **13.06** | Likely Flaky | untriaged |
| **#7** | `tests/checkout/test_checkout_flow_v2` | 244 | 25 | 10.3% | 15.6% | **12.38** | Likely Flaky | untriaged |
| **#8** | `tests/payments/test_webhook_signature` | 447 | 45 | 10.1% | 15.0% | **12.04** | Likely Flaky | untriaged |
| **#9** | `tests/admin/test_bulk_export` | 447 | 45 | 10.1% | 12.1% | **10.87** | Likely Flaky | untriaged |
| **#10** | `tests/search/test_fuzzy_ranking` | 447 | 33 | 7.4% | 11.2% | **8.90** | Likely Flaky | untriaged |

---

## Project Structure

```text
flaky-test-triage/
├── data/
│   └── ci_runs.jsonl                 # Raw CI runs dataset (55,364 JSONL lines)
├── analysis/
│   ├── explore_data.js               # Dataset profiling & data quality detection
│   ├── analyze_flakiness.js          # Logical execution grouping & per-test metrics
│   ├── analyze_flake_patterns.js     # Environmental pattern analysis (branch, worker, date)
│   ├── design_flakiness_score.js     # Initial 4-factor scoring model evaluation
│   └── validate_flakiness_score.js   # Validated 60/40 scoring model & classification
├── backend/
│   ├── data/
│   │   └── flaky_test_triage.db      # SQLite database file
│   └── src/
│       └── db/
│           ├── connection.js         # SQLite connection & schema initialization
│           ├── ingest.js             # Data ingestion and summary aggregation script
│           └── validate_db.js        # Database validation checks script
├── frontend/                         # Frontend application directory
├── AI_WORK_LOG.md                    # Record of AI delegation & prompt decisions
├── DECISION_LOG.md                   # Architectural, data-analysis, and database decisions
├── README.md                         # Project documentation and analysis findings
└── .gitignore                        # Git ignore configuration
```

---

## How To Run Database Ingestion & Validation

```bash
# Ingest raw dataset into SQLite and compute test summary metrics
node backend/src/db/ingest.js

# Run database validation suite
node backend/src/db/validate_db.js
```

---

## Current Status
* **Completed**: Data exploration, data quality audit, scoring validation, SQLite schema design, dataset ingestion pipeline, and database validation queries.
* **Next Step**: **Step 7 — Backend REST API implementation**.
