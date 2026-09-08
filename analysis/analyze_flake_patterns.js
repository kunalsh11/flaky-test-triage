const fs = require('fs');
const path = require('path');
const readline = require('readline');

const dataFilePath = path.join(__dirname, '..', 'data', 'ci_runs.jsonl');

async function analyzeFlakePatterns() {
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

  const overallRecoveriesByBranch = {};
  const overallRecoveriesByWorker = {};
  const overallRecoveriesByDate = {};
  const testStatsMap = new Map();

  for (const [groupKey, attempts] of logicalExecutionsMap.entries()) {
    const [, testId] = groupKey.split(':::');

    if (!testStatsMap.has(testId)) {
      testStatsMap.set(testId, {
        test_id: testId,
        total_executions: 0,
        retry_recoveries: 0,
        recovery_branches: {},
        recovery_workers: {},
        recovery_dates: {},
        all_branches: {},
        all_workers: {},
      });
    }

    const stats = testStatsMap.get(testId);
    stats.total_executions++;

    attempts.sort((a, b) => a.attempt - b.attempt);

    const firstAttempt = attempts[0];
    const initialFailed = firstAttempt.status === 'failed' || firstAttempt.status === 'error';
    const hasPass = attempts.some(a => a.status === 'passed');

    const branch = firstAttempt.branch;
    const worker = firstAttempt.worker;
    
    stats.all_branches[branch] = (stats.all_branches[branch] || 0) + 1;
    stats.all_workers[worker] = (stats.all_workers[worker] || 0) + 1;

    let dateStr = 'unknown';
    if (firstAttempt.started_at) {
      const parsedDate = new Date(firstAttempt.started_at);
      if (!isNaN(parsedDate.getTime())) {
        dateStr = parsedDate.toISOString().slice(0, 10);
      }
    }

    if (initialFailed && hasPass) {
      stats.retry_recoveries++;
      stats.recovery_branches[branch] = (stats.recovery_branches[branch] || 0) + 1;
      stats.recovery_workers[worker] = (stats.recovery_workers[worker] || 0) + 1;
      stats.recovery_dates[dateStr] = (stats.recovery_dates[dateStr] || 0) + 1;

      overallRecoveriesByBranch[branch] = (overallRecoveriesByBranch[branch] || 0) + 1;
      overallRecoveriesByWorker[worker] = (overallRecoveriesByWorker[worker] || 0) + 1;
      overallRecoveriesByDate[dateStr] = (overallRecoveriesByDate[dateStr] || 0) + 1;
    }
  }

  console.log('================================================================================');
  console.log('                 OVERALL RETRY-RECOVERY DISTRIBUTION                            ');
  console.log('================================================================================\n');

  console.log('1. RETRY RECOVERIES BY BRANCH:');
  const sortedBranches = Object.entries(overallRecoveriesByBranch).sort((a, b) => b[1] - a[1]);
  sortedBranches.forEach(([branch, count]) => {
    console.log(`   - ${branch.padEnd(25)}: ${count} recoveries`);
  });

  console.log('\n2. RETRY RECOVERIES BY WORKER:');
  const sortedWorkers = Object.entries(overallRecoveriesByWorker).sort((a, b) => b[1] - a[1]);
  sortedWorkers.forEach(([worker, count]) => {
    console.log(`   - ${worker.padEnd(25)}: ${count} recoveries`);
  });

  console.log('\n3. RETRY RECOVERIES BY DATE (YYYY-MM-DD):');
  const sortedDates = Object.entries(overallRecoveriesByDate).sort((a, b) => a[0].localeCompare(b[0]));
  sortedDates.forEach(([date, count]) => {
    console.log(`   - ${date}: ${count} recoveries`);
  });

  console.log('\n================================================================================');
  console.log('        DEEP DIVE: TOP 10 TESTS BY RETRY-RECOVERY COUNT                         ');
  console.log('================================================================================\n');

  const top10Tests = Array.from(testStatsMap.values())
    .sort((a, b) => b.retry_recoveries - a.retry_recoveries)
    .slice(0, 10);

  top10Tests.forEach((t, idx) => {
    const recoveryRate = ((t.retry_recoveries / t.total_executions) * 100).toFixed(2);
    console.log(`[#${idx + 1}] ${t.test_id}`);
    console.log(`    Total Executions : ${t.total_executions}`);
    console.log(`    Retry Recoveries : ${t.retry_recoveries}`);
    console.log(`    Recovery Rate    : ${recoveryRate}%`);

    console.log(`    Recoveries by Branch:`);
    Object.entries(t.recovery_branches)
      .sort((a, b) => b[1] - a[1])
      .forEach(([branch, count]) => {
        const totalBranchExecs = t.all_branches[branch] || 0;
        const branchRate = totalBranchExecs > 0 ? ((count / totalBranchExecs) * 100).toFixed(1) : 0;
        console.log(`      * ${branch.padEnd(22)}: ${count} recoveries (out of ${totalBranchExecs} execs, ${branchRate}%)`);
      });

    console.log(`    Recoveries by Worker:`);
    Object.entries(t.recovery_workers)
      .sort((a, b) => b[1] - a[1])
      .forEach(([worker, count]) => {
        const totalWorkerExecs = t.all_workers[worker] || 0;
        const workerRate = totalWorkerExecs > 0 ? ((count / totalWorkerExecs) * 100).toFixed(1) : 0;
        console.log(`      * ${worker.padEnd(22)}: ${count} recoveries (out of ${totalWorkerExecs} execs, ${workerRate}%)`);
      });

    const dates = Object.keys(t.recovery_dates).sort();
    const minDate = dates[0] || 'N/A';
    const maxDate = dates[dates.length - 1] || 'N/A';
    console.log(`    Dates with Recoveries: ${dates.length} distinct days (From ${minDate} to ${maxDate})`);
    console.log('--------------------------------------------------------------------------------');
  });

  console.log('\n================================================================================');
  console.log('                 CONCENTRATION & SPREAD ANALYSIS                                ');
  console.log('================================================================================\n');

  console.log('1. BRANCH CONCENTRATION:');
  top10Tests.forEach(t => {
    const branches = Object.keys(t.recovery_branches);
    const mainRecoveries = t.recovery_branches['main'] || 0;
    const mainPct = ((mainRecoveries / t.retry_recoveries) * 100).toFixed(1);
    console.log(`   - ${t.test_id}`);
    console.log(`     Spans ${branches.length} branches. (${mainRecoveries}/${t.retry_recoveries} on 'main' = ${mainPct}%)`);
  });

  console.log('\n2. WORKER CONCENTRATION:');
  top10Tests.forEach(t => {
    const workers = Object.keys(t.recovery_workers);
    console.log(`   - ${t.test_id}`);
    console.log(`     Spans ${workers.length} of 10 workers.`);
  });

  console.log('\n3. DATE CONCENTRATION:');
  top10Tests.forEach(t => {
    const dates = Object.keys(t.recovery_dates);
    console.log(`   - ${t.test_id}`);
    console.log(`     Occurred on ${dates.length} separate days across the 30-day window.`);
  });

  console.log('\n================================================================================\n');
}

analyzeFlakePatterns().catch(err => {
  console.error('Fatal error during pattern analysis:', err);
});
