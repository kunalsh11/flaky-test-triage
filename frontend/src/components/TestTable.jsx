import React from 'react';

function getClassificationBadgeClass(classification) {
  switch (classification) {
    case 'Likely Flaky':
      return 'badge badge-flaky';
    case 'Likely Broken':
      return 'badge badge-broken';
    case 'Possible Flake':
      return 'badge badge-possible';
    default:
      return 'badge badge-stable';
  }
}

function getTriageBadgeClass(status) {
  switch (status) {
    case 'quarantined':
      return 'badge badge-quarantined';
    case 'triaged':
      return 'badge badge-triaged';
    default:
      return 'badge badge-untriaged';
  }
}

export default function TestTable({ tests, onSelectTest }) {
  if (!tests || tests.length === 0) {
    return (
      <div className="empty-state">
        <p>No tests match the selected filters.</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="test-table">
        <thead>
          <tr>
            <th className="col-rank">Rank</th>
            <th className="col-test">Test</th>
            <th className="col-score">Flakiness Score</th>
            <th className="col-rate">Failure/Error Rate</th>
            <th className="col-rate">Retry Recovery</th>
            <th className="col-badge">Classification</th>
            <th className="col-badge">Triage Status</th>
          </tr>
        </thead>
        <tbody>
          {tests.map((test, index) => (
            <tr 
              key={test.test_id}
              className="clickable-row"
              onClick={() => onSelectTest && onSelectTest(test.test_id)}
            >
              <td className="col-rank">#{index + 1}</td>
              <td className="col-test">
                <button
                  type="button"
                  className="test-link-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectTest) onSelectTest(test.test_id);
                  }}
                  title={test.test_id}
                >
                  {test.test_id}
                </button>
              </td>
              <td className="col-score">
                <span className={`score-badge ${test.flakiness_score >= 20 ? 'score-high' : test.flakiness_score >= 10 ? 'score-med' : 'score-low'}`}>
                  {test.flakiness_score.toFixed(2)}
                </span>
              </td>
              <td className="col-rate">{(test.failure_error_rate * 100).toFixed(1)}%</td>
              <td className="col-rate">{(test.retry_recovery_rate * 100).toFixed(1)}%</td>
              <td className="col-badge">
                <span className={getClassificationBadgeClass(test.classification)}>
                  {test.classification}
                </span>
              </td>
              <td className="col-badge">
                <span className={getTriageBadgeClass(test.triage_status)}>
                  {test.triage_status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
