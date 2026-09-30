/**
 * Social — /social and /reports
 *
 * EcoNet social feed with proper desktop composition.
 *
 * Desktop (≥1100px):
 *   LEFT  — profile chip, navigation shortcuts, Lilo prompt
 *   CENTER — post composer + main feed (SocialDashboard, Lilo embedded)
 *   RIGHT  — impact widget, submit report CTA, community discovery
 *
 * Mobile: single column
 *
 * Data: feedService → GET /api/reports/feed (real backend, degrades gracefully)
 * Lilo: LiloAI embedded inside SocialDashboard — preserved as-is.
 */

import SocialDashboard from '../components/SocialDashboard';
import DashboardContainer from '../features/dashboard/DashboardContainer';
import { useAuth } from '../context/AuthContext';

export default function Social({ user: propUser, onNavigate, onLogout }) {
  const { user: authUser } = useAuth();
  const u = authUser || propUser;
  const dashboard = DashboardContainer({ user: u, onLogout, onNavigate });

  return (
    <div className="eco-social-layout w-full">

      {/* ── Desktop left sidebar ── */}
      <aside className="eco-social-left">
        <div className="sticky top-20 space-y-4">

          {/* Profile chip */}
          {u && (
            <div className="p-4 rounded-2xl"
              style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border-2"
                  style={{ borderColor: 'rgba(34,197,94,0.4)' }}>
                  {u.avatar
                    ? <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white"
                        style={{ background: 'linear-gradient(135deg,#134e2a,#0b3320)' }}>
                        {(u.name?.[0] ?? 'S').toUpperCase()}
                      </div>
                  }
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{u.name || 'Sentinel'}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--eco-text-muted)' }}>
                    {u.reputation?.verifiedReporter ? '✓ Verified Reporter' : 'Community Member'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 text-center">
                {[
                  { label: 'Reports', value: u.reputation?.totalReports ?? 0 },
                  { label: 'Trust',   value: `${u.reputation?.trustScore ?? 0}%` },
                  { label: 'Leaves',  value: u.reputation?.leaves ?? 0 },
                ].map(s => (
                  <div key={s.label} className="py-1.5 rounded-lg"
                    style={{ background: 'var(--eco-bg-elevated)' }}>
                    <p className="text-sm font-bold text-white">{s.value}</p>
                    <p className="text-[10px]" style={{ color: 'var(--eco-text-muted)' }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick nav */}
          <div className="p-4 rounded-2xl space-y-1"
            style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2"
              style={{ color: 'var(--eco-text-muted)' }}>Quick Access</p>
            {[
              { label: 'Submit Report',  path: '/submit' },
              { label: 'World Map',      path: '/map' },
              { label: 'Communities',    path: '/communities' },
              { label: 'Command Center', path: '/command' },
              { label: 'My HQ',          path: '/hq' },
            ].map(item => (
              <button key={item.path} onClick={() => onNavigate(item.path)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors hover:bg-white/5 text-left"
                style={{ color: 'var(--eco-text-secondary)' }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: 'var(--eco-green)' }} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Center: main social feed (Lilo embedded inside SocialDashboard) ── */}
      <main className="eco-social-center min-w-0">
        <SocialDashboard
          user={u}
          reports={dashboard.feed || []}
          isCommandMode={false}
        />
      </main>

      {/* ── Desktop right panel ── */}
      <aside className="eco-social-right">
        <div className="sticky top-20 space-y-4">

          {/* Environmental context banner */}
          <div className="p-4 rounded-2xl overflow-hidden relative"
            style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
            <img src="https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=400&q=55"
              alt="" className="absolute inset-0 w-full h-full object-cover opacity-10" loading="lazy" />
            <div className="relative z-10">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2"
                style={{ color: 'var(--eco-green)' }}>EcoNet Community</p>
              <p className="text-sm text-white font-semibold">
                Together we restore ecosystems and build resilient communities.
              </p>
              <button onClick={() => onNavigate('/communities')}
                className="mt-3 text-xs font-medium transition-opacity hover:opacity-70"
                style={{ color: 'var(--eco-green)' }}>
                Explore communities →
              </button>
            </div>
          </div>

          {/* Submit report CTA */}
          <button onClick={() => onNavigate('/submit')}
            className="w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-all hover:border-emerald-500/30"
            style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <svg viewBox="0 0 20 20" fill="none" stroke="#22c55e" strokeWidth={1.8} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 4v12M4 10h12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Submit a report</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--eco-text-muted)' }}>
                Document an environmental incident
              </p>
            </div>
          </button>

          {/* Map discovery */}
          <button onClick={() => onNavigate('/map')}
            className="w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-all hover:border-teal-500/30"
            style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(45,212,191,0.10)', border: '1px solid rgba(45,212,191,0.2)' }}>
              <svg viewBox="0 0 20 20" fill="none" stroke="var(--eco-teal)" strokeWidth={1.8} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16.5L7.5 15V4L4 5.5v11zm3.5-1.5L12.5 17V6L7.5 4.5v11zm5 2L16 15.5V4.5L12.5 6v11z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Explore the map</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--eco-text-muted)' }}>
                Discover missions and Lilo opportunities
              </p>
            </div>
          </button>
        </div>
      </aside>
    </div>
  );
}
