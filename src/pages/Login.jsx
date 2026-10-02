/**
 * Login page — rebuilt for the new EcoNet IO visual system.
 * No MainLayout wrapper — auth pages use EcoShell with noChrome=true.
 * Backend: POST /api/auth/login via AuthContext.login()
 * Security: passwords never stored — email-only remember-me.
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { FaEye, FaEyeSlash } from 'react-icons/fa';

export default function Login({ onNavigate }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();

  // Restore remembered email. Passwords are NEVER stored client-side.
  useEffect(() => {
    localStorage.removeItem('rememberedPassword'); // legacy cleanup
    const saved = localStorage.getItem('rememberedEmail');
    if (saved) { setEmail(saved); setRemember(true); }
  }, []);

  const handleRememberChange = (e) => {
    setRemember(e.target.checked);
    if (!e.target.checked) localStorage.removeItem('rememberedEmail');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login({ email, password }, { remember });
      if (remember) localStorage.setItem('rememberedEmail', email);
      else localStorage.removeItem('rememberedEmail');
      // Redirect to the originally requested page, or home
      const redirect = sessionStorage.getItem('loginRedirect') || '/';
      sessionStorage.removeItem('loginRedirect');
      onNavigate(redirect);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
      {/* Atmospheric layers */}
      <div className="absolute inset-0 pointer-events-none">
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 100% 60% at 50% 100%, rgba(16,60,30,0.5) 0%, transparent 60%)',
        }} />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Real EcoNet logo */}
        <div className="flex flex-col items-center mb-8">
          <img
            src="/econet-logo.jpeg"
            alt="EcoNet IO"
            className="w-16 h-16 rounded-2xl object-cover shadow-2xl mb-4"
            style={{ border: '2px solid rgba(34,197,94,0.4)' }}
          />
          <h1 className="text-2xl font-bold text-white tracking-tight">
            EcoNet <span style={{ color: 'var(--eco-green)' }}>IO</span>
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--eco-text-muted)' }}>Together. For a thriving planet.</p>
        </div>

        {/* Card */}
        <div
          className="rounded-[var(--eco-radius-card)] p-6"
          style={{
            background: 'var(--eco-bg-surface)',
            border: '1px solid var(--eco-border)',
            boxShadow: 'var(--eco-shadow-card)',
          }}
        >
          <h2 className="text-lg font-bold text-white mb-5">Sign in</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--eco-text-secondary)' }}>
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white placeholder:text-[var(--eco-text-muted)] outline-none focus:ring-2 transition-all"
                style={{
                  background: 'var(--eco-bg-elevated)',
                  border: '1px solid var(--eco-border)',
                  focusRingColor: 'var(--eco-green)',
                }}
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--eco-text-secondary)' }}>
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl text-sm text-white placeholder:text-[var(--eco-text-muted)] outline-none focus:ring-2 transition-all"
                  style={{
                    background: 'var(--eco-bg-elevated)',
                    border: '1px solid var(--eco-border)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute inset-y-0 right-3 flex items-center"
                  style={{ color: 'var(--eco-text-muted)' }}
                >
                  {showPassword ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
                </button>
              </div>
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={handleRememberChange}
                  className="w-3.5 h-3.5 rounded accent-emerald-500"
                />
                <span className="text-xs" style={{ color: 'var(--eco-text-secondary)' }}>Remember email</span>
              </label>
              <button
                type="button"
                onClick={() => onNavigate('/forgot-password')}
                className="text-xs transition-opacity hover:opacity-70"
                style={{ color: 'var(--eco-green)' }}
              >
                Forgot password?
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="px-3 py-2 rounded-lg text-sm text-red-300 bg-red-900/30 border border-red-500/20">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-black transition-opacity disabled:opacity-50"
              style={{ background: 'var(--eco-green)' }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-xs mt-4" style={{ color: 'var(--eco-text-muted)' }}>
            Don't have an account?{' '}
            <button
              onClick={() => onNavigate('/register')}
              className="font-medium transition-opacity hover:opacity-70"
              style={{ color: 'var(--eco-green)' }}
            >
              Register
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
