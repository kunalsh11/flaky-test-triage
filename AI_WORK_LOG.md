# AI Work Log

This document records how AI tools were utilized during the development of the Flaky Test Triage project (Steps 1–7D), including the division of responsibilities, accepted outputs, and rejected or refined suggestions.

---

## 1. AI Tooling Used
* **Google Antigravity**: Primary agentic coding assistant used for codebase exploration, code scaffolding, database ingestion implementation, and backend REST API development.
* **ChatGPT**: Secondary advisor and reviewer used for architectural design sanity checks and requirements review.

---

## 2. Division of Responsibilities

### Human Engineer
* Inspected and interpreted the raw CI dataset and identified key production anomalies.
* Reviewed and audited all AI-generated code before execution.
* Executed analysis scripts and validated mathematical formulas against real test examples.
* Tested REST API endpoints and verified JSON responses using Postman.
* Made all final architectural, scoring, database, and classification decisions.
* Managed Git version control, commits, and GitHub repository synchronization.

### AI Assistant (Antigravity & ChatGPT)
* Generated initial file scaffolding and project structure.
* Created zero-dependency data exploration and pattern analysis scripts.
* Implemented the SQLite streaming ingestion pipeline (`node:sqlite`).
* Built Express backend route handlers and database service modules.
* Implemented the single-test detail endpoint (`GET /api/tests/detail`).
* Assisted in diagnosing and refining edge cases during validation.

---

## 3. Key AI Suggestions Rejected, Refined, or Corrected

### 1. Misleading Initial Retry Validation in `validate_db.js`
* **What Happened**: The initial AI-generated database check for retry attempts queried a run with `attempt = 2`, but printed the first 4 records of that run (which happened to be four `attempt: 1` duplicate candidates for `test_admin_case_00`), failing to prove that an `attempt 2` record existed.
* **Correction**: The human reviewer rejected this output and instructed the AI to write a specific SQL query that joins `attempt: 1` (`failed`) with `attempt: 2` (`passed`) on the identical `run_id + test_id`, proving true retry-recovery storage (e.g., `tests/search/test_fuzzy_ranking`).

### 2. Over-Engineered 4-Factor Additive Scoring Model
* **What Happened**: An initial conceptual formula proposed combining four additive signals:
  $$\text{Score} = 40\% \text{ Recovery Rate} + 25\% \text{ Fail Rate} + 20\% \text{ Impact} + 15\% \text{ Confidence}$$
* **Why Rejected**: When run against the actual dataset, Execution Impact and Evidence Confidence normalized to ~1.0 for almost all tests, creating a static $+35$ point baseline floor. This caused stable tests to outrank actual flakes, penalized migrated tests (`test_checkout_flow` v1 and v2) down to ranks #120 and #121, and inflated the broken test `test_payments_idempotency` to rank #4.
* **Correction**: Replaced with the validated, explainable formula:
  $$\text{Flakiness Score} = (0.60 \times \text{Retry Recovery Rate} + 0.40 \times \text{Failure/Error Rate}) \times 100$$
  and introduced explicit classification states (`Likely Broken`, `Likely Flaky`, `Possible Flake`, `Stable`).

### 3. Overly Aggressive Duplicate Skipping
* **What Happened**: An early iteration of the service filtering logic skipped records if a composite key `(run_id, test_id, attempt)` had already been encountered.
* **Why Rejected**: The 1,085 duplicate candidates in the dataset were not proven to be identical JSON records. Blindly dropping records based solely on the composite key could discard valid attempt evidence.
* **Correction**: Refined the logic to preserve all raw `test_runs` rows and only skip records when verified to be exact duplicates across all relevant fields (`run_id`, `test_id`, `attempt`, `status`, `started_at`).

### 4. Date Filtering Severing Midnight Retries
* **What Happened**: An initial filter implementation filtered individual `test_runs` rows by date before grouping into logical executions.
* **Why Rejected**: An execution where Attempt 1 ran at `23:59:50` and Attempt 2 ran at `00:00:10` would have Attempt 2 dropped by the date boundary, corrupting the retry-recovery metric.
* **Correction**: Grouped attempts by `run_id + test_id` *first*, and applied date range boundaries to the logical execution as a complete unit based on Attempt 1's timestamp.

---

## 4. Guiding Principle
> **"AI was used to accelerate implementation, but final technical decisions were based on dataset behavior and were manually validated."**
