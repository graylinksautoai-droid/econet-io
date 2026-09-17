/**
 * Engine 12: Action Engine — EcoNet IO 24-Engine Canon
 * Mission: External authority dispatch, notification routing, webhook delivery, and actuator triggers.
 */

import { ActionApplicationService } from './application/services/ActionApplicationService.js';

export const ENGINE_ID = '12';
export const ENGINE_NAME = 'Action Engine';

export class ActionEngine {
  constructor(options = {}) {
    this.engineId = ENGINE_ID;
    this.engineName = ENGINE_NAME;
    this._service = options.service || new ActionApplicationService(options);
  }

  async executeCommand(command) {
    return this._service.execute(command);
  }

  async getWebhookLogs(target = null) {
    return this._service.getWebhookLogs(target);
  }

  async getDispatch(dispatchId) {
    return this._service.getDispatchById(dispatchId);
  }

  async initialize() {
    return { ready: true, engineId: ENGINE_ID, name: ENGINE_NAME };
  }

  async healthCheck() {
    return {
      healthy: true,
      engineId: ENGINE_ID,
      details: { status: 'READY', persistence: 'IN_MEMORY_ACTION_ADAPTER' }
    };
  }

  async shutdown() {}
}

export const actionEngine = new ActionEngine();
export default actionEngine;

export { ActionApplicationService } from './application/services/ActionApplicationService.js';
export { InMemoryActionRepository } from './infrastructure/repositories/InMemoryActionRepository.js';
export { ActionDispatch, ActionType, DispatchStatus } from './domain/entities/ActionDispatch.js';
export { HmacSigner } from './domain/services/HmacSigner.js';
export { RateLimiter } from './domain/services/RateLimiter.js';
