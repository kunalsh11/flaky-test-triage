const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { getDatabase } = require('./connection');
const { createTestStats, accumulateExecution, summarizeTestStats } = require('../lib/flakiness');

const defaultJsonlPath = path.join(__dirname, '..', '..', '..', 'data', 'ci_runs.jsonl');

async function ingestDataset(options = {}) {
  const jsonlPath = options.jsonlPath || defaultJsonlPath;
  const db = options.db || getDatabase(options.dbPath);
  const reset = options.reset !== false;

  if (!fs.existsSync(jsonlPath)) {
    throw new Error(`Dataset file not found at: ${jsonlPath}`);
  }

  if (reset) {
    db.exec('DELETE FROM test_runs; DELETE FROM tests;');
  }

  const fileStream = fs.createReadStream(jsonlPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const insertRunStmt = db.prepare(`
    INSERT INTO test_runs (
      run_id, test_id, commit_sha, branch, worker, attempt, status, duration_ms, started_at, message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const rawRecords = [];
  const logicalExecutionsMap = new Map();
  const seenAttemptKeys = new Set();

  let lineCount = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    lineCount++;

    let record;
    try {
      record = JSON.parse(line);
    } catch (e) {
      continue;
    }

    const {
      run_id,
      test_id,
      commit_sha,
      branch,
      worker,
      attempt,
      status,
      duration_ms,
      started_at,
      message,
    } = record;

    if (!run_id || !test_id) continue;

    const cleanAttempt = typeof attempt === 'number' && attempt > 0 ? attempt : 1;
    const cleanDuration = typeof duration_ms === 'number' && duration_ms >= 0 ? duration_ms : null;
    const cleanStatus = typeof status === 'string' ? status.trim().toLowerCase() : 'unknown';

    rawRecords.push({
      run_id,
      test_id,
      commit_sha: commit_sha || null,
      branch: branch || null,
      worker: worker || null,
      attempt: cleanAttempt,
      status: cleanStatus,
      duration_ms: cleanDuration,
      started_at: started_at || null,
      message: message || null,
    });

    const dedupKey = `${run_id}:::${test_id}:::${cleanAttempt}`;
    if (seenAttemptKeys.has(dedupKey)) {
      continue;
    }
    seenAttemptKeys.add(dedupKey);

    const groupKey = `${run_id}:::${test_id}`;
    if (!logicalExecutionsMap.has(groupKey)) {
      logicalExecutionsMap.set(groupKey, []);
    }

    logicalExecutionsMap.get(groupKey).push({
      attempt: cleanAttempt,
      status: cleanStatus,
    });
  }

  db.exec('BEGIN TRANSACTION;');
  for (const row of rawRecords) {
    insertRunStmt.run(
      row.run_id,
      row.test_id,
      row.commit_sha,
      row.branch,
      row.worker,
      row.attempt,
      row.status,
      row.duration_ms,
      row.started_at,
      row.message
    );
  }
  db.exec('COMMIT;');

  const testStatsMap = new Map();

  for (const [groupKey, attempts] of logicalExecutionsMap.entries()) {
    const [, testId] = groupKey.split(':::');

    if (!testStatsMap.has(testId)) {
      testStatsMap.set(testId, createTestStats(testId));
    }

    accumulateExecution(testStatsMap.get(testId), attempts);
  }

  const upsertTestStmt = db.prepare(`
    INSERT INTO tests (
      test_id, flakiness_score, retry_recovery_rate, failure_error_rate,
      total_executions, retry_recoveries, classification, triage_status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'untriaged', ?)
    ON CONFLICT(test_id) DO UPDATE SET
      flakiness_score = excluded.flakiness_score,
      retry_recovery_rate = excluded.retry_recovery_rate,
      failure_error_rate = excluded.failure_error_rate,
      total_executions = excluded.total_executions,
      retry_recoveries = excluded.retry_recoveries,
      classification = excluded.classification,
      updated_at = excluded.updated_at
  `);

  const now = new Date().toISOString();

  db.exec('BEGIN TRANSACTION;');
  for (const stats of testStatsMap.values()) {
    const summary = summarizeTestStats(stats);

    upsertTestStmt.run(
      summary.test_id,
      summary.flakiness_score,
      summary.retry_recovery_rate,
      summary.failure_error_rate,
      summary.total_executions,
      summary.retry_recoveries,
      summary.classification,
      now
    );
  }
  db.exec('COMMIT;');

  return {
    rawRecordsIngested: rawRecords.length,
    testsSummaryCount: testStatsMap.size,
    logicalExecutionsCount: logicalExecutionsMap.size,
  };
}

if (require.main === module) {
  const startTime = Date.now();
  console.log('Starting ingestion from ci_runs.jsonl to SQLite...');
  ingestDataset()
    .then(result => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`Ingestion completed successfully in ${elapsed}s:`);
      console.log(`- Raw Test Runs Ingested : ${result.rawRecordsIngested.toLocaleString()}`);
      console.log(`- Unique Tests Summarized: ${result.testsSummaryCount}`);
      console.log(`- Logical Executions     : ${result.logicalExecutionsCount.toLocaleString()}`);
    })
    .catch(err => {
      console.error('Ingestion failed:', err);
      process.exit(1);
    });
}

module.exports = {
  ingestDataset,
};
