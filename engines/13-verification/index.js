/**
 * Engine 13: Verification Engine — EcoNet IO 24-Engine Canon
 * Mission: Multi-source credibility scoring, consensus voting, peer validation, and ground-truth confirmation.
 */

import { VerificationApplicationService } from './application/services/VerificationApplicationService.js';

export const ENGINE_ID = '13';
export const ENGINE_NAME = 'Verification Engine';

export class VerificationEngine {
  constructor(options = {}) {
    this.engineId = ENGINE_ID;
    this.engineName = ENGINE_NAME;
    this._service = options.service || new VerificationApplicationService(options);
  }

  async executeCommand(command) {
    return this._service.execute(command);
  }

  async getVerificationStatus(observationId) {
    return this._service.getVerificationStatus(observationId);
  }

  async getClaim(claimId) {
    return this._service.getClaimById(claimId);
  }

  async initialize() {
    return { ready: true, engineId: ENGINE_ID, name: ENGINE_NAME };
  }

  async healthCheck() {
    return {
      healthy: true,
      engineId: ENGINE_ID,
      details: { status: 'READY', persistence: 'IN_MEMORY_VERIFICATION_ADAPTER' }
    };
  }

  async shutdown() {}
}

export const verificationEngine = new VerificationEngine();
export default verificationEngine;

export { VerificationApplicationService } from './application/services/VerificationApplicationService.js';
export { InMemoryVerificationRepository } from './infrastructure/repositories/InMemoryVerificationRepository.js';
export { VerificationClaim, VoteType } from './domain/entities/VerificationClaim.js';
export { VerificationStatus } from './domain/value-objects/VerificationStatus.js';
export { ConsensusScorer } from './domain/services/ConsensusScorer.js';
