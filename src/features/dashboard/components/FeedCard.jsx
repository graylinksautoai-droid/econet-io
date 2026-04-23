import React from 'react';
import { HiOutlineHeart, HiOutlineChat, HiOutlineShare, HiOutlineLocationMarker, HiOutlineClock, HiOutlineCheckCircle, HiOutlineExclamation } from 'react-icons/hi';
import { formatDistanceToNow } from 'date-fns';

/**
 * Get urgency LED strip styling - matching reference image style
 */
const getUrgencyClass = (urgency) => {
  console.log('LED Strip - Urgency:', urgency); // Debug log
  
  switch (urgency?.toLowerCase()) {
    case "critical":
    case "immediate":
      return "bg-gradient-to-r from-red-600 via-red-500 to-red-600 shadow-lg shadow-red-500/50";
    case "high":
      return "bg-gradient-to-r from-orange-500 via-orange-400 to-orange-500 shadow-lg shadow-orange-500/50";
    case "medium":
    case "moderate":
      return "bg-gradient-to-r from-yellow-500 via-yellow-400 to-yellow-500 shadow-lg shadow-yellow-500/50";
    case "low":
    case "observation":
      return "bg-gradient-to-r from-blue-500 via-blue-400 to-blue-500 shadow-lg shadow-blue-500/50";
    default:
      console.log('LED Strip - Default case triggered for:', urgency);
      return "bg-gradient-to-r from-gray-400 via-gray-300 to-gray-400 shadow-md shadow-gray-400/30";
  }
};

/**
 * Pure UI component for individual feed card
 * No business logic - only rendering and event delegation
 */
export default function FeedCard({ 
  report, 
  onLike, 
  onComment, 
  className = ''
}) {
  const handleLike = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onLike(report.id);
  };

  const handleComment = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onComment(report.id);
  };

  const handleShare = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (navigator.share) {
      navigator.share({
        title: report.title || 'Environmental Report',
        text: report.content || 'Check out this environmental report',
        url: window.location.href
      });
    } else {
      // Fallback - copy to clipboard
      navigator.clipboard.writeText(window.location.href);
    }
  };

  // Determine LED color based on actual content type
  const getLedColor = () => {
    // DEFAULT TO GRAY - Only make red for TRULY critical situations
    let ledColor = 'gray';
    
    // Handle different data structures from backend vs demo
    const category = report.category || '';
    const severity = report.severity || '';
    const urgency = report.urgency || '';
    
    // ONLY RED for actual critical emergencies
    if (
      category === 'Fire' || 
      category === 'Flood' || 
      category === 'Storm' ||
      severity === 'Critical' ||
      severity === 'critical' ||
      urgency === 'Immediate' ||
      urgency === 'immediate'
    ) {
      ledColor = 'red';
    }
    // YELLOW for environmental monitoring/observations and moderate pollution
    else if (
      category === 'Pollution' && severity === 'Moderate' ||
      urgency === 'Observation' ||
      urgency === 'observation'
    ) {
      ledColor = 'yellow';
    }
    // GRAY for everything else (social posts, meetings, announcements, other)
    else {
      ledColor = 'gray';
    }
    
    return ledColor;
  };

  const ledColor = getLedColor();

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden transition-all duration-300 hover:shadow-md ${className}`}>
      {/* LED Light Strip - Full Width at Top - Reference Image Style */}
      <div className={`h-2 w-full relative ${
        ledColor === 'red'
          ? 'bg-gradient-to-r from-red-500 via-red-400 to-red-500 shadow-md shadow-red-500/30 animate-pulse' 
          : ledColor === 'yellow'
          ? 'bg-gradient-to-r from-yellow-500 via-yellow-400 to-yellow-500 shadow-md shadow-yellow-500/30' 
          : 'bg-gradient-to-r from-gray-400 via-gray-300 to-gray-400 shadow-sm shadow-gray-400/20'  // Gray for social posts
      }`}>
        {/* Subtle glow effect */}
        <div className={`absolute inset-0 w-full h-full ${
          ledColor === 'red'
            ? 'bg-gradient-to-r from-red-300 to-transparent opacity-40 animate-pulse' 
            : ledColor === 'yellow'
            ? 'bg-gradient-to-r from-yellow-300 to-transparent opacity-30' 
            : 'bg-gradient-to-r from-gray-200 to-transparent opacity-20'
        }`}></div>
      </div>
      
      {/* Header */}
      <div className="p-4 pb-0">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <img
              src={report.author?.avatar || 'https://via.placeholder.com/40'}
              alt={report.author?.name}
              className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
            />
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="font-semibold text-gray-900">
                  {report.author?.name || 'Anonymous'}
                </h4>
                {report.author?.verifiedReporter && (
                  <HiOutlineCheckCircle className="w-4 h-4 text-emerald-500" />
                )}
              </div>
              <div className="flex items-center space-x-2">
                <p className="text-xs text-gray-500">
                  {report.timestamp && formatDistanceToNow(new Date(report.timestamp), { addSuffix: true })}
                </p>
                {report.aiVerification && (
                  <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full flex items-center">
                    <HiOutlineCheckCircle className="w-3 h-3 mr-1" />
                    AI Verified
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Severity Badge */}
          <div className="flex flex-col items-end space-y-1">
            {/* LED Indicators - Reference Image Style */}
            <div className="flex items-center space-x-1">
              {ledColor === 'red' && (
                <div className="w-3 h-3 bg-red-500 rounded-full shadow-md shadow-red-500/40"></div>
              )}
              
              {ledColor === 'yellow' && (
                <div className="w-3 h-3 bg-yellow-500 rounded-full shadow-md shadow-yellow-500/40"></div>
              )}
              
              {ledColor === 'gray' && (
                <div className="w-3 h-3 bg-gray-400 rounded-full shadow-sm shadow-gray-400/30"></div>
              )}
            </div>
            
            <span className={`px-3 py-1.5 text-xs font-semibold rounded-full ${
              report.severity === 'critical' || report.urgency === 'critical'
                ? 'bg-red-500/20 text-red-300 border border-red-500/30' 
                : report.severity === 'high' || report.urgency === 'high'
                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                : report.severity === 'medium' || report.urgency === 'medium'
                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                : 'bg-green-500/20 text-green-300 border border-green-500/30'
            }`}>
              <HiOutlineExclamation className="inline w-3 h-3 mr-1" />
              {(report.severity || report.urgency || 'low').toUpperCase()}
            </span>
            {report.category && (
              <span className="text-xs bg-slate-700/50 text-slate-300 px-2 py-1 rounded-full">
                {report.category}
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <p className="text-gray-800 leading-relaxed text-base">{report.content}</p>
          
          {/* Location */}
          {report.location && (
            <div className="flex items-center space-x-2 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
              <HiOutlineLocationMarker className="w-4 h-4 text-emerald-500" />
              <span>
                {report.location.lat && report.location.lng 
                  ? `${report.location.lat?.toFixed(4)}, ${report.location.lng?.toFixed(4)}`
                  : `${report.location.coordinates?.[1]?.toFixed(4)}, ${report.location.coordinates?.[0]?.toFixed(4)}`
                }
              </span>
            </div>
          )}

          {/* Image */}
          {report.images && report.images.length > 0 && (
            <div className="relative group">
              <img 
                src={report.images[0].startsWith('http') ? report.images[0] : `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${report.images[0]}`} 
                alt="Report image" 
                className="w-full h-64 object-cover rounded-lg transition-transform duration-300 group-hover:scale-105"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/400x300?text=Image+Not+Available';
                  e.target.onerror = null;
                }}
                onLoad={() => {
                  // Clear any previous error state
                }}
              />
              <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-full flex items-center space-x-1">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs text-white">Evidence</span>
              </div>
            </div>
          )}

          {/* AI Analysis */}
          {report.aiVerification && (
            <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-lg p-3">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-500/50"></div>
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">LILO AI Analysis</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Confidence:</span>
                  <span className="text-blue-300 font-medium">{report.aiVerification.score}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Risk Level:</span>
                  <span className="text-orange-300 font-medium">{report.aiVerification.risk || 'Medium'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="flex items-center space-x-6">
            <button
              onClick={handleLike}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${report.liked ? 'text-red-600 bg-red-50 border-red-200' : 'text-gray-600 hover:text-red-600 hover:bg-red-50'} border border-gray-200 hover:border-red-200 transition-all duration-200`}
            >
              <HiOutlineHeart className={`w-5 h-5 ${report.liked ? 'fill-current text-red-600' : ''}`} />
              <span className="text-sm font-medium">{report.likes || 0}</span>
            </button>

            <button
              onClick={handleComment}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg text-gray-600 hover:text-emerald-600 hover:bg-emerald-50 border border-gray-200 hover:border-emerald-200 transition-all duration-200"
            >
              <HiOutlineChat className="w-5 h-5" />
              <span className="text-sm font-medium">{report.comments?.length || 0}</span>
            </button>

            <button
              onClick={handleShare}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg text-gray-600 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 transition-all duration-200"
            >
              <HiOutlineShare className="w-5 h-5" />
              <span className="text-sm font-medium">Share</span>
            </button>
          </div>

          {/* Trust Score */}
          {report.trustScore && (
            <div className="flex items-center space-x-2 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/30">
              <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
              <span className="text-sm font-medium text-emerald-300">{report.trustScore}% Trust</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
