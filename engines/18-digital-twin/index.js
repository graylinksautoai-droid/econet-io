/**
 * Engine 18: Digital Twin Engine — EcoNet IO 24-Engine Canon
 * Mission: Digital representations of environmental entities and systems.
 */

import { DigitalTwinApplicationService } from './application/services/DigitalTwinApplicationService.js';
import { InMemoryDigitalTwinRepository } from './infrastructure/repositories/InMemoryDigitalTwinRepository.js';

export const ENGINE_ID = '18';
export const ENGINE_NAME = 'Digital Twin Engine';

export class DigitalTwinEngine {
  constructor(options = {}) {
    this.engineId = ENGINE_ID;
    this.engineName = ENGINE_NAME;
    this._service = options.service || new DigitalTwinApplicationService(options);
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

  async getDigitalTwin(twinId) {
    return this._service.getDigitalTwin(twinId);
  }

  async listDigitalTwins(filter) {
    return this._service.listDigitalTwins(filter);
  }

  async getTwinModel(modelId) {
    return this._service.getTwinModel(modelId);
  }

  async getTwinState(twinId, stateId = null) {
    return this._service.getTwinState(twinId, stateId);
  }

  async getTwinStateHistory(twinId) {
    return this._service.getTwinStateHistory(twinId);
  }

  async getSynchronizationStatus(twinId) {
    return this._service.getSynchronizationStatus(twinId);
  }

  async getSynchronizationHistory(twinId) {
    return this._service.getSynchronizationHistory(twinId);
  }

  async getTwinsByTargetEntity(targetEntityId) {
    return this._service.getTwinsByTargetEntity(targetEntityId);
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
        persistence: 'IN_MEMORY_DIGITAL_TWIN_ADAPTER',
        totalTwins: await this._repository.countTwins()
      }
    };
  }

  async shutdown() {}
}

export const digitalTwinEngine = new DigitalTwinEngine();
export default digitalTwinEngine;

export { DigitalTwinApplicationService } from './application/services/DigitalTwinApplicationService.js';
export { InMemoryDigitalTwinRepository } from './infrastructure/repositories/InMemoryDigitalTwinRepository.js';
export { DigitalTwin } from './domain/entities/DigitalTwin.js';
export { TwinModel } from './domain/entities/TwinModel.js';
export { TwinState } from './domain/entities/TwinState.js';
export { SynchronizationRecord } from './domain/entities/SynchronizationRecord.js';
export { TwinStatus, canTransitionTwinStatus, assertTwinStatusTransition, canSynchronizeTwin } from './domain/value-objects/TwinStatus.js';
export { SynchronizationStatus, isValidSyncStatus, normalizeSyncStatus } from './domain/value-objects/SynchronizationStatus.js';
export { isOlderThanCurrent, evaluateFreshness, parseISODate } from './domain/services/TwinStateService.js';