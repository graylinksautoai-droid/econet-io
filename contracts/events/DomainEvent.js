/**
 * EcoNet IO Canonical Domain Event
 * Standard schema specification for all events emitted across the 24 engines.
 */

import { randomUUID } from 'crypto';

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const requireNonEmptyString = (value, fieldName) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`DomainEvent requires a valid string "${fieldName}".`);
  }
};

const requireOptionalNonEmptyString = (value, fieldName) => {
  if (value !== null && value !== undefined) {
    requireNonEmptyString(value, fieldName);
  }
};

const requireTimestamp = (value, fieldName) => {
  if (value !== null && value !== undefined &&
      (typeof value !== 'string' || Number.isNaN(Date.parse(value)))) {
    throw new Error(`DomainEvent requires a valid ISO-8601 string "${fieldName}".`);
  }
};

const cloneAndFreeze = (value) => {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneAndFreeze));
  }
  if (isRecord(value)) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneAndFreeze(item)])
    ));
  }
  return value;
};

export class DomainEvent {
  /**
   * @param {Object} params
   * @param {string} params.eventType - e.g. 'econet.observation.report.submitted'
   * @param {string} params.producer - e.g. 'engine.02.observation'
   * @param {Object} params.payload - Event payload data
   * @param {Object} [params.actor] - Actor triggering the event { actorId, actorType, roles }
   * @param {Object} [params.subject] - Subject entity { entityId, entityType }
   * @param {string} [params.correlationId] - Correlation trace ID
   * @param {string} [params.causationId] - ID of command/event that caused this event
   * @param {string} [params.eventVersion='1.0']
   * @param {Object} [params.metadata={}]
   * @param {string} [params.eventId]
   * @param {string} [params.occurredAt]
   */
  constructor({
    eventType,
    producer,
    payload,
    actor = null,
    subject = null,
    correlationId = null,
    causationId = null,
    eventVersion = '1.0',
    metadata = {},
    eventId = null,
    occurredAt = null
  }) {
    requireNonEmptyString(eventType, 'eventType');
    requireNonEmptyString(producer, 'producer');
    requireNonEmptyString(eventVersion, 'eventVersion');
    requireOptionalNonEmptyString(eventId, 'eventId');
    requireOptionalNonEmptyString(correlationId, 'correlationId');
    requireOptionalNonEmptyString(causationId, 'causationId');
    requireTimestamp(occurredAt, 'occurredAt');
    if (!isRecord(payload)) {
      throw new Error('DomainEvent requires an object "payload".');
    }
    if (!isRecord(metadata)) {
      throw new Error('DomainEvent requires an object "metadata".');
    }
    if (actor !== null && !isRecord(actor)) {
      throw new Error('DomainEvent requires "actor" to be an object when provided.');
    }
    if (subject !== null && !isRecord(subject)) {
      throw new Error('DomainEvent requires "subject" to be an object when provided.');
    }

    this.eventId = eventId || `evt_${randomUUID().replace(/-/g, '')}`;
    this.eventType = eventType;
    this.eventVersion = eventVersion;
    this.occurredAt = occurredAt || new Date().toISOString();
    this.producer = producer;
    this.correlationId = correlationId || `cor_${randomUUID().replace(/-/g, '')}`;
    this.causationId = causationId || null;
    this.actor = actor ? cloneAndFreeze(actor) : null;
    this.subject = subject ? cloneAndFreeze(subject) : null;
    this.payload = cloneAndFreeze(payload);
    this.metadata = cloneAndFreeze({ ...metadata, schemaVersion: '1.0' });

    Object.freeze(this);
  }

  /**
   * Serialize event to standard JSON object.
   * @returns {Object}
   */
  toJSON() {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      eventVersion: this.eventVersion,
      occurredAt: this.occurredAt,
      producer: this.producer,
      correlationId: this.correlationId,
      causationId: this.causationId,
      actor: this.actor,
      subject: this.subject,
      payload: this.payload,
      metadata: this.metadata
    };
  }

  /**
   * Create a child event in the same causation chain.
   * @param {Object} params
   * @returns {DomainEvent}
   */
  createChildEvent({ eventType, producer, payload, actor = null, subject = null, metadata = {} }) {
    return new DomainEvent({
      eventType,
      producer,
      payload,
      actor: actor || this.actor,
      subject: subject || this.subject,
      correlationId: this.correlationId,
      causationId: this.eventId,
      metadata: { ...this.metadata, ...metadata }
    });
  }
}
