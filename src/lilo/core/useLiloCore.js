/**
 * LILO Core Brain - The single hub for all LILO functionality
 * Unified architecture: Input -> Think -> Speak -> Memory -> Events
 */

import { useState, useRef, useCallback } from "react";

export const useLiloCore = () => {
  // Core state
  const [isActive, setIsActive] = useState(false);
  const [memory, setMemory] = useState([]);
  const [personality, setPersonality] = useState("strategic");
  const [isThinking, setIsThinking] = useState(false);

  // Event system
  const listeners = useRef([]);

  /**
   * Event emitter for LILO communication
   */
  const emit = useCallback((event, data) => {
    listeners.current.forEach((cb) => cb(event, data));
  }, []);

  /**
   * Subscribe to LILO events
   */
  const on = useCallback((cb) => {
    listeners.current.push(cb);
    return () => {
      listeners.current = listeners.current.filter(l => l !== cb);
    };
  }, []);

  /**
   * Speak text with controlled voice synthesis
   */
  const speak = useCallback((text, options = {}) => {
    if (!window.speechSynthesis || !text) return false;

    // Cancel any previous speech
    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = options.rate || 1;
    utter.pitch = options.pitch || 1;
    utter.volume = options.volume || 0.8;
    
    window.speechSynthesis.speak(utter);
    emit("speaking", { text, options });
    return true;
  }, [emit]);

  /**
   * Process input through LILO thinking pipeline
   */
  const think = useCallback(async (input) => {
    if (!input || isThinking) return null;

    setIsThinking(true);
    emit("thinking", { input });

    try {
      // Real AI response using Groq API
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [{ role: "user", content: input }]
        })
      });

      const data = await response.json();
      const aiResponse = data.choices?.[0]?.message?.content || "I'm thinking about that...";

      // Save to memory
      const memoryEntry = {
        id: Date.now(),
        input,
        response: aiResponse,
        timestamp: new Date(),
        personality
      };

      setMemory(prev => [...prev, memoryEntry]);
      emit("response", { input, response: aiResponse, memoryEntry });

      return aiResponse;
    } catch (error) {
      emit("error", { input, error });
      return null;
    } finally {
      setIsThinking(false);
    }
  }, [isThinking, personality, emit]);

  /**
   * Process message and optionally speak response
   */
  const process = useCallback(async (input, options = {}) => {
    const response = await think(input);
    
    if (response && options.speak) {
      speak(response, options.voice);
    }
    
    return response;
  }, [think, speak]);

  /**
   * Get memory summary
   */
  const getMemory = useCallback(() => {
    return memory;
  }, [memory]);

  /**
   * Clear memory
   */
  const clearMemory = useCallback(() => {
    setMemory([]);
    emit("memory_cleared");
  }, [emit]);

  /**
   * Change personality mode
   */
  const setPersonalityMode = useCallback((mode) => {
    setPersonality(mode);
    emit("personality_changed", { mode });
  }, [emit]);

  /**
   * Activate/deactivate LILO
   */
  const toggle = useCallback(() => {
    setIsActive(prev => {
      const newState = !prev;
      emit(newState ? "activated" : "deactivated");
      return newState;
    });
  }, [emit]);

  return {
    // State
    isActive,
    isThinking,
    memory,
    personality,
    
    // Core functions
    speak,
    think,
    process,
    
    // Memory functions
    getMemory,
    clearMemory,
    
    // Personality
    setPersonalityMode,
    
    // Event system
    on,
    emit,
    
    // Control
    toggle,
    setIsActive
  };
};
