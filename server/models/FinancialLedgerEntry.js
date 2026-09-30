/**
 * FinancialLedgerEntry — immutable fiat-denominated ledger (double-entry style).
 *
 * Every verified financial movement posts balanced entries here. Amounts are
 * INTEGER MINOR UNITS (kobo for NGN). Entries are never updated or deleted;
 * corrections are compensating entries posted by the reversal path.
 *
 * Accounts (canonical set):
 *   buyer:<userId>          — customer cash out
 *   platform:revenue        — EcoNet service-fee revenue
 *   seller:<sellerId>       — marketplace seller payable
 *   mission:<missionId>     — mission funding pool
 *   provider:paystack       — provider settlement clearing account
 *
 * Uniqueness: (paymentRef, account, direction) is unique so a retried
 * settlement cannot post the same movement twice.
 */
import mongoose from 'mongoose';

const financialLedgerEntrySchema = new mongoose.Schema({
  paymentRef: { type: String, required: true, index: true },
  account: { type: String, required: true },
  direction: { type: String, required: true, enum: ['DEBIT', 'CREDIT'] },
  amountMinor: { type: Number, required: true, min: 1 },
  currency: { type: String, required: true, enum: ['NGN'], default: 'NGN' },
  category: {
    type: String,
    required: true,
    enum: [
      'marketplace_purchase',
      'marketplace_seller_earning',
      'platform_fee',
      'mission_funding',
      'mission_reward',
      'wallet_funding',
      'withdrawal',
      'refund',
      'reversal',
      'adjustment'
    ]
  },
  orderRef: { type: String, default: null, index: true },
  missionRef: { type: String, default: null },
  providerReference: { type: String, default: null },
  actor: { type: String, required: true },
  purpose: { type: String, default: '' },
  status: { type: String, required: true, enum: ['posted', 'reversed'], default: 'posted' },
  createdAt: { type: Date, default: Date.now, immutable: true }
}, {
  collection: 'financial_ledger',
  versionKey: false,
  timestamps: false
});

financialLedgerEntrySchema.index(
  { paymentRef: 1, account: 1, direction: 1 },
  { unique: true }
);

export default mongoose.model('FinancialLedgerEntry', financialLedgerEntrySchema);
