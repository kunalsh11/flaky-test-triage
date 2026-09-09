# Flaky Test Triage

## 1. Project Overview
In continuous integration (CI) environments, flaky tests—tests that non-deterministically pass and fail on the exact same commit without any code change—waste developer time, trigger unnecessary re-runs, and reduce confidence in automated test suites.

**Flaky Test Triage** is an internal developer tool built to help software engineers systematically triage CI test suites and determine **which flaky test should be investigated and fixed first**, rather than naively sorting by raw failure counts.

The system analyzes approximately **55,000 CI execution records** spanning a **30-day period**, computes an explainable flakiness score (0–100), and provides a clean REST API for ranking and historical inspection.

---

## 2. Tech Stack
* **Backend**: Node.js, Express
* **Database**: SQLite (embedded via Node.js `node:sqlite`)
* **API Validation & Testing**: Postman, Node.js automated test scripts
* **Dataset Format**: JSON Lines (`.jsonl`)

---

## 3. Dataset Findings & Data Quality Audit
The project analyzes the raw dataset located at `data/ci_runs.jsonl`. Comprehensive exploration revealed the following statistics and real-world data quality anomalies:

* **Total Raw Records**: 55,364 attempt records
* **Unique Test Cases (`test_id`)**: 121 tests
* **Unique CI Pipeline Runs (`run_id`)**: 447 runs
* **Unique Git Branches**: 18 branches (`main` and 17 feature branches)
* **Unique CI Workers**: 10 runners (`runner-01` through `runner-10`)
* **Execution Status Distribution**:
  * `passed`: 49,397 records (89.2%)
  * `failed`: 1,105 records (2.0%)
  * `error`: 1,610 records (2.9%)
  * `skipped`: 3,252 records (5.9%)
* **Retry Observations**:
  * 652 records have `attempt > 1` (test retries)
  * **592 retry-recovery events** identified (~90.8% of retries recovered to pass)
* **Data Quality Findings**:
  * **5,377 missing durations**: Ingested and stored safely as `null`.
  * **158 negative durations** (e.g. `-250ms`): Sanitized to `null` to avoid skewing test timing averages.
  * **1,085 duplicate-key candidates**: Records sharing `(run_id, test_id, attempt)` resulting from logging retries were preserved in the raw database and deduplicated only when exact field values matched.
  * **Mixed Timestamp Formats**: UTC timestamps with `Z`, explicit offsets (`+05:30`), and suffix-less timestamps were explicitly normalized to UTC.

---

## 4. Definition of Flakiness

### Logical Execution
$$\text{Logical Execution} = \text{run\_id} + \text{test\_id}$$

* Multiple attempts within the same CI run (e.g., Attempt 1 followed by Attempt 2) belong to the **same logical execution**.
* Counting retries as independent executions would artificially inflate total execution counts and distort failure rates.
* Deduplicating and grouping yields **53,635 unique logical executions**.

### Retry Recovery Event
A **Retry-Recovery Event** is defined as:
1. `attempt: 1` results in `failed` or `error`.
2. A subsequent attempt (`attempt > 1`) within the same logical execution results in `passed`.

Because retries occur on the identical commit and environment, retry recovery is the single strongest empirical proof of non-deterministic (flaky) behavior.

---

## 5. Flakiness Scoring Model

$$\text{Flakiness Score} = (0.60 \times \text{Retry Recovery Rate} + 0.40 \times \text{Failure/Error Rate}) \times 100$$

Where:
* $\text{Retry Recovery Rate} = \frac{\text{Retry Recovery Events}}{\text{Total Logical Executions}}$
* $\text{Failure/Error Rate} = \frac{\text{Logical Executions with Failures or Errors}}{\text{Total Logical Executions}}$
* **Score Range**: 0.00 to 100.00

### Why Retry Recovery Receives 60% Weight
A failure followed by a passing retry is direct proof of non-deterministic instability. Simple repeated failures often represent genuine code regressions rather than flakiness.

---

## 6. Test Classification System

1. **Likely Broken**: $\text{Retry Recoveries} = 0 \text{ AND } \text{Failure/Error Rate} \ge 10\%$
2. **Likely Flaky**: $\text{Retry Recovery Rate} \ge 5\%$
3. **Possible Flake**: $\text{Retry Recoveries} > 0 \text{ AND } \text{Retry Recovery Rate} < 5\%$
4. **Stable**: All other tests with no meaningful failure or recovery signals.

---

## 7. Important Examples from the Dataset

* **`tests/auth/test_oauth_callback_timeout`**
  * **Score**: `27.61` | **Classification**: `Likely Flaky`
  * **Metrics**: 109 recoveries across 447 runs (24.38% recovery rate, 32.44% failure rate).
  * **Insight**: Top flaky candidate; consistently fails on attempt 1 due to timeouts and recovers on retry.
* **`tests/payments/test_payments_idempotency`**
  * **Score**: `18.43` | **Classification**: **`Likely Broken`**
  * **Metrics**: 0 recoveries across 447 runs (0.00% recovery rate, 46.09% failure rate).
  * **Insight**: Has the highest failure count in the test suite, but retries *never* pass. It is a persistent bug/regression, separated from classic flakes.

---

## 8. Database Architecture

SQLite (`backend/data/flaky_test_triage.db`) separates summary metrics from raw attempt history:

1. **`tests` Table (Summary & Triage View)**:
   * `test_id` (TEXT PRIMARY KEY), `flakiness_score`, `retry_recovery_rate`, `failure_error_rate`, `total_executions`, `retry_recoveries`, `classification`, `triage_status` (Default: `'untriaged'`), `updated_at`.
2. **`test_runs` Table (Raw Execution Evidence)**:
   * `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `run_id`, `test_id`, `commit_sha`, `branch`, `worker`, `attempt`, `status`, `duration_ms`, `started_at`, `message`.

---

## 9. REST API Endpoints

### 1. Health Check
* **`GET /api/health`**
* **Response**: `{"status": "ok"}`

### 2. Ranked Test List & Filters
* **`GET /api/tests`**
* **Optional Query Parameters**:
  * `branch`: Filter by branch (e.g. `?branch=main`).
  * `from`: Filter executions starting from date `YYYY-MM-DD` (e.g. `?from=2026-07-15`).
  * `to`: Filter executions up through date `YYYY-MM-DD` (e.g. `?to=2026-07-31`).
  * `classification`: Filter by classification badge (`Likely Flaky`, `Likely Broken`, `Possible Flake`, `Stable`).
* **Response**: JSON array of test objects ordered by `flakiness_score DESC`.

### 3. Single-Test Detail & History
* **`GET /api/tests/detail?test_id=<test_id>`**
* *Example*: `GET /api/tests/detail?test_id=tests/auth/test_oauth_callback_timeout`
* *Note*: Query parameter is used because `test_id` paths contain slashes.
* **Response**:
  ```json
  {
    "summary": {
      "test_id": "tests/auth/test_oauth_callback_timeout",
      "flakiness_score": 27.61,
      "retry_recovery_rate": 0.2438,
      "failure_error_rate": 0.3244,
      "classification": "Likely Flaky",
      "triage_status": "untriaged"
    },
    "history": [
      {
        "run_id": "7a41eaa0-eab2-216c-8824-310c92a05d75",
        "commit_sha": "db481baad9ae",
        "branch": "feature/PLAT-110",
        "worker": "runner-07",
        "attempt": 1,
        "status": "passed",
        "duration_ms": 1452,
        "started_at": "2026-07-31T01:23:26.000+05:30",
        "message": null
      }
    ]
  }
  ```

---

## 10. Validation & Testing

Database and API behavior were validated end-to-end:
1. **Database Validation (`backend/src/db/validate_db.js`)**:
   * Verified 121 unique tests in `tests`.
   * Verified 55,364 raw records in `test_runs`.
   * Verified separate storage of attempts (e.g., `tests/search/test_fuzzy_ranking` Attempt 1 failed in 1690ms, Attempt 2 passed in 1779ms).
2. **API & Postman Validation**:
   * `GET /api/health` returns `HTTP 200` and `{"status": "ok"}`.
   * `GET /api/tests` returns `HTTP 200` with 121 items ranked descending by score.
   * First test is `test_oauth_callback_timeout` with score `27.61` and classification `Likely Flaky`.
   * Every test object contains `triage_status`.
   * Filter endpoints (`branch`, `classification`, `from`/`to`) validated against expected distributions.
   * `GET /api/tests/detail` validated with valid IDs (`200 OK`), missing parameter (`400 Bad Request`), and non-existent IDs (`404 Not Found`).

---

## 11. Limitations & Intentional Non-Goals
To keep the project focused, robust, and completed within the assignment scope, the following were intentionally omitted:
* **Authentication & Authorization**: Built as an internal tool for trusted developer environments.
* **External Database Infrastructure**: Embedded SQLite was chosen over PostgreSQL/MySQL to eliminate external setup dependencies.
* **Distributed Caching / Redis**: Sub-millisecond SQLite query execution eliminated the need for secondary caching.
* **Complex Machine Learning**: Replaced by transparent, explainable arithmetic scoring heuristics.
* **Production Deployment / CI Pipelines for this repo**: Focused strictly on core triage functionality.

---

## 12. Future Improvements
* **Automated Webhook Ingestion**: Ingesting test results in real-time from GitHub Actions or GitLab CI.
* **Environmental Anomaly Detection**: Automated flagging for runner-specific flakiness (e.g., `test_webhook_signature` on `runner-07`).
* **Commit Attribution**: Correlating sudden flakiness regressions with specific pull requests.
* **Duration Degradation Alerts**: P95 latency tracking to detect degrading performance before outright timeouts occur.
