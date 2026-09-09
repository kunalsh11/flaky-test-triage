import React, { useEffect, useState } from 'react';
import { getRankedTests } from '../services/api';
import TestTable from '../components/TestTable';
import FilterBar from '../components/FilterBar';

export default function Dashboard({ onSelectTest }) {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [branch, setBranch] = useState('All');
  const [classification, setClassification] = useState('All');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

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

  function handleApply() {
    fetchTests({
      branch: branch !== 'All' ? branch : undefined,
      classification: classification !== 'All' ? classification : undefined,
      from: from || undefined,
      to: to || undefined,
    });
  }

  function handleReset() {
    setBranch('All');
    setClassification('All');
    setFrom('');
    setTo('');
    fetchTests({});
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Flaky Test Triage</h1>
        <p className="subtitle">Identify and triage unreliable CI tests.</p>
      </header>

      <FilterBar
        branch={branch}
        onBranchChange={setBranch}
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
  );
}
