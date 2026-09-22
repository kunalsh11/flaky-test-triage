import React, { useEffect, useState, useMemo } from 'react';
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

  // History & Evidence filter states
  const [historyStatusFilter, setHistoryStatusFilter] = useState('All');
  const [historyAttemptFilter, setHistoryAttemptFilter] = useState('All');
  const [historyBranchFilter, setHistoryBranchFilter] = useState('All');
  const [historySearchQuery, setHistorySearchQuery] = useState('');

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

  const history = data?.history || [];

  // Extract unique branches from history for the dropdown
  const uniqueBranches = useMemo(() => {
    if (!history.length) return [];
    const branches = new Set();
    history.forEach((run) => {
      if (run.branch) branches.add(run.branch);
    });
    return Array.from(branches).sort((a, b) => {
      if (a === 'main') return -1;
      if (b === 'main') return 1;
      return a.localeCompare(b);
    });
  }, [history]);

  // Filter history records based on active filters
  const filteredHistory = useMemo(() => {
    if (!history.length) return [];
    return history.filter((run) => {
      // Status filter
      if (historyStatusFilter !== 'All' && run.status !== historyStatusFilter) {
        return false;
      }
      // Attempt filter
      if (historyAttemptFilter === 'retries' && run.attempt <= 1) {
        return false;
      }
      if (historyAttemptFilter === 'initial' && run.attempt > 1) {
        return false;
      }
      // Branch filter
      if (historyBranchFilter !== 'All' && run.branch !== historyBranchFilter) {
        return false;
      }
      // Text search in message, worker, run_id, commit_sha
      if (historySearchQuery.trim()) {
        const q = historySearchQuery.trim().toLowerCase();
        const matchMessage = run.message && run.message.toLowerCase().includes(q);
        const matchWorker = run.worker && run.worker.toLowerCase().includes(q);
        const matchRunId = run.run_id && run.run_id.toLowerCase().includes(q);
        const matchCommit = run.commit_sha && run.commit_sha.toLowerCase().includes(q);
        const matchBranch = run.branch && run.branch.toLowerCase().includes(q);
        if (!matchMessage && !matchWorker && !matchRunId && !matchCommit && !matchBranch) {
          return false;
        }
      }
      return true;
    });
  }, [history, historyStatusFilter, historyAttemptFilter, historyBranchFilter, historySearchQuery]);

  const hasActiveFilters =
    historyStatusFilter !== 'All' ||
    historyAttemptFilter !== 'All' ||
    historyBranchFilter !== 'All' ||
    historySearchQuery.trim() !== '';

  function handleResetHistoryFilters() {
    setHistoryStatusFilter('All');
    setHistoryAttemptFilter('All');
    setHistoryBranchFilter('All');
    setHistorySearchQuery('');
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

  const { summary } = data;
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
          <span className="record-count">
            {hasActiveFilters
              ? `Showing ${filteredHistory.length} of ${history.length} attempts`
              : `${history.length} attempts recorded (newest execution first, retries in order)`}
          </span>
        </div>

        {history.length > 0 && (
          <div className="history-filter-bar">
            <div className="history-filter-grid">
              <div className="history-filter-group">
                <label htmlFor="history-status-filter" className="history-filter-label">Status:</label>
                <select
                  id="history-status-filter"
                  className="history-filter-select"
                  value={historyStatusFilter}
                  onChange={(e) => setHistoryStatusFilter(e.target.value)}
                >
                  <option value="All">All Statuses</option>
                  <option value="passed">Passed</option>
                  <option value="failed">Failed</option>
                  <option value="error">Error</option>
                  <option value="skipped">Skipped</option>
                </select>
              </div>

              <div className="history-filter-group">
                <label htmlFor="history-attempt-filter" className="history-filter-label">Attempt:</label>
                <select
                  id="history-attempt-filter"
                  className="history-filter-select"
                  value={historyAttemptFilter}
                  onChange={(e) => setHistoryAttemptFilter(e.target.value)}
                >
                  <option value="All">All Attempts</option>
                  <option value="retries">Retries Only (Attempt &gt; 1)</option>
                  <option value="initial">Initial Runs Only (Attempt 1)</option>
                </select>
              </div>

              <div className="history-filter-group">
                <label htmlFor="history-branch-filter" className="history-filter-label">Branch:</label>
                <select
                  id="history-branch-filter"
                  className="history-filter-select"
                  value={historyBranchFilter}
                  onChange={(e) => setHistoryBranchFilter(e.target.value)}
                >
                  <option value="All">All Branches</option>
                  {uniqueBranches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div className="history-filter-group history-search-group">
                <label htmlFor="history-search-filter" className="history-filter-label">Search Evidence:</label>
                <input
                  id="history-search-filter"
                  type="text"
                  className="history-filter-input"
                  placeholder="Search error message, worker, commit, run ID..."
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                />
              </div>

              {hasActiveFilters && (
                <div className="history-filter-actions">
                  <button
                    type="button"
                    className="btn-history-reset"
                    onClick={handleResetHistoryFilters}
                  >
                    Clear Filters
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {history.length === 0 ? (
          <div className="empty-state">
            <p>No execution history recorded for this test.</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="empty-state">
            <p>No execution history matches the selected filters.</p>
            <button
              type="button"
              className="btn-history-reset"
              style={{ marginTop: '0.75rem' }}
              onClick={handleResetHistoryFilters}
            >
              Clear Filters
            </button>
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
                {filteredHistory.map((run, idx) => (
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
