# AI Work Log

This document records the interactions, delegated tasks, accepted contributions, and rejected/modified suggestions during the development of the Flaky Test Triage project.

---

## 1. Work Delegated to AI

### Phase 1: Data Exploration (`analysis/explore_data.js`)
* **Task Delegated**: Writing a zero-dependency Node.js script using `readline` and `fs` to profile the 55,364 JSONL records in `data/ci_runs.jsonl`.
* **Objective**: Compute unique counts (`test_id`, `run_id`, `branch`, `worker`), status distributions, retry counts, timestamp ranges, missing values, negative durations, and duplicate composite keys.
* **AI Output Accepted**: The stream-based parsing logic, anomaly detection counters, and composite key tracking were accepted in full.

### Phase 2: Per-Test Logical Execution Analysis (`analysis/analyze_flakiness.js`)
* **Task Delegated**: Aggregating records by logical execution (`run_id + test_id`) and calculating per-test statistics (pass, fail, error, skip counts, retry recoveries, average durations, and failure rates).
* **Objective**: Establish the baseline behavior of all 121 tests and distinguish between broken, flaky, and stable tests.
* **AI Output Accepted**: Logical execution grouping, retry ordering logic, and terminal table formatting were accepted.

### Phase 3: Environmental Pattern Analysis (`analysis/analyze_flake_patterns.js`)
* **Task Delegated**: Analyzing retry-recovery occurrences across branches, runners, and dates to identify environmental patterns.
* **Objective**: Determine whether flakes are uniform across CI runners or concentrated in specific environments.
* **AI Output Accepted**: Multi-dimensional aggregation tables.

### Phase 4: Scoring Model Design & Validation (`analysis/design_flakiness_score.js` & `analysis/validate_flakiness_score.js`)
* **Task Delegated**: Evaluating conceptual scoring formulas and validating the simplified 60/40 scoring model against the actual dataset.
* **Objective**: Compare test rankings, identify misranked edge cases, and establish explainable classification categories.

---

## 2. AI Suggestions Accepted

1. **Stream-based Line-by-Line Processing**:
   * *Suggestion*: Use Node.js `readline` interface instead of loading the entire 16.4 MB JSONL file into memory with `fs.readFileSync`.
   * *Rationale*: Ensures minimal memory footprint and fast processing speed.
2. **Deduplication on Composite Key `(run_id, test_id, attempt)`**:
   * *Suggestion*: Filter out exact composite-key duplicates during stream ingestion.
   * *Rationale*: Prevents duplicate logging lines from distorting metrics.
3. **Dedicated "Likely Broken" Category**:
   * *Suggestion*: Automatically flag tests with zero retry recoveries and $\ge 10\%$ failure rate with a distinct badge.
   * *Rationale*: Prevents triage engineers from confusing broken code with intermittent flakiness.

---

## 3. AI Suggestions Rejected or Modified

### Example 1: Ranking by Raw Failure Counts
* **Suggestion**: Initially sorting tests by total failure and error count.
* **Why Rejected**: Raw failure count fails to distinguish between broken tests and flaky tests, and treats a test failing 10 times out of 10 runs the same as a test failing 10 times out of 500 runs. It was replaced with the Retry-Recovery metric and logical execution rates.

### Example 2: Additive 4-Factor Scoring Model
* **Suggestion**:
  $$\text{Score} = 0.40 \times \text{RecoveryRate} + 0.25 \times \text{FailRate} + 0.20 \times \text{Impact} + 0.15 \times \text{Confidence}$$
* **Why Rejected**:
  * For almost all tests, `Impact` and `Confidence` normalized to 1.0, creating an artificial $+35$ point floor that allowed stable tests to outrank actual flaky tests.
  * Migrated tests (`test_checkout_flow` and `test_checkout_flow_v2`) were severely penalized down to ranks #120 and #121 simply because they ran ~200 times each rather than 447 times.
  * The broken test `test_payments_idempotency` was inflated to rank #4 despite having 0 retry recoveries.
* **Action Taken**: Replaced with the validated $\text{Flakiness Score} = (0.60 \times \text{Recovery Rate} + 0.40 \times \text{Failure Rate}) \times 100$ and explicit classification states.

### Example 3: Black-Box Machine Learning / Anomaly Detection
* **Suggestion**: Using clustering or statistical anomaly detection to assign flakiness probabilities.
* **Why Rejected**: Triage tools require 100% explainability. Developers need to understand immediately why a test was flagged (e.g., "failed attempt 1, passed attempt 2 in 109 runs"). Simple, transparent arithmetic heuristics provide superior clarity and trust.

---

## 4. Summary of Code Cleanliness Guidelines
* All production and analysis code is kept strictly beginner-friendly, idiomatic, and clean of unnecessary inline explanatory comments.
* No external npm dependencies or heavy frameworks were introduced during the analysis phase.
