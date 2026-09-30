/**
 * Engine 15: Reward Engine — RewardLedgerEntry Entity
 * Minimal double-entry reward accounting record.
 *
 * Every grant produces a balanced pair of ledger entries (one DEBIT, one CREDIT)
 * so the ledger always sums to zero across entries and derives balances.
 * No token supply, exchange rates, fiat, or external wallet semantics are implied.
 */

import { randomUUID } from 'crypto';

export const LedgerSide = Object.freeze({
  DEBIT: 'DEBIT',
  CREDIT: 'CREDIT'
});

export class RewardLedgerEntry {
  constructor({
    entryId = `led_${randomUUID().replace(/-/g, '')}`,
    grantId,
    recipientId,
    rewardType,
    side,
    amount,
    sourceEventRef,
    postedAt = new Date().toISOString()
  } = {}) {
    if (typeof grantId !== 'string' || grantId.trim() === '') {
      throw new Error('RewardLedgerEntry requires a non-empty grantId.');
    }
    if (typeof recipientId !== 'string' || recipientId.trim() === '') {
      throw new Error('RewardLedgerEntry requires a non-empty recipientId.');
    }
    if (!Object.values(LedgerSide).includes(side)) {
      throw new Error(`Invalid ledger side: "${side}". Must be DEBIT or CREDIT.`);
    }
    const numeric = Number(amount);
    if (Number.isNaN(numeric) || !Number.isFinite(numeric) || numeric <= 0) {
      throw new Error(
        `Invalid ledger amount: "${amount}". Must be a positive finite number.`
      );
    }

    this.entryId = entryId;
    this.grantId = grantId.trim();
    this.recipientId = recipientId.trim();
    this.rewardType = rewardType;
    this.side = side;
    this.amount = numeric;
    this.sourceEventRef = sourceEventRef;
    this.postedAt = postedAt;
    Object.freeze(this);
  }

  toJSON() {
    return {
      entryId: this.entryId,
      grantId: this.grantId,
      recipientId: this.recipientId,
      rewardType: this.rewardType,
      side: this.side,
      amount: this.amount,
      sourceEventRef: this.sourceEventRef,
      postedAt: this.postedAt
    };
  }
}