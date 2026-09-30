/**
 * Engine 23: Audit Engine
 * Authority: EcoNet IO 24-Engine Canon
 * Mission: Record an immutable, tamper-evident audit journal of all critical system events, verifications, and actions.
 */

import { AuditJournalEntry } from '../../contracts/audit/AuditJournalEntry.js';
import { globalEventBus } from '../../infrastructure/messaging/EventBus.js';

export const ENGINE_ID = '23';
export const ENGINE_NAME = 'Audit Engine';
export const GENESIS_HASH = '0'.repeat(64);

export class AuditEngine {
  constructor(eventBus = globalEventBus) {
    this.engineId = ENGINE_ID;
    this.engineName = ENGINE_NAME;
    this._eventBus = eventBus;
    this._journal = []; // Append-only array of AuditJournalEntry
    this._subscriptionId = null;
  }

  async initialize() {
    // Subscribe to all domain events across the system
    this._subscriptionId = this._eventBus.subscribeAll(async (event) => {
      this.recordEvent(event);
    }, { priority: 1, engineId: ENGINE_ID });

    return { ready: true, engineId: ENGINE_ID, name: ENGINE_NAME };
  }

  /**
   * Append a new domain event or action to the tamper-evident journal.
   * @param {Object} event
   * @returns {AuditJournalEntry}
   */
  recordEvent(event) {
    const sequenceNumber = this._journal.length;
    const previousHash = sequenceNumber === 0 
      ? GENESIS_HASH 
      : this._journal[sequenceNumber - 1].currentHash;

    const entry = new AuditJournalEntry({
      sequenceNumber,
      previousHash,
      eventType: event.eventType || 'unknown',
      producer: event.producer || 'system',
      actor: event.actor || null,
      subject: event.subject || null,
      payloadSummary: event.payload || {},
      correlationId: event.correlationId || null,
      occurredAt: event.occurredAt || new Date().toISOString()
    });

    this._journal.push(entry);
    return entry;
  }

  /**
   * Verify the entire cryptographic hash chain from genesis to tip.
   * @returns {{ verified: boolean, totalEntries: number, brokenAtSequence?: number, error?: string }}
   */
  verifyIntegrity() {
    if (this._journal.length === 0) {
      return { verified: true, totalEntries: 0 };
    }

    let expectedPreviousHash = GENESIS_HASH;

    for (let i = 0; i < this._journal.length; i++) {
      const entry = this._journal[i];

      // Verify sequence number
      if (entry.sequenceNumber !== i) {
        return {
          verified: false,
          totalEntries: this._journal.length,
          brokenAtSequence: i,
          error: `Sequence mismatch at index ${i}: expected ${i}, found ${entry.sequenceNumber}.`
        };
      }

      // Verify previous hash chain
      if (entry.previousHash !== expectedPreviousHash) {
        return {
          verified: false,
          totalEntries: this._journal.length,
          brokenAtSequence: i,
          error: `Hash chain broken at sequence ${i}: expected previousHash ${expectedPreviousHash}, found ${entry.previousHash}.`
        };
      }

      // Verify entry self-hash validity
      if (!entry.isValid()) {
        return {
          verified: false,
          totalEntries: this._journal.length,
          brokenAtSequence: i,
          error: `Entry hash corrupted at sequence ${i}.`
        };
      }

      expectedPreviousHash = entry.currentHash;
    }

    return { verified: true, totalEntries: this._journal.length };
  }

  /**
   * Query journal records with filtering.
   * @param {Object} [filter]
   * @returns {Array<Object>}
   */
  queryJournal(filter = {}) {
    return this._journal
      .filter(entry => {
        if (filter.eventType && entry.eventType !== filter.eventType) return false;
        if (filter.producer && entry.producer !== filter.producer) return false;
        if (filter.correlationId && entry.correlationId !== filter.correlationId) return false;
        if (filter.actorId && entry.actor?.actorId !== filter.actorId) return false;
        return true;
      })
      .map(entry => entry.toJSON());
  }

  get totalEntries() {
    return this._journal.length;
  }

  async healthCheck() {
    const integrity = this.verifyIntegrity();
    return {
      healthy: integrity.verified,
      engineId: ENGINE_ID,
      details: {
        totalJournalEntries: this._journal.length,
        integrityStatus: integrity.verified ? 'VALID' : 'CORRUPTED',
        ...integrity
      }
    };
  }

  async shutdown() {
    if (this._subscriptionId) {
      this._eventBus.unsubscribe(this._subscriptionId);
      this._subscriptionId = null;
    }
  }

  clear() {
    this._journal = [];
  }
}

// Global Singleton Instance
export const auditEngine = new AuditEngine();
export default auditEngine;
