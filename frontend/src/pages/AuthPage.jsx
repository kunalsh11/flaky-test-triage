import React, { useState, useId, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import './AuthPage.css';

// SVG Icons
function GoogleIcon() {
  return (
    <svg className="auth-social-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="auth-social-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

export default function AuthPage({ onNavigateDashboard }) {
  const { login } = useAuth();
  const [activeTab, setActiveTab] = useState('signin'); // 'signin' | 'signup'
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockActive, setCapsLockActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', message: string }
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  // Validation Errors
  const [errors, setErrors] = useState({});

  // Password strength logic
  const passwordStrength = calculateStrength(password);

  function calculateStrength(pwd) {
    if (!pwd) return { score: 0, label: 'None' };
    let score = 0;
    if (pwd.length >= 8) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    const labels = ['Weak', 'Weak', 'Fair', 'Good', 'Strong'];
    return {
      score,
      label: labels[score] || 'Strong',
    };
  }

  function handleKeyUp(e) {
    if (e.getModifierState) {
      setCapsLockActive(e.getModifierState('CapsLock'));
    }
  }

  function validate() {
    const errs = {};
    if (activeTab === 'signup' && !name.trim()) {
      errs.name = 'Full name is required';
    }
    if (!email.trim()) {
      errs.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = 'Please enter a valid work email';
    }

    if (!password) {
      errs.password = 'Password is required';
    } else if (activeTab === 'signup' && password.length < 8) {
      errs.password = 'Password must be at least 8 characters';
    }

    if (activeTab === 'signup' && !agreeTerms) {
      errs.agree = 'You must accept the terms of service';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setToast(null);

    // Simulated API authentication call with realistic latency
    setTimeout(() => {
      setLoading(false);

      const displayName =
        name.trim() ||
        email
          .split('@')[0]
          .replace(/[._]/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
      const initials =
        displayName
          .split(' ')
          .map((w) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase() || 'US';

      login({
        name: displayName,
        email: email.trim(),
        initials,
        role: 'Staff Platform Engineer',
        provider: 'email',
        avatarBg: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        loginAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });

      setToast({
        type: 'success',
        message:
          activeTab === 'signin'
            ? 'Welcome back! Authentication successful.'
            : 'Account created! Redirecting to triage dashboard...',
      });

      // Automatically transition to the dashboard after a short delay
      setTimeout(() => {
        if (onNavigateDashboard) {
          onNavigateDashboard();
        }
      }, 1000);
    }, 900);
  }

  function handleSocialLogin(provider) {
    setLoading(true);
    setToast(null);
    setTimeout(() => {
      setLoading(false);

      const socialUser =
        provider === 'Google'
          ? {
              name: 'Alex Rivera',
              email: 'alex.rivera@infra.dev',
              initials: 'AR',
              role: 'DevOps Lead',
              provider: 'google',
              avatarBg: 'linear-gradient(135deg, #4285F4, #34A853)',
              loginAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }
          : {
              name: 'Kunal Singh',
              email: 'kunal@github.user',
              initials: 'KS',
              role: 'Infrastructure Architect',
              provider: 'github',
              avatarBg: 'linear-gradient(135deg, #24292e, #6366f1)',
              loginAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };

      login(socialUser);

      setToast({
        type: 'success',
        message: `Authenticated with ${provider}! Redirecting...`,
      });
      setTimeout(() => {
        if (onNavigateDashboard) {
          onNavigateDashboard();
        }
      }, 800);
    }, 700);
  }

  function handleSendReset(e) {
    e.preventDefault();
    if (!resetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)) {
      alert('Please enter a valid email address');
      return;
    }
    setResetSent(true);
    setTimeout(() => {
      setResetSent(false);
      setForgotModalOpen(false);
      setToast({
        type: 'success',
        message: `Password reset link dispatched to ${resetEmail}.`,
      });
      setResetEmail('');
    }, 1200);
  }

  return (
    <div className="auth-page">
      {/* Background Animated Gradient Glow Orbs */}
      <div className="auth-ambient-glow" aria-hidden="true">
        <div className="auth-ambient-orb auth-orb-1" />
        <div className="auth-ambient-orb auth-orb-2" />
        <div className="auth-ambient-orb auth-orb-3" />
      </div>

      {/* ====================================================================
          LEFT SIDE: IMMERSIVE BRAND VISUAL (50/50 Desktop Split)
          ==================================================================== */}
      <aside className="auth-visual-panel">
        <div className="auth-brand-header">
          <a href="#" className="auth-brand-logo" onClick={(e) => { e.preventDefault(); if (onNavigateDashboard) onNavigateDashboard(); }}>
            <div className="auth-brand-icon-box">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20" />
                <path d="m17 5-5-3-5 3" />
                <path d="m17 19-5 3-5-3" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <span className="auth-brand-name">
              FlakyTest<span>Triage</span>
            </span>
          </a>

          <div className="auth-live-badge">
            <span className="auth-pulse-dot" />
            <span>Telemetry v2.4 Live</span>
          </div>
        </div>

        {/* Center Graphic Hero & Value Proposition */}
        <div className="auth-visual-hero">
          <div className="auth-hero-title-group">
            <h2>
              Stop chasing phantom bugs. <br />
              <span className="auth-gradient-text">Triage CI with mathematical certainty.</span>
            </h2>
            <p className="auth-hero-subtitle">
              Distinguish genuine broken tests from intermittent retries using explainable, data-driven retry-recovery scoring.
            </p>
          </div>

          {/* Interactive Floating Glass Cards */}
          <div className="auth-floating-canvas" aria-hidden="true">
            {/* Card 1: Pipeline Reliability Metric */}
            <div className="auth-glass-card auth-metric-card">
              <div className="auth-card-top">
                <span className="auth-card-label">Pipeline Confidence</span>
                <span className="auth-card-status-pill">Active Audit</span>
              </div>
              <div className="auth-metric-value-row">
                <span className="auth-metric-large">98.4%</span>
                <span className="auth-metric-delta">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                  +4.2%
                </span>
              </div>
              <div className="auth-metric-bar-wrapper">
                <div className="auth-metric-bar-fill" />
              </div>
            </div>

            {/* Card 2: Retry Recovery Smoking Gun Evidence */}
            <div className="auth-glass-card auth-evidence-card">
              <div className="auth-card-top">
                <span className="auth-card-label">Retry-Recovery Detected</span>
                <span className="auth-card-status-pill" style={{ borderColor: 'rgba(16, 185, 129, 0.4)', color: '#10b981' }}>
                  Proven Flake
                </span>
              </div>
              <div className="auth-evidence-flow">
                <span className="auth-step-pill auth-step-fail">Attempt 1 : Fail</span>
                <span className="auth-arrow-icon">➔</span>
                <span className="auth-step-pill auth-step-pass">Attempt 2 : Pass</span>
              </div>
              <p className="auth-evidence-caption">
                Identical commit &amp; environment confirmed non-deterministic flakiness.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Social Proof / Customer Endorsement */}
        <div className="auth-visual-footer">
          <p className="auth-quote">
            "Eliminated 40+ engineering hours spent chasing non-deterministic test failures every sprint."
          </p>
          <div className="auth-quote-author">
            <div className="auth-author-avatar">PS</div>
            <div className="auth-author-meta">
              <div className="auth-author-name">Priya Sharma</div>
              <div className="auth-author-role">Staff Platform Engineer @ Enterprise CI</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ====================================================================
          RIGHT SIDE: MODERN AUTHENTICATION FORM
          ==================================================================== */}
      <main className="auth-form-panel">
        <div className="auth-form-container">
          {/* Quick Exit Navigation Link */}
          {onNavigateDashboard && (
            <div className="auth-back-nav">
              <button
                type="button"
                className="auth-back-btn"
                onClick={onNavigateDashboard}
                aria-label="Back to Triage Dashboard"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                Back to Live Dashboard
              </button>
            </div>
          )}

          {/* Form Header */}
          <header className="auth-form-header">
            <h1>{activeTab === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
            <p>
              {activeTab === 'signin'
                ? 'Sign in to access real-time test triage & pipeline telemetry'
                : 'Join top infrastructure engineering teams triaging CI flakiness'}
            </p>
          </header>

          {/* Animated Tab Switcher (Pill Slider) */}
          <div className="auth-tab-switch" role="tablist">
            <div
              className={`auth-tab-slider ${activeTab === 'signin' ? 'slider-left' : 'slider-right'}`}
              aria-hidden="true"
            />
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'signin'}
              className={`auth-tab-btn ${activeTab === 'signin' ? 'active' : ''}`}
              onClick={() => { setActiveTab('signin'); setErrors({}); setToast(null); }}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'signup'}
              className={`auth-tab-btn ${activeTab === 'signup' ? 'active' : ''}`}
              onClick={() => { setActiveTab('signup'); setErrors({}); setToast(null); }}
            >
              Create Account
            </button>
          </div>

          {/* Toast Notification Banner */}
          {toast && (
            <div className={`auth-toast ${toast.type === 'success' ? 'auth-toast-success' : 'auth-toast-error'}`} role="status">
              {toast.type === 'success' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
              <span>{toast.message}</span>
            </div>
          )}

          {/* Social Login Buttons */}
          <div className="auth-social-grid">
            <button
              type="button"
              className="auth-social-btn"
              onClick={() => handleSocialLogin('Google')}
              disabled={loading}
            >
              <GoogleIcon />
              <span>Google</span>
            </button>
            <button
              type="button"
              className="auth-social-btn"
              onClick={() => handleSocialLogin('GitHub')}
              disabled={loading}
            >
              <GitHubIcon />
              <span>GitHub</span>
            </button>
          </div>

          {/* Divider */}
          <div className="auth-divider" aria-hidden="true">
            <div className="auth-divider-line" />
            <span className="auth-divider-text">Or continue with email</span>
            <div className="auth-divider-line" />
          </div>

          {/* Main Credentials Form */}
          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {/* Full Name Field (Sign Up Only) */}
            {activeTab === 'signup' && (
              <div className="auth-field-group auth-view-enter">
                <label className="auth-field-label" htmlFor="auth-name">
                  Full Name
                </label>
                <div className={`auth-input-wrapper ${errors.name ? 'input-error' : ''}`}>
                  <UserIcon />
                  <input
                    id="auth-name"
                    type="text"
                    className="auth-input"
                    placeholder="Alex Morgan"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    disabled={loading}
                  />
                </div>
                {errors.name && <span className="auth-field-error">{errors.name}</span>}
              </div>
            )}

            {/* Work Email Field */}
            <div className="auth-field-group">
              <label className="auth-field-label" htmlFor="auth-email">
                Work Email
              </label>
              <div className={`auth-input-wrapper ${errors.email ? 'input-error' : ''}`}>
                <MailIcon />
                <input
                  id="auth-email"
                  type="email"
                  className="auth-input"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
              {errors.email && <span className="auth-field-error">{errors.email}</span>}
            </div>

            {/* Password Field */}
            <div className="auth-field-group">
              <div className="auth-field-label-row">
                <label className="auth-field-label" htmlFor="auth-password">
                  Password
                </label>
                {activeTab === 'signin' && (
                  <button
                    type="button"
                    className="auth-forgot-link"
                    onClick={() => setForgotModalOpen(true)}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className={`auth-input-wrapper ${errors.password ? 'input-error' : ''}`}>
                <LockIcon />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={handleKeyUp}
                  autoComplete={activeTab === 'signin' ? 'current-password' : 'new-password'}
                  disabled={loading}
                />
                {capsLockActive && (
                  <span className="auth-caps-warning" title="Caps Lock is ON">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 3v14" />
                      <path d="m5 10 7-7 7 7" />
                      <line x1="5" x2="19" y1="21" y2="21" />
                    </svg>
                    CAPS
                  </span>
                )}
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {errors.password && <span className="auth-field-error">{errors.password}</span>}

              {/* Password Strength Meter (Sign Up Only) */}
              {activeTab === 'signup' && password.length > 0 && (
                <div className="auth-strength-meter">
                  <div className="auth-strength-bars">
                    <div className={`auth-strength-bar ${passwordStrength.score >= 1 ? `active-${passwordStrength.label.toLowerCase()}` : ''}`} />
                    <div className={`auth-strength-bar ${passwordStrength.score >= 2 ? `active-${passwordStrength.label.toLowerCase()}` : ''}`} />
                    <div className={`auth-strength-bar ${passwordStrength.score >= 3 ? `active-${passwordStrength.label.toLowerCase()}` : ''}`} />
                    <div className={`auth-strength-bar ${passwordStrength.score >= 4 ? `active-${passwordStrength.label.toLowerCase()}` : ''}`} />
                  </div>
                  <div className="auth-strength-text">
                    <span>Password strength: <strong>{passwordStrength.label}</strong></span>
                    <span>{password.length}/8+ chars</span>
                  </div>
                </div>
              )}
            </div>

            {/* Checkbox Options (Remember Me / Agree to terms) */}
            {activeTab === 'signin' ? (
              <label className="auth-checkbox-label">
                <input
                  type="checkbox"
                  className="auth-checkbox-input"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span className="auth-custom-checkbox">
                  <svg className="auth-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span>Remember this workstation for 30 days</span>
              </label>
            ) : (
              <div className="auth-field-group">
                <label className="auth-checkbox-label">
                  <input
                    type="checkbox"
                    className="auth-checkbox-input"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                  />
                  <span className="auth-custom-checkbox">
                    <svg className="auth-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <span>
                    I agree to the <a href="#terms" className="auth-legal-link">Terms of Service</a> and{' '}
                    <a href="#privacy" className="auth-legal-link">Privacy Policy</a>
                  </span>
                </label>
                {errors.agree && <span className="auth-field-error">{errors.agree}</span>}
              </div>
            )}

            {/* Primary Submit Button */}
            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? (
                <>
                  <span className="auth-spinner" />
                  <span>{activeTab === 'signin' ? 'Authenticating...' : 'Creating Account...'}</span>
                </>
              ) : (
                <>
                  <span>{activeTab === 'signin' ? 'Sign In to Dashboard' : 'Get Started with Triage'}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Bottom Switch View Link */}
          <div className="auth-bottom-switch">
            {activeTab === 'signin' ? (
              <span>
                Don't have an account?{' '}
                <button
                  type="button"
                  className="auth-switch-link"
                  onClick={() => { setActiveTab('signup'); setErrors({}); setToast(null); }}
                >
                  Create one now
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  className="auth-switch-link"
                  onClick={() => { setActiveTab('signin'); setErrors({}); setToast(null); }}
                >
                  Sign in instead
                </button>
              </span>
            )}
          </div>

          {/* Security & Compliance Trust Badge */}
          <div className="auth-security-badge" aria-label="Security standards">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>SOC2 Type II Certified • 256-Bit TLS</span>
          </div>
        </div>
      </main>

      {/* ====================================================================
          FORGOT PASSWORD MODAL DIALOG
          ==================================================================== */}
      {forgotModalOpen && (
        <div
          className="auth-modal-backdrop"
          onClick={() => setForgotModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-modal-title"
        >
          <div className="auth-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="auth-modal-header">
              <h3 id="forgot-modal-title">Reset your password</h3>
              <button
                type="button"
                className="auth-modal-close"
                onClick={() => setForgotModalOpen(false)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>
            <p style={{ color: 'var(--auth-text-secondary)', fontSize: '0.9rem', marginBottom: '1.25rem', lineHeight: '1.5' }}>
              Enter your work email address below and we'll send a secure magic recovery link.
            </p>

            <form onSubmit={handleSendReset}>
              <div className="auth-field-group" style={{ marginBottom: '1.25rem' }}>
                <label className="auth-field-label" htmlFor="reset-email">Work Email</label>
                <div className="auth-input-wrapper">
                  <MailIcon />
                  <input
                    id="reset-email"
                    type="email"
                    className="auth-input"
                    placeholder="name@company.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="auth-back-btn"
                  onClick={() => setForgotModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="auth-submit-btn"
                  style={{ marginTop: 0, padding: '0.65rem 1.25rem' }}
                  disabled={resetSent}
                >
                  {resetSent ? 'Dispatching...' : 'Send Recovery Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
