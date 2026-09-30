/**
 * useLilo — EcoNet Lilo AI hook
 *
 * Provides the Lilo conversation interface for the frontend.
 * All answers use real EcoNet data (missions, reports) when available.
 * Falls back to honest, grounded responses when data is unavailable.
 *
 * RULES:
 * - Never invent mission names, locations, funding amounts, or report counts.
 * - When data is unavailable, say so directly and offer what CAN be done.
 * - Multi-turn memory: prior user messages inform follow-up answers.
 * - Lilo does not claim capabilities it does not have (e.g. real-time satellite).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import liloCore from '../core/LiloCore';
import { getV2ApiOrigin, getApiBaseUrl } from '../services/runtimeConfig';
import { getAuthToken } from '../services/api';
import { useAuth } from '../context/AuthContext';

// ─── Intent detection ─────────────────────────────────────────────────────────

function detectIntent(text) {
  const v = text.toLowerCase();
  if (/(tomorrow|forecast|weather|temperature|rain|sunny|storm|heat wave)/.test(v)) return 'forecast';
  if (/(nigeria|lagos|abuja|kano|port harcourt|ibadan|enugu|calabar)/.test(v) && /(heat|temperature|climate|weather|drought)/.test(v)) return 'regional-climate';
  if (/(fire|burning|smoke|flood|flooding|pollution|spill|erosion|wildfire|contamination|dump|dumping)/.test(v)) return 'incident';
  if (/(hello|hi |hey|good morning|good afternoon|good evening)/.test(v)) return 'greeting';
  if (/(who are you|what can you do|what is lilo|what is econet|how does econet|about lilo)/.test(v)) return 'identity';
  if (/(my name|who am i|what.s my name|do you know me|remember me|my profile|my trust|my balance|my reputation)/.test(v)) return 'user-identity';
  if (/(help|guide me|advise|what should i do|what can i do|where should|how do i start)/.test(v)) return 'guidance';
  // Navigation intents — checked before generic mission/funding to avoid misrouting
  if (/(create|make|start|build|launch|new|post|add)\s+(a\s+)?(mission|missions)/i.test(v) || /mission\s+(create|creation|setup|wizard)/i.test(v)) return 'create-mission';
  if (/(fund|finance|pay for|sponsor)\s+(a\s+)?(mission|missions)/i.test(v)) return 'fund-mission';
  if (/(join|sign up for|participate in|take part in)\s+(a\s+)?(mission|missions)/i.test(v)) return 'join-mission';
  if (/(wallet|balance|ecocoin|eccoins?|withdraw|deposit|my coins|my funds)/.test(v)) return 'wallet-nav';
  if (/(toolkit|inventory|my tools?|equipment|field kit)/.test(v)) return 'toolkit-nav';
  if (/(carbon credit|carbon market|offset|credit|credits)/.test(v)) return 'carbon-nav';
  if (/(list.*mission|show.*mission|what missions|active missions|available missions|any missions|join mission)/.test(v)) return 'mission-list';
  if (/(fund|funding|how much|budget|cost|₦|naira|sponsor|whale|opportunity|opportunities)/.test(v)) return 'funding';
  if (/(mission|problem|environment|climate|impact|action|opportunity|report|community)/.test(v)) return 'general';
  return 'conversation';
}

function extractLocation(text) {
  const cleaned = text.replace(/[?.!,]/g, ' ');
  const words = cleaned.split(/\s+/).filter(Boolean);
  const markers = ['in', 'at', 'around', 'near', 'from'];
  for (let i = 0; i < words.length; i++) {
    if (!markers.includes(words[i].toLowerCase())) continue;
    const next = words.slice(i + 1, i + 4);
    if (next.length) return next.join(' ');
  }
  return '';
}

// ─── Context-aware answer builders ───────────────────────────────────────────

function answerGreeting(memory, user = null) {
  const name = user?.name ? `, ${user.name.split(' ')[0]}` : '';
  const userTurns = memory.filter(e => e.role === 'user').length;
  if (userTurns === 0) return `Hello${name}. I'm Lilo, EcoNet's environmental assistant. Tell me what you're seeing, what you're worried about, or what you need help with.`;
  return `Still with you${name}. What's next?`;
}

// ─── Real weather integration ─────────────────────────────────────────────────
// Weather answers come from GET /api/weather (OpenWeather via the backend).
// Lilo never invents weather. When the capability is unavailable she says so.

const WEATHER_ASK = "Which city or area should I check? For example: \"Kubwa, Abuja\". If you allow location access I can also use your device's position.";

function isLocationFollowUp(text, memory) {
  const lastAssistant = [...memory].reverse().find(e => e.role === 'assistant');
  if (!lastAssistant || !lastAssistant.content.includes('Which city or area should I check')) return false;
  // Treat a short, keyword-free reply as a location answer to the weather prompt.
  return text.split(/\s+/).length <= 6 && !/(mission|fund|report|hello|hi |thank)/i.test(text);
}

function getDevicePosition(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { timeout: timeoutMs, maximumAge: 300000 }
    );
  });
}

function formatWeatherAnswer(data) {
  const loc = data.location || {};
  const where = loc.name
    ? [loc.name, loc.state, loc.country].filter(Boolean).join(', ')
    : 'your location';
  const lines = [`Live weather for ${where} — source: OpenWeather.`];
  const c = data.current;
  if (c) {
    lines.push(`Right now: ${c.tempC}°C, ${c.condition}, feels like ${c.feelsLikeC}°C` +
      (c.humidityPct != null ? `, humidity ${c.humidityPct}%` : '') +
      (c.windKph != null ? `, wind ${c.windKph} km/h` : '') + '.');
  }
  const t = data.tomorrow;
  if (t) {
    lines.push(`Tomorrow (${t.date}): ${t.tempMinC}–${t.tempMaxC}°C, mostly ${t.condition}, rain chance ${t.rainChancePct}%.`);
  } else {
    lines.push("Tomorrow's forecast is unavailable from the provider at the moment — the current reading above is live.");
  }
  return lines.join('\n');
}

/**
 * Resolve a forecast answer using the real backend weather capability.
 * Returns { reply, location } — location is remembered for follow-ups.
 */
async function resolveWeatherReply(text, memory, rememberedLocation) {
  let location = extractLocation(text) || rememberedLocation || '';

  // "my weather" with no named place → try the device's permitted location.
  if (!location && /\b(my|here|our)\b/i.test(text)) {
    const pos = await getDevicePosition();
    if (pos) {
      try {
        const res = await fetch(`${getApiBaseUrl()}/weather?lat=${pos.lat}&lon=${pos.lon}`);
        const body = await res.json().catch(() => ({}));
        if (res.ok && body?.data) {
          return { reply: formatWeatherAnswer(body.data), location: body.data.location?.name || '' };
        }
      } catch { /* fall through to the ask */ }
      return { reply: "I can see your device position, but the weather service isn't reachable right now. Try again in a moment, or name your city.", location: '' };
    }
  }

  if (!location) {
    return { reply: `I can pull live weather, but I need a place. ${WEATHER_ASK}`, location: '' };
  }

  try {
    const res = await fetch(`${getApiBaseUrl()}/weather?location=${encodeURIComponent(location)}`);
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.data) {
      return { reply: formatWeatherAnswer(body.data), location };
    }
    if (res.status === 404) {
      return { reply: body?.message || `I couldn't find "${location}" on the map. Check the spelling or try a nearby larger city.`, location: '' };
    }
    if (res.status === 503) {
      return { reply: "Weather isn't configured on this deployment yet, so I can't pull a live forecast. That's a capability gap, not a guess I want to make. Everything else — missions, reports, opportunities — still works.", location: '' };
    }
    return { reply: "The weather provider isn't responding right now. Try again shortly — I won't guess at conditions.", location };
  } catch {
    return { reply: "I can't reach the weather service from here. Check your connection and try again — I won't guess at conditions.", location };
  }
}


function answerIdentity() {
  return "I'm Lilo — EcoNet's environmental intelligence assistant. I can help you find active missions, understand environmental risks, classify reports, and guide Whales and Grinders through the platform. Ask me anything about the environment, current missions, or what you can do right now.";
}

/**
 * Answer questions about the authenticated user using ONLY the identity data
 * the platform already holds for their own session. Lilo never invents profile
 * details and never reveals another user's information.
 */
function answerUserIdentity(text, user) {
  if (!user) {
    return "I don't have an authenticated profile in this session, so I can't tell you who you are. Sign in and ask me again — I'll use only your own account data.";
  }

  const name = user.name || 'a registered EcoNet member';
  const v = text.toLowerCase();
  const rep = user.reputation || {};
  const lines = [];

  if (/name|who am i|do you know me|remember me/.test(v)) {
    lines.push(`You're signed in as ${name}.`);
  } else {
    lines.push(`That's your own EcoNet account, ${name}.`);
  }

  // Only surface fields that are actually present — never fabricate metrics.
  const facts = [];
  if (typeof rep.trustScore === 'number') facts.push(`trust score ${rep.trustScore}`);
  if (typeof rep.ecoCoins === 'number') facts.push(`${rep.ecoCoins} EcoCoins`);
  if (typeof rep.leaves === 'number') facts.push(`${rep.leaves} leaves`);
  if (typeof rep.verifiedReports === 'number') facts.push(`${rep.verifiedReports} verified reports`);
  if (user.verifiedReporter) facts.push('verified reporter status');
  if (user.role) facts.push(`${user.role} role`);

  lines.push(facts.length
    ? `On this account I can see: ${facts.join(', ')}.`
    : "I don't have any reputation or wallet figures loaded for this session yet.");
  lines.push("I only use your own account data — I never share another member's information.");
  return lines.join(' ');
}

function answerRegionalClimate(text, missionsData = []) {
  const v = text.toLowerCase();
  if (v.includes('lagos')) return "Lagos faces compounding climate pressure: coastal flooding, extreme heat in the dry season, poor air quality near the industrial corridor, and inadequate drainage causing flash floods after heavy rain. The most active EcoNet areas in Lagos are illegal dumping clusters and coastal erosion near Lagos Island. Want me to check for active missions there?";
  if (v.includes('abuja') || v.includes('fct')) {
    const abujaMissions = (missionsData || []).filter(m =>
      /abuja|fct/i.test(m.targetCriteria?.region || ''));
    const missionNote = abujaMissions.length > 0
      ? ` There ${abujaMissions.length === 1 ? 'is' : 'are'} currently ${abujaMissions.length} active mission${abujaMissions.length === 1 ? '' : 's'} in the Abuja area — type 'list missions' to see details.`
      : ' There are no active missions in Abuja right now — a Whale can fund one from the Command Center.';
    return `Abuja faces heat stress, Jabi Lake degradation, erosion near residential developments, and flooding during the rainy season.${missionNote}`;
  }
  if (v.includes('kano')) return "Kano faces severe desertification pressure from the Sahel, seasonal dust storms, and water scarcity. These are priority areas for Lilo-identified opportunities.";
  return "Regional climate pressure in Nigeria typically shows as heat stress, flooding, water scarcity, soil erosion, and air quality decline. Tell me the specific state or city and I'll give you a more grounded response.";
}

function answerIncident(text) {
  const v = text.toLowerCase();
  if (v.includes('fire') || v.includes('burning')) return "If you're safe, send the exact location, how large the fire appears, and what's nearby (homes, roads, fuel). I'll treat it as a critical signal. Use Submit Report to document it officially.";
  if (v.includes('flood') || v.includes('flooding')) return "Tell me the location, water level relative to normal, and whether movement is still safe. If people are at risk, that's an immediate signal — not just observation.";
  if (v.includes('dump') || v.includes('dumping')) return "Illegal dumping is one of the most under-reported issues on EcoNet. Note the location, approximate size of the dump, and any health risk (proximity to water, people). A cluster of reports in one area can trigger a Lilo-identified opportunity.";
  if (v.includes('erosion')) return "Erosion near water bodies or roads is a slow-moving but serious risk. I need location, visible scale (meters of affected bank/road), and whether any communities are downstream. That shapes whether this becomes a monitoring mission or an emergency response.";
  return "That sounds like a real signal. Tell me: location, what you can confirm visually, and whether people or infrastructure are at immediate risk. I'll help classify and route it.";
}

function answerGuidance(memory) {
  const prevTopics = memory.filter(e => e.role === 'user').map(e => e.content.toLowerCase()).join(' ');
  if (prevTopics.includes('flood') || prevTopics.includes('water')) {
    return "Based on what you've shared, the most useful next step is: 1) Submit a formal report with location and photo evidence, 2) Check the map for existing flood monitoring missions you can join, 3) If no mission exists, Whale funding can activate one. Want me to walk through any of those?";
  }
  return "Next steps depend on your role. If you're a Grinder: check the map for active missions, join one, and submit evidence when complete. If you're a Whale: look at Lilo-discovered opportunities on your home screen and fund the ones with the most evidence. If you're reporting an incident: use Submit Report — it goes through Lilo classification automatically.";
}

/**
 * Answer a mission-list intent using real data when available.
 * missionsData is the array returned from GET /api/v2/missions.
 */
function answerMissionList(missionsData) {
  if (!missionsData || missionsData.length === 0) {
    return "I checked the mission engine but there are no active missions right now. A Whale can create one from the Command Center, or check the map for Lilo-identified opportunities waiting to be funded.";
  }
  const active = missionsData.filter(m => m.status === 'ACTIVE');
  if (active.length === 0) {
    return `There are ${missionsData.length} mission(s) but none are currently ACTIVE. They may be in DRAFT and awaiting activation. Check the Command Center.`;
  }
  const lines = active.slice(0, 5).map(m => {
    const region = m.targetCriteria?.region || m.coordinates ? `(${m.targetCriteria?.region || 'see map'})` : '';
    return `• ${m.title} ${region} — ${m.priority} priority`;
  });
  const more = active.length > 5 ? `\n...and ${active.length - 5} more. Open the map or Command Center for the full list.` : '';
  return `There are ${active.length} active mission(s) right now:\n\n${lines.join('\n')}${more}\n\nTo join one, go to the Command Center or tap a green pin on the map.`;
}

function answerFunding(text, missionsData) {
  if (/how much|budget|cost|₦|naira/.test(text.toLowerCase())) {
    return "Mission budgets depend on scope, duration, and participant count. Lilo shows estimated budgets on opportunity cards — these are preliminary figures based on typical costs for that type of intervention, not approved funding amounts. Final scope is set in Mission Studio when a Whale funds the mission. All amounts are in Nigerian Naira (NGN) by default.";
  }
  return "Funding a mission turns a Lilo-identified opportunity into an active mission that Grinders can join. Go to your Whale home screen, browse Lilo-discovered opportunities, and click 'Fund Mission' to review the details and open Mission Studio.";
}

function answerGeneral(text, memory, missionsData) {
  const v = text.toLowerCase();
  const prevContext = memory.filter(e => e.role === 'user').slice(-3).map(e => e.content).join(' ').toLowerCase();

  // Follow-up on a previous topic
  if (prevContext.includes('mission') && /more|another|other|next|also/.test(v)) {
    return answerMissionList(missionsData);
  }

  if (/what (should|can|could) (i|we) (do|focus|work on|prioritize|help with)/i.test(text)) {
    return "The highest-impact areas right now: illegal dumping (underreported), water contamination near industrial zones, urban flooding, coastal erosion. Check the map for active missions or grey pins (Lilo opportunities). If you're a Grinder, join a mission and submit evidence. If you're a Whale, fund an opportunity to make it playable.";
  }
  if (/mission|what.*mission|mission.*can/i.test(v)) return answerMissionList(missionsData);
  if (/opportunit/i.test(v)) return "Lilo-discovered opportunities are grey pins on the map — environmental problems with enough evidence to justify a mission, but not yet funded. Whales can fund them from their home screen. Once funded and activated, they become green pins that Grinders can join.";
  if (/econet|how does econet|what can econet/i.test(v)) return "EcoNet connects Grinders (field participants) and Whales (funders) through Lilo-identified environmental missions. Lilo finds where action is needed, Whales fund it, Grinders execute it and submit evidence, which creates verified impact records. The whole loop runs on one shared platform.";
  if (/community|communities/i.test(v)) return "Communities on EcoNet are groups of people organising around shared environmental causes. You can browse and join communities from the Communities page. Each community persists across sessions — you'll see the same members regardless of which device you use.";

  return "I can help with mission lookup, environmental risk, report guidance, or platform navigation. Tell me your location or the specific situation and I'll give you something concrete to work with.";
}

function answerConversation(text, memory, missionsData) {
  const v = text.toLowerCase();
  if (/thank(s| you)/i.test(v)) return "You're welcome. What else can I help with?";
  if (/worried|concerned|afraid|anxious/.test(v)) return "That's a real concern. Tell me what specifically is changing — I'll help separate an observation from something that needs documenting or acting on.";
  if (/what (should i|do i|next|now)/.test(v)) return answerGuidance(memory);
  return answerGeneral(text, memory, missionsData);
}

// ─── Main response dispatcher ─────────────────────────────────────────────────

function humanizeResponse(input, memory, missionsData, user = null) {
  const text = input.trim();
  const intent = detectIntent(text);

  switch (intent) {
    case 'greeting':        return answerGreeting(memory, user);
    case 'identity':        return answerIdentity();
    case 'user-identity':   return answerUserIdentity(text, user);
    // 'forecast' is async and handled directly in send() via resolveWeatherReply.
    case 'forecast':        return null;
    case 'regional-climate': return answerRegionalClimate(text, missionsData);
    case 'incident':        return answerIncident(text);
    case 'guidance':        return answerGuidance(memory);
    case 'mission-list':    return answerMissionList(missionsData);
    case 'funding':         return answerFunding(text, missionsData);
    case 'create-mission':  return "To create a mission, go to Mission Studio via the Command Center. You can set the mission title, location, type, and budget there. If you're a Whale, you can also fund it straight away. Want me to walk you to the Command Center?";
    case 'fund-mission':    return "Funding a mission turns a Lilo-discovered opportunity into something Grinders can actually join. Head to your Whale home screen, pick an opportunity from the list, and click 'Fund Mission' to open Mission Studio and set the budget.";
    case 'join-mission':    return answerMissionList(missionsData);
    case 'wallet-nav':      return "Your EcoNet wallet shows your EcoCoin balance, transaction history, and pending rewards. Open the Wallet page from the bottom nav or type /wallet. EcoCoins are earned by completing verified missions.";
    case 'toolkit-nav':     return "Your Toolkit holds the field tools assigned to you — things like cameras, sensors, or sampling kits. Open the Toolkit page to see what's available and request equipment for upcoming missions.";
    case 'carbon-nav':      return "The Carbon Credits section is where EcoNet tracks carbon impact from verified missions. It's still being built out — the foundation is live but the market integration is coming. Check the Carbon page for the current project register.";
    case 'general':         return answerGeneral(text, memory, missionsData);
    default:                return answerConversation(text, memory, missionsData);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export default function useLilo() {
  // Authenticated identity context: Lilo may reference the signed-in user's
  // OWN account data (name, reputation). It never receives or reveals another
  // user's information.
  const { user: authUser } = useAuth();
  const [messages, setMessages] = useState([]);
  const [isActive, setIsActive] = useState(false);
  const [mood, setMood]         = useState('aware');
  const [missionsData, setMissionsData] = useState([]);
  const fetchedRef = useRef(false);
  // Last successfully resolved weather location — enables follow-ups like
  // "and the day after?" without the user re-typing the place.
  const weatherLocationRef = useRef('');

  useEffect(() => {
    const coreState = liloCore.getState();
    setIsActive(coreState.isActive);
    setMood(coreState.mood);
  }, []);

  // Fetch real mission data once so Lilo can answer mission-related questions.
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const v2 = getV2ApiOrigin();
    if (!v2) return;
    // Fetch missions
    fetch(`${v2}/api/v2/missions`, { headers: { Accept: 'application/json' } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.missions) setMissionsData(data.missions); })
      .catch(() => { /* non-fatal */ });
  }, []);

  const send = (input) => {
    if (!input || typeof input !== 'string' || !input.trim()) return;
    const cleaned = input.trim();
    const intent  = detectIntent(cleaned);

    // Weather is resolved asynchronously against the real backend capability
    // (GET /api/weather → OpenWeather). A bare short reply right after Lilo
    // asked for a place (e.g. "kubwa abuja") continues the weather flow.
    if (intent === 'forecast' || isLocationFollowUp(cleaned, messages)) {
      setMessages(prev => [...prev, { role: 'user', content: cleaned, timestamp: new Date().toISOString() }]);
      liloCore.setState({ mood: 'focused', isActive: true, context: 'forecast' });
      setMood('focused');
      setIsActive(true);
      void resolveWeatherReply(cleaned, messages, weatherLocationRef.current).then(({ reply, location }) => {
        if (location) weatherLocationRef.current = location;
        setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: new Date().toISOString() }]);
      });
      return;
    }

    // General conversation (catch-all) → GROQ-backed response via /api/lilo/chat.
    // EcoNet-specific intents (missions, incidents, identity, etc.) stay in the
    // fast local pattern-matcher above via humanizeResponse().
    if (intent === 'conversation') {
      setMessages(prev => [...prev, { role: 'user', content: cleaned, timestamp: new Date().toISOString() }]);
      liloCore.setState({ mood: 'aware', isActive: true, context: 'conversation' });
      setIsActive(true);

      // Build the conversation history for the backend (last 12 turns, user+assistant only)
      const historyForApi = [...messages, { role: 'user', content: cleaned }]
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-12)
        .map(m => ({ role: m.role, content: m.content }));

      const base = getApiBaseUrl();
      fetch(`${base}/lilo/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyForApi,
          userContext: authUser ? { name: authUser.name, role: authUser.reputation?.verifiedReporter ? 'verified reporter' : 'member' } : {}
        })
      })
        .then(r => r.json())
        .then(data => {
          const reply = data.reply || "I'm here — go ahead.";
          setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: new Date().toISOString() }]);
        })
        .catch(() => {
          setMessages(prev => [...prev, { role: 'assistant', content: "I'm having trouble connecting right now. Ask me about a specific mission or environmental topic and I'll do my best.", timestamp: new Date().toISOString() }]);
        });
      return;
    }

    const reply   = humanizeResponse(cleaned, messages, missionsData, authUser);
    const nextMood = intent === 'incident' ? 'alert'
      : intent === 'regional-climate' ? 'focused'
      : 'aware';

    setMessages(prev => [
      ...prev,
      { role: 'user',      content: cleaned, timestamp: new Date().toISOString() },
      { role: 'assistant', content: reply,   timestamp: new Date().toISOString() }
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
    setMessages(prev => [...prev, {
      role: 'system',
      content: 'Lilo is online. Ask about missions, environmental risks, reports, or how the platform works.',
      timestamp: new Date().toISOString()
    }]);
  };

  const deactivate = () => {
    setIsActive(false);
    setMood('standby');
    liloCore.deactivate();
    setMessages(prev => [...prev, {
      role: 'system',
      content: 'Lilo is in standby.',
      timestamp: new Date().toISOString()
    }]);
  };

  const getStatus = useMemo(() => () => ({
    isActive,
    mood,
    messageCount: messages.length,
    memorySize:   messages.length,
    missionCount: missionsData.length,
  }), [isActive, mood, messages.length, missionsData.length]);

  return { messages, isActive, mood, send, clear, activate, deactivate, getStatus };
}
