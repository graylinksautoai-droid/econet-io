/**
 * GrinderHome — home screen for Grinder role.
 *
 * A Grinder discovers and participates in missions.
 * This screen prioritizes: mission discovery, personal progress,
 * XP/reputation, social activity, and Lilo guidance.
 *
 * Data sources: canonical /api/v2/missions, real auth context.
 * No invented metrics — empty states shown when data is absent.
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUserRole } from '../context/UserRoleContext';
import { getV2ApiOrigin } from '../services/runtimeConfig';

const DEV_FIXTURE_MISSION = import.meta.env.VITE_ENABLE_MOCK_MISSIONS === 'true'
  ? {
      missionId: 'DEV-G-01',
      title: 'Clean the Jabi Lake Shoreline',
      description: 'Join a weekend cleanup effort to remove debris and invasive plants from the shoreline.',
      priority: 'HIGH',
      targetCriteria: { region: 'Abuja, Nigeria', distanceKm: 1.2 },
      status: 'ACTIVE',
    }
  : null;

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning,';
  if (h < 18) return 'Good afternoon,';
  return 'Good evening,';
}

function XpBar({ current = 0, max = 2000 }) {
  const pct = Math.min(100, (current / max) * 100);
  return (
    <div>
      <div className="eco-xp-bar"><div className="eco-xp-fill" style={{ width: `${pct}%` }} /></div>
      <p className="text-xs mt-1" style={{ color: 'var(--eco-text-muted)' }}>
        {current.toLocaleString()} / {max.toLocaleString()} XP · keep going
      </p>
    </div>
  );
}

/**
 * JoinMissionButton — calls POST /api/v2/missions/:id/join then navigates
 * to Command Center for full mission interaction.
 */
function JoinMissionButton({ mission, onNavigate }) {
  const { token } = useAuth();
  const [state, setState] = useState('idle'); // idle | joining | joined | error

  const handleJoin = async () => {
    if (!token) { onNavigate('/login'); return; }
    if (state === 'joining' || state === 'joined') return;
    setState('joining');
    const v2 = getV2ApiOrigin();
    if (!v2) { onNavigate('/command'); return; }
    try {
      const res = await fetch(`${v2}/api/v2/missions/${mission.missionId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        setState('joined');
        // Navigate to command center so they can see full mission and submit evidence
        setTimeout(() => onNavigate('/command'), 800);
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.code === 'INVALID_STATUS') {
          setState('idle');
          onNavigate('/command'); // Show them the mission list
        } else {
          setState('error');
          setTimeout(() => setState('idle'), 2500);
        }
      }
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 2500);
    }
  };

  const label = state === 'joining' ? 'Joining…'
    : state === 'joined' ? '✓ Joined!'
    : state === 'error' ? 'Try again'
    : 'Join Mission';

  return (
    <button
      onClick={handleJoin}
      disabled={state === 'joining' || state === 'joined'}
      className="self-start flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-60"
      style={{ background: state === 'error' ? '#ef4444' : state === 'joined' ? 'var(--eco-teal)' : 'var(--eco-green)' }}>
      {label}
      {state === 'idle' && (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 5l5 5-5 5M5 10h10" />
        </svg>
      )}
    </button>
  );
}

function MissionCard({ mission, onNavigate, loading }) {
  if (loading) {
    return (
      <div className="eco-mission-card p-5 animate-pulse" style={{ minHeight: 180 }}>
        <div className="h-3 w-24 rounded bg-white/10 mb-3" />
        <div className="h-6 w-3/4 rounded bg-white/10 mb-2" />
        <div className="h-3 w-1/2 rounded bg-white/10 mb-4" />
        <div className="h-3 w-full rounded bg-white/10" />
      </div>
    );
  }
  if (!mission) {
    return (
      <div className="eco-mission-card p-5 flex flex-col gap-3" style={{ minHeight: 140 }}>
        <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border self-start"
          style={{ borderColor: 'rgba(34,197,94,0.3)', color: 'var(--eco-green)', background: 'rgba(34,197,94,0.08)' }}>
          AVAILABLE MISSION
        </span>
        <p className="text-sm" style={{ color: 'var(--eco-text-secondary)' }}>
          No active missions at the moment. Check the map for Lilo-discovered opportunities.
        </p>
        <button onClick={() => onNavigate('/map')}
          className="text-xs self-start px-3 py-1.5 rounded-lg hover:text-white transition-colors"
          style={{ color: 'var(--eco-green)', border: '1px solid rgba(34,197,94,0.25)' }}>
          Open World Map →
        </button>
      </div>
    );
  }
  const region = mission.targetCriteria?.region || '';
  const dist = mission.targetCriteria?.distanceKm ? `${mission.targetCriteria.distanceKm} km away` : '';
  return (
    <div className="eco-mission-card overflow-hidden" style={{ minHeight: 180 }}>
      <div className="absolute inset-0">
        <img src="https://images.unsplash.com/photo-1504472478235-9bc48ba4d60f?w=700&q=70"
          alt="" className="w-full h-full object-cover opacity-25" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a1422] via-[#0a1422]/60 to-transparent" />
      </div>
      <div className="relative z-10 p-5 flex flex-col gap-3 h-full">
        <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border self-start"
          style={{ borderColor: 'rgba(34,197,94,0.35)', color: 'var(--eco-green)', background: 'rgba(34,197,94,0.10)' }}>
          AVAILABLE TO JOIN
        </span>
        <div>
          <h2 className="text-xl font-bold text-white leading-tight">{mission.title}</h2>
          {(region || dist) && (
            <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--eco-text-secondary)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3 flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {[region, dist].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <p className="text-sm leading-relaxed flex-1" style={{ color: 'var(--eco-text-secondary)' }}>
          {mission.description}
        </p>
        <JoinMissionButton mission={mission} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

const GRINDER_ACTIONS = [
  { label: 'Find Missions',    path: '/command',     desc: 'Browse active field missions', color: 'var(--eco-green)' },
  { label: 'Explore Map',      path: '/map',          desc: 'Discover nearby opportunities', color: 'var(--eco-teal)' },
  { label: 'Submit Report',    path: '/submit',       desc: 'Document an environmental incident', color: '#a78bfa' },
  { label: 'My Toolkit',       path: '/toolkit',      desc: 'Tools, inventory & equipment', color: '#f59e0b' },
  { label: 'My Wallet',        path: '/wallet',       desc: 'EcoCoins, balance & history', color: '#ec4899' },
  { label: 'My HQ',            path: '/hq',           desc: 'View your progress and impact', color: 'var(--eco-cyan)' },
];

export default function GrinderHome({ user: propUser, onNavigate }) {
  const { user: authUser } = useAuth();
  const { setRole } = useUserRole();
  const u = authUser || propUser;
  const rep = u?.reputation || {};
  const firstName = (u?.name || 'Sentinel').split(' ')[0];
  const xp = rep.leaves ?? rep.trustScore ?? 0;

  const [mission, setMission] = useState(null);
  const [loading, setLoading] = useState(true);
  const abort = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const fetch_ = async () => {
      setLoading(true);
      abort.current?.abort();
      abort.current = new AbortController();
      const v2 = getV2ApiOrigin();
      if (!v2) { setMission(DEV_FIXTURE_MISSION); setLoading(false); return; }
      try {
        const res = await fetch(`${v2}/api/v2/missions`, { signal: abort.current.signal, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        if (cancelled) return;
        setMission(data?.missions?.[0] ?? DEV_FIXTURE_MISSION ?? null);
      } catch (e) {
        if (e.name === 'AbortError' || cancelled) return;
        setMission(DEV_FIXTURE_MISSION ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetch_();
    return () => { cancelled = true; abort.current?.abort(); };
  }, []);

  return (
    <div className="eco-page eco-fade-up w-full">

      {/* ── Hero ── */}
      <div className="eco-home-top-grid mb-8">
        {/* Left: identity + progress */}
        <div className="relative overflow-hidden p-5 rounded-[var(--eco-radius-card)] flex flex-col justify-between gap-4"
          style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
          <div className="absolute right-0 top-0 w-48 h-36 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at top right, rgba(34,197,94,0.08) 0%, transparent 70%)' }} />

          <div className="relative z-10 flex items-start gap-3">
            <div className="w-16 h-16 rounded-2xl flex-shrink-0 overflow-hidden border-2"
              style={{ borderColor: 'rgba(34,197,94,0.4)' }}>
              {u?.avatar
                ? <img src={u.avatar} alt={firstName} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white"
                    style={{ background: 'linear-gradient(135deg,#134e2a,#0b3320)' }}>
                    {firstName[0]?.toUpperCase()}
                  </div>
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>{timeGreeting()}</p>
              <h1 className="text-2xl font-bold text-white leading-tight truncate">{firstName}</h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold mt-1"
                style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--eco-green)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} className="w-2.5 h-2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 1l1.5 3H11l-2.5 2 1 3L6 7.5 3.5 9l1-3L2 4h3.5z" />
                </svg>
                Grinder
              </span>
              <div className="mt-2">
                <XpBar current={xp} max={2000} />
              </div>
            </div>
          </div>

          <p className="relative z-10 text-sm italic" style={{ color: 'var(--eco-text-secondary)' }}>
            Every report, every mission, every action counts.
          </p>

          <div className="relative z-10 grid grid-cols-3 gap-2">
            {[
              { label: 'Reports', value: rep.totalReports ?? 0 },
              { label: 'Verified', value: rep.verifiedReports ?? 0 },
              { label: 'Trust', value: `${rep.trustScore ?? 0}%` },
            ].map(stat => (
              <div key={stat.label} className="p-2 rounded-xl text-center"
                style={{ background: 'var(--eco-bg-elevated)' }}>
                <p className="text-base font-bold text-white">{stat.value}</p>
                <p className="text-[10px]" style={{ color: 'var(--eco-text-muted)' }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: available mission */}
        <MissionCard mission={mission} loading={loading} onNavigate={onNavigate} />
      </div>

      {/* ── Quick actions ── */}
      <section className="mb-8">
        <h2 className="text-base font-bold text-white mb-4">Your Field Actions</h2>
        <div className="eco-worlds-grid">
          {GRINDER_ACTIONS.map(a => (
            <button key={a.path} onClick={() => onNavigate(a.path)}
              className="eco-world-card text-left p-4 flex flex-col gap-2 hover:border-white/20 transition-all"
              style={{ minHeight: 110 }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: `${a.color}18`, border: `1px solid ${a.color}35` }}>
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: a.color }} />
              </div>
              <p className="text-sm font-bold text-white">{a.label}</p>
              <p className="text-[11px] leading-tight" style={{ color: 'rgba(255,255,255,0.55)' }}>{a.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ── Switch role ── */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl"
        style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
        <div>
          <p className="text-xs font-medium text-white">Switch to Whale experience</p>
          <p className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>Create and fund missions instead</p>
        </div>
        <button onClick={() => { setRole('whale'); onNavigate('/'); }}
          className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-white/10"
          style={{ border: '1px solid rgba(56,189,248,0.4)', color: '#38bdf8' }}>
          Switch →
        </button>
      </div>
    </div>
  );
}
