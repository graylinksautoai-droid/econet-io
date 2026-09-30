/**
 * EcoNet IO Cryptographic Audit Journal Entry Contract
 * Append-only tamper-evident audit record using SHA-256 hash chaining.
 */

import { createHash, randomUUID } from 'crypto';

export class AuditJournalEntry {
  /**
   * @param {Object} params
   * @param {number} params.sequenceNumber - Monotonically increasing sequence index
   * @param {string} params.previousHash - SHA-256 hash of the previous journal entry ('0' for genesis)
   * @param {string} params.eventType - Canonical event type or command
   * @param {string} params.producer - Originating engine identifier
   * @param {Object} [params.actor] - Actor identifier and metadata
   * @param {Object} [params.subject] - Subject entity
   * @param {Object} [params.payloadSummary] - Redacted / summary payload
   * @param {string} [params.correlationId]
   * @param {string} [params.occurredAt]
   * @param {string} [params.entryId]
   * @param {string} [params.currentHash]
   */
  constructor({
    sequenceNumber,
    previousHash,
    eventType,
    producer,
    actor = null,
    subject = null,
    payloadSummary = {},
    correlationId = null,
    occurredAt = null,
    entryId = null,
    currentHash = null
  }) {
    if (typeof sequenceNumber !== 'number' || sequenceNumber < 0) {
      throw new Error('AuditJournalEntry requires a non-negative sequenceNumber.');
    }
    if (!previousHash || typeof previousHash !== 'string') {
      throw new Error('AuditJournalEntry requires a previousHash string.');
    }
    if (!eventType || typeof eventType !== 'string') {
      throw new Error('AuditJournalEntry requires an eventType string.');
    }
    if (!producer || typeof producer !== 'string') {
      throw new Error('AuditJournalEntry requires a producer string.');
    }

    this.entryId = entryId || `aud_${randomUUID().replace(/-/g, '')}`;
    this.sequenceNumber = sequenceNumber;
    this.previousHash = previousHash;
    this.occurredAt = occurredAt || new Date().toISOString();
    this.eventType = eventType;
    this.producer = producer;
    this.actor = actor ? Object.freeze({ ...actor }) : null;
    this.subject = subject ? Object.freeze({ ...subject }) : null;
    this.payloadSummary = Object.freeze({ ...payloadSummary });
    this.correlationId = correlationId || null;

    // Calculate current hash if not provided
    this.currentHash = currentHash || this.calculateHash();

    Object.freeze(this);
  }

  /**
   * Compute deterministic SHA-256 hash of this entry chained with previousHash.
   * @returns {string}
   */
  calculateHash() {
    const rawData = JSON.stringify({
      sequenceNumber: this.sequenceNumber,
      previousHash: this.previousHash,
      occurredAt: this.occurredAt,
      eventType: this.eventType,
      producer: this.producer,
      actor: this.actor,
      subject: this.subject,
      payloadSummary: this.payloadSummary,
      correlationId: this.correlationId
    });

    return createHash('sha256').update(rawData).digest('hex');
  }

  /**
   * Verify whether the current hash matches the computed hash.
   * @returns {boolean}
   */
  isValid() {
    return this.currentHash === this.calculateHash();
  }

  toJSON() {
    return {
      entryId: this.entryId,
      sequenceNumber: this.sequenceNumber,
      previousHash: this.previousHash,
      currentHash: this.currentHash,
      occurredAt: this.occurredAt,
      eventType: this.eventType,
      producer: this.producer,
      actor: this.actor,
      subject: this.subject,
      payloadSummary: this.payloadSummary,
      correlationId: this.correlationId
    };
  }
}
