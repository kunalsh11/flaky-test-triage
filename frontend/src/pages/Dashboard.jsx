import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getRankedTests } from '../services/api';
import TestTable from '../components/TestTable';
import FilterBar from '../components/FilterBar';

export default function Dashboard({ onSelectTest }) {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [branch, setBranch] = useState('All');
  const [suite, setSuite] = useState('All Suites');
  const [classification, setClassification] = useState('All');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);

  async function fetchTests(activeFilters = {}) {
    try {
      setLoading(true);
      setError(null);
      const data = await getRankedTests(activeFilters);
      setTests(data);
    } catch (err) {
      setError(err.message || 'Failed to connect to backend server');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTests();
  }, []);

  // Summary figures are derived from the live response - never hard-coded.
  const summary = useMemo(() => {
    const counts = { flaky: 0, broken: 0, quarantined: 0 };
    for (const t of tests) {
      if (t.classification === 'Likely Flaky') counts.flaky++;
      if (t.classification === 'Likely Broken') counts.broken++;
      if (t.triage_status === 'quarantined') counts.quarantined++;
    }
    return counts;
  }, [tests]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q ? tests.filter((t) => t.test_id.toLowerCase().includes(q)) : tests;
    return pool.slice(0, 40);
  }, [tests, query]);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (!paletteOpen) return;
      if (e.key === 'Escape') {
        setPaletteOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, matches.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === 'Enter' && matches[cursor]) {
        e.preventDefault();
        setPaletteOpen(false);
        onSelectTest(matches[cursor].test_id);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paletteOpen, matches, cursor, onSelectTest]);

  useEffect(() => {
    if (paletteOpen) {
      setQuery('');
      setCursor(0);
      if (inputRef.current) inputRef.current.focus({ preventScroll: true });
    }
  }, [paletteOpen]);

  function handleApply() {
    fetchTests({
      branch: branch !== 'All' ? branch : undefined,
      suite: suite !== 'All Suites' && suite !== 'All' ? suite : undefined,
      classification: classification !== 'All' ? classification : undefined,
      from: from || undefined,
      to: to || undefined,
    });
  }

  function handleReset() {
    setBranch('All');
    setSuite('All Suites');
    setClassification('All');
    setFrom('');
    setTo('');
    fetchTests({});
  }

  const metaLabel = loading ? 'loading' : tests.length + ' tests ranked';

  return (
    <>
      <div className="app-bar">
        <div className="app-bar-inner">
          <span className="app-mark">flaky test triage</span>
          <span className="app-meta">{metaLabel}</span>
          <button
            type="button"
            className="kbd-hint"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search tests"
          >
            <span>Search</span>
            <span aria-hidden="true">Ctrl K</span>
          </button>
        </div>
      </div>

      <div className="dashboard-container">
        <header className="dashboard-header">
          <h1>Ranked by flakiness</h1>
          <p className="subtitle">
            Scored on retry recovery and failure rate across executed CI runs. Highest first.
          </p>
        </header>

        {!loading && !error && tests.length > 0 && (
          <div className="stat-strip reveal">
            <div className="stat-cell">
              <span className="stat-figure">{tests.length}</span>
              <span className="stat-label">tests ranked</span>
            </div>
            <div className="stat-cell" data-tone="flaky">
              <span className="stat-figure">{summary.flaky}</span>
              <span className="stat-label">likely flaky</span>
            </div>
            <div className="stat-cell" data-tone="broken">
              <span className="stat-figure">{summary.broken}</span>
              <span className="stat-label">likely broken</span>
            </div>
            <div className="stat-cell">
              <span className="stat-figure">{summary.quarantined}</span>
              <span className="stat-label">quarantined</span>
            </div>
          </div>
        )}

        <FilterBar
          branch={branch}
          onBranchChange={setBranch}
          suite={suite}
          onSuiteChange={setSuite}
          classification={classification}
          onClassificationChange={setClassification}
          from={from}
          onFromChange={setFrom}
          to={to}
          onToChange={setTo}
          onApply={handleApply}
          onReset={handleReset}
          loading={loading}
        />

        <main className="dashboard-main">
          {loading && (
            <div className="status-box loading-box">
              <p>Loading test rankings from backend...</p>
            </div>
          )}

          {error && (
            <div className="status-box error-box">
              <p><strong>Error:</strong> {error}</p>
              <p className="error-hint">Ensure the backend server is running on port 3000.</p>
            </div>
          )}

          {!loading && !error && (
            <div className="card">
              <TestTable tests={tests} onSelectTest={onSelectTest} />
            </div>
          )}
        </main>
      </div>

      <footer className="app-footer">
        <div className="app-footer-inner">
          <span>flakiness = 0.60 x retry recovery + 0.40 x failure rate</span>
          <span>rates measured over executed runs</span>
        </div>
      </footer>

      {paletteOpen && (
        <div className="cmdk-backdrop" onClick={() => setPaletteOpen(false)}>
          <div
            className="cmdk-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Search tests"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              className="cmdk-input"
              type="text"
              placeholder="Search tests..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            />
            <div className="cmdk-list" role="listbox" aria-label="Matching tests">
              {matches.length === 0 && (
                <p className="cmdk-empty">No test matches that search.</p>
              )}
              {matches.map((t, i) => (
                <button
                  key={t.test_id}
                  type="button"
                  className="cmdk-row"
                  role="option"
                  aria-selected={i === cursor}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => { setPaletteOpen(false); onSelectTest(t.test_id); }}
                >
                  <span className="cmdk-name">{t.test_id}</span>
                  <span className="cmdk-score">{t.flakiness_score.toFixed(2)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
