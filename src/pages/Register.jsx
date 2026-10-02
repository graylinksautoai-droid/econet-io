/**
 * Register — /register (noChrome auth page)
 * No MainLayout wrapper. EcoShell with noChrome=true provides planet bg.
 * Backend: POST /api/auth/register
 */
import { useState } from 'react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { API_ENDPOINTS } from '../services/api.js';
import { useAuth } from '../context/AuthContext';

export default function Register({ onNavigate }) {
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const { persistAuth } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res  = await fetch(API_ENDPOINTS.AUTH.REGISTER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Registration failed'); return; }
      persistAuth({ nextUser: data.user, nextToken: data.token, mode: remember ? 'local' : 'session' });
      onNavigate('/');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Real EcoNet logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/econet-logo.jpeg" alt="EcoNet IO"
            className="w-14 h-14 rounded-2xl object-cover shadow-2xl mb-3"
            style={{ border: '2px solid rgba(34,197,94,0.4)' }} />
          <h1 className="text-xl font-bold text-white">
            EcoNet <span style={{ color: 'var(--eco-green)' }}>IO</span>
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--eco-text-muted)' }}>Join EcoNet IO today</p>
        </div>

        {/* Card */}
        <div className="rounded-[var(--eco-radius-card)] p-6"
          style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border)', boxShadow: 'var(--eco-shadow-card)' }}>

          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { id: 'name',     label: 'Full name',    type: 'text',     val: name,     set: setName,     ph: 'Your name',       auto: 'name' },
              { id: 'email',    label: 'Email',        type: 'email',    val: email,    set: setEmail,    ph: 'you@example.com', auto: 'email' },
            ].map(f => (
              <div key={f.id}>
                <label htmlFor={f.id} className="block text-xs font-medium mb-1.5"
                  style={{ color: 'var(--eco-text-secondary)' }}>{f.label}</label>
                <input
                  id={f.id} type={f.type} required autoComplete={f.auto}
                  value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white placeholder:text-[var(--eco-text-muted)] outline-none transition-all"
                  style={{ background: 'var(--eco-bg-elevated)', border: '1px solid var(--eco-border)' }}
                />
              </div>
            ))}

            {/* Password with visibility toggle */}
            <div>
              <label htmlFor="password" className="block text-xs font-medium mb-1.5"
                style={{ color: 'var(--eco-text-secondary)' }}>Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl text-sm text-white placeholder:text-[var(--eco-text-muted)] outline-none transition-all"
                  style={{ background: 'var(--eco-bg-elevated)', border: '1px solid var(--eco-border)' }}
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

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-emerald-500" />
              <span className="text-xs" style={{ color: 'var(--eco-text-secondary)' }}>Remember me</span>
            </label>

            {error && (
              <div className="px-3 py-2 rounded-lg text-sm text-red-300 bg-red-900/30 border border-red-500/20">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-black transition-opacity disabled:opacity-50 hover:opacity-90"
              style={{ background: 'var(--eco-green)' }}>
              {loading ? 'Creating account…' : 'Sign up'}
            </button>
          </form>

          <p className="text-center text-xs mt-4" style={{ color: 'var(--eco-text-muted)' }}>
            Already have an account?{' '}
            <button onClick={() => onNavigate('/login')}
              className="font-medium hover:opacity-70 transition-opacity"
              style={{ color: 'var(--eco-green)' }}>
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
