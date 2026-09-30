/**
 * EcoHome — primary home screen.
 *
 * DESKTOP (≥1100px):
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  GOOD EVENING,                  │  FEATURED MISSION        │
 *   │  [Name]                         │  [mission card]          │
 *   │  Level N · Pathfinder           │                          │
 *   │  ████████████░░░░░░  XP bar     │                          │
 *   │  [impact chip]                  │                          │
 *   ├─────────────────────────────────┴──────────────────────────┤
 *   │  Your Worlds                              See all →        │
 *   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
 *   │  │ Social   │ │ World Map│ │ Community│ │ Marketplace  │  │
 *   │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
 *   ├────────────────────────────────────────────────────────────┤
 *   │  Your impact matters  Real people. Real action. →          │
 *   └────────────────────────────────────────────────────────────┘
 *
 * MOBILE (<1100px): stacked single column (original layout).
 *
 * Data:
 *   Mission:  GET /api/v2/missions (canonical engine)
 *   User:     AuthContext (real auth data, no invented numbers)
 *   Fixture:  only if VITE_ENABLE_MOCK_MISSIONS=true AND API unreachable
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getV2ApiOrigin, resolveMediaUrl } from '../services/runtimeConfig';

// ── Dev fixture (gated — same contract as CommandCenter) ──────────────────────
const DEV_FIXTURE_MISSION =
  import.meta.env.VITE_ENABLE_MOCK_MISSIONS === 'true'
    ? {
        missionId:   'DEV-FIXTURE-01',
        title:       'Restore Lagos Wetlands',
        description: 'Join a community effort to restore critical wetland ecosystems and monitor biodiversity.',
        priority:    'HIGH',
        targetCriteria: { region: 'Lagos, Nigeria', distanceKm: 2.4 },
        status:      'ACTIVE',
      }
    : null;

// ── Helpers ───────────────────────────────────────────────────────────────────

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
      <div className="eco-xp-bar">
        <div className="eco-xp-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] mt-1" style={{ color: 'var(--eco-text-muted)' }}>
        {current.toLocaleString()} / {max.toLocaleString()} XP
      </p>
    </div>
  );
}

// ── Featured mission card ─────────────────────────────────────────────────────

function FeaturedMission({ mission, loading, onNavigate }) {
  if (loading) {
    return (
      <div className="eco-mission-card p-5 animate-pulse h-full" style={{ minHeight: 200 }}>
        <div className="h-3 w-28 rounded bg-white/10 mb-3" />
        <div className="h-6 w-3/4 rounded bg-white/10 mb-2" />
        <div className="h-3 w-1/2 rounded bg-white/10 mb-4" />
        <div className="h-3 w-full rounded bg-white/10 mb-1" />
        <div className="h-3 w-5/6 rounded bg-white/10" />
      </div>
    );
  }

  if (!mission) {
    return (
      <div className="eco-mission-card p-6 h-full flex flex-col gap-3 justify-center" style={{ minHeight: 200 }}>
        <div
          className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border self-start"
          style={{ borderColor: 'rgba(34,197,94,0.3)', color: 'var(--eco-green)', background: 'rgba(34,197,94,0.08)' }}
        >FEATURED MISSION</div>
        <p className="text-sm" style={{ color: 'var(--eco-text-secondary)' }}>
          No active missions yet. Missions will appear here once the command engine is populated.
        </p>
        <button
          onClick={() => onNavigate('/command')}
          className="text-xs self-start px-3 py-1.5 rounded-lg transition-colors hover:text-white"
          style={{ color: 'var(--eco-green)', border: '1px solid rgba(34,197,94,0.25)' }}
        >
          Open Command Center →
        </button>
      </div>
    );
  }

  const region = mission.targetCriteria?.region || '';
  const dist   = mission.targetCriteria?.distanceKm ? `${mission.targetCriteria.distanceKm} km away` : '';

  return (
    <div className="eco-mission-card overflow-hidden h-full" style={{ minHeight: 200 }}>
      <div className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1504472478235-9bc48ba4d60f?w=800&q=70"
          alt="Mission environment"
          className="w-full h-full object-cover opacity-30"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a1422] via-[#0a1422]/60 to-transparent" />
      </div>
      <div className="relative z-10 p-5 flex flex-col gap-3 h-full">
        <div
          className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border self-start"
          style={{ borderColor: 'rgba(34,197,94,0.35)', color: 'var(--eco-green)', background: 'rgba(34,197,94,0.10)' }}
        >FEATURED MISSION</div>
        <div>
          <h2 className="text-xl font-bold text-white leading-tight mb-1">{mission.title}</h2>
          {(region || dist) && (
            <p className="text-xs flex items-center gap-1" style={{ color: 'var(--eco-text-secondary)' }}>
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
        <div className="flex items-center justify-between mt-auto">
          <div className="flex -space-x-2">
            {[1,2,3].map(i => (
              <div key={i} className="w-7 h-7 rounded-full border-2 bg-emerald-900/60"
                style={{ borderColor: 'var(--eco-bg-canvas)' }} />
            ))}
            <div className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[9px] font-bold"
              style={{ borderColor: 'var(--eco-bg-canvas)', background: 'var(--eco-bg-elevated)', color: 'var(--eco-text-secondary)' }}>
              +12
            </div>
          </div>
          <button
            onClick={() => onNavigate('/command')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-black transition-opacity hover:opacity-90"
            style={{ background: 'var(--eco-green)' }}
          >
            View Mission
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── World cards ───────────────────────────────────────────────────────────────

const WORLDS = [
  {
    key: '/social',
    label: 'Social',
    sub: 'Connect, share and be inspired',
    img: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=500&q=65',
    dot: '#a855f7',
    icon: <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16 18h4.5v-1.8a2.75 2.75 0 00-4.92-1.7M16 18H6m10 0v-1.8c0-.6-.12-1.18-.33-1.7M6 18H1.5v-1.8a2.75 2.75 0 014.92-1.7M6 18v-1.8c0-.6.12-1.18.33-1.7m0 0A4.6 4.6 0 0111 12.5a4.6 4.6 0 014.67 2.0" /></svg>,
  },
  {
    key: '/map',
    label: 'World Map',
    sub: 'Explore missions and activity',
    img: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=500&q=65',
    dot: '#22c55e',
    icon: <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.5 19L3 16.5V3l5.5 2.5M8.5 19V5.5M8.5 19l5-2.5M13.5 16.5V4M13.5 16.5L19 19V5.5L13.5 4" /></svg>,
  },
  {
    key: '/communities',
    label: 'Community',
    sub: 'Join or create communities',
    img: 'https://images.unsplash.com/photo-1534951009808-766178b47a4f?w=500&q=65',
    dot: '#ec4899',
    badge: 2,
    icon: <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M11 4a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm-6.5 14a6.5 6.5 0 0113 0" /></svg>,
  },
  {
    key: '/marketplace',
    label: 'Marketplace',
    sub: 'Green products & services',
    img: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=500&q=65',
    dot: '#f59e0b',
    icon: <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 8h14l-2-8M10 17a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2z" /></svg>,
  },
];

function WorldCard({ world, onNavigate }) {
  return (
    <button
      onClick={() => onNavigate(world.key)}
      className="eco-world-card text-left w-full"
      style={{ minHeight: 160 }}
    >
      <img src={world.img} alt={world.label} className="eco-world-card-img absolute inset-0" loading="lazy" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full"
        style={{ background: world.dot, boxShadow: `0 0 6px ${world.dot}` }} />
      {world.badge && (
        <div className="absolute top-2.5 right-2.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
          {world.badge}
        </div>
      )}
      <div className="absolute inset-0 p-4 flex flex-col justify-end">
        <div className="w-9 h-9 rounded-full flex items-center justify-center mb-2 text-white/90"
          style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.15)' }}>
          {world.icon}
        </div>
        <p className="text-sm font-bold text-white leading-tight">{world.label}</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.58)' }}>{world.sub}</p>
        <div className="absolute bottom-3.5 right-3.5 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.14)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} className="w-3 h-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function EcoHome({ user: propUser, onNavigate }) {
  const { user: authUser } = useAuth();
  const currentUser = authUser || propUser;

  const [mission,        setMission]        = useState(null);
  const [missionLoading, setMissionLoading] = useState(true);
  const abortRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const fetch_ = async () => {
      setMissionLoading(true);
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const v2 = getV2ApiOrigin();
      if (!v2) {
        setMission(DEV_FIXTURE_MISSION);
        setMissionLoading(false);
        return;
      }
      try {
        const res  = await fetch(`${v2}/api/v2/missions`, { signal: abortRef.current.signal, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        if (cancelled) return;
        setMission(data?.missions?.[0] ?? DEV_FIXTURE_MISSION ?? null);
      } catch (err) {
        if (err.name === 'AbortError' || cancelled) return;
        setMission(DEV_FIXTURE_MISSION ?? null);
      } finally {
        if (!cancelled) setMissionLoading(false);
      }
    };
    fetch_();
    return () => { cancelled = true; abortRef.current?.abort(); };
  }, []);

  // User data — real values only, no invented numbers
  const displayName  = currentUser?.name || 'Sentinel';
  const firstName    = displayName.split(' ')[0];
  const rep          = currentUser?.reputation || {};
  const xpCurrent    = rep.leaves ?? rep.trustScore ?? 0;
  const xpMax        = 2000;
  const impactPoints = rep.leaves ?? 0;
  const levelLabel   = rep.verifiedReporter ? 'Pathfinder' : 'Explorer';
  const levelNum     = rep.verifiedReports ? Math.max(1, Math.floor(rep.verifiedReports / 5) + 1) : 1;

  return (
    <div className="eco-page eco-fade-up w-full">

      {/* ──────────────────────────────────────────────────────────────────────
          TOP SECTION
          Desktop: 2 columns — [greeting + XP] | [featured mission]
          Mobile:  stacked
      ────────────────────────────────────────────────────────────────────── */}
      <div className="eco-home-top-grid mb-8">

        {/* Left: greeting panel */}
        <div
          className="relative overflow-hidden p-5 rounded-[var(--eco-radius-card)] flex flex-col justify-between gap-4"
          style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}
        >
          {/* Atmosphere glow */}
          <div className="absolute right-0 top-0 w-48 h-36 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at top right, rgba(34,197,94,0.07) 0%, transparent 70%)' }} />

          <div className="relative z-10 flex items-start gap-3">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-2xl flex-shrink-0 overflow-hidden border-2"
              style={{ borderColor: 'rgba(34,197,94,0.4)' }}>
              {currentUser?.avatar
                ? <img src={resolveMediaUrl(currentUser.avatar)} alt={displayName} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white"
                    style={{ background: 'linear-gradient(135deg,#134e2a,#0b3320)' }}>
                    {firstName[0]?.toUpperCase()}
                  </div>
              }
            </div>

            {/* Name + level */}
            <div className="flex-1 min-w-0">
              <p className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>{timeGreeting()}</p>
              <h1 className="text-2xl font-bold text-white leading-tight truncate">{firstName}</h1>
              <p className="text-xs mb-2" style={{ color: 'var(--eco-text-secondary)' }}>
                Level {levelNum} · {levelLabel}
              </p>
              <XpBar current={xpCurrent} max={xpMax} />
            </div>
          </div>

          {/* Sub-line */}
          <p className="relative z-10 text-sm font-medium italic" style={{ color: 'var(--eco-text-secondary)' }}>
            Different worlds. One mission. Infinite impact.
          </p>

          {/* Impact chip */}
          <button
            onClick={() => onNavigate('/hq')}
            className="relative z-10 flex items-center gap-3 px-4 py-3 rounded-xl self-start transition-all hover:border-emerald-500/40"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.20)' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={1.8} className="w-5 h-5 flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1M4.22 4.22l.7.7m14.14 14.14l.7.7M1 12h1m20 0h1M4.22 19.78l.7-.7M18.36 5.64l.7-.7" />
            </svg>
            <div className="text-left">
              <p className="text-[10px]" style={{ color: 'var(--eco-text-muted)' }}>Your impact</p>
              <p className="text-base font-bold" style={{ color: 'var(--eco-green)' }}>
                {impactPoints > 0 ? `+${impactPoints.toLocaleString()}` : 'Start contributing'}
              </p>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2.5} className="w-4 h-4 ml-auto">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Right: featured mission */}
        <FeaturedMission mission={mission} loading={missionLoading} onNavigate={onNavigate} />
      </div>

      {/* ──────────────────────────────────────────────────────────────────────
          YOUR WORLDS grid
          Desktop: 4 columns
          Tablet:  2 columns
          Mobile:  2 columns (compact)
      ────────────────────────────────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white">Your Worlds</h2>
          <button onClick={() => onNavigate('/social')}
            className="text-xs flex items-center gap-1 transition-opacity hover:opacity-70"
            style={{ color: 'var(--eco-text-secondary)' }}>
            See all
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <div className="eco-worlds-grid">
          {WORLDS.map(w => <WorldCard key={w.key} world={w} onNavigate={onNavigate} />)}
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────────
          IMPACT BANNER
      ────────────────────────────────────────────────────────────────────── */}
      <button
        onClick={() => onNavigate('/submit')}
        className="w-full flex items-center gap-4 p-4 rounded-[var(--eco-radius-card)] transition-all hover:border-emerald-500/25"
        style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}
      >
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={1.8} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v13M8 12l4 4 4-4" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 20h14" />
          </svg>
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold text-white">Your impact matters</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--eco-text-muted)' }}>
            Real people. Real action. Real change.
          </p>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 flex-shrink-0"
          style={{ color: 'var(--eco-text-muted)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
