/**
 * LILO Event Engine - Central event system for LILO communication
 * Simple pub/sub pattern for component communication
 */

class LiloEventEngine {
  constructor() {
    this.events = {};
    this.debug = false;
  }

  /**
   * Subscribe to events
   */
  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    
    this.events[event].push(callback);
    
    if (this.debug) {
      console.log(`LILO Event: Subscribed to "${event}"`);
    }
    
    // Return unsubscribe function
    return () => {
      this.events[event] = this.events[event].filter(cb => cb !== callback);
      if (this.debug) {
        console.log(`LILO Event: Unsubscribed from "${event}"`);
      }
    };
  }

  /**
   * Emit events to subscribers
   */
  emit(event, data) {
    if (!this.events[event]) {
      if (this.debug) {
        console.log(`LILO Event: No listeners for "${event}"`);
      }
      return;
    }

    if (this.debug) {
      console.log(`LILO Event: Emitting "${event}"`, data);
    }

    this.events[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`LILO Event Error in "${event}" callback:`, error);
      }
    });
  }

  /**
   * Remove all listeners for an event
   */
  off(event) {
    if (this.events[event]) {
      delete this.events[event];
      if (this.debug) {
        console.log(`LILO Event: Removed all listeners for "${event}"`);
      }
    }
  }

  /**
   * Get list of active events
   */
  getEvents() {
    return Object.keys(this.events);
  }

  /**
   * Enable/disable debug mode
   */
  setDebug(enabled) {
    this.debug = enabled;
  }

  /**
   * Clear all events
   */
  clear() {
    this.events = {};
    if (this.debug) {
      console.log('LILO Event: All events cleared');
    }
  }
}

// Create singleton instance
export const lilo = new LiloEventEngine();

// Export class for testing if needed
export { LiloEventEngine };
