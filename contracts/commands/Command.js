/**
 * EcoNet IO Canonical Command Contract
 * Imperative messages that request a state change in exactly one target engine.
 */

import { randomUUID } from 'crypto';
import { canonicalRegistry } from '../../architecture/engine-registry/CanonicalEngineRegistry.js';

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const requireNonEmptyString = (value, fieldName) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Command requires a valid string "${fieldName}".`);
  }
};

const requireOptionalNonEmptyString = (value, fieldName) => {
  if (value !== null && value !== undefined) {
    requireNonEmptyString(value, fieldName);
  }
};

const requireTimestamp = (value) => {
  if (value !== null && value !== undefined &&
      (typeof value !== 'string' || Number.isNaN(Date.parse(value)))) {
    throw new Error('Command requires a valid ISO-8601 string "issuedAt".');
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

export class Command {
  /**
   * @param {Object} params
   * @param {string} params.commandType - e.g. 'RegisterActor', 'SubmitObservation'
   * @param {string} params.targetEngine - e.g. '01-identity', '02-observation'
   * @param {Object} params.payload - Command data payload
   * @param {Object} [params.actor] - Authenticated actor issuing command
   * @param {string} [params.idempotencyKey] - Unique key for idempotent deduplication
   * @param {string} [params.correlationId] - Distributed tracing correlation ID
   * @param {string} [params.commandId]
   * @param {string} [params.issuedAt]
   */
  constructor({
    commandType,
    targetEngine,
    payload,
    actor = null,
    idempotencyKey = null,
    correlationId = null,
    commandId = null,
    issuedAt = null
  }) {
    requireNonEmptyString(commandType, 'commandType');
    requireNonEmptyString(targetEngine, 'targetEngine');
    requireOptionalNonEmptyString(commandId, 'commandId');
    requireOptionalNonEmptyString(idempotencyKey, 'idempotencyKey');
    requireOptionalNonEmptyString(correlationId, 'correlationId');
    requireTimestamp(issuedAt);
    if (!isRecord(payload)) {
      throw new Error('Command requires an object "payload".');
    }
    if (actor !== null && !isRecord(actor)) {
      throw new Error('Command requires "actor" to be an object when provided.');
    }

    const targetDefinition = canonicalRegistry.getEngineBySlug(targetEngine);
    if (!targetDefinition || targetDefinition.slug !== targetEngine) {
      throw new Error(`Command targetEngine must be a canonical engine slug; received "${targetEngine}".`);
    }

    this.commandId = commandId || `cmd_${randomUUID().replace(/-/g, '')}`;
    this.commandType = commandType;
    this.targetEngine = targetEngine;
    this.issuedAt = issuedAt || new Date().toISOString();
    this.actor = actor ? cloneAndFreeze(actor) : null;
    this.idempotencyKey = idempotencyKey || null;
    this.correlationId = correlationId || `cor_${randomUUID().replace(/-/g, '')}`;
    this.payload = cloneAndFreeze(payload);

    Object.freeze(this);
  }

  toJSON() {
    return {
      commandId: this.commandId,
      commandType: this.commandType,
      targetEngine: this.targetEngine,
      issuedAt: this.issuedAt,
      actor: this.actor,
      idempotencyKey: this.idempotencyKey,
      correlationId: this.correlationId,
      payload: this.payload
    };
  }
}
