# Flaky Test Triage

An internal developer tool designed to help engineering teams identify, prioritize, and triage unreliable CI tests using an explainable, data-driven flakiness score.

---

## 1. Project Overview & Problem Statement

Modern CI/CD pipelines run thousands of automated tests daily. When tests fail non-deterministically—passing on retry without any code changes—they waste developer hours, block pull requests, and reduce trust in CI.

Traditional dashboards often rank tests solely by **raw failure count**. This approach is misleading because:
1. A test that consistently fails due to a real bug is **broken**, not flaky.
2. A test that fails intermittently and passes on retry is **flaky**.

This tool analyzes CI run logs to detect genuine **retry-recovery behavior**, ranks tests using an explainable mathematical formula, and gives engineers a workflow to manually review and triage unreliable tests.

---

## 2. Core Concepts: What is a Flaky Test?

### Logical Execution vs. Retries
A single test execution in CI is identified by:
$$\text{Logical Execution} = \text{run\_id} + \text{test\_id}$$

* When CI detects a test failure and immediately re-runs it, `attempt: 1` and `attempt: 2` are part of the **same logical execution**.
* Counting attempts as separate runs would artificially inflate total test runs and distort failure rates.
* In our dataset of 55,364 raw records, there are **53,635 unique logical executions** across **121 unique tests** and **447 CI runs**.

### Retry Recovery: The Smoking Gun
A **Retry Recovery** occurs when:
1. `attempt: 1` results in `failed` or `error`.
2. A later attempt (`attempt: 2`) within the same `(run_id, test_id)` results in `passed`.

Because both attempts execute on the exact same commit, branch, and environment, a recovery proves non-deterministic behavior.

### Broken vs. Flaky Tests
* **Flaky Test Example (`test_oauth_callback_timeout`)**: Fails 32.4% of the time, but recovers on retry in 24.4% of runs. Score: **27.61** (`Likely Flaky`).
* **Broken Test Example (`test_payments_idempotency`)**: Fails 46.1% of the time, but **never** recovers on retry (0 recoveries). Score: **18.43** (`Likely Broken`).

---

## 3. Flakiness Scoring & Classification

### Scoring Formula
$$\text{Flakiness Score} = (0.60 \times \text{Retry Recovery Rate} + 0.40 \times \text{Failure/Error Rate}) \times 100$$

* **Retry Recovery Rate (60% weight)**: $\frac{\text{Retry Recoveries}}{\text{Total Logical Executions}}$ — captures empirical non-determinism.
* **Failure/Error Rate (40% weight)**: $\frac{\text{Executions with Failures or Errors}}{\text{Total Logical Executions}}$ — captures overall pipeline disruption.
* **Score Range**: `0.00` to `100.00`.

### Test Classifications
1. **Likely Broken**: Retry Recoveries = 0 **AND** Failure/Error Rate $\ge 10\%$.
2. **Likely Flaky**: Retry Recovery Rate $\ge 5\%$.
3. **Possible Flake**: Retry Recoveries > 0 **AND** Retry Recovery Rate $< 5\%$.
4. **Stable**: Tests with no meaningful failure or recovery history.

---

## 4. Main Features

* **Ranked Flaky Test Dashboard**: Live leaderboard sorted by flakiness score with visual rank, rates, and status badges.
* **Dashboard Filters**:
  * **Branch**: Filter executions by `main` or specific feature branches (`feature/PLAT-101` through `feature/PLAT-117`).
  * **Suite**: Filter by test suite (`auth`, `payments`, `notifications`, `checkout`, `admin`, `search`). The suite is derived dynamically from the second segment of `test_id` (`test_id.split('/')[1]`) without requiring a redundant database column.
  * **Classification**: Filter by `Likely Flaky`, `Likely Broken`, `Possible Flake`, or `Stable`.
  * **Date Range**: Filter executions between `From` and `To` dates (`YYYY-MM-DD`).
* **Single Test Detail & History**: Inspect test metrics and chronological CI attempt logs (status, branch, runner, duration, timestamp, error messages).
* **Retry Evidence**: Clear visual indicators (`Attempt 1` $\rightarrow$ `Attempt 2`) showing why a test was flagged as flaky.
* **User-Controlled Triage Actions**: Engineers manually set status to **Mark as Triaged**, **Quarantine**, or **Reset to Untriaged**.
* **Persistence**: All metrics, attempts, and triage states are persisted in SQLite.

> **Important Note on Quarantine:** Quarantine is an internal workflow status stored in this tool's database to help teams track unreliable tests. It does not automatically disable tests in CI.

---

## 5. Tech Stack & Project Structure

* **Frontend**: React 18, Vite, Vanilla CSS.
* **Backend**: Node.js, Express 4.
* **Database**: SQLite (via Node.js built-in `node:sqlite`).

```text
flaky-test-triage/
|-- backend/
|   |-- data/                 # SQLite database storage
|   |-- src/
|   |   |-- db/               # DB connection, schema & ingestion
|   |   |-- routes/           # Express REST route handlers
|   |   |-- services/         # Business logic & flakiness calculations
|   |   `-- server.js         # Server entry point (port 3000)
|   `-- package.json
|-- frontend/
|   |-- src/
|   |   |-- components/       # UI components (TestTable, FilterBar, TestDetail)
|   |   |-- pages/            # Page layouts (Dashboard)
|   |   |-- services/         # Client API service
|   |   |-- App.jsx           # Main application component
|   |   `-- main.jsx          # React entry point
|   |-- index.html
|   |-- vite.config.js        # Vite config with /api proxy
|   `-- package.json
|-- data/
|   `-- ci_runs.jsonl         # Raw CI execution dataset (55,364 lines)
|-- README.md
|-- ARCHITECTURE.md
|-- DECISION_LOG.md
`-- AI_WORK_LOG.md
```

---

## 6. How to Run Locally

### Prerequisites
* Node.js v22.5.0+ (supports built-in `node:sqlite`)
* npm

### 1. Ingest Data & Start Backend
```bash
cd backend
npm install

# Ingest dataset into SQLite (if not already ingested)
node src/db/ingest.js

# Start Express server on http://localhost:3000
npm start
```

### 2. Start Frontend
```bash
cd frontend
npm install

# Start Vite dev server on http://localhost:5173
npm run dev
```

Open `http://localhost:5173` in your browser to use the application.

---

## 7. Dataset Handling & Data Quality

During analysis of `data/ci_runs.jsonl`, several edge cases were identified and handled defensively:
1. **Logical Execution Grouping**: Attempts sharing `(run_id, test_id)` are grouped together.
2. **Raw History Preservation**: All 55,364 raw rows are kept in `test_runs` for complete auditing.
3. **Timezone Normalization**: Suffix-less timestamps (e.g. `2026-07-15T10:00:00`) are explicitly treated as **UTC** (`+ 'Z'`) to prevent host timezone shifts.
4. **Missing & Negative Durations**: 5,377 missing durations and 158 negative durations (e.g. `-250ms`) are stored safely as `null` to avoid corrupting duration metrics.
5. **Duplicate Logging Candidates**: 1,085 duplicate-key entries in CI logs are preserved and only deduplicated when exact field values match.

---

## 8. REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check endpoint (`{"status": "ok"}`) |
| `GET` | `/api/tests` | Returns ranked tests. Supports `branch`, `suite`, `classification`, `from`, `to` |
| `GET` | `/api/tests/detail?test_id=<id>` | Returns summary metrics and execution history for one test |
| `PATCH` | `/api/tests/detail/triage?test_id=<id>` | Updates triage status (`untriaged`, `triaged`, `quarantined`) |

---

## 9. Limitations & Intentional Non-Goals

To keep the application focused and robust within the scope:
* **No Authentication / RBAC**: Designed as an internal developer tool for trusted networks.
* **No External Database Server**: Embedded SQLite was used instead of PostgreSQL/MySQL to avoid external setup dependencies.
* **No Automatic CI Disabling**: Quarantine is a tracking state, not a direct CI mutation.
* **No Heavy Charting Libraries**: Used clean tabular data and badge indicators to keep the UI lightweight and scannable.

---

## 10. Future Improvements (With Another Week)

1. **CI Webhook Ingestion**: Stream new CI runs directly from GitHub Actions or GitLab CI webhooks into SQLite in real-time.
2. **Runner & Worker Anomaly Detection**: Automatically flag environmental flakiness tied to specific worker nodes (e.g., runner hardware failures).
3. **Commit Regression Attribution**: Correlate the exact commit SHA where a test first turned flaky.
4. **CI Quarantine Integration**: Connect the quarantine action to a GitHub API integration to automatically tag or skip quarantined tests in CI runs.
