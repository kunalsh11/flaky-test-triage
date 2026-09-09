# Architecture

## 1. High-Level Architecture

The Flaky Test Triage tool follows a simple, modular layered architecture:

```text
+-------------------------------------------------------------+
|                      Client / Frontend                      |
|           (HTTP Consumers / Planned UI Dashboard)           |
+-------------------------------------------------------------+
                              │
                              ▼  HTTP / JSON
+-------------------------------------------------------------+
|                 Express REST API Layer                      |
|                (backend/src/routes/)                        |
|   - Route handlers, request validation, HTTP status codes   |
+-------------------------------------------------------------+
                              │
                              ▼
+-------------------------------------------------------------+
|                     Service Layer                           |
|               (backend/src/services/)                       |
|   - Business logic, metric calculations, filtering logic    |
+-------------------------------------------------------------+
                              │
                              ▼
+-------------------------------------------------------------+
|                    SQLite Database                          |
|           (backend/data/flaky_test_triage.db)               |
|                                                             |
|   +--------------------------+   +----------------------+   |
|   |          tests           |   |      test_runs       |   |
|   |  (Summary & Triage View) |   |   (Attempt History)  |   |
|   |       121 records        |   |    55,364 records    |   |
|   +--------------------------+   +----------------------+   |
+-------------------------------------------------------------+
```

---

## 2. Project Structure

```text
flaky-test-triage/
├── data/                             # Raw source CI dataset (ci_runs.jsonl)
├── analysis/                         # Standalone exploratory data analysis scripts
│   ├── explore_data.js               # Dataset profiling & anomaly detection
│   ├── analyze_flakiness.js          # Logical execution & per-test statistics
│   ├── analyze_flake_patterns.js     # Branch, worker, and date pattern analysis
│   ├── design_flakiness_score.js     # Initial scoring formula evaluation
│   └── validate_flakiness_score.js   # Validated 60/40 scoring model & classification
├── backend/
│   ├── data/
│   │   └── flaky_test_triage.db      # Embedded SQLite database file
│   └── src/
│       ├── db/
│       │   ├── connection.js         # SQLite connection & schema creation
│       │   ├── ingest.js             # Data ingestion and metric precomputation
│       │   └── validate_db.js        # Database validation queries
│       ├── routes/
│       │   └── testRoutes.js         # Express route handlers & parameter validation
│       ├── services/
│       │   └── testService.js        # Database queries & dynamic execution filtering
│       └── server.js                 # Express server initialization & routing
├── frontend/                         # Client frontend directory (Next step)
├── README.md                         # Project documentation and quickstart
├── ARCHITECTURE.md                   # System architecture and technical design
├── DECISION_LOG.md                   # Architectural and data decisions
└── AI_WORK_LOG.md                    # Record of AI usage, delegation, and refinements
```

### Directory Purposes
* **`data/`**: Stores the raw `ci_runs.jsonl` dataset (55,364 records).
* **`analysis/`**: Standalone, zero-dependency Node.js exploration scripts used to audit the data and formulate the scoring heuristic.
* **`backend/src/db/`**: Handles database connection management, table initialization, streaming ingestion from JSONL, and database validation.
* **`backend/data/`**: Contains the persistent SQLite database file (`flaky_test_triage.db`).
* **`backend/src/routes/`**: Express route definitions for `/api/health` and `/api/tests` (validates HTTP inputs and returns standard JSON responses).
* **`backend/src/services/`**: Encapsulates business logic, SQL query execution, and execution-level metric recalculation.
* **`frontend/`**: Dedicated directory for the user-facing web dashboard (planned in the next phase).

---

## 3. Database Architecture

The SQLite database consists of two core tables:

```text
┌─────────────────────────────────────────────────────────────┐
│                           tests                             │
├───────────────────────┬──────────────┬──────────────────────┤
│ test_id (PK)          │ TEXT         │ Test identifier      │
│ flakiness_score       │ REAL         │ 0.00 to 100.00       │
│ retry_recovery_rate   │ REAL         │ 0.0000 to 1.0000     │
│ failure_error_rate    │ REAL         │ 0.0000 to 1.0000     │
│ total_executions      │ INTEGER      │ Logical executions   │
│ retry_recoveries      │ INTEGER      │ Successful retries   │
│ classification        │ TEXT         │ Likely Flaky/Broken  │
│ triage_status         │ TEXT         │ Default: 'untriaged' │
│ updated_at            │ TEXT         │ ISO Timestamp        │
└───────────────────────┴──────────────┴──────────────────────┘
                              ▲
                              │ 1 : N (Conceptual)
┌─────────────────────────────┴───────────────────────────────┐
│                         test_runs                           │
├───────────────────────┬──────────────┬──────────────────────┤
│ id (PK AUTOINCREMENT) │ INTEGER      │ Raw attempt row ID   │
│ run_id                │ TEXT         │ CI run identifier    │
│ test_id               │ TEXT         │ Test identifier      │
│ commit_sha            │ TEXT         │ Commit hash          │
│ branch                │ TEXT         │ Branch name          │
│ worker                │ TEXT         │ Runner name          │
│ attempt               │ INTEGER      │ Attempt number (1-2) │
│ status                │ TEXT         │ passed/failed/error  │
│ duration_ms           │ INTEGER NULL │ Timing in ms         │
│ started_at            │ TEXT         │ Timestamp            │
│ message               │ TEXT NULL    │ Error log message    │
└───────────────────────┴──────────────┴──────────────────────┘
```

* **`tests` Table**: Stores precomputed summary metrics for all 121 unique tests, providing instant $O(1)$ reads for default dashboard queries. Also persists mutable triage state (`triage_status`).
* **`test_runs` Table**: Preserves the complete audit trail of all 55,364 raw attempt rows, enabling detailed historical inspection and dynamic filtered metric recalculations.

---

## 4. Flakiness Calculation Flow

```text
[ Raw ci_runs.jsonl Dataset ] (55,364 rows)
            │
            ▼
[ Ingestion & Sanitization ] (Sanitizes negative/missing durations)
            │
            ▼
[ Group Logical Executions ] (run_id + test_id = 53,635 executions)
            │
            ▼
[ Identify Retry Recoveries ] (Attempt 1 fail/error + Later Attempt pass = 592 events)
            │
            ▼
[ Compute Rates & Scores ] (60% Recovery Rate + 40% Failure Rate)
            │
            ▼
[ Classify Tests ] (Likely Broken, Likely Flaky, Possible Flake, Stable)
            │
            ▼
[ Expose via REST API ] (GET /api/tests & GET /api/tests/detail)
```

---

## 5. API Architecture

### `GET /api/tests`
Returns the ranked list of tests ordered by `flakiness_score DESC`.

* **Supported Query Filters**:
  * `branch`: Filter by branch name (e.g. `?branch=main`).
  * `from`: Filter executions on or after date `YYYY-MM-DD` (e.g. `?from=2026-07-15`).
  * `to`: Filter executions on or before date `YYYY-MM-DD` (e.g. `?to=2026-07-31`).
  * `classification`: Filter by classification category (`Likely Flaky`, `Likely Broken`, `Possible Flake`, `Stable`).
* **Response**: JSON array of test objects:
  ```json
  [
    {
      "test_id": "tests/auth/test_oauth_callback_timeout",
      "flakiness_score": 27.61,
      "retry_recovery_rate": 0.2438,
      "failure_error_rate": 0.3244,
      "classification": "Likely Flaky",
      "triage_status": "untriaged"
    }
  ]
  ```

### `GET /api/tests/detail?test_id=<test_id>`
Returns summary metrics and chronological attempt execution history for a single test.

* **Query Parameter**: `test_id` (Required)
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

## 6. Important Design Decision: Query Parameter for `test_id`

* **Why query parameter (`/api/tests/detail?test_id=...`) instead of path parameter (`/api/tests/:test_id`)?**
  * Real-world test identifiers contain forward slashes (e.g., `tests/auth/test_oauth_callback_timeout`).
  * Placing slashes inside URL path segments causes Express routers to misinterpret the path as nested sub-routes (e.g., `/api/tests/tests/auth/...`), requiring fragile wildcard route matching or mandatory client-side URL encoding (`%2F`).
  * Using a standard query parameter (`?test_id=...`) eliminates routing ambiguities and cleanly supports arbitrary hierarchical test names.

---

## 7. Filtering Behavior

1. **Unfiltered Fast Path**:
   * When no execution-level filters (`branch`, `from`, `to`) are provided, `GET /api/tests` reads directly from the precomputed `tests` table in sub-milliseconds.
2. **Execution-Level Dynamic Calculation**:
   * When `branch`, `from`, or `to` filters are applied, the service queries raw records from `test_runs` to recompute accurate metrics for the filtered subset.
   * **Preservation of Logical Executions**: Attempts are first grouped by `run_id + test_id`. The start time of Attempt 1 defines the execution timestamp. If the initial attempt falls within the date range, all subsequent retry attempts are evaluated together, ensuring retry recoveries are never severed across date boundaries.

---

## 8. Data Quality & Defensive Handling

* **Missing Durations (5,377 rows)**: Stored as `null`.
* **Negative Durations (158 rows)**: Sanitized to `null` to prevent skewed averages.
* **Timestamp Normalization**: Suffix-less timestamps are explicitly parsed as **UTC** (`+ 'Z'`), preventing server host machine timezone drift.
* **Duplicate Handling**: All 55,364 rows are preserved in `test_runs` with unique autoincrementing IDs. During logical execution grouping, only exact duplicate rows (identical across all fields) are filtered.

---

## 9. Current Scope & Intentional Omissions

To keep the system robust, transparent, and aligned with the assignment requirements, the following were intentionally omitted:
* **Authentication / User Accounts**: Built for trusted internal developer environments.
* **Microservices & Message Brokers**: A clean modular Node.js/SQLite architecture avoids distributed complexity.
* **External Database Infrastructure**: Embedded SQLite eliminates external server installation and configuration overhead.
* **Black-Box Machine Learning**: Deterministic 60/40 arithmetic scoring provides full transparency for engineers debugging failures.
