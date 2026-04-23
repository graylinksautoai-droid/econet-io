/**
 * LILO Core - Brainstem Singleton
 * Central state management and event system
 */

class LiloCore {
  constructor() {
    this.listeners = [];
    this.state = {
      isListening: false,
      isSpeaking: false,
      lastMessage: null,
      isActive: false,
      mood: "calm",
      context: "environmental"
    };
  }

  emit(event, data) {
    this.listeners.forEach((listener) => {
      try {
        listener(event, data);
      } catch (error) {
        console.error('LILO Core: Event listener error:', error);
      }
    });
  }

  subscribe(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.emit("stateChange", this.state);
  }

  getState() {
    return this.state;
  }

  activate() {
    this.setState({ isActive: true });
    this.emit("activated");
  }

  deactivate() {
    this.setState({ isActive: false });
    this.emit("deactivated");
  }
}

// Create singleton instance
export const liloCore = new LiloCore();

export default liloCore;
