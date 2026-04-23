import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { LiloEngine } from './core/liloEngine';
import { VoiceService } from './services/voiceService';

const LiloContext = createContext();

export const useLiloContext = () => {
  const context = useContext(LiloContext);
  if (!context) {
    throw new Error('useLiloContext must be used within a LiloProvider');
  }
  return context;
};

export const LiloProvider = ({ children }) => {
  const [liloState, setLiloState] = useState({
    isActive: true,
    isExpanded: false,
    isSpeaking: false,
    currentVoice: 'african-male',
    messages: [],
    lastScan: null,
    alerts: [],
    userContext: {
      timeOfDay: 'morning',
      activityLevel: 'active',
      lastInteraction: null
    }
  });

  const liloEngineRef = useRef(null);
  const voiceServiceRef = useRef(null);

  // Initialize LILO on mount
  useEffect(() => {
    const initializeLilo = async () => {
      // Initialize core engine
      liloEngineRef.current = new LiloEngine();
      await liloEngineRef.current.initialize();

      // Initialize voice service
      voiceServiceRef.current = new VoiceService();
      await voiceServiceRef.current.initialize(liloState.currentVoice);

      // Update user context based on time
      updateUserContext();

      // Greet user based on context
      await greetUser();

      console.log('LILO: Intelligence layer initialized');
    };

    initializeLilo();
  }, []);

  // Update user context periodically
  useEffect(() => {
    const interval = setInterval(updateUserContext, 60000); // Every minute
    return () => clearInterval(interval);
  }, []);

  const updateUserContext = () => {
    const hour = new Date().getHours();
    let timeOfDay = 'morning';
    
    if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
    else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
    else if (hour >= 21 || hour < 6) timeOfDay = 'night';

    setLiloState(prev => ({
      ...prev,
      userContext: {
        ...prev.userContext,
        timeOfDay
      }
    }));
  };

  const greetUser = async () => {
    const greetings = {
      morning: "Good morning. I kept an eye on things while you were away.",
      afternoon: "Hey there. Been monitoring the environmental pulse.",
      evening: "Evening. Interesting patterns in today's data.",
      night: "You're up late. I've been watching the night shifts."
    };

    const greeting = greetings[liloState.userContext.timeOfDay];
    await speak(greeting);
    addMessage(greeting, 'lilo');
  };

  const scanImage = async (file, metadata = {}) => {
    if (!liloEngineRef.current) return null;

    try {
      setLiloState(prev => ({ ...prev, isProcessing: true }));

      const result = await liloEngineRef.current.scan(file, metadata);
      
      setLiloState(prev => ({
        ...prev,
        lastScan: result,
        isProcessing: false
      }));

      // Provide voice feedback
      if (result.message) {
        await speak(result.message);
      }

      // Add alert if high risk
      if (result.riskLevel === 'HIGH') {
        addAlert({
          type: 'high_risk',
          message: result.message,
          timestamp: new Date(),
          data: result
        });
      }

      return result;
    } catch (error) {
      console.error('LILO: Scan failed:', error);
      setLiloState(prev => ({ ...prev, isProcessing: false }));
      return null;
    }
  };

  const speak = async (text) => {
    if (!voiceServiceRef.current) return;

    try {
      setLiloState(prev => ({ ...prev, isSpeaking: true }));
      await voiceServiceRef.current.speak(text, liloState.currentVoice);
      setLiloState(prev => ({ ...prev, isSpeaking: false }));
    } catch (error) {
      console.error('LILO: Voice failed:', error);
      setLiloState(prev => ({ ...prev, isSpeaking: false }));
    }
  };

  const changeVoice = async (voice) => {
    if (!voiceServiceRef.current) return;

    try {
      await voiceServiceRef.current.setVoice(voice);
      setLiloState(prev => ({ ...prev, currentVoice: voice }));
      await speak(`Voice changed to ${voice}`);
    } catch (error) {
      console.error('LILO: Voice change failed:', error);
    }
  };

  const addMessage = (text, sender = 'user') => {
    setLiloState(prev => ({
      ...prev,
      messages: [...prev.messages, {
        id: Date.now(),
        text,
        sender,
        timestamp: new Date()
      }]
    }));
  };

  const addAlert = (alert) => {
    setLiloState(prev => ({
      ...prev,
      alerts: [...prev.alerts, alert]
    }));
  };

  const toggleExpanded = () => {
    setLiloState(prev => ({ ...prev, isExpanded: !prev.isExpanded }));
  };

  const toggleActive = () => {
    setLiloState(prev => ({ ...prev, isActive: !prev.isActive }));
  };

  const clearMessages = () => {
    setLiloState(prev => ({ ...prev, messages: [] }));
  };

  const clearAlerts = () => {
    setLiloState(prev => ({ ...prev, alerts: [] }));
  };

  const value = {
    // State
    ...liloState,
    
    // Actions
    scanImage,
    speak,
    changeVoice,
    addMessage,
    addAlert,
    toggleExpanded,
    toggleActive,
    clearMessages,
    clearAlerts,
    
    // Engine access
    engine: liloEngineRef.current,
    voice: voiceServiceRef.current
  };

  return (
    <LiloContext.Provider value={value}>
      {children}
    </LiloContext.Provider>
  );
};
