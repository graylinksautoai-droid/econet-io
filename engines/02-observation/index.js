/**
 * Engine 02: Observation Engine — EcoNet IO 24-Engine Canon
 * Mission: Ingest, validate, structure, and persist raw environmental observations and media evidence.
 */

import { ObservationApplicationService } from './application/services/ObservationApplicationService.js';

export const ENGINE_ID = '02';
export const ENGINE_NAME = 'Observation Engine';

export class ObservationEngine {
  constructor(options = {}) {
    this.engineId = ENGINE_ID;
    this.engineName = ENGINE_NAME;
    this._service = options.service || new ObservationApplicationService(options);
  }

  async executeCommand(command) {
    return this._service.execute(command);
  }

  async getObservation(id) {
    return this._service.getObservationById(id);
  }

  async listObservations(filter) {
    return this._service.listObservations(filter);
  }

  async initialize() {
    return { ready: true, engineId: ENGINE_ID, name: ENGINE_NAME };
  }

  async healthCheck() {
    return {
      healthy: true,
      engineId: ENGINE_ID,
      details: { status: 'READY', persistence: 'IN_MEMORY_OBSERVATION_ADAPTER' }
    };
  }

  async shutdown() {}
}

export const observationEngine = new ObservationEngine();
export default observationEngine;

export { ObservationApplicationService } from './application/services/ObservationApplicationService.js';
export { InMemoryObservationRepository } from './infrastructure/repositories/InMemoryObservationRepository.js';
export { Observation, ObservationCategory, ObservationSeverity, ObservationUrgency } from './domain/entities/Observation.js';
export { ObservationStatus } from './domain/value-objects/ObservationStatus.js';
export { Coordinates } from './domain/value-objects/Coordinates.js';
