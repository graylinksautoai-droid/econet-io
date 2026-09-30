/**
 * Payment — internal payment record for provider-processed fiat transactions.
 *
 * Canonical rules:
 * - All amounts are INTEGER MINOR UNITS (kobo for NGN). Never floats.
 * - `reference` is the internal unique payment reference created by the
 *   backend BEFORE provider initialization. The provider reference is stored
 *   separately and never substitutes for it.
 * - Status lifecycle: PENDING → PROCESSING → PAID | FAILED | CANCELLED.
 *   REFUNDED is a terminal post-settlement state applied only by the
 *   canonical refund path (which also posts reversal ledger entries).
 * - A PAID payment is immutable: the settlement service claims the record
 *   with a conditional update and no later code path may rewrite financial
 *   fields. `timestamps: false` is deliberate — financial history must not
 *   gain mutable updatedAt churn. State transitions are recorded via
 *   explicit dated fields.
 */
import mongoose from 'mongoose';

export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED'
});

export const PAYMENT_PURPOSE = Object.freeze({
  MARKETPLACE_ORDER: 'marketplace_order',
  MISSION_FUNDING: 'mission_funding',
  WALLET_FUNDING: 'wallet_funding'
});

const paymentSchema = new mongoose.Schema({
  // Internal unique reference, e.g. ECO-PAY-<base36>. Created server-side.
  reference: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  purpose: {
    type: String,
    required: true,
    enum: Object.values(PAYMENT_PURPOSE)
  },
  // Related domain object (order id, mission id) — never trusted for amounts.
  relatedRef: {
    type: String,
    default: null,
    index: true
  },
  currency: {
    type: String,
    required: true,
    enum: ['NGN'],
    default: 'NGN'
  },
  // Integer minor units (kobo).
  amountMinor: { type: Number, required: true, min: 1 },
  platformFeeMinor: { type: Number, required: true, min: 0, default: 0 },
  netMinor: { type: Number, required: true, min: 0 },
  // Fee policy snapshot applied to THIS payment (basis points, e.g. 3000 = 30%).
  feeRateBps: { type: Number, required: true, min: 0, default: 0 },
  status: {
    type: String,
    required: true,
    enum: Object.values(PAYMENT_STATUS),
    default: PAYMENT_STATUS.PENDING,
    index: true
  },
  provider: { type: String, required: true, default: 'paystack' },
  providerReference: { type: String, default: null, index: true, sparse: true },
  authorizationUrl: { type: String, default: null },
  providerStatus: { type: String, default: null },
  // Provider channel (card, bank_transfer, …) after verification.
  channel: { type: String, default: null },
  paidAt: { type: Date, default: null },
  settledAt: { type: Date, default: null },
  failedAt: { type: Date, default: null },
  failureReason: { type: String, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, immutable: true }
}, {
  collection: 'payments',
  versionKey: false,
  timestamps: false
});

paymentSchema.index({ provider: 1, providerReference: 1 }, { unique: true, sparse: true });

export default mongoose.model('Payment', paymentSchema);
