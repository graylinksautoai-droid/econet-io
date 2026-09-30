/**
 * App.jsx — EcoNet IO root router.
 *
 * Authentication / role flow:
 *   1. First-time visitor: /role → RoleSelection (Grinder or Whale)
 *   2. Auth pages: /login /register /forgot-password (noChrome)
 *   3. Authenticated app: role-aware navigation and home experience
 *
 * All app pages render inside EcoShell (single global shell).
 * Auth pages use noChrome=true (planet background only, no nav).
 */

import { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { RegionalProvider } from './context/RegionalContext.jsx';
import { UserRoleProvider, useUserRole } from './context/UserRoleContext.jsx';
import EcoShell from './layouts/EcoShell';

// Pages
import RoleSelection from './pages/RoleSelection';
import GrinderHome   from './pages/GrinderHome';
import WhaleHome     from './pages/WhaleHome';
import EcoHQ         from './pages/EcoHQ';
import Social        from './pages/Social';
import WorldMap      from './pages/WorldMap';
import Communities   from './pages/Communities';
import CommandCenter from './pages/CommandCenter';
import Marketplace   from './pages/Marketplace';
import SubmitReport  from './pages/SubmitReport';
import Profile       from './pages/Profile';
import EditProfile   from './pages/EditProfile';
import AmberAlerts   from './pages/AmberAlerts';
import Login         from './pages/Login';
import Register      from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Simulation    from './pages/Simulation';
import Wallet        from './pages/Wallet';
import Toolkit       from './pages/Toolkit';
import CarbonCredits from './pages/CarbonCredits';
import Chat          from './pages/Chat';

// Global overlays
import UnifiedButton from './components/UnifiedButton';
import SentinelLive  from './components/SentinelLive';

const AUTH_PATHS   = ['/login', '/register', '/forgot-password'];
const ROLE_PATH    = '/role';

function AppRouter() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [isLive, setIsLive]           = useState(false);
  const { user, logout }              = useAuth();
  const { role, clearRole }           = useUserRole();

  useEffect(() => {
    const sync = () => {
      setCurrentPath(window.location.pathname);
      setIsLive(window.location.pathname === '/live');
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    setIsLive(path === '/live');
  };

  const handleLogout = () => {
    clearRole();
    logout();
    navigate('/login');
  };

  const isAuthPage = AUTH_PATHS.includes(currentPath);
  const isRolePage = currentPath === ROLE_PATH;

  const renderPage = () => {
    // Role-selection: shown when no role is chosen yet (first visit or after logout)
    if (currentPath === ROLE_PATH || (!role && currentPath === '/')) {
      return <RoleSelection onNavigate={navigate} />;
    }

    switch (currentPath) {
      // Auth
      case '/login':         return <Login onNavigate={navigate} />;
      case '/register':      return <Register onNavigate={navigate} />;
      case '/forgot-password': return <ForgotPassword onNavigate={navigate} />;

      // Primary destinations
      case '/':
        if (role === 'whale') return <WhaleHome   user={user} onNavigate={navigate} />;
        return                        <GrinderHome user={user} onNavigate={navigate} />;

      case '/hq':            return <EcoHQ       user={user} onNavigate={navigate} onLogout={handleLogout} role={role} />;
      case '/social':
      case '/reports':       return <Social      user={user} onNavigate={navigate} onLogout={handleLogout} />;
      case '/map':           return <WorldMap    user={user} onNavigate={navigate} role={role} />;
      case '/communities':   return <Communities user={user} onNavigate={navigate} />;
      case '/command':       return <CommandCenter user={user} onNavigate={navigate} role={role} />;
      case '/marketplace':   return <Marketplace user={user} onNavigate={navigate} onLogout={handleLogout} />;

      // Secondary
      case '/submit':        return <SubmitReport  user={user} onNavigate={navigate} />;
      case '/profile':       return <Profile       user={user} onNavigate={navigate} onLogout={handleLogout} />;
      case '/edit-profile':
      case '/settings':      return <EditProfile   user={user} onNavigate={navigate} />;
      case '/amber-alerts':  return <AmberAlerts   user={user} onNavigate={navigate} onLogout={handleLogout} />;
      case '/simulation':    return <Simulation     user={user} onNavigate={navigate} />;
      case '/wallet':        return <Wallet         user={user} onNavigate={navigate} />;
      case '/toolkit':       return <Toolkit        user={user} onNavigate={navigate} />;
      case '/carbon':        return <CarbonCredits  user={user} onNavigate={navigate} />;
      case '/chat':          return <Chat           user={user} onNavigate={navigate} />;
      case '/setup-2fa':
      case '/change-password': return <EditProfile  user={user} onNavigate={navigate} />;

      default:
        if (role === 'whale') return <WhaleHome   user={user} onNavigate={navigate} />;
        return                        <GrinderHome user={user} onNavigate={navigate} />;
    }
  };

  const noChrome = isAuthPage || isRolePage || (!role && currentPath === '/');

  return (
    <EcoShell currentPath={currentPath} onNavigate={navigate} noChrome={noChrome}>
      {renderPage()}

      {user && !noChrome && (
        <UnifiedButton onNavigate={navigate} />
      )}

      {isLive && (
        <SentinelLive user={user} onStop={() => navigate('/')} onNavigate={navigate} />
      )}
    </EcoShell>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <RegionalProvider>
        <UserRoleProvider>
          <AppRouter />
        </UserRoleProvider>
      </RegionalProvider>
    </ThemeProvider>
  );
}
