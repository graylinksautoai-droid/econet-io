/**
 * Engine 06: Context Engine — EcoNet IO 24-Engine Canon
 * Mission: Aggregate, fuse, and maintain real-time situational, regional, and environmental contextual state.
 */

import { ContextApplicationService } from './application/services/ContextApplicationService.js';
import { InMemoryContextRepository } from './infrastructure/repositories/InMemoryContextRepository.js';

export const ENGINE_ID = '06';
export const ENGINE_NAME = 'Context Engine';

export class ContextEngine {
  constructor(options = {}) {
    this.engineId = ENGINE_ID;
    this.engineName = ENGINE_NAME;
    this._service = options.service || new ContextApplicationService(options);
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

  async getContext(contextId) {
    return this._service.getContextById(contextId);
  }

  async getContextsInRegion(filter) {
    return this._service.getContextsInRegion(filter);
  }

  async listContexts(filter) {
    return this._service.listContexts(filter);
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
        persistence: 'IN_MEMORY_CONTEXT_ADAPTER',
        totalContexts: await this._repository.count()
      }
    };
  }

  async shutdown() {}
}

export const contextEngine = new ContextEngine();
export default contextEngine;

export { ContextApplicationService } from './application/services/ContextApplicationService.js';
export { InMemoryContextRepository } from './infrastructure/repositories/InMemoryContextRepository.js';
export { EnvironmentalContext } from './domain/entities/EnvironmentalContext.js';
export {
  ContextAlertLevel,
  ALERT_LEVEL_SEVERITY,
  alertLevelFromRiskScore,
  isEscalation,
  isDeescalation
} from './domain/value-objects/ContextAlertLevel.js';
export {
  createContextAlertLevelChangedEvent,
  CONTEXT_ALERT_LEVEL_CHANGED
} from './domain/events/ContextAlertLevelChanged.js';

