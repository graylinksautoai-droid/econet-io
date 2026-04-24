import { useState, useEffect, useCallback } from 'react';
import { feedService } from '../services/feedService';
import { useAuth } from '../../../context/AuthContext';

/**
 * Custom hook for feed functionality
 * Encapsulates all feed-related state and operations
 */
export function useFeed(initialFilter = 'for-you', token = null) {
  const { token: authToken } = useAuth();
  const effectiveToken = token || authToken;
  const [state, setState] = useState({
    reports: [],
    loading: false,
    error: null,
    filter: initialFilter,
    fromCache: false
  });

  /**
   * Fetch feed data
   */
  const fetchFeed = useCallback(async (filter = state.filter) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await feedService.fetchFeed(filter, effectiveToken);
      
      if (result.success) {
        setState(prev => ({
          ...prev,
          reports: result.data,
          loading: false,
          fromCache: result.fromCache,
          filter: filter
        }));

        console.log('FEED HOOK: Feed fetched successfully');
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message
      }));

      console.error('FEED HOOK: Fetch failed:', error);
    }
  }, [effectiveToken, state.filter]);

  /**
   * Refresh current feed
   */
  const refreshFeed = useCallback(() => {
    fetchFeed(state.filter);
  }, [fetchFeed]);

  /**
   * Change filter
   */
  const changeFilter = useCallback((filter) => {
    setState(prev => ({ ...prev, filter }));
    fetchFeed(filter);
  }, [fetchFeed, state.filter]);

  /**
   * Submit comment
   */
  const submitComment = useCallback(async (reportId, comment) => {
    try {
      const result = await feedService.submitComment(reportId, comment, effectiveToken);
      
      if (result.success) {
        // Update local state to show new comment immediately
        setState(prev => ({
          ...prev,
          reports: prev.reports.map(report => 
            report.id === reportId 
              ? { ...report, comments: [...(report.comments || []), result.data] }
              : report
          )
        }));

        console.log('FEED HOOK: Comment submitted successfully');
        return result.data;
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      console.error('FEED HOOK: Comment submission failed:', error);
      throw error;
    }
  }, [effectiveToken]);

  /**
   * Toggle like
   */
  const toggleLike = useCallback(async (reportId) => {
    try {
      const result = await feedService.toggleLike(reportId, effectiveToken);
      
      if (result.success) {
        // Update local state to reflect new like status
        setState(prev => ({
          ...prev,
          reports: prev.reports.map(report => 
            report.id === reportId 
              ? { ...report, liked: result.data.liked, likes: result.data.likes }
              : report
          )
        }));

        console.log('FEED HOOK: Like action successful');
        return result.data;
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      console.error('FEED HOOK: Like action failed:', error);
      throw error;
    }
  }, []);

  /**
   * Clear cache and refresh
   */
  const clearCache = useCallback(() => {
    feedService.clearCache();
    fetchFeed(state.filter);
  }, [state.filter]);

  // Initial fetch
  useEffect(() => {
    fetchFeed(initialFilter);
  }, [fetchFeed, initialFilter]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!document.hidden) {
        fetchFeed(state.filter);
      }
    }, 15000);

    return () => window.clearInterval(interval);
  }, [fetchFeed, state.filter]);

  return {
    // State
    ...state,
    
    // Actions
    fetchFeed,
    refreshFeed,
    changeFilter,
    submitComment,
    toggleLike,
    clearCache,
    
    // Computed
    isEmpty: state.reports.length === 0 && !state.loading,
    hasError: !!state.error
  };
}
