const { getDatabase } = require('../db/connection');

function getRankedTests() {
  const db = getDatabase();
  const query = `
    SELECT 
      test_id,
      flakiness_score,
      retry_recovery_rate,
      failure_error_rate,
      classification,
      triage_status
    FROM tests
    ORDER BY flakiness_score DESC
  `;
  return db.prepare(query).all();
}

module.exports = {
  getRankedTests,
};
