import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRegional } from '../context/RegionalContext.jsx';

/**
 * LILO Context Awareness Hook
 * Provides real-time context about user's current state
 */
export const useLiloContext = () => {
  const { user } = useAuth();
  const { country, region, coordinates } = useRegional();
  
  const [context, setContext] = useState({
    currentPage: 'dashboard',
    userStats: {
      coins: 0,
      level: 1,
      followers: 0,
      reports: 0,
      achievements: []
    },
    regionalAlerts: [],
    liveActivity: [],
    lastUpdated: new Date()
  });

  useEffect(() => {
    // Detect current page from URL
    const detectCurrentPage = () => {
      const path = window.location.pathname;
      if (path.includes('/marketplace')) return 'marketplace';
      if (path.includes('/submit')) return 'reports';
      if (path.includes('/command')) return 'command';
      if (path.includes('/profile')) return 'profile';
      if (path.includes('/amber-alerts')) return 'alerts';
      return 'dashboard';
    };

    // Fetch user stats (mock for now, integrate with real API)
    const fetchUserStats = async () => {
      try {
        // In real implementation, this would fetch from user service
        const stats = {
          coins: user?.ecoCoins || 0,
          level: user?.level || 1,
          followers: user?.followers || 0,
          reports: user?.reportsCount || 0,
          achievements: user?.achievements || []
        };
        return stats;
      } catch (error) {
        console.error('Failed to fetch user stats:', error);
        return context.userStats;
      }
    };

    // Fetch regional alerts
    const fetchRegionalAlerts = async () => {
      try {
        // In real implementation, this would fetch from alert service
        const alerts = [];
        if (region === 'Lagos') {
          alerts.push({
            id: 1,
            type: 'flood',
            severity: 'medium',
            message: 'Heavy rainfall expected in coastal areas',
            timestamp: new Date()
          });
        }
        return alerts;
      } catch (error) {
        console.error('Failed to fetch regional alerts:', error);
        return [];
      }
    };

    // Fetch live activity
    const fetchLiveActivity = async () => {
      try {
        // In real implementation, this would fetch from activity service
        const activity = [
          {
            id: 1,
            type: 'report',
            message: 'New flood report submitted nearby',
            timestamp: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
            location: '2.3km away'
          },
          {
            id: 2,
            type: 'marketplace',
            message: 'EcoCoin transaction completed',
            timestamp: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
            amount: '+50 EcoCoins'
          }
        ];
        return activity;
      } catch (error) {
        console.error('Failed to fetch live activity:', error);
        return [];
      }
    };

    // Update context
    const updateContext = async () => {
      const [userStats, regionalAlerts, liveActivity] = await Promise.all([
        fetchUserStats(),
        fetchRegionalAlerts(),
        fetchLiveActivity()
      ]);

      setContext({
        currentPage: detectCurrentPage(),
        userStats,
        regionalAlerts,
        liveActivity,
        lastUpdated: new Date()
      });
    };

    // Initial update
    updateContext();

    // Set up periodic updates
    const interval = setInterval(updateContext, 30000); // Update every 30 seconds

    // Listen for navigation changes
    const handleNavigation = () => {
      setContext(prev => ({
        ...prev,
        currentPage: detectCurrentPage()
      }));
    };

    window.addEventListener('popstate', handleNavigation);

    return () => {
      clearInterval(interval);
      window.removeEventListener('popstate', handleNavigation);
    };
  }, [user, country, region]);

  return context;
};
