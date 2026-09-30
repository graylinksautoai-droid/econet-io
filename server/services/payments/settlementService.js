/**
 * SettlementService — canonical fiat settlement path.
 *
 * Rules enforced here:
 * - A payment settles AT MOST ONCE. The claim is a conditional atomic update
 *   (status in {PENDING, PROCESSING} → PAID); a null result means another
 *   delivery already settled it. No preliminary findOne() is trusted.
 * - Ledger postings carry a unique (paymentRef, account, direction) index, so
 *   a retried settlement can never double-post a movement.
 * - Ledger entries and the order settlement run inside a MongoDB session
 *   transaction when the deployment supports it (Atlas replica sets do).
 * - Verification data (amount/currency/reference/purpose) is re-validated
 *   against the internal record BEFORE any money movement.
 * - A payment whose verification failed is marked FAILED, never PAID.
 */
import mongoose from 'mongoose';
import Payment, { PAYMENT_STATUS, PAYMENT_PURPOSE } from '../../models/Payment.js';
import Order, { ORDER_STATUS } from '../../models/Order.js';
import FinancialLedgerEntry from '../../models/FinancialLedgerEntry.js';

export class SettlementError extends Error {
  constructor(message, code = 'SETTLEMENT_FAILED') {
    super(message);
    this.name = 'SettlementError';
    this.code = code;
  }
}

const SETTLEABLE = [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.PROCESSING];

/** Validate provider-verified data against the internal payment record. */
export function validateVerifiedPayment(payment, verification) {
  if (!verification) throw new SettlementError('No provider verification supplied', 'VERIFICATION_REQUIRED');
  if (verification.providerStatus !== 'success') {
    throw new SettlementError(`Provider reports status "${verification.providerStatus}"`, 'PAYMENT_NOT_SUCCESSFUL');
  }
  if (verification.providerReference && payment.providerReference &&
      verification.providerReference !== payment.providerReference) {
    throw new SettlementError('Provider reference mismatch', 'REFERENCE_MISMATCH');
  }
  if (verification.amountMinor !== payment.amountMinor) {
    throw new SettlementError(
      `Amount mismatch: expected ${payment.amountMinor} minor units, provider reported ${verification.amountMinor}`,
      'AMOUNT_MISMATCH'
    );
  }
  if (verification.currency !== payment.currency) {
    throw new SettlementError(
      `Currency mismatch: expected ${payment.currency}, provider reported ${verification.currency}`,
      'CURRENCY_MISMATCH'
    );
  }
}

function buildLedgerEntries(payment) {
  const base = {
    paymentRef: payment.reference,
    currency: payment.currency,
    providerReference: payment.providerReference,
    orderRef: payment.purpose === PAYMENT_PURPOSE.MARKETPLACE_ORDER ? payment.relatedRef : null,
    missionRef: payment.purpose === PAYMENT_PURPOSE.MISSION_FUNDING ? payment.relatedRef : null,
    actor: `user:${payment.user}`
  };
  const mainCategory = payment.purpose === PAYMENT_PURPOSE.MARKETPLACE_ORDER
    ? 'marketplace_purchase'
    : payment.purpose === PAYMENT_PURPOSE.MISSION_FUNDING ? 'mission_funding' : 'wallet_funding';
  const entries = [
    { ...base, account: `provider:${payment.provider}`, direction: 'DEBIT',
      amountMinor: payment.amountMinor, category: mainCategory,
      purpose: `customer funds received via ${payment.provider}` }
  ];
  if (payment.platformFeeMinor > 0) {
    entries.push({ ...base, account: 'platform:revenue', direction: 'CREDIT',
      amountMinor: payment.platformFeeMinor, category: 'platform_fee',
      purpose: `platform service fee (${payment.feeRateBps} bps)` });
  }
  if (payment.netMinor > 0) {
    const netAccount = payment.purpose === PAYMENT_PURPOSE.MARKETPLACE_ORDER
      ? `seller:order:${payment.relatedRef}`
      : payment.purpose === PAYMENT_PURPOSE.MISSION_FUNDING
        ? `mission:${payment.relatedRef}`
        : `buyer:${payment.user}`;
    entries.push({ ...base, account: netAccount, direction: 'CREDIT',
      amountMinor: payment.netMinor,
      category: payment.purpose === PAYMENT_PURPOSE.MARKETPLACE_ORDER
        ? 'marketplace_seller_earning' : mainCategory,
      purpose: 'net recipient amount after platform fee' });
  }
  return entries;
}

async function postLedgerEntries(entries, session) {
  try {
    await FinancialLedgerEntry.insertMany(entries, { session, ordered: true });
  } catch (err) {
    if (err?.code === 11000) {
      // Unique (paymentRef, account, direction) — these movements already exist.
      throw new SettlementError('Ledger movements already posted for this payment', 'ALREADY_POSTED');
    }
    throw err;
  }
}

/**
 * Settle a payment after authoritative provider verification.
 * Returns { payment, alreadySettled }.
 */
export async function settleVerifiedPayment(reference, verification) {
  const payment = await Payment.findOne({ reference });
  if (!payment) throw new SettlementError('Unknown payment reference', 'PAYMENT_NOT_FOUND');

  if (payment.status === PAYMENT_STATUS.PAID) {
    return { payment, alreadySettled: true };
  }
  if ([PAYMENT_STATUS.FAILED, PAYMENT_STATUS.CANCELLED, PAYMENT_STATUS.REFUNDED].includes(payment.status)) {
    throw new SettlementError(`Payment is ${payment.status} and cannot settle`, 'TERMINAL_STATE');
  }

  // Validate BEFORE claiming. A failed verification marks the payment failed.
  try {
    validateVerifiedPayment(payment, verification);
  } catch (err) {
    if (err.code === 'PAYMENT_NOT_SUCCESSFUL' && SETTLEABLE.includes(payment.status)) {
      await Payment.updateOne(
        { _id: payment._id, status: { $in: SETTLEABLE } },
        { $set: { status: PAYMENT_STATUS.FAILED, failedAt: new Date(), failureReason: err.message, providerStatus: verification?.providerStatus || null } }
      );
    }
    throw err;
  }

  // Atomic claim — the only path from settleable to PAID.
  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: SETTLEABLE } },
    {
      $set: {
        status: PAYMENT_STATUS.PAID,
        paidAt: verification.paidAt || new Date(),
        settledAt: new Date(),
        providerStatus: verification.providerStatus,
        channel: verification.channel || null,
        ...(verification.providerReference && !payment.providerReference
          ? { providerReference: verification.providerReference } : {})
      }
    },
    { new: true }
  );
  if (!claimed) {
    const settled = await Payment.findById(payment._id);
    if (settled?.status === PAYMENT_STATUS.PAID) return { payment: settled, alreadySettled: true };
    throw new SettlementError('Payment state changed during settlement', 'CONCURRENT_MODIFICATION');
  }

  const entries = buildLedgerEntries(claimed);

  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch {
    session = null; // deployment without transaction support — unique indexes still protect
  }

  try {
    await postLedgerEntries(entries, session);

    if (claimed.purpose === PAYMENT_PURPOSE.MARKETPLACE_ORDER && claimed.relatedRef) {
      const settledOrder = await Order.findOneAndUpdate(
        { orderId: claimed.relatedRef, status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.PAYMENT_REQUIRED] } },
        { $set: { status: ORDER_STATUS.PAID, paidAt: claimed.paidAt } },
        { new: true, session }
      );
      if (!settledOrder) {
        const existing = await Order.findOne({ orderId: claimed.relatedRef }).session(session);
        if (!existing) throw new SettlementError('Related order not found', 'ORDER_NOT_FOUND');
        if (existing.status !== ORDER_STATUS.PAID) {
          throw new SettlementError(`Order is ${existing.status} and cannot settle`, 'ORDER_TERMINAL_STATE');
        }
      }
    }

    if (session) await session.commitTransaction();
    return { payment: claimed, alreadySettled: false };
  } catch (err) {
    if (session) await session.abortTransaction().catch(() => {});
    if (err instanceof SettlementError && err.code === 'ALREADY_POSTED') {
      return { payment: claimed, alreadySettled: true };
    }
    // Settlement incomplete — return to a retryable state, never silently half-settled.
    await Payment.updateOne(
      { _id: claimed._id, status: PAYMENT_STATUS.PAID, settledAt: claimed.settledAt },
      { $set: { status: PAYMENT_STATUS.PROCESSING, failureReason: `settlement retry required: ${err.message}` } }
    ).catch(() => {});
    throw err;
  } finally {
    if (session) session.endSession().catch(() => {});
  }
}


/**
 * Refund a PAID payment: conditional claim PAID → REFUNDED, then compensating
 * ledger entries. The original entries are preserved (immutable history).
 */
export async function refundPayment(reference, { reason = '' } = {}) {
  const payment = await Payment.findOne({ reference });
  if (!payment) throw new SettlementError('Unknown payment reference', 'PAYMENT_NOT_FOUND');
  if (payment.status === PAYMENT_STATUS.REFUNDED) return { payment, alreadyRefunded: true };
  if (payment.status !== PAYMENT_STATUS.PAID) {
    throw new SettlementError(`Only PAID payments can be refunded (current: ${payment.status})`, 'NOT_REFUNDABLE');
  }

  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: PAYMENT_STATUS.PAID },
    { $set: { status: PAYMENT_STATUS.REFUNDED } },
    { new: true }
  );
  if (!claimed) {
    const current = await Payment.findById(payment._id);
    if (current?.status === PAYMENT_STATUS.REFUNDED) return { payment: current, alreadyRefunded: true };
    throw new SettlementError('Payment state changed during refund', 'CONCURRENT_MODIFICATION');
  }

  const originals = await FinancialLedgerEntry.find({ paymentRef: reference, status: 'posted' }).lean();
  const reversals = originals.map(e => ({
    paymentRef: `${reference}:refund`,
    account: e.account,
    direction: e.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
    amountMinor: e.amountMinor,
    currency: e.currency,
    category: 'refund',
    orderRef: e.orderRef,
    missionRef: e.missionRef,
    providerReference: e.providerReference,
    actor: 'system:refund',
    purpose: `refund of ${reference}${reason ? ` — ${reason}` : ''}`
  }));
  if (reversals.length) await postLedgerEntries(reversals, null);

  if (claimed.purpose === PAYMENT_PURPOSE.MARKETPLACE_ORDER && claimed.relatedRef) {
    await Order.updateOne(
      { orderId: claimed.relatedRef, status: ORDER_STATUS.PAID },
      { $set: { status: ORDER_STATUS.REFUNDED } }
    );
  }

  return { payment: claimed, alreadyRefunded: false };
}

