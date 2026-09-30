/**
 * Engine 15: Reward Engine — RewardApplicationService
 * Coordinates reward eligibility evaluation, reward-rule evaluation, grant
 * issuance, duplicate protection, reversal, XP/achievement recording, and
 * double-entry reward accounting.
 *
 * NO economics are invented here: every reward amount is an explicit
 * caller/config-supplied value. The engine does not implement verification,
 * reputation, community, mission, action, identity, governance-policy, or
 * audit-journaling semantics.
 */

import crypto from 'crypto';
import { Command } from '../../../../contracts/commands/Command.js';
import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import { globalEventBus } from '../../../../infrastructure/messaging/EventBus.js';
import { globalIdempotencyManager } from '../../../../infrastructure/idempotency/IdempotencyManager.js';
import { RewardRule } from '../../domain/entities/RewardRule.js';
import { RewardGrant, RewardGrantStatus } from '../../domain/entities/RewardGrant.js';
import { RewardLedgerEntry, LedgerSide } from '../../domain/entities/RewardLedgerEntry.js';
import { normalizeRewardType } from '../../domain/value-objects/RewardType.js';
import { InMemoryRewardRepository } from '../../infrastructure/repositories/InMemoryRewardRepository.js';

const ENGINE_SLUG = '15-reward';
const PRODUCER = 'engine.15.reward';

const MUTATING_COMMANDS = new Set([
  'RegisterRewardRule',
  'EvaluateRewardEligibility',
  'GrantReward',
  'ReverseReward'
]);

/**
 * Default authorized roles. Implementation decision: no canonical Engine 15
 * role list exists in the repository, so a conservative allowlist is used and
 * overridable via constructor options. Rewards must never be fabricated by
 * arbitrary callers.
 */
const DEFAULT_AUTHORIZED_ROLES = Object.freeze([
  'system',
  'admin',
  'reward_issuer',
  'automation'
]);

export class RewardApplicationService {
  constructor({
    repository = new InMemoryRewardRepository(),
    eventBus = globalEventBus,
    idempotencyManager = globalIdempotencyManager,
    governance = null,
    clock = () => new Date(),
    authorizedRoles = DEFAULT_AUTHORIZED_ROLES
  } = {}) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.idempotencyManager = idempotencyManager;
    this.governance = governance;
    this.clock = clock;
    this.authorizedRoles = Array.isArray(authorizedRoles) ? [...authorizedRoles] : [...DEFAULT_AUTHORIZED_ROLES];
  }

  async execute(command) {
    const cmd = command instanceof Command ? command : new Command(command);
    if (cmd.targetEngine !== ENGINE_SLUG || !MUTATING_COMMANDS.has(cmd.commandType)) {
      throw new Error(`Unsupported Reward command: "${cmd.commandType}".`);
    }
    if (!cmd.idempotencyKey) {
      throw new Error(`Reward command "${cmd.commandType}" requires an idempotencyKey.`);
    }
    await this._assertAuthorized(cmd);
    return this.idempotencyManager.executeIdempotent(
      `${ENGINE_SLUG}:${cmd.commandType}:${cmd.idempotencyKey}`,
      async () => {
        await this._assertGovernance(cmd);
        return this._dispatch(cmd);
      }
    );
  }

  // ---- Queries ----

  async getGrant(grantId) {
    const grant = await this.repository.findGrantById(grantId);
    return grant ? grant.toJSON() : null;
  }

  async getGrantsByRecipient(recipientId) {
    const grants = await this.repository.findGrantsByRecipient(recipientId);
    return grants.map(g => g.toJSON());
  }

  async getGrantsBySourceEvent(sourceEventRef) {
    const grants = await this.repository.findGrantsBySourceEvent(sourceEventRef);
    return grants.map(g => g.toJSON());
  }

  async getBalance(recipientId, rewardType = null) {
    if (rewardType) {
      return { recipientId, rewardType, balance: await this.repository.getBalance(recipientId, rewardType) };
    }
    return { recipientId, balances: await this.repository.getBalances(recipientId) };
  }

  async getLedger({ limit = 50 } = {}) {
    const entries = await this.repository.listLedgerEntries();
    return entries.slice(-limit).map(e => e.toJSON());
  }

  async getRule(ruleId) {
    const rule = await this.repository.findRuleById(ruleId);
    return rule ? rule.toJSON() : null;
  }

  async listRules() {
    const rules = await this.repository.listRules();
    return rules.map(r => r.toJSON());
  }

  async isLedgerBalanced() {
    return this.repository.isLedgerBalanced();
  }

    async _dispatch(cmd) {
    switch (cmd.commandType) {
      case 'RegisterRewardRule':
        return this._handleRegisterRule(cmd);
      case 'EvaluateRewardEligibility':
        return this._handleEvaluateEligibility(cmd);
      case 'GrantReward':
        return this._handleGrant(cmd);
      case 'ReverseReward':
        return this._handleReverse(cmd);
      default:
        throw new Error(`Unhandled Reward command: ${cmd.commandType}`);
    }
  }

  async _handleRegisterRule(cmd) {
    const { ruleName, rewardType, description = '', metadata = {} } = cmd.payload;
    const rule = new RewardRule({ ruleName, rewardType, description, metadata });
    await this.repository.saveRule(rule);

    await this._emit('econet.reward.rule_registered', {
      ruleId: rule.ruleId,
      ruleName: rule.ruleName,
      rewardType: rule.rewardType,
      description: rule.description
    }, {
      actor: cmd.actor,
      subject: { entityId: rule.ruleId, entityType: 'reward_rule' },
      correlationId: cmd.correlationId
    });

    return { rule: rule.toJSON() };
  }

  async _handleEvaluateEligibility(cmd) {
    const { recipientId, ruleId, sourceEventRef } = cmd.payload;
    this._requireStrings({ recipientId, ruleId, sourceEventRef });

    const rule = await this.repository.findActiveRuleById(ruleId);
    if (!rule) {
      throw new Error(`Active reward rule not found: "${ruleId}".`);
    }
    const operationKey = `${sourceEventRef}:${rule.ruleId}:${recipientId}:${rule.rewardType}`;
    const existing = await this.repository.findGrantByOperationKey(operationKey);

    const eligible = !existing || existing.status === RewardGrantStatus.REVERSED;

    await this._emit('econet.reward.eligibility_evaluated', {
      recipientId,
      ruleId: rule.ruleId,
      sourceEventRef,
      rewardType: rule.rewardType,
      eligible,
      duplicate: Boolean(existing)
    }, {
      actor: cmd.actor,
      subject: { entityId: recipientId, entityType: 'actor' },
      correlationId: cmd.correlationId
    });

    return {
      recipientId,
      ruleId: rule.ruleId,
      sourceEventRef,
      rewardType: rule.rewardType,
      eligible,
      duplicate: Boolean(existing)
    };
  }

    async _handleGrant(cmd) {
    const {
      recipientId,
      ruleId,
      sourceEventRef,
      amount = null,
      achievementId = null,
      reason = '',
      eligibility = null,
      metadata = {}
    } = cmd.payload;
    this._requireStrings({ recipientId, ruleId, sourceEventRef });

    const rule = await this.repository.findActiveRuleById(ruleId);
    if (!rule) {
      throw new Error(`Active reward rule not found: "${ruleId}".`);
    }
    const normalizedType = normalizeRewardType(rule.rewardType);

    // Duplicate protection: same event + rule + recipient + type => same grant.
    const operationKey = `${sourceEventRef}:${rule.ruleId}:${recipientId}:${normalizedType}`;
    const existing = await this.repository.findGrantByOperationKey(operationKey);
    if (existing && existing.status === RewardGrantStatus.GRANTED) {
      return { grant: existing.toJSON(), duplicated: true };
    }

    const grant = new RewardGrant({
      recipientId,
      rewardType: normalizedType,
      amount: normalizedType === 'ACHIEVEMENT' ? null : amount,
      achievementId: normalizedType === 'ACHIEVEMENT' ? achievementId : null,
      ruleId: rule.ruleId,
      ruleName: rule.ruleName,
      sourceEventRef,
      reason,
      eligibility: eligibility && typeof eligibility === 'object' ? eligibility : null,
      metadata,
      grantedAt: this.clock().toISOString()
    });
    await this.repository.saveGrant(grant);

    // Double-entry accounting: a balanced DEBIT+CREDIT pair per grant.
    if (grant.amount !== null) {
      const credit = new RewardLedgerEntry({
        grantId: grant.grantId,
        recipientId: grant.recipientId,
        rewardType: grant.rewardType,
        side: LedgerSide.CREDIT,
        amount: grant.amount,
        sourceEventRef: grant.sourceEventRef,
        postedAt: this.clock().toISOString()
      });
      const debit = new RewardLedgerEntry({
        grantId: grant.grantId,
        recipientId: 'REWARD_RESERVE',
        rewardType: grant.rewardType,
        side: LedgerSide.DEBIT,
        amount: grant.amount,
        sourceEventRef: grant.sourceEventRef,
        postedAt: this.clock().toISOString()
      });
      await this.repository.appendLedgerEntries([credit, debit]);
    }

    // Achievement unlocks are idempotent per recipient.
    if (grant.achievementId) {
      const already = await this.repository.hasAchievementUnlock(grant.achievementId, grant.recipientId);
      if (!already) {
        await this.repository.recordAchievementUnlock(grant.achievementId, grant.recipientId, grant.grantId);
        await this._emit('econet.reward.achievement_unlocked', {
          achievementId: grant.achievementId,
          recipientId: grant.recipientId,
          grantId: grant.grantId,
          ruleId: grant.ruleId,
          sourceEventRef: grant.sourceEventRef
        }, {
          actor: cmd.actor,
          subject: { entityId: grant.recipientId, entityType: 'actor' },
          correlationId: cmd.correlationId
        });
      }
    }

    await this._emit('econet.reward.granted', {
      grantId: grant.grantId,
      recipientId: grant.recipientId,
      rewardType: grant.rewardType,
      amount: grant.amount,
      achievementId: grant.achievementId,
      ruleId: grant.ruleId,
      ruleName: grant.ruleName,
      sourceEventRef: grant.sourceEventRef,
      reason: grant.reason,
      status: grant.status
    }, {
      actor: cmd.actor,
      subject: { entityId: grant.recipientId, entityType: 'actor' },
      correlationId: cmd.correlationId
    });

    return { grant: grant.toJSON(), duplicated: false };
  }

    async _handleReverse(cmd) {
    const { grantId, reason = '', reversedBy = cmd.actor?.actorId } = cmd.payload;
    if (!grantId || typeof grantId !== 'string' || grantId.trim() === '') {
      throw new Error('ReverseReward requires a valid grantId.');
    }
    const existing = await this.repository.findGrantById(grantId);
    if (!existing) {
      throw new Error(`RewardGrant not found: "${grantId}".`);
    }

    const reversed = existing.reverse({ reversedBy, reason, now: this.clock().toISOString() });
    const reversalTime = reversed.reversedAt;
    await this.repository.saveGrant(reversed);

    // Accounting correction: reverse the original credit+debit pair by posting
    // equal and opposite entries so the running ledger remains balanced.
    if (existing.amount !== null) {
      await this.repository.appendLedgerEntries([
        new RewardLedgerEntry({
          grantId: existing.grantId,
          recipientId: existing.recipientId,
          rewardType: existing.rewardType,
          side: LedgerSide.DEBIT,
          amount: existing.amount,
          sourceEventRef: existing.sourceEventRef,
          postedAt: reversalTime
        }),
        new RewardLedgerEntry({
          grantId: existing.grantId,
          recipientId: 'REWARD_RESERVE',
          rewardType: existing.rewardType,
          side: LedgerSide.CREDIT,
          amount: existing.amount,
          sourceEventRef: existing.sourceEventRef,
          postedAt: reversalTime
        })
      ]);
    }

    await this._emit('econet.reward.reversed', {
      grantId: existing.grantId,
      recipientId: existing.recipientId,
      rewardType: existing.rewardType,
      amount: existing.amount,
      achievementId: existing.achievementId,
      sourceEventRef: existing.sourceEventRef,
      reversedBy,
      reason,
      reversedAt: reversalTime
    }, {
      actor: cmd.actor,
      subject: { entityId: existing.recipientId, entityType: 'actor' },
      correlationId: cmd.correlationId
    });

    return { grant: reversed.toJSON() };
  }

    _requireStrings(fields) {
    for (const [label, value] of Object.entries(fields)) {
      if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`Reward command requires a valid string "${label}".`);
      }
    }
  }

  async _assertAuthorized(cmd) {
    const actor = cmd.actor;
    if (!actor || !actor.actorId) {
      throw new Error('Reward commands require an authenticated actor.');
    }
    const roles = Array.isArray(actor.roles) ? actor.roles : [];
    const allowed = roles.some(role => this.authorizedRoles.includes(role));
    if (!allowed) {
      throw new Error(`Reward command denied: actor "${actor.actorId}" lacks an authorized reward role.`);
    }
  }

  async _assertGovernance(cmd) {
    if (!this.governance) return;
    const decision = await this.governance.evaluatePolicy({
      engine: ENGINE_SLUG,
      commandType: cmd.commandType,
      actor: cmd.actor,
      payload: cmd.payload
    });
    if (!decision.allowed) {
      throw new Error(`Governance policy denial: ${decision.reason || 'Command denied by policy.'}`);
    }
  }

  async _emit(eventType, payload, { actor = null, subject = null, correlationId = null } = {}) {
    const event = new DomainEvent({
      eventType,
      producer: PRODUCER,
      actor,
      subject,
      correlationId,
      payload
    });
    await this.eventBus.publish(event);
    return event;
  }
}

// Deterministic helper retained for any local derivation requirements.
export function rewardDeterministicId(seed) {
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 24);
}