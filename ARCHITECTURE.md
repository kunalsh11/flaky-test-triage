# Architecture

## 1. System Overview

Flaky Test Triage is an internal developer tool designed to help software engineers identify, prioritize, and triage non-deterministic ("flaky") test failures in CI pipelines. 

Instead of naively ranking tests by raw failure counts—which often surfaces consistently broken tests or high-volume stable tests—this system focuses on **retry-recovery behavior** (where a test fails on attempt 1 and passes on a subsequent retry during the same CI run). By combining retry recovery rates with failure rates, the system computes an explainable flakiness score (0–100) and provides clear classification badges to separate intermittent flakes from persistent regressions.

---

## 2. High-Level Architecture

The system is organized into four main layers: raw data storage, ingestion & persistence, backend REST API, and frontend user interface.

```text
+-------------------------------------------------------------+
|                     data/ci_runs.jsonl                      |
|                  (55,364 raw JSONL records)                 |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                     Ingestion Pipeline                      |
|                 (backend/src/db/ingest.js)                  |
|    - Sanitizes negative/null durations                      |
|    - Preserves all raw attempt rows                         |
|    - Groups logical executions (run_id + test_id)           |
|    - Computes flakiness score & classification              |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                      SQLite Database                        |
|            (backend/data/flaky_test_triage.db)              |
|                                                             |
|   +--------------------------+   +----------------------+   |
|   |          tests           |   |      test_runs       |   |
|   |  (Summary & Triage View) |   |   (Attempt History)  |   |
|   |       121 records        |   |    55,364 records    |   |
|   +--------------------------+   +----------------------+   |
+-------------------------------------------------------------+
                              |
             =================================
             [ PLANNED FOR STEP 7 & STEP 8 ]
             =================================
                              |
                              v
+-------------------------------------------------------------+
|             Backend REST API (Express / Node.js)            |
|                   [Planned in Step 7]                       |
|   - GET  /api/health                                        |
|   - GET  /api/tests (ranked & filtered test list)           |
|   - GET  /api/tests/detail?test_id=... (run history)        |
|   - PATCH /api/tests/triage (update triage status)          |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                Frontend Dashboard (SPA / Web)               |
|                   [Planned in Step 8]                       |
|   - Ranked test summary table                               |
|   - Classification filters (Likely Flaky, Broken, etc.)     |
|   - Single-test execution timeline & retry inspector        |
|   - Interactive triage action controls                      |
+-------------------------------------------------------------+
```

---

## 3. Data Flow

```text
[ci_runs.jsonl] ──> [Ingestion Parser] ──> [test_runs Table] (Raw Attempts)
                             │
                             └──> [Logical Grouping] ──> [tests Table] (Summaries)
                                                                 │
                                          [Step 7 API] <─────────┘
                                               │
                                       [Step 8 Frontend]
```

1. **Raw Records**: The source file `data/ci_runs.jsonl` contains 55,364 lines. Each line represents an individual execution attempt of a test in a CI run.
2. **Ingestion & Sanitization**: Records are streamed into SQLite. Negative durations are sanitized to `null`, and all 55,364 attempt lines are stored as raw evidence in `test_runs`.
3. **Logical Metric Aggregation**: Attempt records are grouped by `(run_id, test_id)` to form 53,635 logical executions. Summary statistics (recoveries, failure rates, scores, classifications) are computed and stored in the `tests` table.
4. **API Serving (Step 7 Planned)**: The Express backend will query `tests` for fast ranking and `test_runs` for drill-down historical views.
5. **UI Presentation (Step 8 Planned)**: The dashboard will display the ranked list, classification badges, and run history.

---

## 4. Flakiness Analysis

### Logical Execution Definition
$$\text{Logical Execution} = \text{run\_id} + \text{test\_id}$$

* A CI run executing a test represents one logical test execution, regardless of how many retry attempts occurred within that run.
* **Why attempts are stored separately**: Retaining individual attempt records (`attempt: 1`, `attempt: 2`) preserves the execution audit trail, timing measurements, and worker host information needed for debugging.
* **Why attempts are grouped for analysis**: If Attempt 1 (failed) and Attempt 2 (passed) were counted as two independent executions, the failure rate would be artificially halved, distorting the test's reliability metric.

### Retry Recovery Event
A **Retry Recovery** is defined as:
* `attempt: 1` has status `failed` or `error`
* A subsequent attempt (`attempt > 1`) on the same `run_id + test_id` has status `passed`

In the dataset:
* **652 records** have `attempt > 1`
* **592 retry-recovery events** were identified (~90.8% of all retried executions recovered to pass)

---

## 5. Flakiness Scoring & Classification

### Validated Scoring Formula
$$\text{Flakiness Score} = (60\% \times \text{Retry Recovery Rate} + 40\% \times \text{Failure/Error Rate}) \times 100$$

Where:
* $\text{Retry Recovery Rate} = \frac{\text{Retry Recovery Events}}{\text{Total Logical Executions}}$
* $\text{Failure/Error Rate} = \frac{\text{Logical Executions with Failures or Errors}}{\text{Total Logical Executions}}$
* **Score Range**: 0.00 to 100.00

### Why Retry Recovery is Weighted 60%
A test failing on attempt 1 and passing on attempt 2 on the *exact same commit and environment* is direct empirical evidence of non-deterministic behavior. Simple failures without recovery often indicate genuine code regressions rather than flakiness.

### 4-Tier Test Classification Rules
1. **Likely Broken**: $\text{Retry Recoveries} = 0 \text{ AND } \text{Failure/Error Rate} \ge 10\%$
   * *Example*: `tests/payments/test_payments_idempotency` (46.09% failure rate, 0 recoveries $\rightarrow$ Score: 18.43, Classified: **Likely Broken**).
2. **Likely Flaky**: $\text{Retry Recovery Rate} \ge 5\%$
   * *Example*: `tests/auth/test_oauth_callback_timeout` (24.38% recovery rate $\rightarrow$ Score: 27.61, Classified: **Likely Flaky**).
3. **Possible Flake**: $\text{Retry Recoveries} > 0 \text{ AND } \text{Retry Recovery Rate} < 5\%$
   * *Example*: `tests/notifications/test_push_fanout` (3.13% recovery rate $\rightarrow$ Score: 4.65, Classified: **Possible Flake**).
4. **Stable**: All other tests with no meaningful failures or recoveries.

---

## 6. Database Design

The system uses **SQLite** (`backend/data/flaky_test_triage.db`) using Node.js built-in `node:sqlite` (`DatabaseSync`).

### Conceptual Schema & Relationship

```text
+------------------------------------+
|               tests                |
+------------------------------------+
| test_id (TEXT PRIMARY KEY)         |<----+
| flakiness_score (REAL)             |     |
| retry_recovery_rate (REAL)         |     |
| failure_error_rate (REAL)          |     |
| total_executions (INTEGER)         |     | 1 : N (Conceptual)
| retry_recoveries (INTEGER)         |     |
| classification (TEXT)              |     |
| triage_status (TEXT)               |     |
| updated_at (TEXT)                  |     |
+------------------------------------+     |
                                           |
+------------------------------------+     |
|             test_runs              |     |
+------------------------------------+     |
| id (INTEGER PK AUTOINCREMENT)      |     |
| run_id (TEXT)                      |     |
| test_id (TEXT) --------------------+-----+
| commit_sha (TEXT)                  |
| branch (TEXT)                      |
| worker (TEXT)                      |
| attempt (INTEGER)                  |
| status (TEXT)                      |
| duration_ms (INTEGER NULL)         |
| started_at (TEXT)                  |
| message (TEXT NULL)                |
+------------------------------------+
```

### Table Responsibilities
* **`tests`**: Summary table providing $O(1)$ indexed access to pre-computed metrics and mutable triage status (`untriaged`, `acknowledged`, `quarantined`, `resolved`).
* **`test_runs`**: Append-only execution history table preserving all 55,364 raw attempt rows.

### Database Indexes
* `idx_test_runs_test_id` on `test_runs(test_id)`: Accelerates single-test history retrieval.
* `idx_test_runs_run_id` on `test_runs(run_id)`: Supports full CI run inspections.
* `idx_test_runs_run_test` on `test_runs(run_id, test_id)`: Accelerates attempt grouping per run.
* `idx_tests_score` on `tests(flakiness_score DESC)`: Accelerates ranked leaderboard queries.

---

## 7. Data Quality Handling

The ingestion pipeline explicitly handles real-world CI anomalies discovered during dataset analysis:

1. **Missing `duration_ms` (5,377 records)**: Ingested as `null` in `test_runs`.
2. **Negative `duration_ms` (158 records)**: Sanitized to `null` to avoid corrupting test duration averages.
3. **Timezone Inconsistencies**: Preserves raw timestamps as ISO strings while handling UTC `Z`, explicit offsets (`+05:30`), and suffix-free timestamps.
4. **Duplicate Candidate Records (1,085 records)**: Raw records sharing `(run_id, test_id, attempt)` are all preserved in `test_runs` via unique autoincrementing row `id` values. During summary calculation, records are deduplicated per attempt key so logical metrics precisely match verified dataset counts.

---

## 8. Backend Architecture (Planned for Step 7)

```text
[ Client (Browser) ]
         │
         │ HTTP / JSON
         ▼
[ Express Router ] ──> [ Test Controller ] ──> [ Test Service ] ──> [ SQLite DB ]
```

### Expected Endpoints & Responsibilities (Step 7)
* `GET /api/health`: Basic health check returning server and database status.
* `GET /api/tests`: Returns ranked list of tests from `tests` table, supporting filters (`classification`, `triage_status`) and sorting.
* `GET /api/tests/detail?test_id=...`: Returns summary metrics from `tests` combined with recent execution runs from `test_runs`.
* `PATCH /api/tests/triage`: Updates `triage_status` (`untriaged`, `acknowledged`, `quarantined`, `resolved`) for a specific test.

---

## 9. Frontend Architecture (Planned for Step 8)

The frontend will be built as a clean, responsive single-page interface:
* **Triage Dashboard**: Ranked summary table displaying test ID, flakiness score, recovery rate, failure rate, classification badge, and current triage status.
* **Filter & Search Controls**: Quick filtering by classification badge (`Likely Flaky`, `Likely Broken`, `Possible Flake`, `Stable`) and triage status.
* **Test Detail Modal / Drawer**: Deep-dive timeline view showing execution history, individual retry attempts, duration trends, and worker assignments.
* **Triage Action Controls**: Interactive buttons allowing engineers to update triage status with immediate UI feedback.

---

## 10. Triage Workflow

```text
                     [ Ingest Dataset ]
                             │
                             ▼
                      +─────────────+
                      |  untriaged  |  (Default state)
                      +─────────────+
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
    +───────────────+                 +───────────────+
    | acknowledged  |                 |  quarantined  |
    | (Under review)|                 | (Removed from |
    +───────────────+                 |  blocking CI) |
            │                         +───────────────+
            │                                 │
            └────────────────┬────────────────┘
                             ▼
                      +─────────────+
                      |  resolved   |  (Fix merged)
                      +─────────────+
```

Triage state is stored in the `triage_status` column of the `tests` table and persisted across server restarts.

---

## 11. Key Design Principles

* **Simplicity First**: Beginner-friendly, idiomatic JavaScript with zero unnecessary abstractions or complex patterns.
* **Explainable Scoring**: Deterministic arithmetic formula based on observable CI events (retries & failures) rather than black-box statistical models.
* **Separation of Concerns**: Summary metrics in `tests` for fast ranking; raw attempts in `test_runs` for evidence preservation.
* **Defensive Data Handling**: Explicit handling of missing values, negative durations, and duplicate logging rows.
* **Zero External DB Dependencies**: Uses embedded SQLite with native Node.js support (`node:sqlite`).

---

## 12. What Is Intentionally Not Included

To keep the scope clean, reliable, and appropriate for this engineering assignment, the following were intentionally omitted:
* **Authentication & Authorization**: Internal triage tool intended for trusted engineering networks.
* **Complex Microservices**: Monolithic lightweight Node.js/SQLite architecture avoids distributed systems overhead.
* **External Database Servers**: No PostgreSQL/MySQL container or cloud database required.
* **Redis / Caching Layer**: In-memory SQLite reads with B-tree indexes execute in sub-milliseconds for 121 tests.
* **Machine Learning / Anomaly Detection**: Simple heuristics provide better interpretability for engineers debugging test failures.

---

## 13. Future Improvements

* **Environmental Correlation**: Automated flags for worker-specific flakiness (e.g., detecting runner-specific failures like `test_webhook_signature` on `runner-07`).
* **Change-Point & Commit Attribution**: Correlating sudden flakiness spikes with specific commit SHAs or pull requests.
* **Real-time Webhook Ingestion**: Ingesting test runs via CI webhooks (GitHub Actions / GitLab CI) rather than batch JSONL files.
* **Duration Trend Analysis**: P95/P99 latency tracking over time to surface degrading test performance before outright timeouts occur.
