import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

export default function Navbar({ metaLabel, onOpenSearch, onNavigateAuth }) {
  const { user, isAuthenticated, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
      }
    }

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dropdownOpen]);

  function handleSignOut() {
    setDropdownOpen(false);
    logout();
  }

  function handleSwitchAccount() {
    setDropdownOpen(false);
    if (onNavigateAuth) {
      onNavigateAuth();
    }
  }

  const avatarBackground = user?.avatarBg || 'linear-gradient(135deg, #6366f1, #8b5cf6)';
  const initials = user?.initials || (user?.name ? user.name.slice(0, 2).toUpperCase() : 'U');

  return (
    <header className="app-bar">
      <div className="app-bar-inner">
        <span className="app-mark">flaky test triage</span>
        {metaLabel && <span className="app-meta">{metaLabel}</span>}

        <div className="app-actions">
          {onOpenSearch && (
            <button
              type="button"
              className="kbd-hint"
              onClick={onOpenSearch}
              aria-label="Search tests"
            >
              <span>Search</span>
              <span aria-hidden="true">Ctrl K</span>
            </button>
          )}

          {/* Conditional Rendering based on Authentication State */}
          {!isAuthenticated ? (
            <button
              type="button"
              className="kbd-hint btn-auth-signin"
              onClick={onNavigateAuth}
              aria-label="Sign in to platform"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Sign In</span>
            </button>
          ) : (
            <div className="user-profile-wrapper" ref={dropdownRef}>
              <button
                type="button"
                className={`user-profile-btn ${dropdownOpen ? 'active' : ''}`}
                onClick={() => setDropdownOpen((open) => !open)}
                aria-expanded={dropdownOpen}
                aria-haspopup="true"
                aria-label="User account menu"
              >
                <div className="user-avatar" style={{ background: avatarBackground }}>
                  {initials}
                  <span className="user-status-dot" aria-hidden="true" />
                </div>
                <span className="user-name" title={user.name}>
                  {user.name}
                </span>
                <svg
                  className={`user-chevron ${dropdownOpen ? 'rotated' : ''}`}
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Interactive Dropdown Menu */}
              {dropdownOpen && (
                <div className="user-dropdown-menu" role="menu">
                  {/* User Profile Header */}
                  <div className="dropdown-header-card">
                    <div className="dropdown-avatar-large" style={{ background: avatarBackground }}>
                      {initials}
                    </div>
                    <div className="dropdown-user-info">
                      <span className="dropdown-user-name">{user.name}</span>
                      <span className="dropdown-user-email" title={user.email}>
                        {user.email}
                      </span>
                      <span className="dropdown-user-role">
                        {user.role || 'Platform Engineer'}
                      </span>
                    </div>
                  </div>

                  <div className="dropdown-divider" />

                  {/* Account & Session Details */}
                  <div className="dropdown-meta-section">
                    <div className="dropdown-meta-row">
                      <span className="dropdown-meta-label">Session:</span>
                      <span className="dropdown-meta-badge">● Active</span>
                    </div>
                    <div className="dropdown-meta-row">
                      <span className="dropdown-meta-label">Provider:</span>
                      <span className="dropdown-meta-value">
                        {user.provider ? user.provider.toUpperCase() : 'EMAIL'}
                      </span>
                    </div>
                    {user.loginAt && (
                      <div className="dropdown-meta-row">
                        <span className="dropdown-meta-label">Logged In:</span>
                        <span className="dropdown-meta-value">{user.loginAt}</span>
                      </div>
                    )}
                  </div>

                  <div className="dropdown-divider" />

                  {/* Actions */}
                  <div className="dropdown-actions">
                    <button
                      type="button"
                      className="dropdown-item-btn"
                      onClick={handleSwitchAccount}
                      role="menuitem"
                    >
                      <svg
                        className="dropdown-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      <span>Switch Account</span>
                    </button>

                    <button
                      type="button"
                      className="dropdown-item-btn btn-signout"
                      onClick={handleSignOut}
                      role="menuitem"
                    >
                      <svg
                        className="dropdown-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
