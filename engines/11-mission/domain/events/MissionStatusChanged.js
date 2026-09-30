/**
 * Engine 11: Mission Engine — MissionStatusChanged Domain Event Factory.
 * Canonical event emitted on every mission lifecycle transition.
 */

import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import { isTerminalMissionStatus } from '../value-objects/MissionStatus.js';

export const MISSION_STATUS_CHANGED = 'econet.mission.status_changed';
const PRODUCER = 'engine.11.mission';

/**
 * Build a canonical MissionStatusChanged DomainEvent.
 * Audit `criticalMutation` is true only for transitions into a terminal
 * mission state (COMPLETED/ABORTED); implementation decision, not canonical.
 * @param {Object} params
 * @param {Object} params.mission - Mission snapshot AFTER the transition
 * @param {string} params.previousStatus
 * @param {string} [params.reason]
 * @param {Object} [params.actor]
 * @param {string} [params.correlationId]
 * @param {Object} [params.metadata]
 * @returns {DomainEvent}
 */
export function createMissionStatusChangedEvent({
  mission,
  previousStatus,
  reason = null,
  actor = null,
  correlationId = null,
  metadata = {}
}) {
  if (!mission || typeof mission !== 'object') {
    throw new Error('MissionStatusChanged event requires a mission snapshot.');
  }

  const terminal = isTerminalMissionStatus(mission.status);

  return new DomainEvent({
    eventType: MISSION_STATUS_CHANGED,
    producer: PRODUCER,
    actor,
    subject: { entityId: mission.missionId, entityType: 'mission' },
    correlationId,
    payload: {
      missionId: mission.missionId,
      title: mission.title,
      previousStatus,
      newStatus: mission.status,
      reason,
      objectiveCount: mission.objectives ? mission.objectives.length : 0,
      objectiveSummary: mission.objectives
        ? mission.objectives.map(objective => ({
          objectiveId: objective.objectiveId,
          status: objective.status
        }))
        : []
    },
    metadata: {
      audit: {
        criticalMutation: terminal,
        isEscalation: false
      },
      provenance: 'engine.11.mission.MissionStatusChanged',
      ...metadata
    }
  });
}
