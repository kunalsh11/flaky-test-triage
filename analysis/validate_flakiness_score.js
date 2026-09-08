const fs = require('fs');
const path = require('path');
const readline = require('readline');

const dataFilePath = path.join(__dirname, '..', 'data', 'ci_runs.jsonl');

async function validateFlakinessScore() {
  if (!fs.existsSync(dataFilePath)) {
    console.error('Error: File not found at', dataFilePath);
    return;
  }

  const fileStream = fs.createReadStream(dataFilePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const logicalExecutionsMap = new Map();
  const seenRecordKeys = new Set();

  for await (const line of rl) {
    if (!line.trim()) continue;

    let record;
    try {
      record = JSON.parse(line);
    } catch (e) {
      continue;
    }

    const { run_id, test_id, attempt, status, duration_ms, started_at, branch, worker } = record;
    if (!run_id || !test_id) continue;

    const dedupKey = `${run_id}:::${test_id}:::${attempt}`;
    if (seenRecordKeys.has(dedupKey)) continue;
    seenRecordKeys.add(dedupKey);

    const groupKey = `${run_id}:::${test_id}`;
    if (!logicalExecutionsMap.has(groupKey)) {
      logicalExecutionsMap.set(groupKey, []);
    }

    logicalExecutionsMap.get(groupKey).push({
      attempt: typeof attempt === 'number' ? attempt : 1,
      status: status || 'unknown',
      duration_ms: typeof duration_ms === 'number' && duration_ms >= 0 ? duration_ms : null,
      started_at,
      branch: branch || 'unknown',
      worker: worker || 'unknown',
    });
  }

  const testStatsMap = new Map();

  for (const [groupKey, attempts] of logicalExecutionsMap.entries()) {
    const [, testId] = groupKey.split(':::');

    if (!testStatsMap.has(testId)) {
      testStatsMap.set(testId, {
        test_id: testId,
        total_executions: 0,
        passes: 0,
        failures: 0,
        errors: 0,
        skips: 0,
        retry_recoveries: 0,
        unrecovered_failures: 0,
      });
    }

    const stats = testStatsMap.get(testId);
    stats.total_executions++;

    attempts.sort((a, b) => a.attempt - b.attempt);

    const firstAttempt = attempts[0];
    const initialFailed = firstAttempt.status === 'failed' || firstAttempt.status === 'error';
    const hasPass = attempts.some(a => a.status === 'passed');
    const isSkipped = attempts.every(a => a.status === 'skipped');

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
      stats.unrecovered_failures++;
      for (const att of attempts) {
        if (att.status === 'failed') stats.failures++;
        if (att.status === 'error') stats.errors++;
      }
    }
  }

  const testScores = [];

  for (const stats of testStatsMap.values()) {
    const execs = stats.total_executions;
    const recoveryRate = execs > 0 ? stats.retry_recoveries / execs : 0;
    const failureErrorRate = execs > 0 ? (stats.failures + stats.errors) / execs : 0;

    const score = (0.60 * recoveryRate + 0.40 * failureErrorRate) * 100;

    let classification = 'Stable';
    if (stats.retry_recoveries === 0 && failureErrorRate >= 0.10) {
      classification = 'Likely Broken';
    } else if (stats.retry_recoveries > 0) {
      classification = 'Likely Flaky';
    } else if (execs < 50) {
      classification = 'Low Evidence';
    } else {
      classification = 'Stable';
    }

    testScores.push({
      test_id: stats.test_id,
      total_executions: execs,
      retry_recoveries: stats.retry_recoveries,
      unrecovered_failures: stats.unrecovered_failures,
      retry_recovery_rate: recoveryRate,
      failure_error_rate: failureErrorRate,
      score: score,
      score_str: score.toFixed(2),
      classification: classification,
    });
  }

  testScores.sort((a, b) => b.score - a.score);

  console.log('=========================================================================================================================');
  console.log('                            SIMPLIFIED FLAKINESS SCORE (TOP 15)                                                          ');
  console.log('                            Score = (60% Recovery Rate + 40% Failure Rate) x 100                                        ');
  console.log('=========================================================================================================================');

  const headers = [
    'Rank',
    'Test ID',
    'Execs',
    'Recovs',
    'Recov Rate',
    'Fail Rate',
    'Score',
    'Classification',
  ];

  console.log(
    headers[0].padEnd(5) +
    headers[1].padEnd(48) +
    headers[2].padStart(7) +
    headers[3].padStart(8) +
    headers[4].padStart(12) +
    headers[5].padStart(12) +
    headers[6].padStart(10) +
    '  ' + headers[7]
  );
  console.log('-'.repeat(120));

  testScores.slice(0, 15).forEach((t, i) => {
    console.log(
      String(i + 1).padEnd(5) +
      t.test_id.padEnd(48) +
      String(t.total_executions).padStart(7) +
      String(t.retry_recoveries).padStart(8) +
      ((t.retry_recovery_rate * 100).toFixed(1) + '%').padStart(12) +
      ((t.failure_error_rate * 100).toFixed(1) + '%').padStart(12) +
      t.score_str.padStart(10) +
      '  ' + t.classification
    );
  });

  console.log('\n=========================================================================================================================');
  console.log('                               SPECIFIC TEST CASE RANKING INSPECTION                                                     ');
  console.log('=========================================================================================================================');

  const targetTests = [
    'tests/auth/test_oauth_callback_timeout',
    'tests/auth/test_session_refresh_race',
    'tests/notifications/test_email_batch_send',
    'tests/payments/test_payments_idempotency',
    'tests/checkout/test_checkout_flow',
    'tests/checkout/test_checkout_flow_v2',
  ];

  targetTests.forEach(testId => {
    const item = testScores.find(t => t.test_id === testId);
    const rank = testScores.findIndex(t => t.test_id === testId) + 1;
    if (item) {
      console.log(`- ${testId}:`);
      console.log(`    Rank           : #${rank}`);
      console.log(`    Score          : ${item.score_str} / 100`);
      console.log(`    Classification : ${item.classification}`);
      console.log(`    Executions     : ${item.total_executions}`);
      console.log(`    Recoveries     : ${item.retry_recoveries} (${(item.retry_recovery_rate * 100).toFixed(1)}%)`);
      console.log(`    Fail/Err Rate  : ${(item.failure_error_rate * 100).toFixed(1)}%`);
    }
  });

  console.log('\n=========================================================================================================================');
  console.log('                               COMPARISON: PREVIOUS VS SIMPLIFIED RANKING                                                ');
  console.log('=========================================================================================================================');
  console.log(`1. 'tests/checkout/test_checkout_flow' (v1):`);
  console.log(`     Previous Rank: #121 (Penalized by lower volume) -> Simplified Rank: #${testScores.findIndex(t => t.test_id === 'tests/checkout/test_checkout_flow') + 1}`);
  console.log(`2. 'tests/checkout/test_checkout_flow_v2' (v2):`);
  console.log(`     Previous Rank: #120 (Penalized by lower volume) -> Simplified Rank: #${testScores.findIndex(t => t.test_id === 'tests/checkout/test_checkout_flow_v2') + 1}`);
  console.log(`3. 'tests/payments/test_payments_idempotency':`);
  console.log(`     Previous Rank: #4 -> Simplified Rank: #${testScores.findIndex(t => t.test_id === 'tests/payments/test_payments_idempotency') + 1}`);
  console.log(`     Classification: ${testScores.find(t => t.test_id === 'tests/payments/test_payments_idempotency')?.classification}`);

  console.log('\n=========================================================================================================================\n');
}

validateFlakinessScore().catch(err => {
  console.error('Fatal error during validation:', err);
});
