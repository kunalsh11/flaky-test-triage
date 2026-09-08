const fs = require('fs');
const path = require('path');
const readline = require('readline');

const dataFilePath = path.join(__dirname, '..', 'data', 'ci_runs.jsonl');

async function evaluateFlakinessScoring() {
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

  let maxExecutions = 0;
  for (const stats of testStatsMap.values()) {
    if (stats.total_executions > maxExecutions) {
      maxExecutions = stats.total_executions;
    }
  }

  const testScores = [];

  for (const stats of testStatsMap.values()) {
    const execs = stats.total_executions;
    const recoveryRate = execs > 0 ? stats.retry_recoveries / execs : 0;
    const failureErrorRate = execs > 0 ? (stats.failures + stats.errors) / execs : 0;
    
    const executionImpact = maxExecutions > 0 ? execs / maxExecutions : 0;
    const evidenceConfidence = Math.min(1.0, execs / 200);

    const score = (
      0.40 * recoveryRate +
      0.25 * failureErrorRate +
      0.20 * executionImpact +
      0.15 * evidenceConfidence
    );

    testScores.push({
      test_id: stats.test_id,
      total_executions: execs,
      retry_recoveries: stats.retry_recoveries,
      unrecovered_failures: stats.unrecovered_failures,
      retry_recovery_rate: recoveryRate,
      failure_error_rate: failureErrorRate,
      execution_impact: executionImpact,
      evidence_confidence: evidenceConfidence,
      score: score,
      score_pct: (score * 100).toFixed(2),
    });
  }

  testScores.sort((a, b) => b.score - a.score);

  console.log('=========================================================================================================================');
  console.log('                            PROPOSED FLAKINESS SCORE RANKING (TOP 15)                                                    ');
  console.log('                            Score = 40% RecoveryRate + 25% FailRate + 20% Impact + 15% Confidence                       ');
  console.log('=========================================================================================================================');

  const headers = [
    'Rank',
    'Test ID',
    'Execs',
    'Recovs',
    'RecovRate',
    'FailRate',
    'Impact',
    'Confid',
    'Final Score',
  ];

  console.log(
    headers[0].padEnd(5) +
    headers[1].padEnd(48) +
    headers[2].padStart(7) +
    headers[3].padStart(8) +
    headers[4].padStart(11) +
    headers[5].padStart(11) +
    headers[6].padStart(9) +
    headers[7].padStart(9) +
    headers[8].padStart(14)
  );
  console.log('-'.repeat(125));

  testScores.slice(0, 15).forEach((t, i) => {
    console.log(
      String(i + 1).padEnd(5) +
      t.test_id.padEnd(48) +
      String(t.total_executions).padStart(7) +
      String(t.retry_recoveries).padStart(8) +
      ( (t.retry_recovery_rate * 100).toFixed(1) + '%' ).padStart(11) +
      ( (t.failure_error_rate * 100).toFixed(1) + '%' ).padStart(11) +
      t.execution_impact.toFixed(2).padStart(9) +
      t.evidence_confidence.toFixed(2).padStart(9) +
      (t.score_pct + ' / 100').padStart(14)
    );
  });

  console.log('\n=========================================================================================================================');
  console.log('                               CRITICAL COMPARISON & EDGE CASES ANALYSIS                                                 ');
  console.log('=========================================================================================================================');

  const brokenTest = testScores.find(t => t.test_id === 'tests/payments/test_payments_idempotency');
  const brokenRank = testScores.findIndex(t => t.test_id === 'tests/payments/test_payments_idempotency') + 1;

  console.log(`\n1. THE CONSISTENTLY BROKEN TEST CASE:`);
  console.log(`   Test: 'tests/payments/test_payments_idempotency'`);
  console.log(`   Rank in Proposed Formula : #${brokenRank} out of ${testScores.length}`);
  console.log(`   Retry Recoveries         : ${brokenTest ? brokenTest.retry_recoveries : 'N/A'}`);
  console.log(`   Unrecovered Failures     : ${brokenTest ? brokenTest.unrecovered_failures : 'N/A'}`);
  console.log(`   Failure/Error Rate       : ${brokenTest ? (brokenTest.failure_error_rate * 100).toFixed(2) : 'N/A'}%`);
  console.log(`   Proposed Flakiness Score : ${brokenTest ? brokenTest.score_pct : 'N/A'} / 100`);
  console.log(`   Component Breakdown:`);
  if (brokenTest) {
    console.log(`     - 40% x Recovery Rate (0.000) = 0.000`);
    console.log(`     - 25% x Failure Rate  (0.461) = ${(0.25 * brokenTest.failure_error_rate).toFixed(3)}`);
    console.log(`     - 20% x Impact        (1.000) = ${(0.20 * brokenTest.execution_impact).toFixed(3)}`);
    console.log(`     - 15% x Confidence    (1.000) = ${(0.15 * brokenTest.evidence_confidence).toFixed(3)}`);
    console.log(`     => Total Score = ${brokenTest.score_pct}`);
  }

  const v1Test = testScores.find(t => t.test_id === 'tests/checkout/test_checkout_flow');
  const v2Test = testScores.find(t => t.test_id === 'tests/checkout/test_checkout_flow_v2');
  const v1Rank = testScores.findIndex(t => t.test_id === 'tests/checkout/test_checkout_flow') + 1;
  const v2Rank = testScores.findIndex(t => t.test_id === 'tests/checkout/test_checkout_flow_v2') + 1;

  console.log(`\n2. MIGRATED / SPLIT TEST VOLUME COMPARISON:`);
  console.log(`   - 'tests/checkout/test_checkout_flow' (v1)   : Rank #${v1Rank} | Execs: ${v1Test?.total_executions} | Recovs: ${v1Test?.retry_recoveries} | RecovRate: ${(v1Test?.retry_recovery_rate * 100).toFixed(1)}% | Score: ${v1Test?.score_pct}`);
  console.log(`   - 'tests/checkout/test_checkout_flow_v2' (v2): Rank #${v2Rank} | Execs: ${v2Test?.total_executions} | Recovs: ${v2Test?.retry_recoveries} | RecovRate: ${(v2Test?.retry_recovery_rate * 100).toFixed(1)}% | Score: ${v2Test?.score_pct}`);

  const topFlakeByRecovery = testScores.slice().sort((a, b) => b.retry_recoveries - a.retry_recoveries)[0];
  console.log(`\n3. TOP FLAKE BY RETRY RECOVERIES:`);
  console.log(`   Test: '${topFlakeByRecovery.test_id}'`);
  console.log(`   Recoveries: ${topFlakeByRecovery.retry_recoveries} | Recovery Rate: ${(topFlakeByRecovery.retry_recovery_rate * 100).toFixed(1)}% | Score: ${topFlakeByRecovery.score_pct}`);

  console.log('\n=========================================================================================================================\n');
}

evaluateFlakinessScoring().catch(err => {
  console.error('Fatal error during scoring evaluation:', err);
});
