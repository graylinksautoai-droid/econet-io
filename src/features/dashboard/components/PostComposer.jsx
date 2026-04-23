import React, { useState } from 'react';
import { HiOutlineLocationMarker } from 'react-icons/hi';
import ImageUploader from './ImageUploader';

/**
 * Pure UI component for post composition
 * No business logic - only UI and state management
 */
export default function PostComposer({ 
  onPostSubmit, 
  posting, 
  className = '',
  initialText = ''
}) {
  const [text, setText] = useState(initialText);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim()) {
      onPostSubmit(text);
      setText('');
    }
  };

  const handleTextChange = (e) => {
    setText(e.target.value);
  };

  const handleLocationClick = () => {
    // Get user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const locationText = `Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
          setText(prev => prev ? `${prev}\n\n${locationText}` : locationText);
        },
        (error) => {
          console.error('Location access denied:', error);
          // Fallback to manual location entry
          const location = prompt('Enter your location:');
          if (location) {
            const locationText = `Location: ${location}`;
            setText(prev => prev ? `${prev}\n\n${locationText}` : locationText);
          }
        }
      );
    } else {
      const location = prompt('Enter your location:');
      if (location) {
        const locationText = `Location: ${location}`;
        setText(prev => prev ? `${prev}\n\n${locationText}` : locationText);
      }
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <form onSubmit={handleSubmit}>
        <div className="w-full">
          <textarea
            value={text}
            onChange={handleTextChange}
            placeholder="What's happening in your environment?" 
            className={`w-full p-3 border rounded-lg focus:outline-none focus:border-emerald-500 resize-none h-24 bg-white text-gray-900 placeholder-gray-500 disabled:opacity-50 ${posting ? 'cursor-not-allowed' : ''}`}
            disabled={posting}
            rows={4}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center text-gray-500">
            <button
              type="button"
              onClick={handleLocationClick}
              className="p-2 hover:text-gray-700 transition-colors"
              title="Add location"
            >
              <HiOutlineLocationMarker className="w-5 h-5" />
            </button>
          </div>

          <button
            type="submit"
            disabled={posting || !text.trim()}
            className="px-6 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {posting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  );
}
