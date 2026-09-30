/**
 * EcoHQ — My HQ personal command screen.
 *
 * This is intentionally distinct from Profile (public identity) and
 * Settings (preferences). My HQ is the user's personal dashboard:
 * identity, XP, impact stats, active missions, eco-coins, achievements.
 *
 * Data comes from the real auth context / profile API where available.
 * No invented metrics — empty states shown when data is absent.
 */

import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { getApiBaseUrl } from '../services/runtimeConfig';

function StatCard({ label, value, sub, color = 'var(--eco-green)', icon }) {
  return (
    <div
      className="flex flex-col gap-1 p-4 rounded-2xl"
      style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium" style={{ color: 'var(--eco-text-muted)' }}>{label}</span>
        {icon && <span style={{ color }}>{icon}</span>}
      </div>
      <span className="text-2xl font-bold" style={{ color }}>
        {value !== undefined && value !== null ? value : '—'}
      </span>
      {sub && <span className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>{sub}</span>}
    </div>
  );
}

function XpBar({ current = 0, max = 2000 }) {
  const pct = Math.min(100, (current / max) * 100);
  return (
    <div className="eco-xp-bar mt-1">
      <div className="eco-xp-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function EcoHQ({ user: propUser, onNavigate, onLogout }) {
  const { user: authUser, token } = useAuth();
  const u     = authUser || propUser;
  const rep   = u?.reputation || {};
  const name  = u?.name || 'Sentinel';

  const xp        = rep.leaves ?? rep.ecoCoins ?? 0;
  const xpMax     = 2000;
  const trust     = rep.trustScore ?? 0;
  const reports   = rep.totalReports ?? rep.verifiedReports ?? 0;
  const verified  = rep.verifiedReports ?? 0;
  const level     = rep.verifiedReporter ? 'Pathfinder' : 'Explorer';
  const lvlNum    = Math.max(1, Math.floor(verified / 5) + 1);

  // Live balance from the economy endpoint — falls back to auth context values
  const [liveBalance, setLiveBalance] = useState(null);
  useEffect(() => {
    if (!token) return;
    fetch(`${getApiBaseUrl()}/economy/balance`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(b => { if (b) setLiveBalance(b); })
      .catch(() => {});
  }, [token]);

  const seeds = liveBalance?.seeds ?? rep.seeds ?? 0;
  const ecoCoins = liveBalance?.ecoCoins ?? rep.ecoCoins ?? 0;

  return (
    <div className="eco-page eco-fade-up w-full">

      {/* ── Header ── */}
      <div className="flex items-start gap-4 mb-8">
        {/* Avatar */}
        <div
          className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 border-2"
          style={{ borderColor: 'rgba(34,197,94,0.4)' }}
        >
          {u?.avatar
            ? <img src={u.avatar} alt={name} className="w-full h-full object-cover" />
            : (
              <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#134e2a,#0b3320)' }}>
                {name[0]?.toUpperCase()}
              </div>
            )
          }
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs mb-0.5" style={{ color: 'var(--eco-text-muted)' }}>My HQ</p>
          <h1 className="text-2xl font-bold text-white truncate">{name}</h1>
          <p className="text-sm mb-2" style={{ color: 'var(--eco-text-secondary)' }}>
            Level {lvlNum} · {level}
          </p>
          <XpBar current={xp} max={xpMax} />
          <p className="text-xs mt-1" style={{ color: 'var(--eco-text-muted)' }}>
            {xp.toLocaleString()} / {xpMax.toLocaleString()} XP
          </p>
        </div>

        <button
          onClick={() => onNavigate('/edit-profile')}
          className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors hover:bg-white/10"
          style={{ border: '1px solid var(--eco-border)', color: 'var(--eco-text-secondary)' }}
        >
          Edit profile
        </button>
      </div>

      {/* ── Stats grid ── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--eco-text-secondary)' }}>
          Your impact
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard label="Trust Score"   value={trust}    sub="out of 100"        color="var(--eco-green)"  />
          <StatCard label="Reports"       value={reports}  sub="total submitted"    color="var(--eco-teal)"   />
          <StatCard label="Verified"      value={verified} sub="verified reports"   color="#a78bfa"           />
          <StatCard label="EcoCoins"      value={ecoCoins} sub="platform credits"   color="#f59e0b" />
        </div>
      </section>

      {/* ── Quick actions ── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--eco-text-secondary)' }}>
          Quick actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Submit Report',    path: '/submit',      desc: 'Document an environmental incident' },
            { label: 'View Missions',    path: '/command',     desc: 'Browse active field missions' },
            { label: 'Social Feed',      path: '/social',      desc: 'Connect with the community' },
            { label: 'World Map',        path: '/map',         desc: 'Explore environmental activity' },
            { label: 'My Wallet',        path: '/wallet',      desc: 'EcoCoins, balance & history' },
            { label: 'My Toolkit',       path: '/toolkit',     desc: 'Tools, inventory & requests' },
          ].map(action => (
            <button
              key={action.path}
              onClick={() => onNavigate(action.path)}
              className="flex flex-col gap-1 p-4 rounded-2xl text-left transition-all hover:border-emerald-500/30 hover:bg-white/5"
              style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}
            >
              <span className="text-sm font-semibold text-white">{action.label}</span>
              <span className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>{action.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Account ── */}
      <section>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--eco-text-secondary)' }}>
          Account
        </h2>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onNavigate('/edit-profile')}
            className="flex items-center justify-between px-4 py-3 rounded-xl text-sm text-white transition-colors hover:bg-white/5"
            style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}
          >
            <span>Profile &amp; Settings</span>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4" style={{ color: 'var(--eco-text-muted)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 7l3 3-3 3" />
            </svg>
          </button>
          {u && (
            <button
              onClick={onLogout}
              className="flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-colors hover:bg-red-900/20"
              style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)', color: '#f87171' }}
            >
              <span>Sign out</span>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l3 3-3 3M16 10H8M8 4H5a1 1 0 00-1 1v10a1 1 0 001 1h3" />
              </svg>
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
