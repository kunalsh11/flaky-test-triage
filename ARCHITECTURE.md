# Architecture Overview

This document outlines the technical architecture of the Flaky Test Triage system in a concise, interview-friendly format.

---

## 1. High-Level Architecture

The application follows a clean 4-tier layered architecture:

```text
React / Vite Frontend (Port 5173)
        |
        v  HTTP / REST (/api)
Node.js + Express API Server (Port 3000)
        |
        v  Method Calls
Service Layer (testService.js)
        |
        v  SQL Queries
SQLite Database (flaky_test_triage.db)
```

### Layer Responsibilities
* **Frontend (React + Vite)**: Renders the scannable ranked test table, interactive filters, single-test detail views with retry evidence, and handles user triage actions.
* **REST API Layer (Express Routes)**: Validates incoming HTTP request query parameters and payloads, maps routes to service functions, and formats standard JSON error and success responses.
* **Service Layer (`testService.js`)**: Encapsulates business logic: flakiness score calculation, logical execution aggregation, UTC date range handling, suite derivation, and database interactions.
* **Database Layer (`node:sqlite`)**: Embedded single-file relational storage with indexes for fast read operations and mutable triage status persistence.

---

## 2. Project Directory Structure

* **`analysis/`**: Standalone exploratory analysis scripts used in Steps 1–5 to profile the dataset, test flakiness patterns, and mathematically validate the scoring formula.
* **`backend/`**: Node.js application containing SQLite ingestion scripts, database schemas, Express route handlers, and service logic.
* **`frontend/`**: React single-page application built with Vite and Vanilla CSS.
* **`data/`**: Contains the source dataset (`ci_runs.jsonl`, 55,364 execution records).

---

## 3. Database Schema Design

The SQLite database (`backend/data/flaky_test_triage.db`) separates summary metrics from raw execution history:

```text
+--------------------------------------------------------+
|                        tests                           |
+-------------------------+--------------+---------------+
| test_id (PK)            | TEXT         | Test Name     |
| flakiness_score         | REAL         | 0.00 - 100.00 |
| retry_recovery_rate     | REAL         | 0.0 - 1.0     |
| failure_error_rate      | REAL         | 0.0 - 1.0     |
| total_executions        | INTEGER      | Total runs    |
| retry_recoveries        | INTEGER      | Pass on retry |
| classification          | TEXT         | Badge category|
| triage_status           | TEXT         | untriaged/... |
| updated_at              | TEXT         | ISO Timestamp |
+-------------------------+--------------+---------------+
                           |
                           | 1 : N (Conceptual)
                           v
+--------------------------------------------------------+
|                      test_runs                         |
+-------------------------+--------------+---------------+
| id (PK AUTOINCREMENT)   | INTEGER      | Row ID        |
| run_id                  | TEXT         | CI Run ID     |
| test_id                 | TEXT         | Test Name     |
| commit_sha              | TEXT         | Commit Hash   |
| branch                  | TEXT         | Branch Name   |
| worker                  | TEXT         | Runner Name   |
| attempt                 | INTEGER      | Attempt (1, 2)|
| status                  | TEXT         | passed/failed |
| duration_ms             | INTEGER NULL | Duration (ms) |
| started_at              | TEXT         | ISO Timestamp |
| message                 | TEXT NULL    | Error log     |
+-------------------------+--------------+---------------+
```

### Why Both Tables Exist
1. **`tests` Table**: Stores precomputed summaries for all 121 unique tests, enabling $O(1)$ fast reads for the default dashboard. It also stores the user-controlled mutable `triage_status`.
2. **`test_runs` Table**: Retains all 55,364 raw attempt rows, preserving an immutable audit trail for test history inspection and dynamic recalculation during filtered queries.

---

## 4. Flakiness Calculation & Pipeline Flow

```text
1. Raw JSONL Records (55,364 lines)
   |
   v
2. Group Attempts into Logical Executions (run_id + test_id = 53,635 executions)
   |
   v
3. Identify Retry Recoveries (Attempt 1 = failed/error AND Attempt > 1 = passed)
   |
   v
4. Calculate Rates (Recovery Rate = recoveries / total, Failure Rate = failed / total)
   |
   v
5. Compute Flakiness Score = (0.60 * Recovery Rate + 0.40 * Failure Rate) * 100
   |
   v
6. Assign Classification (Likely Flaky, Likely Broken, Possible Flake, Stable)
   |
   v
7. Store Summary in SQLite tests Table
   |
   v
8. Serve via REST API to Frontend
```

---

## 5. Retry Evidence: How Retries Work

### What IS a Retry Recovery
* **Attempt 1**: `failed` (e.g. timeout at 10:00:00)
* **Attempt 2**: `passed` (e.g. completed at 10:00:05)
* **Same `run_id` + `test_id`**: This is **one logical execution** that proved non-deterministic behavior.

### What is NOT a Retry Recovery
* **Run 1, Attempt 1**: `failed` on commit `abc` on `main`
* **Run 2, Attempt 1**: `passed` on commit `xyz` on `main`
* These are **two separate logical executions** across different pipeline runs, not an immediate retry recovery.

---

## 6. REST API Architecture

### `GET /api/health`
Returns `{ "status": "ok" }`.

### `GET /api/tests`
Returns the ranked list of tests ordered by `flakiness_score DESC`.
* **Query Filters**:
  * `branch`: Filter by branch name (e.g. `?branch=main`).
  * `suite`: Filter by test suite (e.g. `?suite=auth`). Derived from `test_id.split('/')[1]`.
  * `from`: Filter executions on or after date `YYYY-MM-DD` (e.g. `?from=2026-07-15`).
  * `to`: Filter executions on or before date `YYYY-MM-DD` (e.g. `?to=2026-07-31`).
  * `classification`: Filter by badge (`Likely Flaky`, `Likely Broken`, `Possible Flake`, `Stable`).

### `GET /api/tests/detail?test_id=<test_id>`
Returns single test summary metrics and complete chronological execution attempts.
* *Note on Query Param*: Test IDs contain forward slashes (e.g. `tests/auth/test_oauth_callback_timeout`). Using a query parameter prevents Express route collisions.

### `PATCH /api/tests/detail/triage?test_id=<test_id>`
Updates mutable triage status (`untriaged`, `triaged`, `quarantined`) and persists it in SQLite.

---

## 7. Frontend User Flow

```text
[ Ranked Dashboard ]
        |  Click test link
        v
[ Single Test Detail View ]
        |  Reviews score, failure rate, recovery rate & history table
        v
[ User Selects Action ]  (Mark as Triaged / Quarantine / Reset)
        |
        v  PATCH /api/tests/detail/triage
[ Backend Persists in SQLite ]
        |
        v  Instant JSON Response
[ UI Updates Status Badge Immediately ]
```

---

## 8. Why SQLite Was Chosen

* **Dataset Size**: The dataset is ~55,000 records, which is small enough for an embedded relational database to handle in sub-milliseconds.
* **Zero Infrastructure Overhead**: SQLite requires no external database server, background daemon, or connection pooling setup.
* **Reliability & Portability**: Node.js 22+ provides built-in `node:sqlite` support, making the project completely self-contained and easy to evaluate locally.

---

## 9. Architectural Simplicity

To keep the application robust, maintainable, and easy to explain during code walkthroughs, complex distributed infrastructure (such as microservices, Redis caching, Docker orchestration, or external authentication) was intentionally omitted in favor of a clean, cohesive modular architecture.
