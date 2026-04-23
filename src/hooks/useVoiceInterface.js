/**
 * Voice Interface Hook - Clean Architecture
 * Fixed imports and constructor issues
 */

import { useState, useEffect } from "react";
import { LiloPersonalityEngine } from "../lilo/engine/LiloPersonalityEngine";
import { liloCore } from "../lilo/core/liloCore";

export const useVoiceInterface = () => {
  const [messages, setMessages] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const voiceSupported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  
  const engine = new LiloPersonalityEngine(); // ✅ now valid constructor

  // Subscribe to core events
  useEffect(() => {
    const unsubscribe = liloCore.subscribe((event, data) => {
      if (event === "stateChange") {
        setIsListening(data.isListening);
        setIsSpeaking(data.isSpeaking);
      }
    });
    
    return unsubscribe;
  }, []);

  const sendMessage = (text) => {
    if (!text?.trim()) return;

    const response = engine.respond(text);

    setMessages((prev) => [
      ...prev,
      { from: "user", text, timestamp: Date.now() },
      { from: "lilo", text: response, timestamp: Date.now() },
    ]);

    // Update core state
    liloCore.setState({ lastMessage: response });
    
    console.log('LILO Voice:', { input: text, response });
  };

  const startListening = () => {
    setIsListening(true);
    liloCore.setState({ isListening: true });
  };

  const stopListening = () => {
    setIsListening(false);
    liloCore.setState({ isListening: false });
  };

  return {
    messages,
    sendMessage,
    startListening,
    stopListening,
    isListening,
    isSpeaking,
    transcript,
    voiceSupported,
  };
};
