import React, { useState, useEffect } from 'react';
import { useFeed } from './hooks/useFeed';
import { useImageUpload } from './hooks/useImageUpload';
import { feedService } from './services/feedService';
import PostComposer from './components/PostComposer';
import FeedList from './components/FeedList';
import ImageUploader from './components/ImageUploader';

/**
 * Dashboard Container - orchestrates all dashboard functionality
 * No UI rendering - only state management and data flow
 */
export default function DashboardContainer({ user, onLogout, onNavigate }) {
  const [activeTab, setActiveTab] = useState('feed');
  const [posting, setPosting] = useState(false);

  // Feed hook
  const feed = useFeed('for-you', user?.token);
  
  // Image upload hook
  const imageUpload = useImageUpload();

  // Handle post submission
  const handlePostSubmit = async (text) => {
    if (!text.trim() && !imageUpload.file) {
      throw new Error('Please add text or image');
    }

    setPosting(true);
    
    try {
      // Create post data
      const postData = {
        description: text,
        content: text,
        category: 'Other', // Default category, can be enhanced with AI classification
        severity: 'Low',
        urgency: 'Low',
        location: { type: 'Point', coordinates: [3.3792, 6.5244] }, // Default location
        authorName: user?.name || 'Anonymous',
        authorAvatar: user?.avatar || 'https://via.placeholder.com/150',
        images: imageUpload.file ? [imageUpload.previewUrl] : []
      };

      // Create the post
      await feedService.createPost(postData, user?.token);
      
      // Handle image upload if there's a file
      if (imageUpload.file) {
        await imageUpload.uploadImage(text, user?.token);
      }
      
      // Refresh feed after successful post
      await feed.refreshFeed();
      
      // Reset image upload
      imageUpload.resetUpload();
      
      console.log('DASHBOARD CONTAINER: Post submitted successfully');
    } catch (error) {
      console.error('DASHBOARD CONTAINER: Post submission failed:', error);
      throw error;
    } finally {
      setPosting(false);
    }
  };

  // Handle tab changes
  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  // Handle filter changes
  const handleFilterChange = (filter) => {
    feed.changeFilter(filter);
  };

  // Handle like action
  const handleLike = async (reportId) => {
    try {
      await feed.toggleLike(reportId);
      console.log('DASHBOARD CONTAINER: Like action completed');
    } catch (error) {
      console.error('DASHBOARD CONTAINER: Like action failed:', error);
    }
  };

  // Handle comment action
  const handleComment = async (reportId) => {
    try {
      await feed.submitComment(reportId, 'New comment');
      console.log('DASHBOARD CONTAINER: Comment submitted');
    } catch (error) {
      console.error('DASHBOARD CONTAINER: Comment failed:', error);
    }
  };

  // Initial data fetch
  useEffect(() => {
    feed.fetchFeed();
  }, []);

  return {
    // State
    activeTab,
    posting,
    feed: feed.reports,
    feedLoading: feed.loading,
    feedError: feed.error,
    imageUpload: imageUpload,
    
    // Actions
    handlePostSubmit,
    handleTabChange,
    handleFilterChange,
    handleLike,
    handleComment,
    refreshFeed: feed.refreshFeed,
    clearCache: feed.clearCache,
    
    // Components (for rendering)
    PostComposer: (props) => (
      <PostComposer 
        {...props}
        onPostSubmit={handlePostSubmit}
        posting={posting}
      />
    ),
    FeedList: (props) => (
      <FeedList 
        {...props}
        reports={feed.reports}
        loading={feed.loading}
        error={feed.error}
        onLike={handleLike}
        onComment={handleComment}
        onRefresh={feed.refreshFeed}
      />
    ),
    ImageUploader: (props) => (
      <ImageUploader 
        {...props}
        onImageSelect={imageUpload.processImage}
        previewUrl={imageUpload.previewUrl}
        loading={imageUpload.loading}
        error={imageUpload.error}
        disabled={posting}
      />
    )
  };
}
