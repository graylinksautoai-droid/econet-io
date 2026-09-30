/**
 * Engine 15: Reward Engine — EcoNet IO 24-Engine Canon
 * Mission: Ecosystem incentives, point accounting, token balances, and
 * double-entry reward distribution.
 */

import { RewardApplicationService } from './application/services/RewardApplicationService.js';
import { InMemoryRewardRepository } from './infrastructure/repositories/InMemoryRewardRepository.js';

export const ENGINE_ID = '15';
export const ENGINE_NAME = 'Reward Engine';

export class RewardEngine {
  constructor(options = {}) {
    this.engineId = ENGINE_ID;
    this.engineName = ENGINE_NAME;
    this._service = options.service || new RewardApplicationService(options);
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

  async getGrant(grantId) {
    return this._service.getGrant(grantId);
  }

  async getGrantsByRecipient(recipientId) {
    return this._service.getGrantsByRecipient(recipientId);
  }

  async getGrantsBySourceEvent(sourceEventRef) {
    return this._service.getGrantsBySourceEvent(sourceEventRef);
  }

  async getBalance(recipientId, rewardType = null) {
    return this._service.getBalance(recipientId, rewardType);
  }

  async getLedger(filter) {
    return this._service.getLedger(filter);
  }

  async getRule(ruleId) {
    return this._service.getRule(ruleId);
  }

  async listRules() {
    return this._service.listRules();
  }

  async isLedgerBalanced() {
    return this._service.isLedgerBalanced();
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
        persistence: 'IN_MEMORY_REWARD_ADAPTER',
        totalGrants: await this._repository.countGrants(),
        ledgerBalanced: await this._repository.isLedgerBalanced()
      }
    };
  }

  async shutdown() {}
}

export const rewardEngine = new RewardEngine();
export default rewardEngine;

export { RewardApplicationService } from './application/services/RewardApplicationService.js';
export { InMemoryRewardRepository } from './infrastructure/repositories/InMemoryRewardRepository.js';
export { RewardRule } from './domain/entities/RewardRule.js';
export { RewardGrant, RewardGrantStatus } from './domain/entities/RewardGrant.js';
export { RewardLedgerEntry, LedgerSide } from './domain/entities/RewardLedgerEntry.js';
export { RewardType, isValidRewardType, normalizeRewardType, assertValidRewardAmount } from './domain/value-objects/RewardType.js';
