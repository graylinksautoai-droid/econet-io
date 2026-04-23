import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

const SplashScreen = ({ onFinish }) => {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(onFinish, 800); // wait for fade-out animation
    }, 2500); // show for 2.5 seconds

    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-green-900 to-green-800 transition-opacity duration-700 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="relative">
        {/* Radar scan effect */}
        <div className="absolute inset-0 rounded-full border-4 border-emerald-400/30 animate-ping-slow"></div>
        <div className="absolute inset-0 rounded-full border-2 border-emerald-300/50 animate-pulse"></div>
        
        {/* EcoNet Radar Logo */}
        <svg
          viewBox="0 0 100 100"
          width="120"
          height="120"
          className="relative z-10"
          style={{ filter: 'drop-shadow(0 0 20px #10b981)' }}
        >
          <defs>
            <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#047857" stopOpacity="0.2" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill="url(#radarGlow)" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="#34d399" strokeWidth="2" strokeDasharray="4 4" />
          <line x1="50" y1="10" x2="50" y2="90" stroke="#34d399" strokeWidth="1.5" />
          <line x1="10" y1="50" x2="90" y2="50" stroke="#34d399" strokeWidth="1.5" />
          <circle cx="50" cy="50" r="8" fill="#10b981" />
          <text x="50" y="70" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">ECONET</text>
        </svg>
        <p className="text-emerald-200 mt-4 text-lg tracking-widest animate-pulse">
          SEARCHING FOR SATELLITE LINK...
        </p>
      </div>
    </div>
  );
};

SplashScreen.propTypes = {
  onFinish: PropTypes.func.isRequired,
};

export default SplashScreen;