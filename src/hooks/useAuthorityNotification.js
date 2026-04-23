import { useState, useCallback } from 'react';
import { useRegional } from '../context/RegionalContext';

/**
 * Hook for notifying authorities about environmental incidents
 */
export function useAuthorityNotification() {
  const [isNotifying, setIsNotifying] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const { country, getAuthoritiesForHazard } = useRegional();

  /**
   * Notify authorities about a new report
   */
  const notifyAuthorities = useCallback(async (report) => {
    if (!report || !country) {
      console.warn('Cannot notify authorities: missing report or country data');
      return [];
    }

    setIsNotifying(true);
    setNotifications([]);

    try {
      // Get relevant authorities for the hazard type
      const relevantAuthorities = getAuthoritiesForHazard(report.category);
      
      if (relevantAuthorities.length === 0) {
        console.log('No relevant authorities found for this region');
        return [];
      }

      console.log(`Notifying ${relevantAuthorities.length} authorities about ${report.category} incident`);

      // Prepare notification payload
      const notificationPayload = {
        report: {
          id: report._id,
          category: report.category,
          severity: report.severity,
          urgency: report.urgency,
          location: report.location,
          description: report.description || report.content,
          timestamp: report.createdAt,
          author: {
            name: report.authorName || 'Anonymous',
            trustScore: report.trustScore || 0
          }
        },
        country: country
      };

      // Send notifications to backend
      const response = await fetch('/api/region/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || sessionStorage.getItem('token')}`
        },
        body: JSON.stringify(notificationPayload)
      });

      if (response.ok) {
        const result = await response.json();
        const notificationResults = result.data?.notifications || [];
        
        setNotifications(notificationResults);
        
        // Log results
        const successful = notificationResults.filter(n => n.status === 'sent' || n.status === 'mocked');
        const failed = notificationResults.filter(n => n.status === 'failed' || n.status === 'error');
        
        console.log(`Authority notifications: ${successful.length} successful, ${failed.length} failed`);
        
        return notificationResults;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to notify authorities:', error);
      
      // Create error notification
      const errorNotification = {
        authority: 'System',
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
      
      setNotifications([errorNotification]);
      return [errorNotification];
    } finally {
      setIsNotifying(false);
    }
  }, [country, getAuthoritiesForHazard]);

  /**
   * Clear notifications
   */
  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  /**
   * Get notification summary
   */
  const getNotificationSummary = useCallback(() => {
    if (notifications.length === 0) return null;
    
    const successful = notifications.filter(n => n.status === 'sent' || n.status === 'mocked').length;
    const failed = notifications.filter(n => n.status === 'failed' || n.status === 'error').length;
    
    return {
      total: notifications.length,
      successful,
      failed,
      timestamp: notifications[0]?.timestamp
    };
  }, [notifications]);

  return {
    notifyAuthorities,
    isNotifying,
    notifications,
    clearNotifications,
    getNotificationSummary
  };
}
