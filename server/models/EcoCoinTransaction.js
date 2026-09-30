/**
 * EcoCoin Transaction Model
 *
 * IMPORTANT DEFINITIONS:
 *
 *   EcoCoins  — Platform reward credits. They are NOT real money, NOT
 *               convertible to fiat currency, and NOT withdrawable.
 *               They exist only within EcoNet as a gamified recognition
 *               mechanism for environmental actions.
 *
 *   Seeds     — Spendable EcoNet platform credits (separate from EcoCoins).
 *   Leaves    — Reputation score units (not a currency).
 *
 * Real money transactions (mission funding, payouts) are outside this model
 * and require a dedicated payment provider integration with compliance review.
 * No real-money transfer may be initiated from this codebase without explicit
 * operator approval and a configured payment provider.
 *
 * TRANSACTION TYPES:
 *   earn_report    — EcoCoins earned by submitting a verified report
 *   earn_mission   — EcoCoins earned by completing a mission
 *   earn_evidence  — EcoCoins earned by submitting mission evidence
 *   earn_daily     — Daily harvest reward
 *   spend_boost    — EcoCoins spent on boosting a post/report
 *   admin_adjust   — Admin correction (requires reason)
 *
 * IDEMPOTENCY:
 * Each transaction has an idempotencyKey. Duplicate keys are rejected so
 * the same reward cannot be credited twice for the same event.
 */

import mongoose from 'mongoose';

const ecoCoinTransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['earn_report', 'earn_mission', 'earn_evidence', 'earn_daily', 'spend_boost', 'admin_adjust']
  },
  // Amount in EcoCoins (positive = credit, negative = debit)
  amount: {
    type: Number,
    required: true
  },
  // Balance after this transaction (denormalised for display performance)
  balanceAfter: {
    type: Number,
    required: true
  },
  // Reference to the entity that triggered this transaction
  referenceType: {
    type: String,
    enum: ['report', 'mission', 'evidence', 'daily', 'admin', null],
    default: null
  },
  referenceId: {
    type: String,
    default: null
  },
  // Human-readable reason (required for admin_adjust)
  reason: {
    type: String,
    default: ''
  },
  // Idempotency key — prevents duplicate rewards for the same event
  idempotencyKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Transaction state
  status: {
    type: String,
    enum: ['completed', 'reversed'],
    default: 'completed'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: 'eco_coin_transactions',
  versionKey: false
});

// Indexes for efficient history queries
ecoCoinTransactionSchema.index({ user: 1, createdAt: -1 });
ecoCoinTransactionSchema.index({ idempotencyKey: 1 }, { unique: true });

export default mongoose.model('EcoCoinTransaction', ecoCoinTransactionSchema);
