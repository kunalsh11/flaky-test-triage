# AI Work Log

This document records the division of work between the human engineer and AI tools (Google Antigravity and ChatGPT) during the Flaky Test Triage project, detailing effective prompts, rejected outputs, and debugging takeaways.

---

## 1. How I Used AI

### Human Engineer Responsibilities
* **Data Inspection**: Audited the raw dataset (`ci_runs.jsonl`), identifying anomalies (missing/negative durations, composite key duplicates, mixed timestamps).
* **Domain Modeling**: Defined the concept of a **Logical Execution** (`run_id + test_id`) and formulated the retry-recovery definition.
* **Algorithm Design**: Evaluated, validated, and finalized the 60/40 flakiness scoring model and classification thresholds.
* **Code Review & Auditing**: Inspected all generated JavaScript and JSX code to verify edge-case handling and performance.
* **Testing & Verification**: Executed automated validation scripts, Postman test collections, and browser UI tests.
* **Engineering Decisions**: Made all final architectural and product decisions (e.g. SQLite storage, query parameters for test IDs, manual triage workflow).

### AI Assistant Responsibilities
* **Scaffolding**: Generated directory structures and initial boilerplate for Express and Vite.
* **Pipeline Implementation**: Implemented the SQLite streaming ingestion pipeline using Node.js built-in `node:sqlite`.
* **API Route & Service Layer**: Built Express route handlers and SQL query aggregations for test rankings and history.
* **Frontend Components**: Built the React UI components (`TestTable`, `FilterBar`, `TestDetail`) and CSS styling.

> **Key Rule**: AI output was treated as draft proposals that were strictly reviewed, debugged, and tested against actual data rather than blindly accepted.

---

## 2. Effective AI Sessions

### Session 1: SQLite Streaming Ingestion & Database Validation
* **Prompt Summary**: Instructed the AI to create a streaming ingestion script using `node:readline` and Node's built-in `node:sqlite` to ingest 55,364 JSONL lines into `test_runs` and populate precomputed metrics in `tests` without running out of memory.
* **Why Effective**: Specifying exact table schemas, type coercion rules (`null` for negative/missing durations), and a separate `validate_db.js` script with 10 explicit criteria produced an efficient, self-verifying ingestion pipeline on the first try.

### Session 2: REST API with Preserved Logical Executions
* **Prompt Summary**: Asked the AI to build `GET /api/tests` supporting optional `branch`, `classification`, `from`, and `to` filters, with a strict constraint: grouping attempts into logical executions must occur *before* applying date boundaries to avoid severing midnight retries.
* **Why Effective**: Clear behavioral requirements prevented subtle data corruption bugs where a midnight retry attempt might have been excluded from its initial failure.

### Session 3: React Dashboard & Triage Actions
* **Prompt Summary**: Instructed the AI to build a clean single-page React frontend with a ranked table, filter bar, single-test detail view, and user-controlled triage actions (`Mark as Triaged`, `Quarantine`, `Reset`) calling `PATCH /api/tests/detail/triage`.
* **Why Effective**: Constraining the implementation to Vanilla CSS, native fetch, and zero external UI libraries kept the bundle lightweight, fast, and beginner-friendly.

---

## 3. AI Output I Rejected or Fixed

### Example 1: Misleading Initial Retry Validation in `validate_db.js`
* **What Happened**: The AI generated a test check that searched for `attempt = 2`, but printed the first 4 rows of the matching run. These rows happened to be four `attempt: 1` duplicate candidates for `test_admin_case_00`, failing to prove that an `attempt: 2` record existed.
* **Why Rejected**: Different run IDs with attempt 1 are separate executions. A valid retry recovery requires the same `run_id` and `test_id` with an `attempt: 1` failure followed by a later `attempt: 2` pass.
* **What I Changed**: Replaced the check with a SQL self-join that explicitly asserts an Attempt 1 `failed`/`error` is followed by an Attempt 2 `passed` for the exact same `(run_id, test_id)` (e.g. `tests/search/test_fuzzy_ranking`).

### Example 2: Flawed 4-Factor Scoring Model
* **What Happened**: The AI proposed a 4-factor formula combining Recovery Rate (40%), Failure Rate (25%), Execution Impact (20%), and Evidence Confidence (15%).
* **Why Rejected**: When run against the 55k dataset, Execution Impact and Confidence normalized to ~1.0 for almost every test, creating a flat +35 point baseline. This penalized legitimate flaky tests (like migrated checkout tests) down to ranks #120 and #121, while ranking the broken test `test_payments_idempotency` at #4 despite 0 retry recoveries.
* **What I Changed**: Replaced it with the simpler, highly explainable formula `60% Retry Recovery + 40% Failure/Error Rate` and introduced the `Likely Broken` category.

### Example 3: Overly Aggressive Duplicate Skipping
* **What Happened**: An early AI suggestion proposed skipping records during ingestion if the composite key `(run_id, test_id, attempt)` had already been seen.
* **Why Rejected**: The 1,085 duplicate composite keys in CI logs were not verified exact duplicates; dropping them indiscriminately risked discarding valid execution evidence.
* **What I Changed**: Preserved all raw attempt rows in `test_runs` with unique IDs and only filtered records during calculation if all fields matched identically.

---

## 4. Things That Did Not Work

* **Initial Retry Query**: The first database validation query printed false retry evidence by mixing different executions.
* **Initial 4-Factor Scoring**: Lacked discrimination across the test suite and elevated broken tests over true flakes.
* **Rigid Postman Assertions**: A Postman test script asserting `data.length === 121` failed on valid filtered requests (e.g., date ranges returning 120 or 0 items); updated to assert dynamic array responses.
* **Occupied Port 3000**: The backend initially failed to start because port 3000 was held by an orphan process; diagnosed using PowerShell port queries and terminated the lingering process.
