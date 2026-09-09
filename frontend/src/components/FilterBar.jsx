import React from 'react';

const BRANCH_OPTIONS = [
  'All',
  'main',
  'feature/PLAT-101',
  'feature/PLAT-102',
  'feature/PLAT-103',
  'feature/PLAT-104',
  'feature/PLAT-105',
  'feature/PLAT-106',
  'feature/PLAT-107',
  'feature/PLAT-108',
  'feature/PLAT-109',
  'feature/PLAT-110',
  'feature/PLAT-111',
  'feature/PLAT-112',
  'feature/PLAT-113',
  'feature/PLAT-114',
  'feature/PLAT-115',
  'feature/PLAT-116',
  'feature/PLAT-117',
];

const CLASSIFICATION_OPTIONS = [
  'All',
  'Likely Flaky',
  'Likely Broken',
  'Possible Flake',
  'Stable',
];

export default function FilterBar({
  branch,
  onBranchChange,
  classification,
  onClassificationChange,
  from,
  onFromChange,
  to,
  onToChange,
  onApply,
  onReset,
  loading,
}) {
  return (
    <div className="filter-bar card">
      <div className="filter-grid">
        <div className="filter-group">
          <label htmlFor="filter-branch" className="filter-label">Branch:</label>
          <select
            id="filter-branch"
            className="filter-select"
            value={branch}
            onChange={(e) => onBranchChange(e.target.value)}
            disabled={loading}
          >
            {BRANCH_OPTIONS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-classification" className="filter-label">Classification:</label>
          <select
            id="filter-classification"
            className="filter-select"
            value={classification}
            onChange={(e) => onClassificationChange(e.target.value)}
            disabled={loading}
          >
            {CLASSIFICATION_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-from" className="filter-label">From:</label>
          <input
            id="filter-from"
            type="date"
            className="filter-input"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
            disabled={loading}
            placeholder="YYYY-MM-DD"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="filter-to" className="filter-label">To:</label>
          <input
            id="filter-to"
            type="date"
            className="filter-input"
            value={to}
            onChange={(e) => onToChange(e.target.value)}
            disabled={loading}
            placeholder="YYYY-MM-DD"
          />
        </div>

        <div className="filter-actions">
          <button
            type="button"
            className="btn-filter-apply"
            onClick={onApply}
            disabled={loading}
          >
            Apply Filters
          </button>
          <button
            type="button"
            className="btn-filter-reset"
            onClick={onReset}
            disabled={loading}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
