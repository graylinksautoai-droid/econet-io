/**
 * Engine 11: Mission Engine — MissionCreated Domain Event Factory.
 * Canonical event emitted when a mission aggregate is created.
 * Event naming follows the repository's econet.<engine>.<fact> convention.
 */

import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';

export const MISSION_CREATED = 'econet.mission.created';
const PRODUCER = 'engine.11.mission';

/**
 * Build a canonical MissionCreated DomainEvent.
 * @param {Object} params
 * @param {Object} params.mission - Mission snapshot (toJSON output)
 * @param {Object} [params.actor]
 * @param {string} [params.correlationId]
 * @param {Object} [params.metadata]
 * @returns {DomainEvent}
 */
export function createMissionCreatedEvent({
  mission,
  actor = null,
  correlationId = null,
  metadata = {}
}) {
  if (!mission || typeof mission !== 'object') {
    throw new Error('MissionCreated event requires a mission snapshot.');
  }

  return new DomainEvent({
    eventType: MISSION_CREATED,
    producer: PRODUCER,
    actor,
    subject: { entityId: mission.missionId, entityType: 'mission' },
    correlationId,
    payload: {
      missionId: mission.missionId,
      title: mission.title,
      description: mission.description,
      priority: mission.priority,
      status: mission.status,
      targetCriteria: mission.targetCriteria,
      objectives: mission.objectives,
      objectiveCount: mission.objectives ? mission.objectives.length : 0
    },
    metadata: {
      audit: {
        criticalMutation: false,
        isEscalation: false
      },
      provenance: 'engine.11.mission.CreateMission',
      ...metadata
    }
  });
}
