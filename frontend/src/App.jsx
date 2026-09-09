import React, { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import TestDetail from './components/TestDetail';
import './App.css';

export default function App() {
  const [selectedTestId, setSelectedTestId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('test_id') || null;
  });

  useEffect(() => {
    function handlePopState() {
      const params = new URLSearchParams(window.location.search);
      setSelectedTestId(params.get('test_id') || null);
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function handleSelectTest(testId) {
    setSelectedTestId(testId);
    const newUrl = testId ? `?test_id=${encodeURIComponent(testId)}` : window.location.pathname;
    window.history.pushState({}, '', newUrl);
  }

  function handleBack() {
    setSelectedTestId(null);
    window.history.pushState({}, '', window.location.pathname);
  }

  return (
    <div className="app">
      {selectedTestId ? (
        <TestDetail testId={selectedTestId} onBack={handleBack} />
      ) : (
        <Dashboard onSelectTest={handleSelectTest} />
      )}
    </div>
  );
}
