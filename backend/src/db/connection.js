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
  migrateDatabase(db);
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
      executed_executions INTEGER NOT NULL DEFAULT 0,
      skipped_executions INTEGER NOT NULL DEFAULT 0,
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


/**
 * Adds columns introduced after the first release.
 *
 * `CREATE TABLE IF NOT EXISTS` leaves an existing table untouched, so a database
 * created before these columns existed would otherwise keep a stale shape and
 * fail on insert. Checked per column and safe to run on every connection.
 */
function migrateDatabase(db) {
  const existing = new Set(
    db.prepare(`PRAGMA table_info(tests)`).all().map((col) => col.name)
  );

  const additions = [
    ['executed_executions', `ALTER TABLE tests ADD COLUMN executed_executions INTEGER NOT NULL DEFAULT 0`],
    ['skipped_executions', `ALTER TABLE tests ADD COLUMN skipped_executions INTEGER NOT NULL DEFAULT 0`],
  ];

  for (const [column, sql] of additions) {
    if (!existing.has(column)) {
      db.exec(sql);
    }
  }
}

module.exports = {
  getDatabase,
  initDatabase,
  migrateDatabase,
  defaultDbPath,
};
