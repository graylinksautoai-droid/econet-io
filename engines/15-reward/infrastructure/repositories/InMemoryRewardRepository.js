/**
 * Engine 15: Reward Engine — InMemoryRewardRepository
 * Isolated in-memory persistence adapter for RewardGrant, RewardRule, ledger
 * entries, and achievement unlocks.
 *
 * Balances are DERIVED from ledger entries, never stored as mutable totals.
 * Reward state belongs strictly to the Reward domain — it is not written into
 * any legacy User/reputation model.
 */

import { RewardGrant } from '../../domain/entities/RewardGrant.js';
import { RewardLedgerEntry, LedgerSide } from '../../domain/entities/RewardLedgerEntry.js';

export class InMemoryRewardRepository {
  #grants = new Map();
  #rules = new Map();
  #ledger = [];
  #achievements = new Map(); // achievementId -> Set<recipientId>
  #operations = new Map();   // operationKey -> grantId (duplicate protection)

  // ---- Grants ----

  async saveGrant(grant) {
    if (!grant || !grant.grantId) {
      throw new Error('Cannot save invalid RewardGrant.');
    }
    this.#grants.set(grant.grantId, grant);
    this.#operations.set(grant.operationKey(), grant.grantId);
    return grant;
  }

  async findGrantById(grantId) {
    return this.#grants.get(grantId) || null;
  }

  async findGrantByOperationKey(operationKey) {
    const grantId = this.#operations.get(operationKey);
    return grantId ? this.#grants.get(grantId) || null : null;
  }

  async findGrantsByRecipient(recipientId) {
    const results = [];
    for (const grant of this.#grants.values()) {
      if (grant.recipientId === recipientId) {
        results.push(grant);
      }
    }
    return results;
  }

  async findGrantsBySourceEvent(sourceEventRef) {
    const results = [];
    for (const grant of this.#grants.values()) {
      if (grant.sourceEventRef === sourceEventRef) {
        results.push(grant);
      }
    }
    return results;
  }

  async countGrants() {
    return this.#grants.size;
  }

  // ---- Rules ----

  async saveRule(rule) {
    if (!rule || !rule.ruleId) {
      throw new Error('Cannot save invalid RewardRule.');
    }
    this.#rules.set(rule.ruleId, rule);
    return rule;
  }

  async findRuleById(ruleId) {
    return this.#rules.get(ruleId) || null;
  }

  async findActiveRuleById(ruleId) {
    const rule = this.#rules.get(ruleId);
    return rule && rule.active ? rule : null;
  }

  async listRules() {
    return Array.from(this.#rules.values());
  }

  // ---- Ledger ----

  async appendLedgerEntries(entries) {
    if (!Array.isArray(entries)) {
      throw new Error('appendLedgerEntries requires an array.');
    }
    for (const entry of entries) {
      this.#ledger.push(entry);
    }
    return entries;
  }

  async listLedgerEntries() {
    return Array.from(this.#ledger);
  }

  async getBalance(recipientId, rewardType) {
    let balance = 0;
    for (const entry of this.#ledger) {
      if (entry.recipientId !== recipientId) continue;
      if (entry.rewardType !== rewardType) continue;
      if (entry.side === LedgerSide.CREDIT) {
        balance += entry.amount;
      } else if (entry.side === LedgerSide.DEBIT) {
        balance -= entry.amount;
      }
    }
    return balance;
  }

  async getBalances(recipientId) {
    const balances = {};
    for (const entry of this.#ledger) {
      if (entry.recipientId !== recipientId) continue;
      if (!(entry.rewardType in balances)) balances[entry.rewardType] = 0;
      if (entry.side === LedgerSide.CREDIT) {
        balances[entry.rewardType] += entry.amount;
      } else if (entry.side === LedgerSide.DEBIT) {
        balances[entry.rewardType] -= entry.amount;
      }
    }
    return balances;
  }

  async isLedgerBalanced() {
    let runningTotal = 0;
    for (const entry of this.#ledger) {
      runningTotal += entry.side === LedgerSide.CREDIT ? entry.amount : -entry.amount;
    }
    return Object.is(runningTotal, 0);
  }

  // ---- Achievement unlocks ----

  async recordAchievementUnlock(achievementId, recipientId, grantId) {
    if (!this.#achievements.has(achievementId)) {
      this.#achievements.set(achievementId, new Set());
    }
    this.#achievements.get(achievementId).add(recipientId);
    return { achievementId, recipientId, grantId };
  }

  async hasAchievementUnlock(achievementId, recipientId) {
    const set = this.#achievements.get(achievementId);
    return Boolean(set && set.has(recipientId));
  }

  async listAchievementUnlocks(achievementId) {
    const set = this.#achievements.get(achievementId);
    return set ? Array.from(set) : [];
  }

  async clear() {
    this.#grants.clear();
    this.#rules.clear();
    this.#ledger = [];
    this.#achievements.clear();
    this.#operations.clear();
  }
}