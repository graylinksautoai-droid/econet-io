/**
 * LILO Core Intelligence Module
 * Central brain for environmental AI assistant
 */

class LiloCore {
  constructor() {
    this.memory = [];
    this.state = {
      mood: 'aware',
      context: null,
      isActive: false
    };
  }

  process(input) {
    if (!input || typeof input !== 'string') {
      return "I'm here... listening. What's happening in your environment?";
    }

    // Store user input in memory
    this.memory.push({ 
      role: 'user', 
      content: input,
      timestamp: new Date().toISOString()
    });

    // Generate response
    const response = this.generateResponse(input);

    // Store assistant response in memory
    this.memory.push({ 
      role: 'assistant', 
      content: response,
      timestamp: new Date().toISOString()
    });

    // Keep memory limited to last 50 exchanges
    if (this.memory.length > 100) {
      this.memory = this.memory.slice(-100);
    }

    return response;
  }

  generateResponse(input) {
    const text = input.toLowerCase().trim();

    // Greetings
    if (text.includes('hello') || text.includes('hi') || text.includes('hey')) {
      return "Hey there! I'm LILO, your environmental intelligence assistant. What's happening around you?";
    }

    // Environmental emergencies
    if (text.includes('fire') || text.includes('burning')) {
      return "Fire detected! This is critical. Please report the exact location and any immediate dangers. Stay safe and evacuate if necessary.";
    }

    if (text.includes('flood') || text.includes('flooding')) {
      return "Flooding situation identified. Please move to higher ground immediately. What's your current location and water level?";
    }

    if (text.includes('smoke') || text.includes('haze')) {
      return "Smoke detected. This could indicate fire or air pollution. Are you experiencing difficulty breathing? Please describe the situation.";
    }

    // Environmental monitoring
    if (text.includes('air quality') || text.includes('pollution')) {
      return "Air quality monitoring activated. I can help track pollution levels and health impacts. What specific concerns do you have?";
    }

    if (text.includes('climate') || text.includes('weather')) {
      return "Climate data available. I can help with weather patterns, climate trends, and environmental changes. What would you like to know?";
    }

    // Help and assistance
    if (text.includes('help') || text.includes('assist')) {
      return "I'm here to help! I can assist with:\n\n- Emergency reporting (fire, flood, smoke)\n- Environmental monitoring (air quality, climate)\n- Safety guidance\n- Community coordination\n\nWhat do you need help with?";
    }

    if (text.includes('status') || text.includes('how are you')) {
      return "LILO systems operational. I'm actively monitoring environmental conditions and ready to assist. Current mood: " + this.state.mood;
    }

    // Location and reporting
    if (text.includes('report') || text.includes('incident')) {
      return "Ready to document environmental incident. Please provide:\n- Type of incident (fire, flood, pollution, etc.)\n- Location description\n- Severity level\n- Any immediate dangers\n\nI'll help coordinate the response.";
    }

    // Default responses
    if (text.length < 5) {
      return "I'm listening... Could you tell me more about what you're observing?";
    }

    return "I'm processing that environmental information. Could you provide more details about the situation you're describing?";
  }

  setState(newState) {
    this.state = { ...this.state, ...newState };
  }

  getState() {
    return { ...this.state };
  }

  getMemory() {
    return [...this.memory];
  }

  clearMemory() {
    this.memory = [];
    return "Memory cleared. I'm ready for fresh environmental monitoring.";
  }

  activate() {
    this.setState({ isActive: true, mood: 'alert' });
    return "LILO activated. Environmental intelligence systems online.";
  }

  deactivate() {
    this.setState({ isActive: false, mood: 'standby' });
    return "LILO deactivated. Entering standby mode.";
  }
}

// Create singleton instance
const liloCore = new LiloCore();

export default liloCore;
