import React, { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import TestDetail from './components/TestDetail';
import AuthPage from './pages/AuthPage';
import './App.css';

export default function App() {
  const [selectedTestId, setSelectedTestId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('test_id') || null;
  });

  const [isAuthView, setIsAuthView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('auth') === 'true';
  });

  useEffect(() => {
    function handlePopState() {
      const params = new URLSearchParams(window.location.search);
      setSelectedTestId(params.get('test_id') || null);
      setIsAuthView(params.get('auth') === 'true');
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function handleSelectTest(testId) {
    setIsAuthView(false);
    setSelectedTestId(testId);
    const newUrl = testId ? `?test_id=${encodeURIComponent(testId)}` : window.location.pathname;
    window.history.pushState({}, '', newUrl);
  }

  function handleBack() {
    setSelectedTestId(null);
    setIsAuthView(false);
    window.history.pushState({}, '', window.location.pathname);
  }

  function handleGoToAuth() {
    setSelectedTestId(null);
    setIsAuthView(true);
    window.history.pushState({}, '', '?auth=true');
  }

  function handleBackToDashboard() {
    setIsAuthView(false);
    window.history.pushState({}, '', window.location.pathname);
  }

  if (isAuthView) {
    return <AuthPage onNavigateDashboard={handleBackToDashboard} />;
  }

  return (
    <div className="app">
      {selectedTestId ? (
        <TestDetail testId={selectedTestId} onBack={handleBack} onNavigateAuth={handleGoToAuth} />
      ) : (
        <Dashboard onSelectTest={handleSelectTest} onNavigateAuth={handleGoToAuth} />
      )}
    </div>
  );
}

