/**
 * Engine 20: Integration Engine — EcoNet IO 24-Engine Canon
 *
 * Mission: External connector management, 3rd-party satellite/weather API
 * adaptors, and protocol gateways.
 *
 * This is the controlled boundary between EcoNet and external systems.
 * Engine 20 manages connector definitions and lifecycle; it does NOT own
 * environmental observations, digital twins, simulations, missions, actions,
 * governance policy, or audit infrastructure.
 */

import { IntegrationApplicationService } from './application/services/IntegrationApplicationService.js';
import { InMemoryConnectorRepository } from './infrastructure/repositories/InMemoryConnectorRepository.js';

export const ENGINE_ID = '20';
export const ENGINE_NAME = 'Integration Engine';

export class IntegrationEngine {
  constructor(options = {}) {
    this.engineId = ENGINE_ID;
    this.engineName = ENGINE_NAME;
    this._service = options.service || new IntegrationApplicationService(options);
    this._repository = this._service.repository;
  }

  get service() { return this._service; }
  get repository() { return this._repository; }

  async executeCommand(command) {
    return this._service.execute(command);
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async getConnector(connectorId) {
    return this._service.getConnector(connectorId);
  }

  async listConnectors(filter) {
    return this._service.listConnectors(filter);
  }

  async getConnectorStatus(connectorId) {
    return this._service.getConnectorStatus(connectorId);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async initialize() {
    return { ready: true, engineId: ENGINE_ID, name: ENGINE_NAME };
  }

  async healthCheck() {
    return {
      healthy: true,
      engineId: ENGINE_ID,
      details: {
        status: 'READY',
        persistence: 'IN_MEMORY_INTEGRATION_ADAPTER',
        totalConnectors: await this._repository.count()
      }
    };
  }

  async shutdown() {}
}

export const integrationEngine = new IntegrationEngine();
export default integrationEngine;

// Named exports for test fixtures and consumers
export { IntegrationApplicationService } from './application/services/IntegrationApplicationService.js';
export { InMemoryConnectorRepository } from './infrastructure/repositories/InMemoryConnectorRepository.js';
export { ExternalConnector } from './domain/entities/ExternalConnector.js';
export { ConnectorConfig } from './domain/entities/ConnectorConfig.js';
export {
  ConnectorType,
  normalizeConnectorType,
  isValidConnectorType
} from './domain/value-objects/ConnectorType.js';
export {
  ConnectorStatus,
  canTransitionConnectorStatus,
  assertConnectorStatusTransition,
  isTerminalConnectorStatus,
  isOperationalConnectorStatus
} from './domain/value-objects/ConnectorStatus.js';
