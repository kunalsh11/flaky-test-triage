const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const defaultDbPath = path.join(__dirname, '..', '..', 'data', 'flaky_test_triage.db');

function getDatabase(customPath) {
  const dbPath = customPath || defaultDbPath;
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  initDatabase(db);
  return db;
}

function initDatabase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tests (
      test_id TEXT PRIMARY KEY,
      flakiness_score REAL NOT NULL,
      retry_recovery_rate REAL NOT NULL,
      failure_error_rate REAL NOT NULL,
      total_executions INTEGER NOT NULL,
      retry_recoveries INTEGER NOT NULL,
      classification TEXT NOT NULL,
      triage_status TEXT NOT NULL DEFAULT 'untriaged',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      test_id TEXT NOT NULL,
      commit_sha TEXT,
      branch TEXT,
      worker TEXT,
      attempt INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL,
      duration_ms INTEGER,
      started_at TEXT,
      message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_test_runs_test_id ON test_runs(test_id);
    CREATE INDEX IF NOT EXISTS idx_test_runs_run_id ON test_runs(run_id);
    CREATE INDEX IF NOT EXISTS idx_test_runs_run_test ON test_runs(run_id, test_id);
    CREATE INDEX IF NOT EXISTS idx_tests_score ON tests(flakiness_score DESC);
  `);
}

module.exports = {
  getDatabase,
  initDatabase,
  defaultDbPath,
};
