/**
 * LILO Personality Engine - Analyzes input and determines personality mode
 * The brain that decides how LILO should respond
 */

import { LILO_PERSONALITY } from './liloPersonality';

export class LiloPersonalityEngine {
  constructor() {
    this.mood = "calm";
    this.mode = "strategic";
  }

  /**
   * Analyze input and determine personality mode
   */
  analyze(input) {
    const text = (input || "").toLowerCase();
    
    // Emergency detection (highest priority)
    if (this.isEmergency(text)) {
      return "alert";
    }
    
    // Urgent detection
    if (this.isUrgent(text)) {
      return "urgent";
    }
    
    // Strategic analysis detection
    if (this.isStrategic(text)) {
      return "advisor";
    }
    
    // Help request detection
    if (this.isHelpRequest(text)) {
      return "normal";
    }
    
    // Default
    return "normal";
  }
  
  /**
   * Get personality settings for a mode
   */
  getSettings(mode) {
    return LILO_PERSONALITY.modes[mode] || LILO_PERSONALITY.modes.normal;
  }
  
  /**
   * Get appropriate response for context
   */
  getResponse(type, context = {}) {
    return LILO_PERSONALITY.getResponse(type, context);
  }
  
  /**
   * Check if input indicates emergency
   */
  isEmergency(text) {
    const emergencyKeywords = ['emergency', 'critical', 'danger', 'evacuate', 'life threatening'];
    return emergencyKeywords.some(keyword => text.includes(keyword));
  }
  
  /**
   * Check if input is urgent
   */
  isUrgent(text) {
    const urgentKeywords = ['urgent', 'immediate', 'asap', 'quickly', 'right now'];
    return urgentKeywords.some(keyword => text.includes(keyword));
  }
  
  /**
   * Check if input requires strategic analysis
   */
  isStrategic(text) {
    const strategicKeywords = ['analyze', 'strategy', 'plan', 'recommend', 'assess', 'optimize', 'advise'];
    return strategicKeywords.some(keyword => text.includes(keyword));
  }
  
  /**
   * Check if input is help request
   */
  isHelpRequest(text) {
    const helpKeywords = ['help', 'assist', 'how', 'what', 'explain', 'tell me'];
    return helpKeywords.some(keyword => text.includes(keyword));
  }
  
  /**
   * Check if input is greeting
   */
  isGreeting(text) {
    const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'yo'];
    return greetings.some(greeting => text.includes(greeting));
  }

  /**
   * Process input with personality
   */
  process(input) {
    const mode = this.analyze(input);
    const settings = this.getSettings(mode);
    
    // Simple personality shaping
    if (this.mode === "strategic") {
      return `Analyzing: ${input}`;
    }

    if (this.mode === "social") {
      return `Hey 👋 ${input}`;
    }

    return input;
  }

  /**
   * Get voice settings based on mood
   */
  getVoiceSettings() {
    if (this.mood === "calm") {
      return { rate: 0.9, pitch: 1 };
    }

    if (this.mood === "energetic") {
      return { rate: 1.1, pitch: 1.2 };
    }

    return { rate: 1, pitch: 1 };
  }

  /**
   * Set personality mode
   */
  setMode(mode) {
    this.mode = mode;
  }

  /**
   * Set mood
   */
  setMood(mood) {
    this.mood = mood;
  }
}
