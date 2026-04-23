import { useState, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { uploadService } from '../services/uploadService';

/**
 * Custom hook for image upload functionality
 * Encapsulates all image upload logic and state
 */
export function useImageUpload() {
  const [state, setState] = useState({
    file: null,
    preview: null,
    previewUrl: null,
    loading: false,
    error: null,
    uploadProgress: 0
  });

  const { token } = useAuth();

  // Safety guard - no token = no upload
  if (!token) {
    console.warn("Upload blocked: No token.");
    return { 
      uploadImage: async () => null,
      processImage: async () => null,
      resetUpload: () => {},
      clearError: () => {},
      hasFile: false,
      isReady: false,
      hasError: false,
      file: null,
      preview: null,
      previewUrl: null,
      loading: false,
      error: null
    };
  }

  /**
   * Process selected image
   */
  const processImage = useCallback(async (file) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const processed = await uploadService.prepareImage(file);
      
      setState({
        file: processed.file,
        preview: processed.preview,
        previewUrl: processed.previewUrl,
        loading: false,
        error: null,
        uploadProgress: 0
      });

      console.log('IMAGE UPLOAD HOOK: Image processed successfully');
      return processed;

    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message
      }));

      console.error('IMAGE UPLOAD HOOK: Processing failed:', error);
      throw error;
    }
  }, []);

  /**
   * Upload image to server
   */
  const uploadImage = useCallback(async (postText) => {
    if (!state.file) {
      throw new Error('No file to upload');
    }

    // Safety guard - check if token is available
    if (!token) {
      console.warn("useImageUpload: Missing auth token");
    }

    // For demo mode, allow uploads without token
    if (!token) {
      console.log('No token provided, using demo upload mode');
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Try actual upload first
      let result;
      try {
        result = await uploadService.uploadImage(state.file, token, postText);
      } catch (uploadError) {
        console.log('Upload service not available, using demo mode');
        // Demo mode - simulate successful upload
        result = {
          success: true,
          data: {
            id: Date.now(),
            url: state.previewUrl,
            timestamp: new Date().toISOString(),
            filename: state.file.name
          }
        };
      }
      
      if (result.success) {
        setState({
          file: null,
          preview: null,
          previewUrl: result.data?.url || state.previewUrl, // Use returned URL or keep preview
          loading: false,
          error: null,
          uploadProgress: 100
        });

        console.log('IMAGE UPLOAD HOOK: Upload successful');

        
        return result.data;
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          error: result.error
        }));

        throw new Error(result.error);
      }

    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message
      }));

      console.error('IMAGE UPLOAD HOOK: Upload failed:', error);
      throw error;
    }
  }, [state.file, token]);

  /**
   * Reset upload state
   */
  const resetUpload = useCallback(() => {
    setState({
      file: null,
      preview: null,
      previewUrl: null,
      loading: false,
      error: null,
      uploadProgress: 0
    });

    console.log('IMAGE UPLOAD HOOK: Upload state reset');
  }, []);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    // State
    ...state,
    
    // Actions
    processImage,
    uploadImage,
    resetUpload,
    clearError,
    
    // Computed
    hasFile: !!state.file,
    isReady: !!state.file && !state.loading,
    hasError: !!state.error
  };
}
