/**
 * EcoBottomNav — mobile bottom tab bar.
 * Hidden on desktop (≥1100px) via .eco-botnav-mobile class.
 * Desktop navigation is in EcoTopNav.
 *
 * Tabs: Connect Worlds · My HQ · Social · World Map · Community
 */

const tabs = [
  {
    key: '/',
    label: 'Connect Worlds',
    icon: (
      <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5">
        <circle cx="11" cy="11" r="9" />
        <path d="M2 11h18M11 2a14 14 0 010 18M11 2a14 14 0 000 18" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: '/hq',
    label: 'My HQ',
    icon: (
      <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3 9L11 3l8 6v10a.7.7 0 01-.7.7h-4.4v-4.8H8.1v4.8H3.7A.7.7 0 013 19V9z" />
      </svg>
    ),
  },
  {
    key: '/social',
    label: 'Social',
    icon: (
      <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M16 18h4.5v-1.8a2.75 2.75 0 00-4.92-1.7M16 18H6m10 0v-1.8c0-.6-.12-1.18-.33-1.7M6 18H1.5v-1.8a2.75 2.75 0 014.92-1.7M6 18v-1.8c0-.6.12-1.18.33-1.7m0 0A4.6 4.6 0 0111 12.5a4.6 4.6 0 014.67 2.0" />
      </svg>
    ),
  },
  {
    key: '/map',
    label: 'World Map',
    icon: (
      <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M8.5 19L3 16.5V3l5.5 2.5M8.5 19V5.5M8.5 19l5-2.5M13.5 16.5V4M13.5 16.5L19 19V5.5L13.5 4" />
      </svg>
    ),
  },
  {
    key: '/communities',
    label: 'Community',
    icon: (
      <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M11 4a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm-6.5 14a6.5 6.5 0 0113 0" />
      </svg>
    ),
  },
];

export default function EcoBottomNav({ currentPath, onNavigate }) {
  const isActive = (key) => {
    if (key === '/') return currentPath === '/';
    return currentPath === key || currentPath.startsWith(key + '/');
  };

  return (
    // eco-botnav-mobile hides this on desktop — see index.css
    <nav className="eco-botnav eco-botnav-mobile fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-1"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {tabs.map((tab) => {
        const active = isActive(tab.key);
        return (
          <button
            key={tab.key}
            onClick={() => onNavigate(tab.key)}
            className="relative flex flex-col items-center gap-0.5 pt-2 pb-1.5 px-2 min-w-[52px] flex-1 transition-colors"
            style={{ color: active ? 'var(--eco-green)' : 'var(--eco-text-muted)' }}
          >
            {tab.badge && (
              <span
                className="absolute top-1 right-1.5 w-4 h-4 bg-red-500 text-white flex items-center justify-center rounded-full font-bold z-10"
                style={{ fontSize: 9, lineHeight: 1 }}
              >
                {tab.badge}
              </span>
            )}
            {tab.icon}
            <span className="text-[9px] font-medium leading-tight text-center block"
              style={{ maxWidth: 52 }}>
              {tab.label}
            </span>
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
  );
}
