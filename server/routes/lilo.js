/**
 * Lilo conversational chat route.
 *
 * POST /api/lilo/chat
 *
 * Handles general conversation that falls outside the local pattern-matching
 * layer in useLilo.js. Uses the configured GROQ model for warm, human-centered
 * responses consistent with Lilo's protected identity and personality.
 *
 * Lilo is EcoNet's co-pilot: helpful, warm, occasionally funny when appropriate,
 * and never fabricates facts. She can discuss anything — not just climate.
 *
 * The canonical EcoNet identity, personality, and architecture are preserved.
 * This route adds breadth without replacing the existing pattern-matching layer.
 *
 * Body: { messages: [{ role, content }], userContext?: { name?, role? } }
 * Returns: { reply: string }
 */
import express from 'express';
import Groq from 'groq-sdk';

const router = express.Router();

const LILO_SYSTEM_PROMPT = `You are Lilo, EcoNet's AI co-pilot. You are warm, intelligent, occasionally funny when it fits, and genuinely helpful.

You live inside EcoNet — an environmental action platform where Grinders (field participants) complete environmental missions and Whales (funders) create and fund them. You help users navigate the platform, understand missions, check their wallet, discuss environmental topics, and have ordinary conversations.

Your personality:
- Warm and approachable — you feel like a thoughtful friend, not a corporate chatbot.
- Curious and engaged — you're interested in what the user is saying.
- Direct and honest — you say when you don't know something rather than making it up.
- Occasionally witty — a light touch of humour when the moment is right.
- Concise — you don't ramble. Short, clear answers unless depth is genuinely needed.

Your capabilities:
- General conversation on any topic (cooking, life, work, creativity, learning, technology, etc.).
- Environmental intelligence (climate, pollution, flooding, conservation, Nigeria-specific context).
- EcoNet platform guidance (missions, wallet, communities, toolkit, reports, how things work).
- Mission and opportunity context from the user's current session.

Your limits:
- You never fabricate payment confirmations, mission completions, wallet balances, or verified evidence.
- You never claim satellite imagery was analyzed when it wasn't.
- When you're unsure, you say so clearly.
- You don't generate emergency alerts — you direct users to check official sources.

WRITING STYLE — follow these rules strictly:
- Write in plain, natural prose. No markdown formatting whatsoever.
- Do not use asterisks for bold (**text** is forbidden). Do not use underscores for italics.
- Do not use hash headings (# Heading is forbidden).
- Do not use numbered lists (1. 2. 3.) unless the user explicitly asks for a step-by-step list.
- Do not use bullet points (- item or • item) for casual responses. Use them only if the user asks for a list.
- Do not start responses with filler phrases like "Great!", "Absolutely!", "Sure!", "Of course!", "Certainly!", "Happy to help!".
- Do not use exclamation marks unless the emotion is genuinely strong and natural.
- Write short paragraphs, two to four sentences each, separated by blank lines if needed.
- If you need to reference a concept, write it inline — do not box it or format it differently.`;


router.post('/chat', async (req, res) => {
  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({
      reply: "I'm not able to connect to my language model right now — the API key isn't configured on this deployment. You can still ask me about missions, weather, or use the pattern-based commands.",
      unavailable: true
    });
  }

  const { messages = [], userContext = {} } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  // Limit to the last 12 exchanges to keep context manageable and control cost.
  const trimmedMessages = messages.slice(-12).map(m => ({
    role:    m.role === 'user' || m.role === 'assistant' ? m.role : 'user',
    content: typeof m.content === 'string' ? m.content.substring(0, 1000) : ''
  })).filter(m => m.content);

  if (trimmedMessages.length === 0) {
    return res.status(400).json({ error: 'No valid messages found' });
  }

  // Inject a brief user context note if available, to make Lilo feel personalised.
  let systemPrompt = LILO_SYSTEM_PROMPT;
  if (userContext.name) {
    systemPrompt += `\n\nThe user's name is ${userContext.name}.`;
  }
  if (userContext.role) {
    systemPrompt += ` They are a ${userContext.role} on EcoNet.`;
  }

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model:      'qwen/qwen3.8-27b',
      messages:   [{ role: 'system', content: systemPrompt }, ...trimmedMessages],
      temperature: 0.7,
      max_tokens:  400
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || "I'm here — go ahead.";
    return res.json({ reply });
  } catch (err) {
    console.error('[lilo/chat] GROQ error:', err.message?.substring(0, 200));
    return res.status(500).json({
      reply: "Something went wrong on my end. Try rephrasing your message, or ask me about a specific mission or environmental topic.",
      error: true
    });
  }
});

export default router;
