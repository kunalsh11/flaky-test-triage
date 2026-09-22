const { getDatabase } = require('../db/connection');
const {
  parseTimestampToUtcMs,
  parseDateBoundaryToUtcMs,
  createTestStats,
  sortAttempts,
  accumulateExecution,
  summarizeTestStats,
} = require('../lib/flakiness');

function matchesSuite(testId, suite) {
  const segments = testId.split('/');
  return segments.length > 1 && segments[1] === suite;
}

function getRankedTests(filters = {}) {
  const db = getDatabase();
  const { branch, from, to, classification, suite } = filters;

  const hasExecutionFilters = Boolean(branch || from || to);

  if (!hasExecutionFilters) {
    let query = `
      SELECT 
        test_id,
        flakiness_score,
        retry_recovery_rate,
        failure_error_rate,
        classification,
        triage_status
      FROM tests
    `;
    const params = [];

    if (classification) {
      query += ` WHERE classification = ?`;
      params.push(classification);
    }

    query += ` ORDER BY flakiness_score DESC`;
    const rows = db.prepare(query).all(...params);

    if (suite) {
      return rows.filter((row) => matchesSuite(row.test_id, suite));
    }

    return rows;
  }

  const sql = `
    SELECT 
      tr.id,
      tr.run_id,
      tr.test_id,
      tr.branch,
      tr.attempt,
      tr.status,
      tr.started_at,
      t.triage_status
    FROM test_runs tr
    LEFT JOIN tests t ON tr.test_id = t.test_id
    ORDER BY tr.attempt ASC, tr.id ASC
  `;

  const rows = db.prepare(sql).all();

  const fromUtcMs = parseDateBoundaryToUtcMs(from, false);
  const toUtcMs = parseDateBoundaryToUtcMs(to, true);

  const logicalExecutionsMap = new Map();
  const triageStatusMap = new Map();
  const seenExactRecords = new Set();

  for (const row of rows) {
    if (!triageStatusMap.has(row.test_id)) {
      triageStatusMap.set(row.test_id, row.triage_status || 'untriaged');
    }

    const exactRecordKey = `${row.run_id}:::${row.test_id}:::${row.attempt}:::${row.status}:::${row.started_at}`;
    if (seenExactRecords.has(exactRecordKey)) {
      continue;
    }
    seenExactRecords.add(exactRecordKey);

    const groupKey = `${row.run_id}:::${row.test_id}`;

    if (!logicalExecutionsMap.has(groupKey)) {
      logicalExecutionsMap.set(groupKey, {
        run_id: row.run_id,
        test_id: row.test_id,
        branch: row.branch,
        attempts: [],
      });
    }

    logicalExecutionsMap.get(groupKey).attempts.push({
      attempt: row.attempt,
      status: row.status,
      started_at: row.started_at,
    });
  }

  const testStatsMap = new Map();

  for (const execution of logicalExecutionsMap.values()) {
    const attempts = sortAttempts(execution.attempts);
    const firstAttempt = attempts[0];

    if (branch && execution.branch !== branch) {
      continue;
    }

    if (fromUtcMs !== null || toUtcMs !== null) {
      const executionStartMs = parseTimestampToUtcMs(firstAttempt.started_at);
      if (executionStartMs !== null) {
        if (fromUtcMs !== null && executionStartMs < fromUtcMs) continue;
        if (toUtcMs !== null && executionStartMs > toUtcMs) continue;
      }
    }

    const testId = execution.test_id;
    if (!testStatsMap.has(testId)) {
      testStatsMap.set(testId, createTestStats(testId));
    }

    accumulateExecution(testStatsMap.get(testId), attempts);
  }

  const results = [];

  for (const stats of testStatsMap.values()) {
    const summary = summarizeTestStats(stats);

    if (classification && summary.classification !== classification) {
      continue;
    }

    if (suite && !matchesSuite(summary.test_id, suite)) {
      continue;
    }

    results.push({
      test_id: summary.test_id,
      flakiness_score: summary.flakiness_score,
      retry_recovery_rate: summary.retry_recovery_rate,
      failure_error_rate: summary.failure_error_rate,
      classification: summary.classification,
      triage_status: triageStatusMap.get(summary.test_id) || 'untriaged',
    });
  }

  results.sort((a, b) => b.flakiness_score - a.flakiness_score);

  return results;
}

/**
 * Orders raw attempt rows for the detail view.
 *
 * Rows cannot be ordered by `started_at` directly. The column holds three
 * timestamp formats that do not sort correctly as strings, and 344 retries in
 * the dataset carry a timestamp earlier than their own first attempt. So rows
 * are grouped into logical executions, executions are ordered newest-first by
 * the UTC-normalised start of their first attempt, and attempts within an
 * execution always read in retry order (Attempt 1 -> Attempt 2).
 */
function orderHistoryRows(rows) {
  const executions = new Map();

  for (const row of rows) {
    if (!executions.has(row.run_id)) {
      executions.set(row.run_id, []);
    }
    executions.get(row.run_id).push(row);
  }

  const ordered = [];

  for (const attempts of executions.values()) {
    attempts.sort((a, b) => (a.attempt - b.attempt) || (a.id - b.id));
    ordered.push({
      attempts,
      startedAtMs: parseTimestampToUtcMs(attempts[0].started_at),
      firstRowId: attempts[0].id,
    });
  }

  ordered.sort((a, b) => {
    const aMs = a.startedAtMs === null ? -Infinity : a.startedAtMs;
    const bMs = b.startedAtMs === null ? -Infinity : b.startedAtMs;
    return (bMs - aMs) || (b.firstRowId - a.firstRowId);
  });

  return ordered.flatMap((execution) =>
    execution.attempts.map(({ id, ...row }) => row)
  );
}

function getTestDetail(testId) {
  const db = getDatabase();

  const summaryQuery = `
    SELECT 
      test_id,
      flakiness_score,
      retry_recovery_rate,
      failure_error_rate,
      classification,
      triage_status
    FROM tests
    WHERE test_id = ?
  `;

  const summary = db.prepare(summaryQuery).get(testId);
  if (!summary) {
    return null;
  }

  const historyQuery = `
    SELECT 
      id,
      run_id,
      commit_sha,
      branch,
      worker,
      attempt,
      status,
      duration_ms,
      started_at,
      message
    FROM test_runs
    WHERE test_id = ?
  `;

  const history = orderHistoryRows(db.prepare(historyQuery).all(testId));

  return {
    summary,
    history,
  };
}

function updateTriageStatus(testId, triageStatus) {
  const db = getDatabase();

  const existing = db.prepare(`SELECT test_id FROM tests WHERE test_id = ?`).get(testId);
  if (!existing) {
    return null;
  }

  const now = new Date().toISOString();
  const updateStmt = db.prepare(`
    UPDATE tests
    SET triage_status = ?, updated_at = ?
    WHERE test_id = ?
  `);

  updateStmt.run(triageStatus, now, testId);

  return db.prepare(`SELECT * FROM tests WHERE test_id = ?`).get(testId);
}

module.exports = {
  getRankedTests,
  getTestDetail,
  updateTriageStatus,
  orderHistoryRows,
  parseTimestampToUtcMs,
  parseDateBoundaryToUtcMs,
};
