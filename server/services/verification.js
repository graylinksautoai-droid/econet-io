import Groq from 'groq-sdk';

/**
 * Analyzes a report description and returns a credibility score (0-100) and reasoning.
 */
export async function verifyText(description) {
  // Initialize Groq client inside the function to ensure env vars are loaded
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  try {
    const prompt = `You are an AI that assesses the credibility of climate/environmental reports.
Analyze the following report description and return a JSON object with:
- "score": a number from 0 to 100 indicating credibility (higher means more credible)
- "reasoning": a brief explanation of the score
- "flags": an array of strings listing any suspicious aspects (e.g., "vague description", "no location", "exaggerated language") or empty if none.

Consider factors like: specificity (time, place, details), plausibility, consistency, presence of verifiable facts, and language that seems exaggerated or fake.

Report description: "${description}"

Return ONLY the JSON object, no other text.`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 300
    });

    const result = completion.choices[0]?.message?.content;
    // Attempt to parse JSON
    const parsed = JSON.parse(result);
    return {
      score: parsed.score,
      reasoning: parsed.reasoning,
      flags: parsed.flags || []
    };
  } catch (error) {
    console.error("Verification error:", error);
    // Fallback: return neutral score
    return { score: 50, reasoning: "AI verification failed", flags: [] };
  }
}