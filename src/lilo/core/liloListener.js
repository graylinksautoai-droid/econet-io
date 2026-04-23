/**
 * LILO Event Listener System - Initialize all LILO event subscriptions
 * Sets up core event handlers for LILO communication
 */

import { lilo } from "./liloEventEngine";

let isInitialized = false;

/**
 * Initialize LILO event listeners
 * Sets up default event handlers for logging and system monitoring
 */
export const initLiloListeners = () => {
  if (isInitialized) {
    console.log("LILO: Event listeners already initialized");
    return;
  }

  // Response handler - logs all LILO responses
  lilo.on("response", (data) => {
    console.log("LILO RESPONSE:", data);
  });

  // Speaking handler - logs when LILO speaks
  lilo.on("speaking", (data) => {
    console.log("LILO SPEAKING:", data);
  });

  // Thinking handler - logs when LILO is thinking
  lilo.on("thinking", (data) => {
    console.log("LILO THINKING:", data);
  });

  // Error handler - logs all LILO errors
  lilo.on("error", (data) => {
    console.error("LILO ERROR:", data);
  });

  // Activation handler
  lilo.on("activated", () => {
    console.log("LILO: System activated");
  });

  // Deactivation handler
  lilo.on("deactivated", () => {
    console.log("LILO: System deactivated");
  });

  // Memory cleared handler
  lilo.on("memory_cleared", () => {
    console.log("LILO: Memory cleared");
  });

  // Personality change handler
  lilo.on("personality_changed", (data) => {
    console.log("LILO: Personality changed to:", data.mode);
  });

  // Image upload handler (for useImageUpload integration)
  lilo.on("IMAGE_UPLOADED", (data) => {
    console.log("LILO: Image uploaded:", data);
  });

  isInitialized = true;
  console.log("LILO: Event listeners initialized");
};

/**
 * Remove all LILO event listeners
 * Useful for cleanup or testing
 */
export const removeLiloListeners = () => {
  lilo.clear();
  isInitialized = false;
  console.log("LILO: Event listeners removed");
};

/**
 * Check if listeners are initialized
 */
export const areListenersInitialized = () => {
  return isInitialized;
};

/**
 * Add custom event listener
 */
export const addLiloListener = (event, callback) => {
  return lilo.on(event, callback);
};

/**
 * Emit LILO event
 */
export const emitLiloEvent = (event, data) => {
  lilo.emit(event, data);
};
