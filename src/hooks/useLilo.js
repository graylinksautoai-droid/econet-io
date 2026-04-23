import { useEffect, useMemo, useState } from 'react';
import liloCore from '../core/LiloCore';

function detectIntent(text) {
  const value = text.toLowerCase();

  if (/(tomorrow|forecast|weather|temperature|rain|sunny|storm|heat)/.test(value)) return 'forecast';
  if (/(nigeria|lagos|abuja|kano|port harcourt)/.test(value) && /(heat|temperature|climate|weather)/.test(value)) return 'regional-climate';
  if (/(fire|burning|smoke|flood|pollution|spill|erosion|wildfire)/.test(value)) return 'incident';
  if (/(hello|hi|hey|good morning|good evening)/.test(value)) return 'greeting';
  if (/(who are you|what can you do)/.test(value)) return 'identity';
  if (/(help|guide me|advise|what should i do)/.test(value)) return 'guidance';
  return 'conversation';
}

function answerForecast(text) {
  if (text.includes('tomorrow')) {
    return "I can help interpret tomorrow's weather, but I don't have live forecast data inside this chat yet. If you tell me your city, I can still explain what conditions to watch for and how heat, rain, or wind could affect you.";
  }

  return "I can talk through weather and climate risk with you. If you share your city or region, I’ll make the guidance more grounded and practical.";
}

function answerRegionalClimate(text) {
  if (text.includes('heat') && text.includes('nigeria')) {
    return "That concern is valid. Rising heat in Nigeria usually means more heat stress, drier surfaces in some regions, pressure on water access, and more health risk for children, elders, and outdoor workers. If you want, I can help you turn that concern into a clear climate post or a monitored command signal.";
  }

  return "Regional climate pressure often shows up as heat stress, flooding patterns, water strain, crop disruption, and air quality changes. Tell me the state or city you're focused on and I’ll respond more specifically.";
}

function answerIncident(text) {
  if (text.includes('fire')) {
    return "That sounds serious. If you're safe, send the nearest location, how visible the fire is, and whether homes, roads, or power lines are close. I’ll treat it as a potential critical signal.";
  }

  if (text.includes('flood')) {
    return "Understood. Safety first. If you can, tell me the location, water depth, and whether movement is still possible. That helps decide whether this stays in observation or becomes critical.";
  }

  if (text.includes('pollution') || text.includes('smoke')) {
    return "That could be important. Tell me where it is, what you can smell or see, and whether people nearby are being affected. I can help shape it into a useful report.";
  }

  return "That does sound like a real environmental signal. Give me the location, what you can visibly confirm, and whether people or infrastructure are at immediate risk.";
}

function humanizeResponse(input, memory) {
  const text = input.trim();
  const lower = text.toLowerCase();
  const intent = detectIntent(lower);
  const messageCount = memory.filter((entry) => entry.role === 'user').length;

  if (intent === 'greeting') {
    return messageCount === 0
      ? "I'm here with you. Ask me something real, or tell me what you're seeing and I’ll help you make sense of it."
      : "Still with you. What do you want to figure out right now?";
  }

  if (intent === 'identity') {
    return "I'm LILO, EcoNet's field and command assistant. I help with climate signals, report shaping, environmental guidance, and making raw observations more actionable.";
  }

  if (intent === 'forecast') {
    return answerForecast(lower);
  }

  if (intent === 'regional-climate') {
    return answerRegionalClimate(lower);
  }

  if (intent === 'incident') {
    return answerIncident(lower);
  }

  if (intent === 'guidance') {
    return "We can work through it together. If this is an incident, send location, what happened, how severe it looks, and any photo or video. If it’s more of a concern or trend, I can help turn it into a strong climate post.";
  }

  return "I follow you. Give me a bit more detail and I’ll respond more concretely instead of guessing.";
}

export default function useLilo() {
  const [messages, setMessages] = useState([]);
  const [isActive, setIsActive] = useState(false);
  const [mood, setMood] = useState('aware');

  useEffect(() => {
    const coreState = liloCore.getState();
    setIsActive(coreState.isActive);
    setMood(coreState.mood);
  }, []);

  const send = (input) => {
    if (!input || typeof input !== 'string' || !input.trim()) return;

    const cleaned = input.trim();
    const reply = humanizeResponse(cleaned, messages);
    const intent = detectIntent(cleaned);
    const nextMood = intent === 'incident' ? 'alert' : intent === 'forecast' || intent === 'regional-climate' ? 'focused' : 'aware';

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: cleaned, timestamp: new Date().toISOString() },
      { role: 'assistant', content: reply, timestamp: new Date().toISOString() }
    ]);

    liloCore.setState({ mood: nextMood, isActive: true, context: intent });
    setMood(nextMood);
    setIsActive(true);
  };

  const clear = () => {
    setMessages([]);
    liloCore.clearMemory();
  };

  const activate = () => {
    setIsActive(true);
    setMood('aware');
    liloCore.activate();
    setMessages((prev) => [
      ...prev,
      {
        role: 'system',
        content: 'LILO is online. Ask naturally about climate, risk, reports, or what you are worried about.',
        timestamp: new Date().toISOString()
      }
    ]);
  };

  const deactivate = () => {
    setIsActive(false);
    setMood('standby');
    liloCore.deactivate();
    setMessages((prev) => [
      ...prev,
      {
        role: 'system',
        content: 'LILO is in standby. Re-activate when you want to continue.',
        timestamp: new Date().toISOString()
      }
    ]);
  };

  const getStatus = useMemo(
    () => () => ({
      isActive,
      mood,
      messageCount: messages.length,
      memorySize: messages.length
    }),
    [isActive, mood, messages.length]
  );

  return { messages, isActive, mood, send, clear, activate, deactivate, getStatus };
}
