/**
 * WhaleHome — home screen for Whale role.
 *
 * A Whale creates, funds, and manages missions.
 * This screen prioritizes: mission portfolio, funding pipeline,
 * Lilo-discovered opportunities, mission creation, impact analytics.
 *
 * Data sources: canonical /api/v2/missions, real auth context.
 * Lilo opportunities: dev fixtures when VITE_ENABLE_MOCK_MISSIONS=true.
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUserRole } from '../context/UserRoleContext';
import { getV2ApiOrigin } from '../services/runtimeConfig';
import { displayMoney } from '../services/currency';

// Dev fixture opportunities — represent Lilo-discovered, unfunded locations
const DEV_OPPORTUNITIES = import.meta.env.VITE_ENABLE_MOCK_MISSIONS === 'true'
  ? [
      {
        id: 'OPP-DEV-01',
        title: 'Erosion threat — Anambra river bank',
        location: 'Anambra State, Nigeria',
        coordinates: [6.9386, 6.2209],  // [lng, lat]
        evidence: 'Recent satellite imagery shows significant bank erosion. 3 communities at flood risk.',
        suggestedAction: 'Shoreline stabilisation mission — plant native grasses + monitoring stations',
        estimatedFunding: '₦450,000',
        estimatedParticipants: 12,
        durationDays: 14,
        confidence: 88,
        source: 'lilo',
        status: 'suggested',
      },
      {
        id: 'OPP-DEV-02',
        title: 'Illegal dumping cluster — Lagos outskirts',
        location: 'Lagos State, Nigeria',
        coordinates: [3.4246, 6.4541],  // [lng, lat]
        evidence: '14 user reports flagged by Lilo over 30 days. Growing waste accumulation.',
        suggestedAction: 'Community cleanup + environmental report documentation mission',
        estimatedFunding: '₦180,000',
        estimatedParticipants: 8,
        durationDays: 2,
        confidence: 76,
        source: 'lilo',
        status: 'suggested',
      },
    ]
  : [];

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning,';
  if (h < 18) return 'Good afternoon,';
  return 'Good evening,';
}

function OpportunityCard({ opp, onNavigate, onFund }) {
  return (
    <div className="p-4 rounded-2xl flex flex-col gap-3 transition-all hover:border-[#38bdf8]/30"
      style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
      {/* Lilo badge */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)' }}>
          LILO DISCOVERED · NOT YET FUNDED
        </span>
        <span className="text-[10px]" style={{ color: 'var(--eco-text-muted)' }}>{opp.confidence}% confidence</span>
      </div>

      <div>
        <h3 className="text-sm font-bold text-white">{opp.title}</h3>
        <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--eco-text-secondary)' }}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3 h-3 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9a3 3 0 100-6 3 3 0 000 6zm0 0v4m-3-2h6" />
          </svg>
          {opp.location}
        </p>
      </div>

      <p className="text-xs leading-relaxed" style={{ color: 'var(--eco-text-secondary)' }}>{opp.evidence}</p>

      <div className="p-2.5 rounded-xl" style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)' }}>
        <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: '#38bdf8' }}>Suggested action</p>
        <p className="text-xs" style={{ color: 'var(--eco-text-secondary)' }}>{opp.suggestedAction}</p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px]" style={{ color: 'var(--eco-text-muted)' }}>Est. funding required</p>
          <p className="text-sm font-bold" style={{ color: '#38bdf8' }}>{displayMoney(opp.estimatedFunding)}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onNavigate(`/map?oppId=${opp.id}&lng=${opp.coordinates?.[0]}&lat=${opp.coordinates?.[1]}`)}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-white/5"
            style={{ border: '1px solid var(--eco-border)', color: 'var(--eco-text-secondary)' }}>
            View on map
          </button>
          <button onClick={() => onFund(opp)}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold text-black transition-opacity hover:opacity-90"
            style={{ background: '#38bdf8' }}>
            Fund mission
          </button>
        </div>
      </div>
    </div>
  );
}

const WHALE_ACTIONS = [
  { label: 'Create Mission',     path: '/command',     desc: 'Design and fund a new mission', color: '#38bdf8' },
  { label: 'Explore Map',        path: '/map',          desc: 'Find Lilo-identified opportunities', color: 'var(--eco-green)' },
  { label: 'Active Missions',    path: '/command',      desc: 'Monitor your funded missions', color: '#a78bfa' },
  { label: 'Communities',        path: '/communities',  desc: 'Build mission communities', color: '#ec4899' },
  { label: 'Social Feed',        path: '/social',       desc: 'Connect and inspire action', color: '#f59e0b' },
  { label: 'My HQ',              path: '/hq',           desc: 'View your portfolio and impact', color: 'var(--eco-teal)' },
];

// ─── Fund Mission Modal ────────────────────────────────────────────────────────
// Shows the full opportunity details before the Whale confirms funding.
// On confirm, navigates to CommandCenter with the opportunity pre-filled.

function FundModal({ opp, onNavigate, onClose }) {
  if (!opp) return null;

  const handleFund = () => {
    // Encode key opportunity fields into the URL so CommandCenter can pre-fill
    const params = new URLSearchParams({
      oppId:       opp.id,
      title:       opp.title,
      description: opp.suggestedAction,
      location:    opp.location,
      priority:    'HIGH',
    });
    onClose();
    onNavigate(`/command?${params.toString()}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(5,10,18,0.88)', backdropFilter: 'blur(10px)' }}>
      <div className="w-full max-w-lg rounded-[var(--eco-radius-card)] overflow-hidden"
        style={{ background: 'var(--eco-bg-surface)', border: '1px solid rgba(56,189,248,0.25)' }}>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start justify-between"
          style={{ borderBottom: '1px solid var(--eco-border-soft)' }}>
          <div>
            <span className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)' }}>
              LILO OPPORTUNITY · NOT YET FUNDED
            </span>
            <h2 className="text-lg font-bold text-white mt-2 leading-tight">{opp.title}</h2>
            <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--eco-text-secondary)' }}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9a3 3 0 100-6 3 3 0 000 6zm0 0v4" />
              </svg>
              {opp.location}
              {opp.coordinates && (
                <span style={{ color: 'var(--eco-text-muted)' }}>
                  {' '}· {opp.coordinates[1].toFixed(4)}°N {opp.coordinates[0].toFixed(4)}°E
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center ml-4 flex-shrink-0 transition-colors hover:bg-white/10"
            style={{ color: 'var(--eco-text-muted)' }}>✕</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-4">

          {/* Evidence */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--eco-text-muted)' }}>Evidence</p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--eco-text-secondary)' }}>{opp.evidence}</p>
          </div>

          {/* Proposed action */}
          <div className="p-3 rounded-xl" style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#38bdf8' }}>Proposed intervention</p>
            <p className="text-sm" style={{ color: 'var(--eco-text-secondary)' }}>{opp.suggestedAction}</p>
          </div>

          {/* Budget / participants / duration grid */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Est. budget',      value: displayMoney(opp.estimatedFunding) },
              { label: 'Participants',     value: opp.estimatedParticipants ? `${opp.estimatedParticipants} Grinders` : '—' },
              { label: 'Duration',         value: opp.durationDays ? `${opp.durationDays} days` : '—' },
            ].map(s => (
              <div key={s.label} className="p-3 rounded-xl text-center"
                style={{ background: 'var(--eco-bg-elevated)', border: '1px solid var(--eco-border)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--eco-text-muted)' }}>{s.label}</p>
                <p className="text-sm font-bold" style={{ color: '#38bdf8' }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Confidence */}
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--eco-text-muted)' }}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" style={{ color: '#38bdf8' }}>
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            </svg>
            Lilo confidence: <span style={{ color: '#38bdf8' }} className="font-bold">{opp.confidence}%</span>
            <span className="ml-1">· This is an estimate, not an approved budget.</span>
          </div>

          {/* Lifecycle notice */}
          <div className="px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
            Funding this opportunity creates a DRAFT mission. It must be activated before Grinders can join.
            Estimates shown are preliminary — final scope is set in Mission Studio.
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={handleFund}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-black transition-opacity hover:opacity-90"
            style={{ background: '#38bdf8' }}>
            Open Mission Studio →
          </button>
          <button onClick={onClose}
            className="px-4 py-3 rounded-xl text-sm transition-colors hover:bg-white/5"
            style={{ border: '1px solid var(--eco-border)', color: 'var(--eco-text-secondary)' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WhaleHome({ user: propUser, onNavigate }) {
  const { user: authUser } = useAuth();
  const { setRole } = useUserRole();
  const u = authUser || propUser;
  const rep = u?.reputation || {};
  const firstName = (u?.name || 'Sentinel').split(' ')[0];

  const [missions, setMissions] = useState([]);
  const [missionLoading, setMissionLoading] = useState(true);
  const [fundingOpp, setFundingOpp] = useState(null);
  const abort = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const fetch_ = async () => {
      setMissionLoading(true);
      abort.current?.abort();
      abort.current = new AbortController();
      const v2 = getV2ApiOrigin();
      if (!v2) { setMissions([]); setMissionLoading(false); return; }
      try {
        const res = await fetch(`${v2}/api/v2/missions`, { signal: abort.current.signal, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        if (!cancelled) setMissions(data?.missions ?? []);
      } catch (e) {
        if (!cancelled && e.name !== 'AbortError') setMissions([]);
      } finally {
        if (!cancelled) setMissionLoading(false);
      }
    };
    fetch_();
    return () => { cancelled = true; abort.current?.abort(); };
  }, []);

  const totalMissions = missions.length;
  const activeMissions = missions.filter(m => m.status === 'ACTIVE').length;

  return (
    <div className="eco-page eco-fade-up w-full">

      {/* ── Hero ── */}
      <div className="eco-home-top-grid mb-8">
        {/* Left: Whale identity + portfolio summary */}
        <div className="relative overflow-hidden p-5 rounded-[var(--eco-radius-card)] flex flex-col justify-between gap-4"
          style={{ background: 'var(--eco-bg-surface)', border: '1px solid rgba(56,189,248,0.2)' }}>
          <div className="absolute right-0 top-0 w-48 h-36 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at top right, rgba(56,189,248,0.07) 0%, transparent 70%)' }} />

          <div className="relative z-10 flex items-start gap-3">
            <div className="w-16 h-16 rounded-2xl flex-shrink-0 overflow-hidden border-2"
              style={{ borderColor: 'rgba(56,189,248,0.4)' }}>
              {u?.avatar
                ? <img src={u.avatar} alt={firstName} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white"
                    style={{ background: 'linear-gradient(135deg,#0c3a5e,#071e34)' }}>
                    {firstName[0]?.toUpperCase()}
                  </div>
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>{timeGreeting()}</p>
              <h1 className="text-2xl font-bold text-white leading-tight truncate">{firstName}</h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold mt-1"
                style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}>
                <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5">
                  <path d="M6 1C3.2 1 1 3.2 1 6s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 9c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4z" opacity=".4"/>
                  <path d="M6 3v3.4L8 8l.7-.7-1.5-1.5V3H6z"/>
                </svg>
                Whale
              </span>
            </div>
          </div>

          <p className="relative z-10 text-sm italic" style={{ color: 'var(--eco-text-secondary)' }}>
            Your funding creates real-world environmental impact.
          </p>

          <div className="relative z-10 grid grid-cols-3 gap-2">
            {[
              { label: 'Missions', value: missionLoading ? '…' : totalMissions },
              { label: 'Active', value: missionLoading ? '…' : activeMissions },
              { label: 'Opportunities', value: DEV_OPPORTUNITIES.length || '—' },
            ].map(stat => (
              <div key={stat.label} className="p-2 rounded-xl text-center"
                style={{ background: 'var(--eco-bg-elevated)' }}>
                <p className="text-base font-bold" style={{ color: '#38bdf8' }}>{stat.value}</p>
                <p className="text-[10px]" style={{ color: 'var(--eco-text-muted)' }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Create mission CTA */}
        <div className="eco-mission-card overflow-hidden" style={{ minHeight: 180 }}>
          <div className="absolute inset-0">
            <img src="https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=700&q=70"
              alt="" className="w-full h-full object-cover opacity-20" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a1422] to-[#0a1422]/50" />
          </div>
          <div className="relative z-10 p-6 flex flex-col gap-4 h-full justify-between"
            style={{ border: '1px solid rgba(56,189,248,0.2)', borderRadius: 'var(--eco-radius-card)' }}>
            <div>
              <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border"
                style={{ borderColor: 'rgba(56,189,248,0.35)', color: '#38bdf8', background: 'rgba(56,189,248,0.10)' }}>
                WHALE STUDIO
              </span>
              <h2 className="text-xl font-bold text-white mt-3 leading-tight">
                Fund environmental change
              </h2>
              <p className="text-sm mt-2" style={{ color: 'var(--eco-text-secondary)' }}>
                Discover Lilo-identified opportunities or create a mission from scratch. Grinders are ready to participate.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => onNavigate('/command')}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold text-black transition-opacity hover:opacity-90"
                style={{ background: '#38bdf8' }}>
                Create Mission
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 5l5 5-5 5M5 10h10" />
                </svg>
              </button>
              <button onClick={() => onNavigate('/map')}
                className="px-4 py-2 rounded-full text-sm font-semibold transition-colors hover:bg-white/10"
                style={{ border: '1px solid rgba(56,189,248,0.35)', color: '#38bdf8' }}>
                View Map
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Lilo opportunities ── */}
      {DEV_OPPORTUNITIES.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white">Lilo-Discovered Opportunities</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--eco-text-muted)' }}>
                Unfunded locations where a mission could create impact · not yet playable by Grinders
              </p>
            </div>
            <button onClick={() => onNavigate('/map')}
              className="text-xs flex items-center gap-1 transition-opacity hover:opacity-70"
              style={{ color: '#38bdf8' }}>
              View on map
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {DEV_OPPORTUNITIES.map(opp => (
              <OpportunityCard key={opp.id} opp={opp} onNavigate={onNavigate} onFund={setFundingOpp} />
            ))}
          </div>
        </section>
      )}

      {/* ── Quick actions ── */}
      <section className="mb-8">
        <h2 className="text-base font-bold text-white mb-4">Whale Actions</h2>
        <div className="eco-worlds-grid">
          {WHALE_ACTIONS.map(a => (
            <button key={a.label} onClick={() => onNavigate(a.path)}
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
          <p className="text-xs font-medium text-white">Switch to Grinder experience</p>
          <p className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>Participate in and complete missions</p>
        </div>
        <button onClick={() => { setRole('grinder'); onNavigate('/'); }}
          className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-white/10"
          style={{ border: '1px solid rgba(34,197,94,0.4)', color: 'var(--eco-green)' }}>
          Switch →
        </button>
      </div>

      {/* Fund Mission modal */}
      {fundingOpp && (
        <FundModal
          opp={fundingOpp}
          onNavigate={onNavigate}
          onClose={() => setFundingOpp(null)}
        />
      )}
    </div>
  );
}
