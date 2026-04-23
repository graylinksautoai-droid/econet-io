import React from 'react';
import { HiOutlineHeart, HiOutlineChat, HiOutlineShare } from 'react-icons/hi';
import FeedCard from './FeedCard';

/**
 * Pure UI component for feed list
 * No business logic - only rendering
 */
export default function FeedList({ 
  reports, 
  loading, 
  error, 
  onLike, 
  onComment, 
  onRefresh,
  className = ''
}) {
  const handleRefresh = () => {
    onRefresh();
  };

  if (loading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="text-center py-10">
          <div className="inline-block w-6 h-6 border-2 border-t-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-2 text-gray-600">Loading feed...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="text-center py-10">
          <p className="text-red-600 bg-red-50 p-4 rounded">Error: {error}</p>
          <button 
            onClick={handleRefresh}
            className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="text-center py-10">
          <p className="text-gray-500">No environmental reports yet.</p>
          <p className="text-sm text-gray-400 mt-2">Be the first to report something in your area!</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {reports.map((report) => (
        <FeedCard
          key={report.id || report._id || `report-${Math.random()}`}
          report={report}
          onLike={onLike}
          onComment={onComment}
        />
      ))}
    </div>
  );
}
