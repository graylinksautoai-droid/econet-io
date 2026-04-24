import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  FaBars,
  FaCog,
  FaFileAlt,
  FaHome,
  FaLeaf,
  FaMap,
  FaMoon,
  FaStore,
  FaSun,
  FaTimes,
  FaTrophy,
  FaUser
} from 'react-icons/fa';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

const Navbar = ({ onNavigate, onToggleCommandMode, isCommandMode }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const themeIcon = theme === 'dark'
    ? <FaMoon className="text-primary" />
    : theme === 'green'
      ? <FaLeaf className="text-primary" />
      : <FaSun className="text-primary" />;

  return (
    <>
      <nav className="flex items-center justify-between border-b border-theme bg-secondary p-4 text-primary shadow-md">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="rounded p-2 transition-colors hover:bg-tertiary lg:hidden"
            title="Toggle menu"
          >
            <FaBars />
          </button>

          <div className="hidden space-x-4 lg:flex">
            <button onClick={() => onNavigate('/')} className="text-secondary transition-colors hover:text-primary">Home</button>
            <button onClick={() => onNavigate('/marketplace')} className="text-secondary transition-colors hover:text-primary">Market</button>
            <button onClick={() => onNavigate('/reports')} className="text-secondary transition-colors hover:text-primary">Reports</button>
          </div>

          {!isOnline && (
            <span className="rounded bg-black/30 px-2 py-0.5 text-sm font-medium text-amber-300" title="Connection lost. Reports will sync when back online.">
              Offline
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2 sm:space-x-4">
          <div className="hidden items-center space-x-2 rounded-full bg-amber-600 px-3 py-1 sm:flex">
            <FaTrophy className="text-yellow-300" />
            <span className="text-sm font-medium">Level 5</span>
            <span className="rounded bg-yellow-700 px-2 py-0.5 text-xs">1,250 XP</span>
          </div>

          <button
            onClick={() => onNavigate('/settings')}
            className="rounded p-2 transition-colors hover:bg-tertiary"
            title="Settings"
          >
            <FaCog />
          </button>

          {user ? (
            <button
              onClick={() => onNavigate('/profile')}
              className="hidden items-center space-x-2 rounded bg-tertiary px-3 py-1 transition-colors hover:bg-primary hover:bg-opacity-20 sm:flex"
            >
              <FaUser />
              <span className="text-sm">Profile</span>
            </button>
          ) : (
            <button
              onClick={() => onNavigate('/login')}
              className="hidden items-center space-x-2 rounded bg-emerald-600 px-3 py-1 text-white transition-colors hover:bg-emerald-700 sm:flex"
            >
              <FaUser />
              <span className="text-sm">Login</span>
            </button>
          )}

          <button
            onClick={toggleTheme}
            className="flex items-center space-x-2 rounded bg-tertiary px-3 py-1 transition-colors hover:bg-primary hover:bg-opacity-20"
            title={`Current theme: ${theme}. Click to change theme.`}
          >
            {themeIcon}
            <span className="text-primary">
              {theme === 'dark' ? 'Dark' : theme === 'green' ? 'Green' : 'Light'}
            </span>
          </button>

          <span className="rounded bg-yellow-700 px-2 py-0.5 text-xs">1,250 XP</span>
        </div>
      </nav>

      <div
        className={`fixed inset-0 z-50 transform transition-transform duration-300 ease-in-out lg:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />

        <div className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-theme bg-secondary text-primary shadow-2xl">
          <div className="flex items-center justify-between border-b border-theme bg-theme-muted p-4">
            <div className="flex items-center gap-3">
              <img src="/econet-logo.jpeg" alt="EcoNet logo" className="h-10 w-10 rounded-2xl object-cover" />
              <span className="text-lg font-bold text-primary">EcoNet</span>
            </div>
            <button onClick={() => setIsMobileMenuOpen(false)} className="rounded p-1 text-secondary transition-colors hover:text-primary">
              <FaTimes className="h-6 w-6" />
            </button>
          </div>

          <div className="flex-1 py-4">
            <nav className="space-y-1 px-3">
              <button onClick={() => { onNavigate('/'); setIsMobileMenuOpen(false); }} className="group flex w-full items-center space-x-3 rounded-xl px-4 py-3 text-secondary transition-all duration-200 hover:bg-tertiary hover:text-primary">
                <FaHome className="text-secondary group-hover:text-primary" />
                <span className="font-medium">Home</span>
              </button>
              <button onClick={() => { onNavigate('/marketplace'); setIsMobileMenuOpen(false); }} className="group flex w-full items-center space-x-3 rounded-xl px-4 py-3 text-secondary transition-all duration-200 hover:bg-tertiary hover:text-primary">
                <FaStore className="text-secondary group-hover:text-primary" />
                <span className="font-medium">Market</span>
              </button>
              <button onClick={() => { onNavigate('/reports'); setIsMobileMenuOpen(false); }} className="group flex w-full items-center space-x-3 rounded-xl px-4 py-3 text-secondary transition-all duration-200 hover:bg-tertiary hover:text-primary">
                <FaFileAlt className="text-secondary group-hover:text-primary" />
                <span className="font-medium">Reports</span>
              </button>
              <button onClick={() => { onToggleCommandMode?.(); setIsMobileMenuOpen(false); }} className="group flex w-full items-center space-x-3 rounded-xl px-4 py-3 text-secondary transition-all duration-200 hover:bg-tertiary hover:text-primary">
                <FaMap className="text-secondary group-hover:text-primary" />
                <span className="font-medium">{isCommandMode ? 'Exit Command Mode' : 'Open Command Mode'}</span>
              </button>

              {user ? (
                <button onClick={() => { onNavigate('/profile'); setIsMobileMenuOpen(false); }} className="group flex w-full items-center space-x-3 rounded-xl px-4 py-3 text-secondary transition-all duration-200 hover:bg-tertiary hover:text-primary">
                  <FaUser className="text-secondary group-hover:text-primary" />
                  <span className="font-medium">Profile</span>
                </button>
              ) : (
                <button onClick={() => { onNavigate('/login'); setIsMobileMenuOpen(false); }} className="flex w-full items-center space-x-3 rounded-xl bg-emerald-600 px-4 py-3 text-white transition-all duration-200 hover:bg-emerald-700">
                  <FaUser />
                  <span className="font-medium">Login</span>
                </button>
              )}

              <button onClick={() => { onNavigate('/settings'); setIsMobileMenuOpen(false); }} className="group flex w-full items-center space-x-3 rounded-xl px-4 py-3 text-secondary transition-all duration-200 hover:bg-tertiary hover:text-primary">
                <FaCog className="text-secondary group-hover:text-primary" />
                <span className="font-medium">Settings</span>
              </button>
              <button onClick={() => { toggleTheme(); setIsMobileMenuOpen(false); }} className="group flex w-full items-center space-x-3 rounded-xl px-4 py-3 text-secondary transition-all duration-200 hover:bg-tertiary hover:text-primary">
                {themeIcon}
                <span className="font-medium">Theme: {theme === 'dark' ? 'Dark' : theme === 'green' ? 'Green' : 'Light'}</span>
              </button>
            </nav>
          </div>

          <div className="border-t border-theme bg-theme-muted p-4">
            <div className="flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-tertiary">
                {user?.avatar ? <img src={user.avatar} alt={user.name || 'User'} className="h-10 w-10 object-cover" /> : <FaUser className="text-primary" />}
              </div>
              <div>
                <p className="text-sm font-medium text-primary">{user ? user.name || 'Sentinel' : 'Guest mode'}</p>
                <p className="text-xs text-secondary">{user ? '1,250 XP' : 'Sign in for shared feed sync'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

Navbar.propTypes = {
  onNavigate: PropTypes.func.isRequired,
  onToggleCommandMode: PropTypes.func,
  isCommandMode: PropTypes.bool,
};

export default Navbar;
