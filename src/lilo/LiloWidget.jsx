import React, { useState, useRef, useEffect } from 'react';
import { HiOutlineSparkles, HiOutlineX, HiOutlineMicrophone, HiOutlineSpeakerWave } from 'react-icons/hi';

/**
 * LILO Widget - Floating assistant UI
 * Always visible, minimal, clickable for expansion
 */
export default function LiloWidget({ 
  isActive, 
  isExpanded, 
  isSpeaking, 
  isProcessing,
  hasAlerts,
  onToggleExpanded,
  onToggleActive,
  className = ''
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [pulseAnimation, setPulseAnimation] = useState(false);
  const widgetRef = useRef(null);

  // Pulse animation for alerts
  useEffect(() => {
    if (hasAlerts) {
      const interval = setInterval(() => {
        setPulseAnimation(prev => !prev);
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [hasAlerts]);

  const handleClick = () => {
    if (isExpanded) {
      onToggleExpanded();
    } else {
      onToggleExpanded();
    }
  };

  const handleRightClick = (e) => {
    e.preventDefault();
    onToggleActive();
  };

  const getWidgetColor = () => {
    if (hasAlerts) return 'bg-red-500';
    if (isSpeaking) return 'bg-emerald-500';
    if (isProcessing) return 'bg-yellow-500';
    return 'bg-purple-600';
  };

  const getWidgetIcon = () => {
    if (isSpeaking) return <HiOutlineSpeakerWave className="w-5 h-5" />;
    if (isProcessing) return <div className="w-5 h-5 border-2 border-t-2 border-white border-t-transparent rounded-full animate-spin" />;
    return <HiOutlineSparkles className="w-5 h-5" />;
  };

  return (
    <div
      ref={widgetRef}
      className={`
        fixed bottom-6 right-6 z-50
        flex items-center justify-center
        w-14 h-14 rounded-full
        ${getWidgetColor()}
        text-white shadow-lg cursor-pointer
        transition-all duration-300 ease-in-out
        hover:scale-110 hover:shadow-xl
        ${isHovered ? 'ring-4 ring-white/30' : ''}
        ${pulseAnimation && hasAlerts ? 'animate-pulse' : ''}
        ${!isActive ? 'opacity-50' : ''}
        ${className}
      `}
      onClick={handleClick}
      onContextMenu={handleRightClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={isActive ? 'LILO - Click to expand, Right-click to disable' : 'LILO - Right-click to enable'}
    >
      {/* Main icon */}
      <div className="relative">
        {getWidgetIcon()}
        
        {/* Alert indicator */}
        {hasAlerts && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-600 rounded-full animate-ping" />
        )}
        
        {/* Processing indicator */}
        {isProcessing && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
        )}
      </div>

      {/* Hover tooltip */}
      {isHovered && (
        <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg whitespace-nowrap">
          <div className="font-medium">LILO</div>
          <div className="text-xs text-gray-300">
            {hasAlerts ? 'Alerts active' : 
             isSpeaking ? 'Speaking...' : 
             isProcessing ? 'Processing...' : 
             'Ready'}
          </div>
          <div className="absolute bottom-0 right-2 transform translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900" />
        </div>
      )}

      {/* Status ring when active */}
      {isActive && (
        <div className="absolute inset-0 rounded-full border-2 border-white/20 animate-pulse" />
      )}

      {/* Voice wave animation when speaking */}
      {isSpeaking && (
        <div className="absolute inset-0 rounded-full">
          <div className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ping" />
          <div className="absolute inset-0 rounded-full border-2 border-emerald-300 animate-ping animation-delay-200" />
        </div>
      )}
    </div>
  );
}
