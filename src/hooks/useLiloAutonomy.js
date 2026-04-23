import { useState, useEffect, useCallback } from 'react';
import { useLiloContext } from './useLiloContext';
import { useLiloMemory } from './useLiloMemory';
import { LiloPersonalityEngine } from '../lilo/personality/liloPersonalityEngine';

/**
 * LILO Autonomy Hook
 * Handles proactive messaging and autonomous behavior
 */
export const useLiloAutonomy = (onMessage) => {
  const context = useLiloContext();
  const { getRecentInteractions, getUserPreferences } = useLiloMemory();
  const personalityEngine = new LiloPersonalityEngine();
  
  const [lastProactiveMessage, setLastProactiveMessage] = useState(null);
  const [isAutonomous, setIsAutonomous] = useState(true);
  const [inactivityTimer, setInactivityTimer] = useState(0);

  // Generate contextual proactive messages
  const generateContextualMessage = useCallback(() => {
    const { currentPage, userStats, regionalAlerts, liveActivity } = context;
    const recentInteractions = getRecentInteractions(5);
    const preferences = getUserPreferences();

    // Marketplace context
    if (currentPage === 'marketplace') {
      if (userStats.coins < 50) {
        return personalityEngine.generateMessage(
          'marketplace_low_coins',
          { coins: userStats.coins }
        );
      }
      if (preferences.interestedIn === 'visibility') {
        return personalityEngine.generateMessage(
          'marketplace_visibility_tip',
          { coins: userStats.coins }
        );
      }
      return personalityEngine.generateMessage('marketplace_general');
    }

    // Reports context
    if (currentPage === 'reports') {
      if (userStats.reports === 0) {
        return personalityEngine.generateMessage('first_report_encouragement');
      }
      return personalityEngine.generateMessage('reports_tip', {
        reportsCount: userStats.reports
      });
    }

    // Command Center context
    if (currentPage === 'command') {
      return personalityEngine.generateMessage('command_center_status');
    }

    // Regional alerts context
    if (regionalAlerts.length > 0) {
      const highPriorityAlert = regionalAlerts.find(alert => 
        ['high', 'critical'].includes(alert.severity)
      );
      
      if (highPriorityAlert) {
        return personalityEngine.generateMessage(
          'high_priority_alert',
          { 
            alertType: highPriorityAlert.type,
            location: highPriorityAlert.location || 'your area'
          }
        );
      }
    }

    // Live activity context
    if (liveActivity.length > 0) {
      const recentActivity = liveActivity[0];
      if (recentActivity.type === 'report') {
        return personalityEngine.generateMessage(
          'nearby_activity',
          { 
            activityType: 'report',
            location: recentActivity.location
          }
        );
      }
    }

    // Inactivity-based messages
    if (inactivityTimer > 120) { // 2 minutes
      return personalityEngine.generateMessage('inactivity_check');
    }

    // User preference-based messages
    if (preferences.topics && preferences.topics.length > 0) {
      const topic = preferences.topics[0];
      return personalityEngine.generateMessage(
        'topic_interest',
        { topic }
      );
    }

    // Default contextual message
    return personalityEngine.generateMessage('general_context', {
      page: currentPage,
      region: context.region
    });
  }, [context, getRecentInteractions, getUserPreferences, inactivityTimer]);

  // Trigger proactive message
  const triggerProactiveMessage = useCallback(() => {
    if (!isAutonomous || !onMessage) return;

    const message = generateContextualMessage();
    if (message && message !== lastProactiveMessage) {
      // Add delay to simulate thinking
      setTimeout(() => {
        onMessage({
          type: 'proactive',
          content: message,
          timestamp: new Date(),
          context: context
        });
        setLastProactiveMessage(message);
      }, Math.random() * 2000 + 1000); // 1-3 second delay
    }
  }, [isAutonomous, onMessage, generateContextualMessage, lastProactiveMessage, context]);

  // Handle user activity
  const handleUserActivity = useCallback(() => {
    setInactivityTimer(0);
  }, []);

  // Main autonomy loop
  useEffect(() => {
    if (!isAutonomous) return;

    // Set up proactive messaging interval (20-40 seconds)
    const interval = setInterval(() => {
      triggerProactiveMessage();
    }, Math.random() * 20000 + 20000); // 20-40 seconds

    // Set up inactivity tracking
    const inactivityInterval = setInterval(() => {
      setInactivityTimer(prev => prev + 10);
    }, 10000); // Every 10 seconds

    // Listen for user activity
    const activityEvents = ['click', 'scroll', 'keypress', 'touch'];
    activityEvents.forEach(event => {
      document.addEventListener(event, handleUserActivity);
    });

    return () => {
      clearInterval(interval);
      clearInterval(inactivityInterval);
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleUserActivity);
      });
    };
  }, [isAutonomous, triggerProactiveMessage, handleUserActivity]);

  // Trigger message on context changes
  useEffect(() => {
    if (context.currentPage !== lastProactiveMessage?.context?.page) {
      const timer = setTimeout(() => {
        triggerProactiveMessage();
      }, 5000); // Wait 5 seconds after page change
      
      return () => clearTimeout(timer);
    }
  }, [context.currentPage, triggerProactiveMessage]);

  // Trigger message on new alerts
  useEffect(() => {
    if (context.regionalAlerts.length > 0) {
      const newAlert = context.regionalAlerts[0];
      if (new Date(newAlert.timestamp) > new Date(lastProactiveMessage?.timestamp)) {
        triggerProactiveMessage();
      }
    }
  }, [context.regionalAlerts, triggerProactiveMessage]);

  return {
    isAutonomous,
    setIsAutonomous,
    triggerProactiveMessage,
    inactivityTimer
  };
};
