import { useState, useRef, useCallback } from "react";

export const useLiloCore = () => {
  // Core state
  const [isActive, setIsActive] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [memory, setMemory] = useState([]);
  const [personality, setPersonality] = useState("professional");
  const emitRef = useRef(null);

  // Event emitter setup
  const emit = useCallback((event, data) => {
    if (emitRef.current) {
      emitRef.current(event, data);
    }
  }, []);

  // Voice synthesis
  const speak = useCallback((text, options = {}) => {
    if (!window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options.rate || 1;
    utterance.pitch = options.pitch || 1;
    utterance.volume = options.volume || 1;

    window.speechSynthesis.speak(utterance);
    emit("speaking", { text, options });
  }, [emit]);

  // Voice toggle
  const toggleVoice = useCallback(() => {
    setIsActive(prev => !prev);
  }, []);

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

  return {
    process,
    voiceEnabled: isActive,
    toggleVoice,
    isThinking,
    memory,
    personality,
    emit
  };
};
