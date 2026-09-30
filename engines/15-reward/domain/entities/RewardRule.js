/**
 * Engine 15: Reward Engine — RewardRule Entity
 * Immutable specification of a reward rule. Rules reference canonical
 * configuration (or caller-supplied values) and carry NO invented economics.
 *
 * The matching key is the tuple:
 *   ruleId + recipientId + sourceEventRef
 * which is the canonical identity of a reward operation per the architectural
 * idempotency requirement (same event + same rule + same recipient => same grant).
 */

import { randomUUID } from 'crypto';
import { normalizeRewardType } from '../value-objects/RewardType.js';

export class RewardRule {
  constructor({
    ruleId = `rwl_${randomUUID().replace(/-/g, '')}`,
    ruleName,
    rewardType,
    description = '',
    active = true,
    metadata = {}
  } = {}) {
    if (typeof ruleId !== 'string' || ruleId.trim() === '') {
      throw new Error('RewardRule requires a non-empty ruleId.');
    }
    if (typeof ruleName !== 'string' || ruleName.trim() === '') {
      throw new Error('RewardRule requires a non-empty ruleName.');
    }
    if (typeof description !== 'string') {
      throw new Error('RewardRule description must be a string.');
    }

    this.ruleId = ruleId;
    this.ruleName = ruleName.trim();
    this.rewardType = normalizeRewardType(rewardType);
    this.description = description;
    this.active = Boolean(active);
    this.metadata = Object.freeze({ ...metadata });
    Object.freeze(this);
  }

  toJSON() {
    return {
      ruleId: this.ruleId,
      ruleName: this.ruleName,
      rewardType: this.rewardType,
      description: this.description,
      active: this.active,
      metadata: { ...this.metadata }
    };
  }
}