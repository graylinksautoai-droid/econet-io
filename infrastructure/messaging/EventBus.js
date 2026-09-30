/**
 * EcoNet IO In-Memory Canonical Event Bus
 * Decoupled event-driven backbone connecting the 24 engines.
 */

import { DomainEvent } from '../../contracts/events/DomainEvent.js';
import { randomUUID } from 'crypto';

export class EventBus {
  constructor(options = {}) {
    this._subscribers = new Map(); // eventType -> Map<subId, { handler, priority, engineId }>
    this._wildcardSubscribers = new Map(); // subId -> { handler, priority, engineId }
    this._deadLetters = [];
    this._history = [];
    this._maxHistory = options.maxHistory || 500;
  }

  /**
   * Subscribe to a specific event type.
   * @param {string} eventType - Exact event type string (e.g. 'econet.observation.report.submitted')
   * @param {Function} handler - Async function(domainEvent)
   * @param {Object} [options]
   * @param {number} [options.priority=10] - Lower number = higher priority
   * @param {string} [options.engineId] - Subscribing engine identifier
   * @returns {string} subscriptionId
   */
  subscribe(eventType, handler, options = {}) {
    if (!eventType || typeof eventType !== 'string') {
      throw new Error('EventBus subscribe requires a valid eventType string.');
    }
    if (typeof handler !== 'function') {
      throw new Error('EventBus subscribe requires a handler function.');
    }

    const subId = `sub_${randomUUID().replace(/-/g, '')}`;
    if (!this._subscribers.has(eventType)) {
      this._subscribers.set(eventType, new Map());
    }

    this._subscribers.get(eventType).set(subId, {
      handler,
      priority: options.priority || 10,
      engineId: options.engineId || 'unknown'
    });

    return subId;
  }

  /**
   * Subscribe to ALL events across all engines (e.g. Audit, Learning, Metrics).
   * @param {Function} handler
   * @param {Object} [options]
   * @returns {string} subscriptionId
   */
  subscribeAll(handler, options = {}) {
    if (typeof handler !== 'function') {
      throw new Error('EventBus subscribeAll requires a handler function.');
    }
    const subId = `sub_all_${randomUUID().replace(/-/g, '')}`;
    this._wildcardSubscribers.set(subId, {
      handler,
      priority: options.priority || 10,
      engineId: options.engineId || 'global'
    });
    return subId;
  }

  /**
   * Unsubscribe a subscription by its ID.
   * @param {string} subscriptionId
   * @returns {boolean}
   */
  unsubscribe(subscriptionId) {
    if (this._wildcardSubscribers.delete(subscriptionId)) {
      return true;
    }
    for (const subMap of this._subscribers.values()) {
      if (subMap.delete(subscriptionId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Publish a DomainEvent to all registered subscribers asynchronously.
   * @param {DomainEvent|Object} event
   * @returns {Promise<{ deliveredCount: number, errors: Array<Object> }>}
   */
  async publish(event) {
    const domainEvent = event instanceof DomainEvent ? event : new DomainEvent(event);

    // Record to history
    this._recordHistory(domainEvent);

    const matchedSubs = [];

    // Collect type-specific subscribers
    if (this._subscribers.has(domainEvent.eventType)) {
      for (const [subId, sub] of this._subscribers.get(domainEvent.eventType).entries()) {
        matchedSubs.push({ subId, ...sub });
      }
    }

    // Collect wildcard subscribers
    for (const [subId, sub] of this._wildcardSubscribers.entries()) {
      matchedSubs.push({ subId, ...sub });
    }

    // Sort by priority (ascending)
    matchedSubs.sort((a, b) => a.priority - b.priority);

    let deliveredCount = 0;
    const errors = [];

    // Deliver to all matched subscribers with error isolation
    for (const sub of matchedSubs) {
      try {
        await sub.handler(domainEvent);
        deliveredCount++;
      } catch (err) {
        const errorRecord = {
          eventId: domainEvent.eventId,
          eventType: domainEvent.eventType,
          subscriptionId: sub.subId,
          engineId: sub.engineId,
          error: err.message,
          stack: err.stack,
          failedAt: new Date().toISOString()
        };
        errors.push(errorRecord);
        this._deadLetters.push({ event: domainEvent, ...errorRecord });
      }
    }

    return { deliveredCount, errors };
  }

  _recordHistory(event) {
    this._history.push(event);
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }
  }

  getHistory(filter = {}) {
    return this._history.filter(evt => {
      if (filter.eventType && evt.eventType !== filter.eventType) return false;
      if (filter.producer && evt.producer !== filter.producer) return false;
      if (filter.correlationId && evt.correlationId !== filter.correlationId) return false;
      return true;
    });
  }

  getDeadLetters() {
    return [...this._deadLetters];
  }

  clearDeadLetters() {
    this._deadLetters = [];
  }

  clearHistory() {
    this._history = [];
  }

  clearAllSubscribers() {
    this._subscribers.clear();
    this._wildcardSubscribers.clear();
  }
}

// Global Singleton Instance
export const globalEventBus = new EventBus();
