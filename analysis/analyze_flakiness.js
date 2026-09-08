const fs = require('fs');
const path = require('path');
const readline = require('readline');

const dataFilePath = path.join(__dirname, '..', 'data', 'ci_runs.jsonl');

async function analyzeFlakiness() {
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
  let rawLinesCount = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    rawLinesCount++;

    let record;
    try {
      record = JSON.parse(line);
    } catch (e) {
      continue;
    }

    const { run_id, test_id, attempt, status, duration_ms, started_at, branch } = record;
    if (!run_id || !test_id) continue;

    const dedupKey = `${run_id}:::${test_id}:::${attempt}`;
    if (seenRecordKeys.has(dedupKey)) {
      continue;
    }
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
      branch,
    });
  }

  const testStatsMap = new Map();

  for (const [groupKey, attempts] of logicalExecutionsMap.entries()) {
    const [, testId] = groupKey.split(':::');

    if (!testStatsMap.has(testId)) {
      testStatsMap.set(testId, {
        test_id: testId,
        total_executions: 0,
        total_passes: 0,
        total_failures: 0,
        total_errors: 0,
        total_skips: 0,
        executions_with_retries: 0,
        retry_recoveries: 0,
        unrecovered_failures: 0,
        durations: [],
      });
    }

    const stats = testStatsMap.get(testId);
    stats.total_executions++;

    attempts.sort((a, b) => a.attempt - b.attempt);

    const hasRetry = attempts.length > 1;
    if (hasRetry) {
      stats.executions_with_retries++;
    }

    for (const att of attempts) {
      if (att.duration_ms !== null) {
        stats.durations.push(att.duration_ms);
      }
    }

    const firstAttempt = attempts[0];
    const initialFailed = firstAttempt.status === 'failed' || firstAttempt.status === 'error';
    const hasPass = attempts.some(a => a.status === 'passed');
    const isSkipped = attempts.every(a => a.status === 'skipped');

    if (isSkipped) {
      stats.total_skips++;
    } else if (hasPass) {
      stats.total_passes++;
      if (initialFailed) {
        stats.retry_recoveries++;
        if (firstAttempt.status === 'failed') stats.total_failures++;
        if (firstAttempt.status === 'error') stats.total_errors++;
      }
    } else {
      stats.unrecovered_failures++;
      for (const att of attempts) {
        if (att.status === 'failed') stats.total_failures++;
        if (att.status === 'error') stats.total_errors++;
      }
    }
  }

  const testSummaryList = [];

  for (const stats of testStatsMap.values()) {
    const totalExec = stats.total_executions;
    const failureOrErrorCount = stats.total_failures + stats.total_errors;

    const failureErrorRate = totalExec > 0 ? (failureOrErrorCount / totalExec) * 100 : 0;
    const retryRecoveryRate = totalExec > 0 ? (stats.retry_recoveries / totalExec) * 100 : 0;

    const avgDuration = stats.durations.length > 0
      ? Math.round(stats.durations.reduce((sum, d) => sum + d, 0) / stats.durations.length)
      : 0;

    testSummaryList.push({
      test_id: stats.test_id,
      total_executions: stats.total_executions,
      passes: stats.total_passes,
      failures: stats.total_failures,
      errors: stats.total_errors,
      skips: stats.total_skips,
      retried_executions: stats.executions_with_retries,
      retry_recoveries: stats.retry_recoveries,
      unrecovered_failures: stats.unrecovered_failures,
      retry_recovery_rate_pct: retryRecoveryRate.toFixed(2),
      failure_error_rate_pct: failureErrorRate.toFixed(2),
      avg_duration_ms: avgDuration,
    });
  }

  function formatTable(items) {
    const headers = [
      'Rank',
      'Test ID',
      'Execs',
      'Pass',
      'Fail',
      'Err',
      'Skip',
      'Retries',
      'Recoveries',
      'Recovery %',
      'Fail/Err %',
      'Avg Dur (ms)',
    ];

    console.log(
      headers[0].padEnd(5) +
      headers[1].padEnd(48) +
      headers[2].padStart(7) +
      headers[3].padStart(7) +
      headers[4].padStart(7) +
      headers[5].padStart(6) +
      headers[6].padStart(6) +
      headers[7].padStart(9) +
      headers[8].padStart(12) +
      headers[9].padStart(12) +
      headers[10].padStart(12) +
      headers[11].padStart(14)
    );
    console.log('-'.repeat(145));

    items.forEach((item, index) => {
      console.log(
        String(index + 1).padEnd(5) +
        item.test_id.padEnd(48) +
        String(item.total_executions).padStart(7) +
        String(item.passes).padStart(7) +
        String(item.failures).padStart(7) +
        String(item.errors).padStart(6) +
        String(item.skips).padStart(6) +
        String(item.retried_executions).padStart(9) +
        String(item.retry_recoveries).padStart(12) +
        (item.retry_recovery_rate_pct + '%').padStart(12) +
        (item.failure_error_rate_pct + '%').padStart(12) +
        String(item.avg_duration_ms).padStart(14)
      );
    });
  }

  console.log('=========================================================================================================================');
  console.log('                            TOP 15 TESTS BY RETRY-RECOVERY COUNT                                                         ');
  console.log('=========================================================================================================================');
  const topByRecoveries = [...testSummaryList]
    .sort((a, b) => b.retry_recoveries - a.retry_recoveries || b.total_executions - a.total_executions)
    .slice(0, 15);
  formatTable(topByRecoveries);

  console.log('\n=========================================================================================================================');
  console.log('                            TOP 15 TESTS BY FAILURE / ERROR RATE                                                         ');
  console.log('=========================================================================================================================');
  const topByFailureRate = [...testSummaryList]
    .sort((a, b) => parseFloat(b.failure_error_rate_pct) - parseFloat(a.failure_error_rate_pct) || b.total_executions - a.total_executions)
    .slice(0, 15);
  formatTable(topByFailureRate);

  console.log('\n=========================================================================================================================');
  console.log('                                        BEHAVIORAL CATEGORY INSIGHTS                                                     ');
  console.log('=========================================================================================================================');

  const persistentlyBroken = testSummaryList.filter(t => t.unrecovered_failures > 0 && t.retry_recoveries === 0);
  console.log(`\n1. Persistently Failing / Broken Tests (Fail without retry recovery): ${persistentlyBroken.length} tests`);
  persistentlyBroken.slice(0, 5).forEach(t => {
    console.log(`   - ${t.test_id} (Execs: ${t.total_executions}, Passes: ${t.passes}, Unrecovered Failures: ${t.unrecovered_failures})`);
  });

  const pureFlakes = testSummaryList.filter(t => t.retry_recoveries >= 15);
  console.log(`\n2. Frequent Flakes (15+ Retry Recoveries): ${pureFlakes.length} tests`);
  pureFlakes.slice(0, 5).forEach(t => {
    console.log(`   - ${t.test_id} (Recoveries: ${t.retry_recoveries}, Execs: ${t.total_executions}, Recovery Rate: ${t.retry_recovery_rate_pct}%)`);
  });

  const lowExecutionTests = testSummaryList.filter(t => t.total_executions < 100);
  console.log(`\n3. Low Execution Volume Tests (< 100 executions): ${lowExecutionTests.length} tests`);

  const rockSolidTests = testSummaryList.filter(t => t.total_executions > 400 && t.failures === 0 && t.errors === 0);
  console.log(`\n4. Rock Solid Tests (> 400 execs, 0 failures/retries): ${rockSolidTests.length} tests`);

  console.log('\n=========================================================================================================================\n');
}

analyzeFlakiness().catch(err => {
  console.error('Fatal error during flakiness analysis:', err);
});
