/**
 * EcoTopNav — responsive top navigation using the real EcoNet logo.
 *
 * Desktop (≥1100px): logo | nav links | search · bell · user pill
 * Mobile (<1100px):  logo | bell
 *
 * Logo: /econet-logo.jpeg — the project's real brand asset.
 * Do NOT replace with an SVG invention.
 */

import { useAuth } from '../context/AuthContext';
import { resolveMediaUrl } from '../services/runtimeConfig';

const BellIcon = () => (
  <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-[18px] h-[18px]">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M14 15.5h4.5l-1.3-1.3A1.9 1.9 0 0116.75 13V10a5.75 5.75 0 10-11.5 0v3c0 .5-.2 1-.55 1.32L3.5 15.5H8m6 0v1a3 3 0 11-6 0v-1m6 0H8" />
  </svg>
);

const UserIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M10 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zm-6.5 8a6.5 6.5 0 0113 0" />
  </svg>
);

const NAV_LINKS = [
  { label: 'Connect Worlds', path: '/' },
  { label: 'My HQ',        path: '/hq' },
  { label: 'Social',       path: '/social' },
  { label: 'World Map',    path: '/map' },
  { label: 'Communities',  path: '/communities' },
  { label: 'Marketplace',  path: '/marketplace' },
  { label: 'Command',      path: '/command' },
];

export default function EcoTopNav({ onNavigate, currentPath = '/' }) {
  const { user } = useAuth();

  const isActive = (path) => {
    if (path === '/') return currentPath === '/' || currentPath === '/hq' && false;
    return currentPath === path || currentPath.startsWith(path + '/');
  };

  return (
    <header className="eco-topnav fixed top-0 left-0 right-0 z-50 flex items-center px-4 xl:px-8">

      {/* ── Real EcoNet brand mark ───────────────────────── */}
      <button
        onClick={() => onNavigate('/')}
        className="flex items-center gap-3 select-none flex-shrink-0"
        aria-label="EcoNet IO home"
      >
        {/* Real project logo — /econet-logo.jpeg in public/ */}
        <img
          src="/econet-logo.jpeg"
          alt="EcoNet IO"
          className="w-9 h-9 rounded-xl object-cover shadow-md flex-shrink-0"
          style={{ border: '1px solid rgba(34,197,94,0.35)' }}
        />
        <div className="leading-tight">
          <div className="text-[14px] font-bold text-white tracking-wide">
            EcoNet <span style={{ color: 'var(--eco-green)' }}>IO</span>
          </div>
          <div className="hidden md:block text-[9px] tracking-widest uppercase font-medium"
            style={{ color: 'var(--eco-text-muted)' }}>
            Together. For a thriving planet.
          </div>
        </div>
      </button>

      {/* ── Desktop nav links (≥1100px only) ─────────────── */}
      <nav className="eco-nav-desktop flex items-center gap-0.5 flex-1 ml-8 overflow-hidden">
        {NAV_LINKS.map((link) => {
          const active = isActive(link.path);
          return (
            <button
              key={link.path}
              onClick={() => onNavigate(link.path)}
              className="relative px-3.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap hover:text-white"
              style={{
                fontSize: 13,
                color: active ? '#fff' : 'var(--eco-text-secondary)',
                background: active ? 'rgba(34,197,94,0.12)' : 'transparent',
              }}
            >
              {link.label}
              {active && (
                <span
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-5 rounded-full"
                  style={{ background: 'var(--eco-green)' }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Mobile spacer */}
      <div className="flex-1 eco-nav-mobile-spacer" />

      {/* ── Right actions ─────────────────────────────────── */}
      <div className="flex items-center gap-1">
        {/* Bell / Alerts */}
        <button
          onClick={() => onNavigate('/amber-alerts')}
          className="relative p-2.5 rounded-full transition-colors hover:text-white"
          style={{ color: 'var(--eco-text-secondary)' }}
          title="Alerts"
        >
          <BellIcon />
          <span
            className="absolute top-1.5 right-1.5 w-3 h-3 bg-red-500 text-white flex items-center justify-center rounded-full font-bold"
            style={{ fontSize: 7, lineHeight: 1 }}
          >3</span>
        </button>

        {/* User pill — desktop only */}
        <button
          onClick={() => onNavigate(user ? '/hq' : '/login')}
          className="eco-nav-desktop flex items-center gap-2 ml-1 px-3.5 py-1.5 rounded-xl transition-all hover:bg-white/10"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          {user?.avatar
            ? <img src={resolveMediaUrl(user.avatar)} alt={user.name || 'User'}
                className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
            : (
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                style={{ background: 'rgba(34,197,94,0.18)', color: 'var(--eco-green)' }}>
                {user ? (user.name?.[0] ?? 'U').toUpperCase() : <UserIcon />}
              </div>
            )
          }
          <span className="text-[13px] font-medium text-white max-w-[96px] truncate">
            {user ? (user.name || 'Sentinel') : 'Sign in'}
          </span>
        </button>
      </div>
    </header>
  );
}
