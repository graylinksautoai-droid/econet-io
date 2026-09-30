/**
 * Engine 06: Context Engine — ContextAlertLevelChanged Domain Event Factory
 * Canonical event emitted whenever an EnvironmentalContext transitions between alert levels.
 */

import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';

export const CONTEXT_ALERT_LEVEL_CHANGED = 'econet.context.alert_level_changed';
const PRODUCER = 'engine.06.context';

/**
 * Build a canonical ContextAlertLevelChanged DomainEvent.
 * @param {Object} params
 * @param {string} params.contextId
 * @param {string} params.regionId
 * @param {string} params.previousLevel
 * @param {string} params.newLevel
 * @param {boolean} params.isEscalation
 * @param {Object} [params.actor]
 * @param {string} [params.correlationId]
 * @param {Object} [params.metadata]
 * @returns {DomainEvent}
 */
export function createContextAlertLevelChangedEvent({
  contextId,
  regionId,
  previousLevel,
  newLevel,
  isEscalation,
  actor = null,
  correlationId = null,
  metadata = {}
}) {
  return new DomainEvent({
    eventType: CONTEXT_ALERT_LEVEL_CHANGED,
    producer: PRODUCER,
    actor,
    subject: { entityId: contextId, entityType: 'environmental_context' },
    correlationId,
    payload: {
      contextId,
      regionId,
      previousLevel,
      newLevel,
      isEscalation: Boolean(isEscalation)
    },
    metadata
  });
}
