const { getDatabase } = require('./connection');

function validateDatabase() {
  const db = getDatabase();

  console.log('=========================================================================================================================');
  console.log('                                  STEP 6: SQLITE DATABASE VALIDATION CHECKS                                             ');
  console.log('=========================================================================================================================');

  const testCountRow = db.prepare('SELECT COUNT(*) as count FROM tests').get();
  console.log(`\nCheck 1: Unique Tests Count`);
  console.log(`  Target: ~121 tests | Actual in DB: ${testCountRow.count}`);

  const runCountRow = db.prepare('SELECT COUNT(*) as count FROM test_runs').get();
  console.log(`\nCheck 2: Total Test Runs Ingested`);
  console.log(`  Target: 55,364 records | Actual in DB: ${runCountRow.count.toLocaleString()}`);

  const oauthTest = db.prepare('SELECT * FROM tests WHERE test_id = ?').get('tests/auth/test_oauth_callback_timeout');
  console.log(`\nCheck 3 & 5: OAuth Callback Timeout Test`);
  console.log(`  Test ID        : ${oauthTest?.test_id}`);
  console.log(`  Flakiness Score: ${oauthTest?.flakiness_score} (Expected ~27.61)`);
  console.log(`  Recovery Rate  : ${(oauthTest?.retry_recovery_rate * 100).toFixed(2)}%`);
  console.log(`  Fail/Err Rate  : ${(oauthTest?.failure_error_rate * 100).toFixed(2)}%`);
  console.log(`  Classification : ${oauthTest?.classification}`);
  console.log(`  Triage Status  : ${oauthTest?.triage_status}`);

  const paymentsTest = db.prepare('SELECT * FROM tests WHERE test_id = ?').get('tests/payments/test_payments_idempotency');
  console.log(`\nCheck 4 & 6: Payments Idempotency Test`);
  console.log(`  Test ID        : ${paymentsTest?.test_id}`);
  console.log(`  Flakiness Score: ${paymentsTest?.flakiness_score} (Expected ~13.78)`);
  console.log(`  Recovery Rate  : ${(paymentsTest?.retry_recovery_rate * 100).toFixed(2)}%`);
  console.log(`  Fail/Err Rate  : ${(paymentsTest?.failure_error_rate * 100).toFixed(2)}%`);
  console.log(`  Classification : ${paymentsTest?.classification}`);
  console.log(`  Triage Status  : ${paymentsTest?.triage_status}`);

  const retryPair = db.prepare(`
    SELECT r1.run_id, r1.test_id
    FROM test_runs r1
    JOIN test_runs r2 ON r1.run_id = r2.run_id AND r1.test_id = r2.test_id
    WHERE r1.attempt = 1 AND r1.status IN ('failed', 'error')
      AND r2.attempt = 2 AND r2.status = 'passed'
    LIMIT 1
  `).get();

  console.log(`\nCheck 7: Separate Storage of Individual Retry Attempts (Genuine Retry-Recovery Example)`);
  if (retryPair) {
    const attempts = db.prepare(`
      SELECT id, run_id, test_id, attempt, status, duration_ms, worker, started_at
      FROM test_runs
      WHERE run_id = ? AND test_id = ?
      ORDER BY attempt ASC
    `).all(retryPair.run_id, retryPair.test_id);

    console.log(`  Run ID  : ${retryPair.run_id}`);
    console.log(`  Test ID : ${retryPair.test_id}`);
    attempts.forEach(att => {
      console.log(`    - DB Row #${att.id}: Attempt ${att.attempt} | Status: ${att.status.padEnd(8)} | Duration: ${att.duration_ms}ms | Worker: ${att.worker}`);
    });

    const hasAttempt1 = attempts.some(a => a.attempt === 1);
    const hasAttempt2 = attempts.some(a => a.attempt === 2);
    console.log(`  Verification: Both Attempt 1 (exists: ${hasAttempt1}) and Attempt 2 (exists: ${hasAttempt2}) exist as separate rows in test_runs.`);
  } else {
    console.log('  No retry-recovery pair found in test_runs.');
  }

  const untriagedCount = db.prepare("SELECT COUNT(*) as count FROM tests WHERE triage_status = 'untriaged'").get();
  console.log(`\nCheck 8: Default Triage Status`);
  console.log(`  Total tests with triage_status = 'untriaged': ${untriagedCount.count} / ${testCountRow.count}`);

  const singleTestHistory = db.prepare(`
    SELECT run_id, branch, worker, attempt, status, duration_ms, started_at
    FROM test_runs
    WHERE test_id = ?
    ORDER BY id DESC
    LIMIT 5
  `).all('tests/auth/test_oauth_callback_timeout');
  console.log(`\nCheck 9: Querying Detailed Test History (Recent 5 runs for OAuth test)`);
  singleTestHistory.forEach(h => {
    console.log(`    - Run: ${h.run_id} | Branch: ${h.branch.padEnd(16)} | Worker: ${h.worker} | Att: ${h.attempt} | Status: ${h.status.padEnd(6)} | ${h.duration_ms}ms`);
  });

  const topTests = db.prepare(`
    SELECT test_id, flakiness_score, retry_recoveries, total_executions, retry_recovery_rate, failure_error_rate, classification, triage_status
    FROM tests
    ORDER BY flakiness_score DESC
    LIMIT 10
  `).all();

  console.log('\n=========================================================================================================================');
  console.log('                                        TOP 10 TESTS IN SQLITE DATABASE                                                  ');
  console.log('=========================================================================================================================');
  console.log(
    'Rank'.padEnd(5) +
    'Test ID'.padEnd(48) +
    'Execs'.padStart(7) +
    'Recovs'.padStart(8) +
    'Recov Rate'.padStart(12) +
    'Fail Rate'.padStart(12) +
    'Score'.padStart(10) +
    '  ' + 'Classification'.padEnd(16) +
    'Triage Status'
  );
  console.log('-'.repeat(125));

  topTests.forEach((t, i) => {
    console.log(
      String(i + 1).padEnd(5) +
      t.test_id.padEnd(48) +
      String(t.total_executions).padStart(7) +
      String(t.retry_recoveries).padStart(8) +
      ((t.retry_recovery_rate * 100).toFixed(1) + '%').padStart(12) +
      ((t.failure_error_rate * 100).toFixed(1) + '%').padStart(12) +
      t.flakiness_score.toFixed(2).padStart(10) +
      '  ' + t.classification.padEnd(16) +
      t.triage_status
    );
  });
  console.log('=========================================================================================================================\n');
}

if (require.main === module) {
  validateDatabase();
}

module.exports = {
  validateDatabase,
};
