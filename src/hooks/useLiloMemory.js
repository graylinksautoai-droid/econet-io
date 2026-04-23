import { useState, useCallback } from 'react';

/**
 * LILO Short-Term Memory Hook
 * Stores recent interactions, preferences, and patterns
 */
export const useLiloMemory = () => {
  const [memory, setMemory] = useState({
    interactions: [],
    preferences: {
      topics: [],
      interestedIn: null,
      communicationStyle: 'casual',
      frequentActions: [],
      lastSeenTopics: []
    },
    patterns: {
      activeHours: [],
      preferredPages: [],
      responseTypes: {}
    },
    userContext: {
      name: null,
      region: null,
      lastActivity: null
    }
  });

  /**
   * Store a new interaction
   */
  const storeInteraction = useCallback((interaction) => {
    const interactionData = {
      id: Date.now(),
      timestamp: new Date(),
      type: interaction.type, // 'user_message', 'lilo_response', 'proactive', 'action'
      content: interaction.content,
      context: interaction.context || {},
      page: interaction.page || 'unknown',
      metadata: interaction.metadata || {}
    };

    setMemory(prev => {
      const updatedInteractions = [interactionData, ...prev.interactions].slice(0, 10); // Keep last 10
      
      // Update patterns
      const updatedPatterns = { ...prev.patterns };
      
      // Track active hours
      const hour = new Date().getHours();
      if (!updatedPatterns.activeHours.includes(hour)) {
        updatedPatterns.activeHours.push(hour);
      }
      
      // Track preferred pages
      if (!updatedPatterns.preferredPages.includes(interactionData.page)) {
        updatedPatterns.preferredPages.push(interactionData.page);
      }
      
      // Track response types
      const responseType = interactionData.type;
      updatedPatterns.responseTypes[responseType] = 
        (updatedPatterns.responseTypes[responseType] || 0) + 1;

      return {
        ...prev,
        interactions: updatedInteractions,
        patterns: updatedPatterns,
        userContext: {
          ...prev.userContext,
          lastActivity: new Date()
        }
      };
    });

    // Update preferences based on interaction
    updatePreferencesFromInteraction(interactionData);
  }, []);

  /**
   * Update preferences based on interaction content
   */
  const updatePreferencesFromInteraction = useCallback((interaction) => {
    setMemory(prev => {
      const updatedPrefs = { ...prev.preferences };
      
      // Extract topics from user messages
      if (interaction.type === 'user_message') {
        const content = interaction.content.toLowerCase();
        
        // Detect topic interests
        const topicKeywords = {
          'flood': ['flood', 'flooding', 'water', 'rain'],
          'fire': ['fire', 'burning', 'smoke', 'flames'],
          'drought': ['drought', 'dry', 'water shortage'],
          'pollution': ['pollution', 'air quality', 'contamination'],
          'marketplace': ['marketplace', 'buy', 'sell', 'ecoCoins'],
          'reports': ['report', 'submit', 'document']
        };

        Object.entries(topicKeywords).forEach(([topic, keywords]) => {
          if (keywords.some(keyword => content.includes(keyword))) {
            if (!updatedPrefs.topics.includes(topic)) {
              updatedPrefs.topics.push(topic);
            }
            updatedPrefs.lastSeenTopics = [topic, ...updatedPrefs.lastSeenTopics.slice(0, 5)];
          }
        });

        // Detect interests
        if (content.includes('visibility') || content.includes('boost')) {
          updatedPrefs.interestedIn = 'visibility';
        }
        if (content.includes('monitor') || content.includes('track')) {
          updatedPrefs.interestedIn = 'monitoring';
        }
      }

      return {
        ...prev,
        preferences: updatedPrefs
      };
    });
  }, []);

  /**
   * Get recent interactions
   */
  const getRecentInteractions = useCallback((count = 5) => {
    return memory.interactions.slice(0, count);
  }, [memory.interactions]);

  /**
   * Get user preferences
   */
  const getUserPreferences = useCallback(() => {
    return memory.preferences;
  }, [memory.preferences]);

  /**
   * Get user patterns
   */
  const getUserPatterns = useCallback(() => {
    return memory.patterns;
  }, [memory.patterns]);

  /**
   * Check if user has shown interest in specific topic
   */
  const hasInterestIn = useCallback((topic) => {
    return memory.preferences.topics.includes(topic) || 
           memory.preferences.lastSeenTopics.includes(topic);
  }, [memory.preferences]);

  /**
   * Get most frequent action type
   */
  const getMostFrequentAction = useCallback(() => {
    const { responseTypes } = memory.patterns;
    const actions = Object.entries(responseTypes);
    if (actions.length === 0) return null;
    
    return actions.reduce((a, b) => a[1] > b[1] ? a : b)[0];
  }, [memory.patterns]);

  /**
   * Get context-aware suggestions
   */
  const getContextualSuggestions = useCallback((currentContext) => {
    const suggestions = [];
    const { preferences, patterns } = memory;
    
    // Based on topic interests
    if (preferences.topics.length > 0) {
      suggestions.push({
        type: 'topic_follow_up',
        topic: preferences.topics[0],
        message: `I noticed you're interested in ${preferences.topics[0]}. There's new activity.`
      });
    }
    
    // Based on frequent actions
    const frequentAction = getMostFrequentAction();
    if (frequentAction === 'user_message' && patterns.preferredPages.includes('reports')) {
      suggestions.push({
        type: 'action_suggestion',
        action: 'submit_report',
        message: 'Ready to submit another report?'
      });
    }
    
    // Based on current page and preferences
    if (currentContext.page === 'marketplace' && preferences.interestedIn === 'visibility') {
      suggestions.push({
        type: 'marketplace_tip',
        message: 'Want to boost your marketplace visibility?'
      });
    }
    
    return suggestions;
  }, [memory, getMostFrequentAction]);

  /**
   * Update user context
   */
  const updateUserContext = useCallback((context) => {
    setMemory(prev => ({
      ...prev,
      userContext: {
        ...prev.userContext,
        ...context,
        lastActivity: new Date()
      }
    }));
  }, []);

  /**
   * Clear old memory (remove interactions older than 24 hours)
   */
  const clearOldMemory = useCallback(() => {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    setMemory(prev => ({
      ...prev,
      interactions: prev.interactions.filter(
        interaction => new Date(interaction.timestamp) > twentyFourHoursAgo
      )
    }));
  }, []);

  /**
   * Get memory summary for debugging
   */
  const getMemorySummary = useCallback(() => {
    return {
      interactionCount: memory.interactions.length,
      topicCount: memory.preferences.topics.length,
      mostActiveHour: memory.patterns.activeHours[0],
      preferredPage: memory.patterns.preferredPages[0],
      lastActivity: memory.userContext.lastActivity
    };
  }, [memory]);

  return {
    memory,
    storeInteraction,
    getRecentInteractions,
    getUserPreferences,
    getUserPatterns,
    hasInterestIn,
    getMostFrequentAction,
    getContextualSuggestions,
    updateUserContext,
    clearOldMemory,
    getMemorySummary
  };
};
