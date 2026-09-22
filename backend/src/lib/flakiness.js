/**
 * Shared flakiness domain logic.
 *
 * This module is the single source of truth for how a logical execution is
 * interpreted and how a test's flakiness score and classification are derived.
 * Both the ingestion pipeline (precomputed `tests` rows) and the service layer
 * (dynamic recalculation under execution-level filters) consume it, so the two
 * paths cannot drift apart.
 */

const SCORE_WEIGHTS = {
  retryRecoveryRate: 0.60,
  failureErrorRate: 0.40,
};

const CLASSIFICATION_THRESHOLDS = {
  brokenFailureRate: 0.10,
  flakyRecoveryRate: 0.05,
};

const FAILING_STATUSES = new Set(['failed', 'error']);

/**
 * Parses a CI timestamp to epoch milliseconds (UTC).
 *
 * The dataset mixes three formats: a `Z` suffix, an explicit offset such as
 * `+05:30`, and suffix-less local-looking strings. Suffix-less values are
 * treated as UTC so results do not shift with the host timezone.
 */
function parseTimestampToUtcMs(timestampStr) {
  if (!timestampStr) return null;
  let cleanStr = timestampStr.trim();

  if (!cleanStr.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(cleanStr)) {
    cleanStr = cleanStr + 'Z';
  }

  const time = new Date(cleanStr).getTime();
  return isNaN(time) ? null : time;
}

/** Converts a `YYYY-MM-DD` filter boundary to epoch milliseconds (UTC). */
function parseDateBoundaryToUtcMs(dateStr, isEndOfDay = false) {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const [, year, month, day] = match;
  if (isEndOfDay) {
    return Date.UTC(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999);
  }
  return Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
}

function createTestStats(testId) {
  return {
    test_id: testId,
    total_executions: 0,
    passes: 0,
    failing_executions: 0,
    skips: 0,
    retry_recoveries: 0,
  };
}

/**
 * Orders the attempts of one logical execution.
 *
 * Ordering is by attempt number, never by timestamp: 344 retries in the dataset
 * carry a `started_at` earlier than their own first attempt, so timestamps are
 * not a reliable ordering key.
 */
function sortAttempts(attempts) {
  return [...attempts].sort((a, b) => a.attempt - b.attempt);
}

/**
 * Folds one logical execution (all attempts sharing run_id + test_id) into a
 * test's running totals.
 *
 * Every rate is measured per execution, never per attempt. An execution that
 * fails on attempt 1 and fails again on attempt 2 is one failing execution, not
 * two, which keeps `failure_error_rate` a true fraction bounded by 0..1.
 */
function accumulateExecution(stats, attempts) {
  const ordered = sortAttempts(attempts);
  if (ordered.length === 0) return ordered;

  const firstAttempt = ordered[0];
  const initialFailed = FAILING_STATUSES.has(firstAttempt.status);
  const hasPass = ordered.some((a) => a.status === 'passed');
  const allSkipped = ordered.every((a) => a.status === 'skipped');
  const hasFailure = ordered.some((a) => FAILING_STATUSES.has(a.status));

  stats.total_executions++;

  if (allSkipped) {
    stats.skips++;
    return ordered;
  }

  if (hasPass) {
    stats.passes++;
    if (initialFailed) {
      stats.retry_recoveries++;
    }
  }

  if (hasFailure) {
    stats.failing_executions++;
  }

  return ordered;
}

function classifyTest(retryRecoveries, recoveryRate, failureErrorRate) {
  if (retryRecoveries === 0 && failureErrorRate >= CLASSIFICATION_THRESHOLDS.brokenFailureRate) {
    return 'Likely Broken';
  }
  if (recoveryRate >= CLASSIFICATION_THRESHOLDS.flakyRecoveryRate) {
    return 'Likely Flaky';
  }
  if (retryRecoveries > 0) {
    return 'Possible Flake';
  }
  return 'Stable';
}

/**
 * Turns accumulated per-execution totals into the stored/served metrics.
 *
 * Rates are measured over EXECUTED executions — total minus the ones where the
 * test was skipped on every attempt. A skipped execution never ran, so it can
 * demonstrate neither flakiness nor stability; leaving it in the denominator
 * silently deflates every rate for suites that skip often (the admin suite is
 * skipped in up to 38% of its executions).
 *
 * `total_executions` still reports every logical execution, skipped included,
 * so the audit trail and the dataset totals are unchanged.
 */
function summarizeTestStats(stats) {
  const totalExecutions = stats.total_executions;
  const executedExecutions = totalExecutions - stats.skips;

  const recoveryRate =
    executedExecutions > 0 ? stats.retry_recoveries / executedExecutions : 0;
  const failureErrorRate =
    executedExecutions > 0 ? stats.failing_executions / executedExecutions : 0;

  const flakinessScore =
    (SCORE_WEIGHTS.retryRecoveryRate * recoveryRate +
      SCORE_WEIGHTS.failureErrorRate * failureErrorRate) * 100;

  return {
    test_id: stats.test_id,
    flakiness_score: Number(flakinessScore.toFixed(2)),
    retry_recovery_rate: Number(recoveryRate.toFixed(4)),
    failure_error_rate: Number(failureErrorRate.toFixed(4)),
    total_executions: totalExecutions,
    executed_executions: executedExecutions,
    skipped_executions: stats.skips,
    retry_recoveries: stats.retry_recoveries,
    classification: classifyTest(stats.retry_recoveries, recoveryRate, failureErrorRate),
  };
}

module.exports = {
  SCORE_WEIGHTS,
  CLASSIFICATION_THRESHOLDS,
  FAILING_STATUSES,
  parseTimestampToUtcMs,
  parseDateBoundaryToUtcMs,
  createTestStats,
  sortAttempts,
  accumulateExecution,
  classifyTest,
  summarizeTestStats,
};
