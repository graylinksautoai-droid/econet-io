/** Engine 01: Identity Engine — EcoNet IO 24-Engine Canon. */

import { IdentityApplicationService } from './application/services/IdentityApplicationService.js';

export const ENGINE_ID = '01';
export const ENGINE_NAME = 'Identity Engine';

export class IdentityEngine {
  constructor(options = {}) {
    this.engineId = ENGINE_ID;
    this.engineName = ENGINE_NAME;
    this._service = options.service || new IdentityApplicationService(options);
  }

  async executeCommand(command) { return this._service.execute(command); }

  async authenticate(credentials) { return this._service.authenticate(credentials); }

  async authorize(request) { return this._service.authorize(request); }

  async initialize() {
    return { ready: true, engineId: ENGINE_ID, name: ENGINE_NAME };
  }

  async healthCheck() {
    return {
      healthy: true,
      engineId: ENGINE_ID,
      details: { status: 'READY', persistence: 'IN_MEMORY_IDENTITY_ADAPTER' }
    };
  }

  async shutdown() {}
}

export const identityEngine = new IdentityEngine();
export default identityEngine;

export { IdentityApplicationService } from './application/services/IdentityApplicationService.js';
export { InMemoryIdentityRepository } from './infrastructure/repositories/InMemoryIdentityRepository.js';
export { Role } from './domain/entities/Role.js';
export { IdentityStatus } from './domain/value-objects/IdentityStatus.js';
