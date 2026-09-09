import React, { useEffect, useState } from 'react';
import { getTestDetail, updateTriageStatus } from '../services/api';

function getStatusBadgeClass(status) {
  switch (status) {
    case 'passed':
      return 'badge badge-status-passed';
    case 'failed':
      return 'badge badge-status-failed';
    case 'error':
      return 'badge badge-status-error';
    case 'skipped':
      return 'badge badge-status-skipped';
    default:
      return 'badge';
  }
}

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

export default function TestDetail({ testId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    async function loadDetail() {
      try {
        setLoading(true);
        setError(null);
        setActionError(null);
        const result = await getTestDetail(testId);
        setData(result);
      } catch (err) {
        setError(err.message || 'Failed to load test details');
      } finally {
        setLoading(false);
      }
    }

    if (testId) {
      loadDetail();
    }
  }, [testId]);

  async function handleTriageChange(newStatus) {
    if (!data || !data.summary || data.summary.triage_status === newStatus || updating) {
      return;
    }

    try {
      setUpdating(true);
      setActionError(null);
      const updatedSummary = await updateTriageStatus(testId, newStatus);
      setData((prev) => ({
        ...prev,
        summary: updatedSummary,
      }));
    } catch (err) {
      setActionError(err.message || 'Failed to update triage status');
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <button className="btn-back" onClick={onBack}>
          ← Back to tests
        </button>
        <div className="status-box loading-box">
          <p>Loading test details for {testId}...</p>
        </div>
      </div>
    );
  }

  if (error || !data || !data.summary) {
    return (
      <div className="dashboard-container">
        <button className="btn-back" onClick={onBack}>
          ← Back to tests
        </button>
        <div className="status-box error-box">
          <p><strong>Error:</strong> {error || 'Test not found'}</p>
        </div>
      </div>
    );
  }

  const { summary, history } = data;
  const currentStatus = summary.triage_status || 'untriaged';

  return (
    <div className="dashboard-container">
      <div className="detail-top-nav">
        <button className="btn-back" onClick={onBack}>
          ← Back to tests
        </button>
      </div>

      <header className="detail-header card">
        <div className="detail-title-section">
          <span className="detail-label">Test Identifier</span>
          <h1 className="detail-test-name">{summary.test_id}</h1>
        </div>

        <div className="detail-metrics-grid">
          <div className="metric-box">
            <span className="metric-label">Flakiness Score</span>
            <span className={`metric-value ${summary.flakiness_score >= 20 ? 'text-high' : summary.flakiness_score >= 10 ? 'text-med' : 'text-low'}`}>
              {summary.flakiness_score.toFixed(2)}
            </span>
          </div>
          <div className="metric-box">
            <span className="metric-label">Recovery Rate</span>
            <span className="metric-value">
              {(summary.retry_recovery_rate * 100).toFixed(1)}%
            </span>
          </div>
          <div className="metric-box">
            <span className="metric-label">Failure/Error Rate</span>
            <span className="metric-value">
              {(summary.failure_error_rate * 100).toFixed(1)}%
            </span>
          </div>
          <div className="metric-box">
            <span className="metric-label">Classification</span>
            <span className={getClassificationBadgeClass(summary.classification)}>
              {summary.classification}
            </span>
          </div>
          <div className="metric-box">
            <span className="metric-label">Current Triage Status</span>
            <span className={getTriageBadgeClass(currentStatus)}>
              {currentStatus}
            </span>
          </div>
        </div>

        <div className="triage-action-section">
          <div className="triage-action-header">
            <span className="triage-action-title">Triage Actions</span>
            {updating && <span className="triage-updating-indicator">Updating status...</span>}
          </div>

          <div className="triage-button-group">
            <button
              type="button"
              className={`btn-action btn-triaged ${currentStatus === 'triaged' ? 'btn-active' : ''}`}
              disabled={updating || currentStatus === 'triaged'}
              onClick={() => handleTriageChange('triaged')}
            >
              {currentStatus === 'triaged' ? '✓ Marked as Triaged' : 'Mark as Triaged'}
            </button>
            <button
              type="button"
              className={`btn-action btn-quarantine ${currentStatus === 'quarantined' ? 'btn-active' : ''}`}
              disabled={updating || currentStatus === 'quarantined'}
              onClick={() => handleTriageChange('quarantined')}
            >
              {currentStatus === 'quarantined' ? '✓ Quarantined' : 'Quarantine'}
            </button>
            {currentStatus !== 'untriaged' && (
              <button
                type="button"
                className="btn-action btn-reset"
                disabled={updating}
                onClick={() => handleTriageChange('untriaged')}
              >
                Reset to Untriaged
              </button>
            )}
          </div>

          {actionError && (
            <div className="triage-error-message">
              <span>{actionError}</span>
            </div>
          )}
        </div>
      </header>

      <section className="detail-history-section card">
        <div className="card-header">
          <h2>CI Execution History & Retry Evidence</h2>
          <span className="record-count">{history ? history.length : 0} runs recorded (newest first)</span>
        </div>

        {(!history || history.length === 0) ? (
          <div className="empty-state">
            <p>No execution history recorded for this test.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="test-table history-table">
              <thead>
                <tr>
                  <th className="col-attempt">Attempt</th>
                  <th className="col-status">Status</th>
                  <th className="col-duration">Duration</th>
                  <th className="col-branch">Branch</th>
                  <th className="col-worker">Worker</th>
                  <th className="col-started">Started At</th>
                  <th className="col-runid">Run ID</th>
                  <th className="col-message">Error / Message</th>
                </tr>
              </thead>
              <tbody>
                {history.map((run, idx) => (
                  <tr key={`${run.run_id}-${run.attempt}-${idx}`} className={run.attempt > 1 ? 'row-retry' : ''}>
                    <td className="col-attempt">
                      <span className={run.attempt > 1 ? 'badge badge-retry' : 'badge badge-initial'}>
                        Attempt {run.attempt}
                      </span>
                    </td>
                    <td className="col-status">
                      <span className={getStatusBadgeClass(run.status)}>
                        {run.status}
                      </span>
                    </td>
                    <td className="col-duration">
                      {run.duration_ms !== null && run.duration_ms !== undefined ? `${run.duration_ms} ms` : '-'}
                    </td>
                    <td className="col-branch">
                      <span className="code-text">{run.branch || '-'}</span>
                    </td>
                    <td className="col-worker">
                      <span className="code-text">{run.worker || '-'}</span>
                    </td>
                    <td className="col-started">
                      {run.started_at ? run.started_at.replace('.000', '') : '-'}
                    </td>
                    <td className="col-runid">
                      <span className="code-text" title={run.run_id}>
                        {run.run_id ? run.run_id.substring(0, 8) + '...' : '-'}
                      </span>
                    </td>
                    <td className="col-message">
                      {run.message ? (
                        <span className="error-message" title={run.message}>
                          {run.message}
                        </span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
