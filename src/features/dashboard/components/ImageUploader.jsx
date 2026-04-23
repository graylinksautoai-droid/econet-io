import React from 'react';
import { HiOutlineX } from 'react-icons/hi';

/**
 * Pure UI component for image upload
 * No business logic - only state and UI
 */
export default function ImageUploader({ 
  onImageSelect, 
  previewUrl, 
  loading, 
  error, 
  disabled = false,
  className = ''
}) {
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      onImageSelect(file);
    }
  };

  const handleClear = () => {
    onImageSelect(null);
  };

  return (
    <div className={`relative ${className}`}>
      {/* Preview */}
      {previewUrl ? (
        <div className="relative mb-4">
          <img 
            src={previewUrl} 
            alt="Preview" 
            className="w-full h-48 object-cover rounded-lg border border-gray-300"
          />
          <button
            onClick={handleClear}
            disabled={disabled}
            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 disabled:opacity-50"
          >
            <HiOutlineX className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-4">
          <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-gray-600">Click to select image</p>
        </div>
      )}

      {/* Upload Input */}
      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={disabled || loading}
        className="hidden"
        id="dashboard-image-upload"
      />

      {/* Upload Button */}
      <label 
        htmlFor="dashboard-image-upload"
        className={`cursor-pointer inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-t-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span className="ml-2">Processing...</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="ml-2">Select Image</span>
          </>
        )}
      </label>

      {/* Error Display */}
      {error && (
        <div className="mt-2 text-red-600 text-sm bg-red-50 p-2 rounded">
          {error}
        </div>
      )}
    </div>
  );
}
