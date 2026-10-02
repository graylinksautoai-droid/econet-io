/**
 * ForgotPassword — /forgot-password and /reset-password
 *
 * Wired to the real backend endpoints:
 *   POST /api/auth/forgot-password  — sends reset email
 *   POST /api/auth/reset-password   — sets new password from token
 *
 * mode="reset" is passed by App.jsx when the route is /reset-password.
 * The token and email are read from the URL query string (?token=...&email=...).
 *
 * Security:
 *   - Reset tokens are never logged or displayed to the user.
 *   - The backend always returns the same message whether the email exists or not.
 *   - Token is sent to the backend only — never shown in the UI.
 */
import { useState, useEffect } from 'react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { getApiBaseUrl } from '../services/runtimeConfig.js';

export default function ForgotPassword({ onNavigate, mode }) {
  const isReset = mode === 'reset';

  // ── Forgot-password state ────────────────────────────────────────────────
  const [email,     setEmail]     = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  // ── Reset-password state (mode=reset) ────────────────────────────────────
  const [newPassword,   setNewPassword]   = useState('');
  const [showPassword,  setShowPassword]  = useState(false);
  const [resetDone,     setResetDone]     = useState(false);
  const [tokenFromUrl,  setTokenFromUrl]  = useState('');
  const [emailFromUrl,  setEmailFromUrl]  = useState('');

  useEffect(() => {
    if (isReset) {
      const p = new URLSearchParams(window.location.search);
      setTokenFromUrl(p.get('token') || '');
      setEmailFromUrl(p.get('email') || '');
    }
  }, [isReset]);

  // ── Forgot-password submit ────────────────────────────────────────────────
  const handleForgot = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const base = getApiBaseUrl();
      const res  = await fetch(`${base}/auth/forgot-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      setSubmitted(true);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Reset-password submit ─────────────────────────────────────────────────
  const handleReset = async (e) => {
    e.preventDefault();
    if (!tokenFromUrl || !emailFromUrl) {
      setError('Invalid reset link. Please request a new one.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const base = getApiBaseUrl();
      const res  = await fetch(`${base}/auth/reset-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          token:    tokenFromUrl,
          email:    emailFromUrl,
          password: newPassword
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Reset failed. The link may have expired.');
        return;
      }
      setResetDone(true);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full px-3.5 py-2.5 rounded-xl text-sm text-white placeholder:text-[var(--eco-text-muted)] outline-none transition-all";
  const inputSty = { background: 'var(--eco-bg-elevated)', border: '1px solid var(--eco-border)' };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/econet-logo.jpeg" alt="EcoNet IO"
            className="w-14 h-14 rounded-2xl object-cover shadow-2xl mb-3"
            style={{ border: '2px solid rgba(34,197,94,0.4)' }} />
          <h1 className="text-xl font-bold text-white">
            {isReset ? 'Set new password' : 'Reset your password'}
          </h1>
        </div>

        <div className="rounded-[var(--eco-radius-card)] p-6"
          style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border)', boxShadow: 'var(--eco-shadow-card)' }}>

          {/* ── Forgot: success state ─────────────────────────────────────── */}
          {submitted && !isReset && (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="#22c55e" strokeWidth={2} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l3 3 7-7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-white">Check your email</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--eco-text-muted)' }}>
                If an account exists for <strong className="text-white">{email}</strong>,
                we've sent a password reset link. Check your inbox and spam folder.
                The link expires in 1 hour.
              </p>
              <button onClick={() => onNavigate('/login')}
                className="text-xs font-medium hover:opacity-70 transition-opacity"
                style={{ color: 'var(--eco-green)' }}>
                Return to sign in
              </button>
            </div>
          )}

          {/* ── Reset: success state ─────────────────────────────────────── */}
          {resetDone && (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="#22c55e" strokeWidth={2} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l3 3 7-7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-white">Password updated</p>
              <p className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>
                Your password has been changed. You can now sign in.
              </p>
              <button onClick={() => onNavigate('/login')}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-black transition-opacity hover:opacity-90"
                style={{ background: 'var(--eco-green)' }}>
                Sign in
              </button>
            </div>
          )}

          {/* ── Forgot: form ─────────────────────────────────────────────── */}
          {!submitted && !isReset && (
            <form onSubmit={handleForgot} className="space-y-4">
              <p className="text-xs mb-2" style={{ color: 'var(--eco-text-secondary)' }}>
                Enter your account email and we'll send you a reset link.
              </p>
              <div>
                <label htmlFor="fp-email" className="block text-xs font-medium mb-1.5"
                  style={{ color: 'var(--eco-text-secondary)' }}>Email address</label>
                <input id="fp-email" type="email" required autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputCls} style={inputSty} />
              </div>

              {error && (
                <div className="px-3 py-2 rounded-lg text-sm text-red-300 bg-red-900/30 border border-red-500/20">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-black transition-opacity disabled:opacity-50 hover:opacity-90"
                style={{ background: 'var(--eco-green)' }}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>

              <p className="text-center text-xs" style={{ color: 'var(--eco-text-muted)' }}>
                <button type="button" onClick={() => onNavigate('/login')}
                  className="font-medium hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--eco-green)' }}>
                  Back to sign in
                </button>
              </p>
            </form>
          )}

          {/* ── Reset: form ──────────────────────────────────────────────── */}
          {isReset && !resetDone && (
            <form onSubmit={handleReset} className="space-y-4">
              {(!tokenFromUrl || !emailFromUrl) ? (
                <div className="px-3 py-2 rounded-lg text-sm text-red-300 bg-red-900/30 border border-red-500/20">
                  Invalid reset link. Please{' '}
                  <button type="button" onClick={() => onNavigate('/forgot-password')}
                    className="underline">request a new one</button>.
                </div>
              ) : (
                <>
                  <p className="text-xs mb-2" style={{ color: 'var(--eco-text-secondary)' }}>
                    Choose a new password for <strong className="text-white">{emailFromUrl}</strong>.
                  </p>
                  <div>
                    <label htmlFor="rp-password" className="block text-xs font-medium mb-1.5"
                      style={{ color: 'var(--eco-text-secondary)' }}>New password</label>
                    <div className="relative">
                      <input id="rp-password"
                        type={showPassword ? 'text' : 'password'}
                        required autoComplete="new-password"
                        value={newPassword} onChange={e => setNewPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        className={`${inputCls} pr-10`} style={inputSty} />
                      <button type="button" onClick={() => setShowPassword(v => !v)}
                        className="absolute inset-y-0 right-3 flex items-center"
                        style={{ color: 'var(--eco-text-muted)' }}>
                        {showPassword ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="px-3 py-2 rounded-lg text-sm text-red-300 bg-red-900/30 border border-red-500/20">
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={loading || newPassword.length < 6}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-black transition-opacity disabled:opacity-50 hover:opacity-90"
                    style={{ background: 'var(--eco-green)' }}>
                    {loading ? 'Updating…' : 'Set new password'}
                  </button>
                </>
              )}
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
