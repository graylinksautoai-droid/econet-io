/**
 * Engine 11: Mission Engine — EcoNet IO 24-Engine Canon.
 * Mission: Operational response task creation, field responder allocation,
 * mission tracking, and operational lifecycle management.
 */

import { MissionApplicationService } from './application/services/MissionApplicationService.js';
import { InMemoryMissionRepository } from './infrastructure/repositories/InMemoryMissionRepository.js';

export const ENGINE_ID = '11';
export const ENGINE_NAME = 'Mission Engine';

export class MissionEngine {
  constructor(options = {}) {
    this.engineId = ENGINE_ID;
    this.engineName = ENGINE_NAME;
    this._service = options.service || new MissionApplicationService(options);
    this._repository = this._service.repository;
  }

  get service() {
    return this._service;
  }

  get repository() {
    return this._repository;
  }

  async executeCommand(command) {
    return this._service.execute(command);
  }

  async getMission(missionId) {
    return this._service.getMissionById(missionId);
  }

  async listActiveMissions(filter) {
    return this._service.listActiveMissions(filter);
  }

  async initialize() {
    return { ready: true, engineId: ENGINE_ID, name: ENGINE_NAME };
  }

  async healthCheck() {
    return {
      healthy: true,
      engineId: ENGINE_ID,
      details: {
        status: 'READY',
        persistence: 'IN_MEMORY_MISSION_ADAPTER',
        totalMissions: await this._repository.count()
      }
    };
  }

  async shutdown() {}
}

export const missionEngine = new MissionEngine();
export default missionEngine;

export { MissionApplicationService } from './application/services/MissionApplicationService.js';
export { InMemoryMissionRepository } from './infrastructure/repositories/InMemoryMissionRepository.js';
export { Mission } from './domain/entities/Mission.js';
export {
  MissionStatus,
  MISSION_STATUS_TRANSITIONS,
  assertMissionStatusTransition,
  canTransitionMissionStatus,
  isTerminalMissionStatus
} from './domain/value-objects/MissionStatus.js';
export {
  MissionPriority,
  MISSION_PRIORITY_RANK,
  assertValidMissionPriority,
  normalizeMissionPriority,
  missionPriorityWeight
} from './domain/value-objects/MissionPriority.js';
export {
  ObjectiveStatus,
  OBJECTIVE_STATUS_TRANSITIONS,
  assertObjectiveStatusTransition,
  canTransitionObjectiveStatus
} from './domain/value-objects/ObjectiveStatus.js';
export { MISSION_CREATED, createMissionCreatedEvent } from './domain/events/MissionCreated.js';
export {
  MISSION_STATUS_CHANGED,
  createMissionStatusChangedEvent
} from './domain/events/MissionStatusChanged.js';
export {
  OBJECTIVE_STATUS_CHANGED,
  createObjectiveStatusChangedEvent
} from './domain/events/ObjectiveStatusChanged.js';

