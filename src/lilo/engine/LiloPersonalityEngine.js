/**
 * LILO Personality Engine - Clean Class Export
 * Fixed constructor issue that was causing crashes
 */

export class LiloPersonalityEngine {
  constructor() {
    this.mood = "calm";
    this.context = "environmental";
  }

  respond(input) {
    if (!input) return "I'm listening...";

    const text = input.toLowerCase();

    if (text.includes("hello") || text.includes("hi")) {
      return "Hey there 👋 I'm LILO. What's happening in your world?";
    }

    if (text.includes("fire")) {
      return "🔥 That sounds serious. Do you want to report it?";
    }

    if (text.includes("flood")) {
      return "🌊 Flood detected. Stay safe. I can help coordinate response.";
    }

    if (text.includes("help")) {
      return "I've got you. Tell me what you need.";
    }

    if (text.includes("status")) {
      return `LILO operational. Mood: ${this.mood}. Context: ${this.context}.`;
    }

    return "Interesting... tell me more.";
  }

  setMood(mood) {
    this.mood = mood;
  }

  setContext(context) {
    this.context = context;
  }
}
