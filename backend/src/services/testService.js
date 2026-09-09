const { getDatabase } = require('../db/connection');

function parseTimestampToUtcMs(timestampStr) {
  if (!timestampStr) return null;
  let cleanStr = timestampStr.trim();

  if (!cleanStr.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(cleanStr)) {
    cleanStr = cleanStr + 'Z';
  }

  const time = new Date(cleanStr).getTime();
  return isNaN(time) ? null : time;
}

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
      return rows.filter((row) => {
        const segments = row.test_id.split('/');
        return segments.length > 1 && segments[1] === suite;
      });
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
    execution.attempts.sort((a, b) => a.attempt - b.attempt);

    const firstAttempt = execution.attempts[0];

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
      testStatsMap.set(testId, {
        test_id: testId,
        total_executions: 0,
        passes: 0,
        failures: 0,
        errors: 0,
        skips: 0,
        retry_recoveries: 0,
      });
    }

    const stats = testStatsMap.get(testId);
    stats.total_executions++;

    const initialFailed = firstAttempt.status === 'failed' || firstAttempt.status === 'error';
    const hasPass = execution.attempts.some(a => a.status === 'passed');
    const isSkipped = execution.attempts.every(a => a.status === 'skipped');

    if (isSkipped) {
      stats.skips++;
    } else if (hasPass) {
      stats.passes++;
      if (initialFailed) {
        stats.retry_recoveries++;
        if (firstAttempt.status === 'failed') stats.failures++;
        if (firstAttempt.status === 'error') stats.errors++;
      }
    } else {
      for (const att of execution.attempts) {
        if (att.status === 'failed') stats.failures++;
        if (att.status === 'error') stats.errors++;
      }
    }
  }

  const results = [];

  for (const stats of testStatsMap.values()) {
    const execs = stats.total_executions;
    const recoveryRate = execs > 0 ? stats.retry_recoveries / execs : 0;
    const failureErrorRate = execs > 0 ? (stats.failures + stats.errors) / execs : 0;

    const flakinessScore = (0.60 * recoveryRate + 0.40 * failureErrorRate) * 100;

    let testClassification = 'Stable';
    if (stats.retry_recoveries === 0 && failureErrorRate >= 0.10) {
      testClassification = 'Likely Broken';
    } else if (recoveryRate >= 0.05) {
      testClassification = 'Likely Flaky';
    } else if (stats.retry_recoveries > 0 && recoveryRate < 0.05) {
      testClassification = 'Possible Flake';
    } else {
      testClassification = 'Stable';
    }

    if (classification && testClassification !== classification) {
      continue;
    }

    if (suite) {
      const segments = stats.test_id.split('/');
      if (segments.length <= 1 || segments[1] !== suite) {
        continue;
      }
    }

    results.push({
      test_id: stats.test_id,
      flakiness_score: Number(flakinessScore.toFixed(2)),
      retry_recovery_rate: Number(recoveryRate.toFixed(4)),
      failure_error_rate: Number(failureErrorRate.toFixed(4)),
      classification: testClassification,
      triage_status: triageStatusMap.get(stats.test_id) || 'untriaged',
    });
  }

  results.sort((a, b) => b.flakiness_score - a.flakiness_score);

  return results;
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
    ORDER BY started_at DESC, id DESC
  `;

  const history = db.prepare(historyQuery).all(testId);

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
  parseTimestampToUtcMs,
  parseDateBoundaryToUtcMs,
};
