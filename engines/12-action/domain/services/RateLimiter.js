/**
 * Engine 12: Action Engine — RateLimiter Domain Service
 * Sliding window rate limiter for external action execution.
 */

export class RateLimiter {
  #requests = new Map();

  constructor({ windowMs = 60000, maxRequests = 10 } = {}) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  isAllowed(key, now = Date.now()) {
    if (!key || typeof key !== 'string') {
      return { allowed: true, remaining: this.maxRequests, resetInMs: 0 };
    }

    const currentTimestamps = this.#requests.get(key) || [];
    const windowStart = now - this.windowMs;

    // Filter out timestamps outside the active window
    const activeTimestamps = currentTimestamps.filter(t => t > windowStart);

    if (activeTimestamps.length >= this.maxRequests) {
      const oldestTimestamp = activeTimestamps[0];
      const resetInMs = Math.max(0, oldestTimestamp + this.windowMs - now);
      this.#requests.set(key, activeTimestamps);
      return {
        allowed: false,
        remaining: 0,
        resetInMs
      };
    }

    activeTimestamps.push(now);
    this.#requests.set(key, activeTimestamps);

    return {
      allowed: true,
      remaining: this.maxRequests - activeTimestamps.length,
      resetInMs: this.windowMs
    };
  }

  reset() {
    this.#requests.clear();
  }
}
