/**
 * LILO Voice System - Controlled, disciplined speaking
 * Only speaks when explicitly told, no random outbursts
 */

import { useState, useRef, useCallback } from "react";

export const useLiloVoice = () => {
  const [enabled, setEnabled] = useState(false);
  const speaking = useRef(false);
  const currentMode = useRef("normal");

  /**
   * Speak text with personality mode
   */
  const speak = useCallback((text, mode = "normal") => {
    if (!enabled || speaking.current || !text) return;

    // Cancel any previous speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Apply mode-based settings
    const settings = getModeSettings(mode);
    utterance.rate = settings.speed;
    utterance.pitch = settings.pitch;
    utterance.volume = settings.volume;
    
    speaking.current = true;
    currentMode.current = mode;

    utterance.onstart = () => {
      console.log(`LILO speaking in ${mode} mode`);
    };

    utterance.onend = () => {
      speaking.current = false;
      currentMode.current = "normal";
    };

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      speaking.current = false;
      currentMode.current = "normal";
    };

    window.speechSynthesis.speak(utterance);
  }, [enabled]);

  /**
   * Stop speaking immediately
   */
  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    speaking.current = false;
    currentMode.current = "normal";
  }, []);

  /**
   * Toggle voice on/off
   */
  const toggle = useCallback(() => {
    setEnabled(prev => !prev);
  }, []);

  /**
   * Get mode settings for voice
   */
  const getModeSettings = (mode) => {
    const settings = {
      normal: { speed: 1, pitch: 1, volume: 0.8 },
      urgent: { speed: 1.2, pitch: 1.2, volume: 0.9 },
      advisor: { speed: 0.9, pitch: 0.9, volume: 0.8 },
      alert: { speed: 1.3, pitch: 1.3, volume: 1.0 }
    };
    
    return settings[mode] || settings.normal;
  };

  return {
    speak,
    stop,
    toggle,
    enabled,
    isSpeaking: speaking.current,
    currentMode: currentMode.current
  };
};
