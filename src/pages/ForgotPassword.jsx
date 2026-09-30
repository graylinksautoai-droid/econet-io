/**
 * ForgotPassword — /forgot-password (noChrome auth page)
 * No MainLayout wrapper. EcoShell with noChrome=true provides planet bg.
 */
import { useState } from 'react';

export default function ForgotPassword({ onNavigate }) {
  const [email,     setEmail]     = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: wire to backend password-reset endpoint
    setSubmitted(true);
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/econet-logo.jpeg" alt="EcoNet IO"
            className="w-14 h-14 rounded-2xl object-cover shadow-2xl mb-3"
            style={{ border: '2px solid rgba(34,197,94,0.4)' }} />
          <h1 className="text-xl font-bold text-white">Reset your password</h1>
        </div>

        {/* Card */}
        <div className="rounded-[var(--eco-radius-card)] p-6"
          style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border)', boxShadow: 'var(--eco-shadow-card)' }}>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs font-medium mb-1.5"
                  style={{ color: 'var(--eco-text-secondary)' }}>
                  Email address
                </label>
                <input
                  id="email" type="email" required autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white placeholder:text-[var(--eco-text-muted)] outline-none transition-all"
                  style={{ background: 'var(--eco-bg-elevated)', border: '1px solid var(--eco-border)' }}
                />
              </div>
              <button type="submit"
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-black transition-opacity hover:opacity-90"
                style={{ background: 'var(--eco-green)' }}>
                Send reset link
              </button>
              <p className="text-center text-xs" style={{ color: 'var(--eco-text-muted)' }}>
                <button type="button" onClick={() => onNavigate('/login')}
                  className="font-medium hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--eco-green)' }}>
                  Back to sign in
                </button>
              </p>
            </form>
          ) : (
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="#22c55e" strokeWidth={2} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l3 3 7-7" />
                </svg>
              </div>
              <p className="text-sm text-white font-medium">Check your email</p>
              <p className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>
                If an account exists with that email, we've sent a reset link.
              </p>
              <button onClick={() => onNavigate('/login')}
                className="text-xs font-medium hover:opacity-70 transition-opacity"
                style={{ color: 'var(--eco-green)' }}>
                Return to sign in
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
