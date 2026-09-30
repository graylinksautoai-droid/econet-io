/**
 * EcoShell — single global application shell.
 *
 * All authenticated app pages render inside this shell.
 * Auth pages use noChrome=true which suppresses nav and shows only the
 * planetary background.
 *
 * Responsive behaviour (controlled via CSS in index.css):
 *   Desktop ≥1100px:
 *     - EcoTopNav shows full horizontal nav links + user pill
 *     - EcoBottomNav is hidden (.eco-botnav-mobile display:none)
 *     - Content has only top padding (no bottom nav padding)
 *
 *   Mobile <1100px:
 *     - EcoTopNav shows logo + bell only
 *     - EcoBottomNav visible at bottom
 *     - Content has both top and bottom padding
 */

import EcoTopNav from '../components/EcoTopNav';
import EcoBottomNav from '../components/EcoBottomNav';

export default function EcoShell({ children, currentPath = '/', onNavigate, noChrome = false }) {

  if (noChrome) {
    return (
      <div className="relative min-h-screen">
        <div className="eco-planet-bg" />
        <div className="relative z-10 min-h-screen">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      {/* Planetary atmosphere */}
      <div className="eco-planet-bg" />

      {/* Top nav — always visible */}
      <EcoTopNav onNavigate={onNavigate} currentPath={currentPath} />

      {/* Scrollable content area
          - eco-shell-content class (in index.css) adjusts padding responsively:
            desktop: padding-top only (no bottom nav)
            mobile:  padding-top + padding-bottom (above bottom nav)
      */}
      <main className="eco-shell-content relative z-10">
        {children}
      </main>

      {/* Bottom nav — hidden on desktop via .eco-botnav-mobile CSS class */}
      <EcoBottomNav currentPath={currentPath} onNavigate={onNavigate} />
    </div>
  );
}
