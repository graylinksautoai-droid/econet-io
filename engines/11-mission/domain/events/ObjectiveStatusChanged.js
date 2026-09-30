/**
 * Engine 11: Mission Engine — ObjectiveStatusChanged Domain Event Factory.
 * Canonical event emitted on every objective status transition.
 * Third event type is an implementation decision following the repository's
 * multi-event convention (Risk/Action/Verification), not a canonical mandate.
 */

import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import { ObjectiveStatus } from '../value-objects/ObjectiveStatus.js';

export const OBJECTIVE_STATUS_CHANGED = 'econet.mission.objective_status_changed';
const PRODUCER = 'engine.11.mission';

/**
 * Build a canonical ObjectiveStatusChanged DomainEvent.
 * Audit `criticalMutation` is true only when an objective reaches terminal
 * FAILED status; implementation decision, not canonical.
 * @param {Object} params
 * @param {Object} params.mission - Mission snapshot AFTER the objective change
 * @param {string} params.objectiveId
 * @param {string} params.previousStatus
 * @param {string} [params.reason]
 * @param {Object} [params.actor]
 * @param {string} [params.correlationId]
 * @param {Object} [params.metadata]
 * @returns {DomainEvent}
 */
export function createObjectiveStatusChangedEvent({
  mission,
  objectiveId,
  previousStatus,
  reason = null,
  actor = null,
  correlationId = null,
  metadata = {}
}) {
  if (!mission || typeof mission !== 'object') {
    throw new Error('ObjectiveStatusChanged event requires a mission snapshot.');
  }

  const objective = (mission.objectives || []).find(candidate => candidate.objectiveId === objectiveId);
  if (!objective) {
    throw new Error(`ObjectiveStatusChanged event requires objective "${objectiveId}" on the mission snapshot.`);
  }
  const critical = objective.status === ObjectiveStatus.FAILED;

  return new DomainEvent({
    eventType: OBJECTIVE_STATUS_CHANGED,
    producer: PRODUCER,
    actor,
    subject: { entityId: mission.missionId, entityType: 'mission' },
    correlationId,
    payload: {
      missionId: mission.missionId,
      objectiveId,
      description: objective.description,
      previousStatus,
      newStatus: objective.status,
      reason,
      missionStatus: mission.status
    },
    metadata: {
      audit: {
        criticalMutation: critical,
        isEscalation: false
      },
      provenance: 'engine.11.mission.UpdateObjectiveStatus',
      ...metadata
    }
  });
}
