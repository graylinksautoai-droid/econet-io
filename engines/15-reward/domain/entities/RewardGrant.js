/**
 * Engine 15: Reward Engine — RewardGrant Entity
 * Authoritative, provenance-complete reward grant record.
 *
 * A grant MUST be able to answer:
 *   WHO (recipientId) · WHAT (rewardType/amount/achievement) · WHY (reason)
 *   WHICH event (sourceEventRef) · WHICH rule (ruleRef) · WHEN (grantedAt)
 *   eligibility evidence (eligibility) · whether granted (status)
 *   whether subsequently reversed (status=REVERSED, reversedBy/reversedAt/reversalReason).
 *
 * State transitions: GRANTED -> REVERSED only. Grants are never deleted.
 */

import { randomUUID } from 'crypto';
import { normalizeRewardType, assertValidRewardAmount } from '../value-objects/RewardType.js';

export const RewardGrantStatus = Object.freeze({
  GRANTED: 'GRANTED',
  REVERSED: 'REVERSED'
});

export class RewardGrant {
  constructor({
    grantId = `rgr_${randomUUID().replace(/-/g, '')}`,
    recipientId,
    rewardType,
    amount = null,
    achievementId = null,
    ruleId,
    ruleName,
    sourceEventRef,
    reason = '',
    eligibility = null,
    status = RewardGrantStatus.GRANTED,
    reversedBy = null,
    reversedAt = null,
    reversalReason = null,
    metadata = {},
    grantedAt = new Date().toISOString()
  } = {}) {
    if (typeof grantId !== 'string' || grantId.trim() === '') {
      throw new Error('RewardGrant requires a non-empty grantId.');
    }
    if (typeof recipientId !== 'string' || recipientId.trim() === '') {
      throw new Error('RewardGrant requires a non-empty recipientId.');
    }
    if (typeof ruleId !== 'string' || ruleId.trim() === '') {
      throw new Error('RewardGrant requires a non-empty ruleId.');
    }
    if (typeof sourceEventRef !== 'string' || sourceEventRef.trim() === '') {
      throw new Error('RewardGrant requires a non-empty sourceEventRef.');
    }

    const normalizedType = normalizeRewardType(rewardType);

    // Achievement grants carry an achievementId and no scalar amount.
    // Amount-bearing types (XP/POINTS/TOKEN) require a positive explicit amount.
    if (normalizedType === 'ACHIEVEMENT') {
      if (achievementId === null || typeof achievementId !== 'string' || achievementId.trim() === '') {
        throw new Error('ACHIEVEMENT grant requires an achievementId.');
      }
    } else {
      if (amount === null) {
        throw new Error(`Reward type "${normalizedType}" requires an explicit positive amount.`);
      }
      assertValidRewardAmount(amount);
    }

    if (!Object.values(RewardGrantStatus).includes(status)) {
      throw new Error(`Unknown reward grant status: "${status}".`);
    }
    if (status === RewardGrantStatus.REVERSED && !reversedAt) {
      throw new Error('REVERSED grant requires reversedAt timestamp.');
    }

    this.grantId = grantId;
    this.recipientId = recipientId.trim();
    this.rewardType = normalizedType;
    this.amount = normalizedType === 'ACHIEVEMENT' ? null : Number(amount);
    this.achievementId = normalizedType === 'ACHIEVEMENT' ? achievementId.trim() : null;
    this.ruleId = ruleId.trim();
    this.ruleName = ruleName || null;
    this.sourceEventRef = sourceEventRef.trim();
    this.reason = reason || null;
    this.eligibility = eligibility
      ? Object.freeze({ ...eligibility })
      : null;
    this.status = status;
    this.reversedBy = reversedBy || null;
    this.reversedAt = reversedAt || null;
    this.reversalReason = reversalReason || null;
    this.metadata = Object.freeze({ ...metadata });
    this.grantedAt = grantedAt;
    Object.freeze(this);
  }

  /**
   * Return a new RewardGrant representing reversal. Historical grant is preserved.
   */
  reverse({ reversedBy, reason, now = new Date().toISOString() }) {
    if (this.status !== RewardGrantStatus.GRANTED) {
      throw new Error(`Cannot reverse grant "${this.grantId}" in status ${this.status}.`);
    }
    return new RewardGrant({
      ...this.toJSON(),
      status: RewardGrantStatus.REVERSED,
      reversedBy: reversedBy || null,
      reversedAt: now,
      reversalReason: reason || null
    });
  }

  /**
   * Canonical logical-operation identity (same event, rule, recipient, type).
   */
  operationKey() {
    return `${this.sourceEventRef}:${this.ruleId}:${this.recipientId}:${this.rewardType}`;
  }

  toJSON() {
    return {
      grantId: this.grantId,
      recipientId: this.recipientId,
      rewardType: this.rewardType,
      amount: this.amount,
      achievementId: this.achievementId,
      ruleId: this.ruleId,
      ruleName: this.ruleName,
      sourceEventRef: this.sourceEventRef,
      reason: this.reason,
      eligibility: this.eligibility ? { ...this.eligibility } : null,
      status: this.status,
      reversedBy: this.reversedBy,
      reversedAt: this.reversedAt,
      reversalReason: this.reversalReason,
      metadata: { ...this.metadata },
      grantedAt: this.grantedAt
    };
  }
}