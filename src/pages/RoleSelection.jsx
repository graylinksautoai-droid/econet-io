/**
 * RoleSelection — the EcoNet IO role-selection / welcome screen.
 *
 * Shown to authenticated users who have not yet chosen a role,
 * or who arrive at / without a stored role.
 *
 * Flow:
 *   1. User opens EcoNet.io
 *   2. Beautiful welcome experience with real EcoNet logo
 *   3. Two clearly differentiated role choices: GRINDER · WHALE
 *   4. User selects a role → navigated to the role-appropriate home
 *
 * Uses the project's real logo at /econet-logo.jpeg.
 * Does NOT require authentication — role choice can happen before login.
 * If the user is already authenticated, their name is shown.
 *
 * Lilo is visible as EcoNet's personal AI companion, not a generic chatbot.
 */

import { useState } from 'react';
import { useUserRole } from '../context/UserRoleContext';
import { useAuth } from '../context/AuthContext';

const ROLES = [
  {
    id: 'grinder',
    title: 'Grinder',
    tagline: 'Take action. Make impact.',
    description: 'Join active field missions, earn XP and EcoCoins, report environmental issues, and grow your community reputation.',
    highlights: [
      'Discover & join missions near you',
      'Report environmental incidents',
      'Earn XP, EcoCoins & reputation',
      'Connect with your community',
      'Track your environmental impact',
    ],
    img: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=600&q=70',
    accent: 'var(--eco-green)',
    glow: 'rgba(34,197,94,0.15)',
  },
  {
    id: 'whale',
    title: 'Whale',
    tagline: 'Create missions. Scale impact.',
    description: 'Create and fund environmental missions, discover Lilo-identified opportunities, build communities, and measure your portfolio impact.',
    highlights: [
      'Create & fund new missions',
      'Discover Lilo-identified opportunities',
      'View mission performance',
      'Build environmental communities',
      'Track funded mission outcomes',
    ],
    img: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=600&q=70',
    accent: '#38bdf8',
    glow: 'rgba(56,189,248,0.15)',
  },
];

export default function RoleSelection({ onNavigate }) {
  const { setRole } = useUserRole();
  const { user } = useAuth();
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const handleChoose = async (roleId) => {
    setSelected(roleId);
    setConfirming(true);
    await new Promise(r => setTimeout(r, 340));
    setRole(roleId);
    // If user is already authenticated, go straight to their role home.
    // If not, go to login so they can authenticate then return home.
    onNavigate(user ? '/' : '/login');
  };

  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center px-4 py-12 overflow-hidden"
      style={{ background: 'var(--eco-bg-canvas)' }}
    >
      {/* Atmospheric background */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 120% 70% at 50% 100%, rgba(16,60,30,0.45) 0%, transparent 60%)',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 80% 50% at 20% 20%, rgba(10,30,55,0.5) 0%, transparent 55%)',
        }} />
      </div>

      <div className="relative z-10 w-full max-w-4xl mx-auto">

        {/* ── Brand ── */}
        <div className="flex flex-col items-center mb-10">
          <img
            src="/econet-logo.jpeg"
            alt="EcoNet IO"
            className="w-16 h-16 rounded-2xl object-cover shadow-2xl mb-5"
            style={{ border: '2px solid rgba(34,197,94,0.4)' }}
          />
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-2 text-center">
            Welcome to <span style={{ color: 'var(--eco-green)' }}>EcoNet IO</span>
          </h1>
          {user?.name && (
            <p className="text-base mb-1" style={{ color: 'var(--eco-text-secondary)' }}>
              {user.name}
            </p>
          )}
          <p className="text-base text-center max-w-md" style={{ color: 'var(--eco-text-secondary)' }}>
            Different worlds. One mission. Infinite impact.
          </p>
          <p className="text-sm mt-3 font-medium text-center" style={{ color: 'var(--eco-text-muted)' }}>
            How will you participate?
          </p>
        </div>

        {/* ── Role cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
          {ROLES.map((r) => {
            const isHovered  = hovered === r.id;
            const isSelected = selected === r.id;
            return (
              <button
                key={r.id}
                onClick={() => !confirming && handleChoose(r.id)}
                onMouseEnter={() => setHovered(r.id)}
                onMouseLeave={() => setHovered(null)}
                disabled={confirming}
                className="relative overflow-hidden text-left transition-all duration-300"
                style={{
                  borderRadius: 'var(--eco-radius-card)',
                  border: `1.5px solid ${isSelected || isHovered
                    ? r.accent
                    : 'rgba(148,163,184,0.12)'}`,
                  background: isSelected || isHovered ? r.glow : 'var(--eco-bg-surface)',
                  transform: isSelected ? 'scale(0.99)' : isHovered ? 'scale(1.01)' : 'scale(1)',
                  boxShadow: isSelected || isHovered
                    ? `0 0 32px ${r.glow}, var(--eco-shadow-card)`
                    : 'var(--eco-shadow-card)',
                  minHeight: 320,
                }}
              >
                {/* Card background image */}
                <div className="absolute inset-0">
                  <img src={r.img} alt={r.title}
                    className="w-full h-full object-cover transition-opacity duration-300"
                    style={{ opacity: isHovered || isSelected ? 0.22 : 0.12 }}
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                </div>

                {/* Selection indicator */}
                {isSelected && (
                  <div className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: r.accent }}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="black" strokeWidth={2.5} className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l3 3 7-7" />
                    </svg>
                  </div>
                )}

                {/* Content */}
                <div className="relative z-10 p-6 flex flex-col gap-3 h-full">
                  <div
                    className="text-xs font-bold tracking-widest uppercase px-2.5 py-1 rounded-full self-start"
                    style={{
                      background: `${r.accent}1a`,
                      border: `1px solid ${r.accent}50`,
                      color: r.accent,
                    }}
                  >
                    {r.title}
                  </div>

                  <h2 className="text-2xl font-bold text-white mt-1">{r.tagline}</h2>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
                    {r.description}
                  </p>

                  <ul className="mt-2 space-y-1.5 flex-1">
                    {r.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                        <span className="mt-0.5 w-3.5 h-3.5 flex-shrink-0 rounded-full flex items-center justify-center"
                          style={{ background: `${r.accent}25`, border: `1px solid ${r.accent}50` }}>
                          <svg viewBox="0 0 10 10" fill="none" stroke={r.accent} strokeWidth={2} className="w-2 h-2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2 5l2 2 4-4" />
                          </svg>
                        </span>
                        {h}
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center gap-2 mt-3 pt-3"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <span className="text-sm font-semibold" style={{ color: r.accent }}>
                      {isSelected && confirming ? 'Entering…' : `Enter as ${r.title}`}
                    </span>
                    <svg viewBox="0 0 16 16" fill="none" stroke={r.accent} strokeWidth={2} className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Lilo hint ── */}
        <div className="flex items-center justify-center gap-2 text-xs"
          style={{ color: 'var(--eco-text-muted)' }}>
          <img src="/econet-logo.jpeg" alt="" className="w-4 h-4 rounded-md object-cover opacity-60" />
          <span>Lilo, your environmental AI, will guide you either way.</span>
        </div>

        {/* ── Sign in link ── */}
        <div className="flex justify-center mt-4">
          <button
            onClick={() => onNavigate('/login')}
            className="text-xs transition-opacity hover:opacity-70"
            style={{ color: 'var(--eco-text-muted)' }}
          >
            Already have an account? Sign in →
          </button>
        </div>
      </div>
    </div>
  );
}
