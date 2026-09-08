const fs = require('fs');
const path = require('path');
const readline = require('readline');

const dataFilePath = path.join(__dirname, '..', 'data', 'ci_runs.jsonl');

async function analyzeDataset() {
  console.log('----------------------------------------------------');
  console.log('Starting data exploration on:', dataFilePath);
  console.log('----------------------------------------------------\n');

  if (!fs.existsSync(dataFilePath)) {
    console.error('Error: File not found at', dataFilePath);
    return;
  }

  const fileStream = fs.createReadStream(dataFilePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let totalRecords = 0;
  const uniqueTestIds = new Set();
  const uniqueRunIds = new Set();
  const uniqueBranches = new Set();
  const uniqueWorkers = new Set();

  const statusCounts = {};
  const attemptCounts = {};
  let retryRecordsCount = 0;

  const runTestAttempts = new Map();

  const seenRecordKeys = new Set();
  let duplicateRecordsCount = 0;


  const missingFieldCounts = {
    run_id: 0,
    test_id: 0,
    attempt: 0,
    status: 0,
    duration_ms: 0,
    started_at: 0,
  };

  let negativeDurationCount = 0;


  let minStartedAt = null;
  let maxStartedAt = null;
  const timezonePatterns = {
    utc_z: 0,
    plus_offset: 0,
    minus_offset: 0,
    no_tz: 0,
    other: 0,
  };

  for await (const line of rl) {
    if (!line.trim()) continue;
    totalRecords++;

    let record;
    try {
      record = JSON.parse(line);
    } catch (err) {
      console.warn(`Line ${totalRecords}: JSON parse error:`, err.message);
      continue;
    }

    for (const field of Object.keys(missingFieldCounts)) {
      if (record[field] === undefined || record[field] === null || record[field] === '') {
        missingFieldCounts[field]++;
      }
    }


    if (record.test_id) uniqueTestIds.add(record.test_id);
    if (record.run_id) uniqueRunIds.add(record.run_id);
    if (record.branch) uniqueBranches.add(record.branch);
    if (record.worker) uniqueWorkers.add(record.worker);


    const status = record.status || 'UNKNOWN';
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    const attempt = record.attempt;
    attemptCounts[attempt] = (attemptCounts[attempt] || 0) + 1;
    if (typeof attempt === 'number' && attempt > 1) {
      retryRecordsCount++;
    }

    if (record.run_id && record.test_id) {
      const groupKey = `${record.run_id}:::${record.test_id}`;
      if (!runTestAttempts.has(groupKey)) {
        runTestAttempts.set(groupKey, []);
      }
      runTestAttempts.get(groupKey).push({
        attempt: record.attempt,
        status: record.status,
      });
    }


    const duplicateKey = `${record.run_id}:::${record.test_id}:::${record.attempt}`;
    if (seenRecordKeys.has(duplicateKey)) {
      duplicateRecordsCount++;
    } else {
      seenRecordKeys.add(duplicateKey);
    }


    if (typeof record.duration_ms === 'number' && record.duration_ms < 0) {
      negativeDurationCount++;
    }


    if (record.started_at) {
      const startedAtStr = String(record.started_at).trim();
      const timestampMs = Date.parse(startedAtStr);

      if (!isNaN(timestampMs)) {
        if (!minStartedAt || timestampMs < minStartedAt.ms) {
          minStartedAt = { ms: timestampMs, raw: startedAtStr };
        }
        if (!maxStartedAt || timestampMs > maxStartedAt.ms) {
          maxStartedAt = { ms: timestampMs, raw: startedAtStr };
        }
      }


      if (startedAtStr.endsWith('Z')) {
        timezonePatterns.utc_z++;
      } else if (/[+-]\d{2}:\d{2}$/.test(startedAtStr)) {
        if (startedAtStr.includes('+')) {
          timezonePatterns.plus_offset++;
        } else {
          timezonePatterns.minus_offset++;
        }
      } else {
        timezonePatterns.no_tz++;
      }
    }
  }

  let retryRecoveryEventsCount = 0;
  const flakyTestExamples = [];

  for (const [key, attempts] of runTestAttempts.entries()) {

    attempts.sort((a, b) => a.attempt - b.attempt);

    const firstAttempt = attempts.find(a => a.attempt === 1);
    const hasInitialFailure = firstAttempt && (firstAttempt.status === 'failed' || firstAttempt.status === 'error');
    const hasLaterPass = attempts.some(a => a.attempt > 1 && a.status === 'passed');

    if (hasInitialFailure && hasLaterPass) {
      retryRecoveryEventsCount++;
      if (flakyTestExamples.length < 3) {
        const [runId, testId] = key.split(':::');
        flakyTestExamples.push({ runId, testId, attempts });
      }
    }
  }




  console.log(`1. Total Records: ${totalRecords}`);
  console.log(`2. Unique test_id Count: ${uniqueTestIds.size}`);
  console.log(`3. Unique run_id Count: ${uniqueRunIds.size}`);
  console.log(`4. Status Counts:`, statusCounts);
  console.log(`5. Attempt Counts:`, attemptCounts);
  console.log(`6. Records with attempt > 1: ${retryRecordsCount}`);
  console.log(`7. Retry-Recovery Events (Attempt 1 Failed/Error -> Later Passed): ${retryRecoveryEventsCount}`);
  console.log(`8. Unique Branches Count: ${uniqueBranches.size}`);
  console.log(`   Sample Branches:`, Array.from(uniqueBranches).slice(0, 5));
  console.log(`9. Unique Workers Count: ${uniqueWorkers.size}`);
  console.log(`   Workers:`, Array.from(uniqueWorkers).sort());
  console.log(`10. Timestamp Range:`);
  console.log(`    - Minimum started_at: ${minStartedAt ? minStartedAt.raw : 'N/A'}`);
  console.log(`    - Maximum started_at: ${maxStartedAt ? maxStartedAt.raw : 'N/A'}`);
  console.log(`11. Missing / Null Values for Important Fields:`, missingFieldCounts);
  console.log(`12. Negative duration_ms Records: ${negativeDurationCount}`);
  console.log(`13. Duplicate Records (same run_id + test_id + attempt): ${duplicateRecordsCount}`);
  console.log(`14. Timestamp Timezone Variations:`, timezonePatterns);

  console.log('\n--- Sample Retry Recovery Event (Classic Flake) ---');
  if (flakyTestExamples.length > 0) {
    console.log(JSON.stringify(flakyTestExamples[0], null, 2));
  }

}

analyzeDataset().catch(err => {
  console.error('Fatal error during data exploration:', err);
});
