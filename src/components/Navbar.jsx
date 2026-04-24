import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { FaMap, FaRss, FaUser, FaCog, FaTrophy, FaBars, FaTimes, FaHome, FaStore, FaFileAlt, FaMoon, FaSun, FaLeaf } from 'react-icons/fa';
import { useTheme } from '../context/ThemeContext';

const Navbar = ({ onNavigate, onToggleCommandMode, isCommandMode }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

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

  return (
    <>
      <nav className="bg-secondary text-primary p-4 flex justify-between items-center shadow-md border-b border-theme">
        <div className="flex items-center space-x-4">
          {/* Mobile Menu Toggle */}
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-2 hover:bg-tertiary rounded transition-colors"
            title="Toggle menu"
          >
            <FaBars />
          </button>
          
          {/* Desktop Navigation */}
          <div className="hidden lg:flex space-x-4">
            <button onClick={() => onNavigate('/')} className="text-secondary hover:text-primary transition-colors">Home</button>
            <button onClick={() => onNavigate('/marketplace')} className="text-secondary hover:text-primary transition-colors">Market</button>
            <button onClick={() => onNavigate('/reports')} className="text-secondary hover:text-primary transition-colors">Reports</button>
          </div>
          
          {!isOnline && (
            <span className="text-amber-300 text-sm font-medium bg-black/30 px-2 py-0.5 rounded" title="Connection lost. Reports will sync when back online.">
              Offline
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Gamification */}
          <div className="flex items-center space-x-2 bg-amber-600 px-3 py-1 rounded-full">
            <FaTrophy className="text-yellow-300" />
            <span className="text-sm font-medium">Level 5</span>
            <span className="text-xs bg-yellow-700 px-2 py-0.5 rounded">1,250 XP</span>
          </div>
          
          {/* Settings */}
          <button 
            onClick={() => onNavigate('/settings')}
            className="p-2 hover:bg-tertiary rounded transition-colors"
            title="Settings"
          >
            <FaCog />
          </button>
          
          {/* Profile */}
          <button 
            onClick={() => onNavigate('/profile')}
            className="flex items-center space-x-2 bg-tertiary px-3 py-1 rounded hover:bg-primary hover:bg-opacity-20 transition-colors"
          >
            <FaUser />
            <span className="text-sm">Profile</span>
          </button>
          
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center space-x-2 px-3 py-1 rounded bg-tertiary hover:bg-primary hover:bg-opacity-20 transition-colors"
            title={`Current theme: ${theme}. Click to change theme.`}
          >
            {theme === 'dark' ? <FaMoon className="text-primary" /> : 
             theme === 'green' ? <FaLeaf className="text-primary" /> : 
             <FaSun className="text-primary" />}
            <span className="text-primary">
              {theme === 'dark' ? 'Dark' : theme === 'green' ? 'Green' : 'Light'}
            </span>
          </button>
          <span className="text-xs bg-yellow-700 px-2 py-0.5 rounded">1,250 XP</span>
        </div>
      </nav>

    {/* Mobile Menu - Slides in from left */}
    <div 
      className={`fixed inset-0 z-50 transform transition-transform duration-300 ease-in-out lg:hidden ${
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setIsMobileMenuOpen(false)}
      />
      
      {/* Menu Panel */}
      <div className="absolute left-0 top-0 h-full w-72 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-emerald-600 to-emerald-700 flex items-center justify-between">
          <span className="text-white font-bold text-lg">Menu</span>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="text-white/80 hover:text-white p-1 rounded transition-colors"
          >
            <FaTimes className="w-6 h-6" />
          </button>
        </div>
        
        {/* Navigation Links */}
        <div className="flex-1 py-4">
          <nav className="space-y-1 px-3">
            <button 
              onClick={() => { onNavigate('/'); setIsMobileMenuOpen(false); }}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-all duration-200 group"
            >
              <FaHome className="text-gray-500 group-hover:text-emerald-600" />
              <span className="font-medium">Home</span>
            </button>
            <button 
              onClick={() => { onNavigate('/marketplace'); setIsMobileMenuOpen(false); }}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-all duration-200 group"
            >
              <FaStore className="text-gray-500 group-hover:text-emerald-600" />
              <span className="font-medium">Market</span>
            </button>
            <button 
              onClick={() => { onNavigate('/reports'); setIsMobileMenuOpen(false); }}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-all duration-200 group"
            >
              <FaFileAlt className="text-gray-500 group-hover:text-emerald-600" />
              <span className="font-medium">Reports</span>
            </button>
            <button 
              onClick={() => { onToggleCommandMode?.(); setIsMobileMenuOpen(false); }}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-all duration-200 group"
            >
              <FaMap className="text-gray-500 group-hover:text-emerald-600" />
              <span className="font-medium">{isCommandMode ? 'Exit Command Mode' : 'Open Command Mode'}</span>
            </button>
            <button 
              onClick={() => { onNavigate('/profile'); setIsMobileMenuOpen(false); }}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-all duration-200 group"
            >
              <FaUser className="text-gray-500 group-hover:text-emerald-600" />
              <span className="font-medium">Profile</span>
            </button>
            <button 
              onClick={() => { onNavigate('/settings'); setIsMobileMenuOpen(false); }}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-all duration-200 group"
            >
              <FaCog className="text-gray-500 group-hover:text-emerald-600" />
              <span className="font-medium">Settings</span>
            </button>
            <button 
              onClick={() => { toggleTheme(); }}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-all duration-200 group"
            >
              {theme === 'dark' ? <FaMoon className="text-gray-500 group-hover:text-emerald-600" /> : 
               theme === 'green' ? <FaLeaf className="text-gray-500 group-hover:text-emerald-600" /> : 
               <FaSun className="text-gray-500 group-hover:text-emerald-600" />}
              <span className="font-medium">Theme: {theme === 'dark' ? 'Dark' : theme === 'green' ? 'Green' : 'Light'}</span>
            </button>
          </nav>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <FaUser className="text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Level 5</p>
              <p className="text-xs text-gray-500">1,250 XP</p>
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
