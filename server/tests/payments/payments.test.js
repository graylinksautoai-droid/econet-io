/**
 * Payment subsystem tests — provider mocked, MongoMemoryReplSet for real
 * transaction semantics (Atlas is a replica set; a standalone mongod is not).
 *
 * NO test here contacts the real Paystack API. Provider responses are
 * simulated via injected fetch. Simulated responses are test fixtures only —
 * they are not evidence of a live payment.
 *
 * Run: node --test server/tests/payments/payments.test.js
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Payment, { PAYMENT_STATUS, PAYMENT_PURPOSE } from '../../models/Payment.js';
import Order, { ORDER_STATUS } from '../../models/Order.js';
import Product from '../../models/Product.js';
import FinancialLedgerEntry from '../../models/FinancialLedgerEntry.js';
import { splitFee } from '../../services/payments/paymentConfig.js';
import { createPaystackProvider, verifyWebhookSignature, PaystackError } from '../../services/payments/paystackProvider.js';
import { settleVerifiedPayment, refundPayment, SettlementError } from '../../services/payments/settlementService.js';

let replset;
let available = false;

const uid = () => new mongoose.Types.ObjectId();

before(async () => {
  // The services under test use the DEFAULT mongoose connection.
  for (let attempt = 1; attempt <= 2 && !available; attempt++) {
    try {
      replset = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
      await mongoose.connect(replset.getUri(), { serverSelectionTimeoutMS: 15_000 });
      available = true;
    } catch (err) {
      console.warn(`[payments-test] replset attempt ${attempt} failed:`, err.message);
      if (replset) { await replset.stop().catch(() => {}); replset = null; }
    }
  }
  if (!available) console.warn('[payments-test] MongoMemoryReplSet unavailable. Skipping.');
});

after(async () => {
  await mongoose.disconnect().catch(() => {});
  if (replset) await replset.stop().catch(() => {});
});

beforeEach(async (t) => {
  if (!available) { t.skip(); return; }
  for (const name of ['payments', 'marketplace_orders', 'marketplace_products', 'financial_ledger']) {
    await mongoose.connection.db.collection(name).deleteMany({}).catch(() => {});
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function makeOrder({ total = 250_000 } = {}) {
  const product = await Product.create({
    slug: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: 'Test Product', seller: 'Test Seller', category: 'test', priceMinor: total
  });
  const fee = splitFee(total);
  return Order.create({
    orderId: `ECO-TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    buyer: uid(),
    customer: { name: 'Buyer', email: 'buyer@example.com' },
    items: [{ productSlug: product.slug, name: product.name, unitPriceMinor: total, quantity: 1, lineTotalMinor: total }],
    currency: 'NGN',
    subtotalMinor: total,
    platformFeeMinor: fee.feeMinor,
    feeRateBps: fee.feeRateBps,
    totalMinor: total,
    status: ORDER_STATUS.PAYMENT_REQUIRED
  });
}

async function makePayment(order) {
  return Payment.create({
    reference: `ECO-PAY-TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    user: order.buyer,
    purpose: PAYMENT_PURPOSE.MARKETPLACE_ORDER,
    relatedRef: order.orderId,
    currency: 'NGN',
    amountMinor: order.totalMinor,
    platformFeeMinor: order.platformFeeMinor,
    netMinor: order.subtotalMinor - order.platformFeeMinor,
    feeRateBps: order.feeRateBps,
    provider: 'paystack',
    providerReference: `psk_${Math.random().toString(36).slice(2, 10)}`
  });
}

const okVerification = (payment) => ({
  providerStatus: 'success',
  amountMinor: payment.amountMinor,
  currency: payment.currency,
  providerReference: payment.providerReference,
  channel: 'card',
  paidAt: new Date()
});

// ─── Fee math (pure, no DB) ──────────────────────────────────────────────────

describe('Fee math (splitFee)', () => {
  it('applies the canonical 30% platform fee exactly', () => {
    const { grossMinor, feeMinor, netMinor, feeRateBps } = splitFee(100_000, 3000);
    assert.equal(grossMinor, 100_000);
    assert.equal(feeMinor, 30_000);
    assert.equal(netMinor, 70_000);
    assert.equal(feeRateBps, 3000);
  });

  it('always reconciles: fee + net === gross, even with odd amounts', () => {
    for (const gross of [1, 3, 7, 999, 10_001, 123_457, 99_999_999]) {
      const { feeMinor, netMinor } = splitFee(gross, 3000);
      assert.equal(feeMinor + netMinor, gross);
      assert.ok(Number.isInteger(feeMinor) && Number.isInteger(netMinor));
    }
  });

  it('rejects non-integer or non-positive gross amounts', () => {
    assert.throws(() => splitFee(10.5), /positive integer/);
    assert.throws(() => splitFee(0), /positive integer/);
    assert.throws(() => splitFee(-500), /positive integer/);
  });
});

// ─── Webhook signature (pure) ────────────────────────────────────────────────

describe('Paystack webhook signature', () => {
  const secret = 'test-secret';
  const body = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'x' } }));
  const good = crypto.createHmac('sha512', secret).update(body).digest('hex');

  it('accepts a valid HMAC-SHA512 signature of the raw body', () => {
    assert.equal(verifyWebhookSignature(body, good, secret), true);
  });

  it('rejects an invalid signature', () => {
    assert.equal(verifyWebhookSignature(body, 'deadbeef'.repeat(16), secret), false);
  });

  it('rejects when the body is tampered after signing', () => {
    const tampered = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'y' } }));
    assert.equal(verifyWebhookSignature(tampered, good, secret), false);
  });

  it('rejects when no secret is configured', () => {
    assert.equal(verifyWebhookSignature(body, good, ''), false);
  });
});

// ─── Paystack provider (injected fetch — never the real API) ─────────────────

describe('Paystack provider (mocked transport)', () => {
  it('initialize sends integer kobo and returns the authorization URL', async () => {
    const calls = [];
    const provider = createPaystackProvider({
      secretKey: 'sk_test_fake',
      fetchImpl: async (url, opts) => {
        calls.push({ url, body: JSON.parse(opts.body) });
        return { ok: true, json: async () => ({ status: true, data: { authorization_url: 'https://pay.example/abc', reference: 'psk_123', access_code: 'abc' } }) };
      }
    });
    const out = await provider.initialize({ email: 'a@b.c', amountMinor: 250_000, reference: 'ECO-PAY-X', currency: 'NGN' });
    assert.equal(out.authorizationUrl, 'https://pay.example/abc');
    assert.equal(calls[0].body.amount, 250_000); // kobo, not naira
    assert.equal(calls[0].body.reference, 'ECO-PAY-X');
  });

  it('verify parses provider transaction data', async () => {
    const provider = createPaystackProvider({
      secretKey: 'sk_test_fake',
      fetchImpl: async () => ({ ok: true, json: async () => ({ status: true, data: { status: 'success', amount: 250_000, currency: 'NGN', reference: 'psk_123', channel: 'card', paid_at: '2026-01-01T00:00:00Z' } }) })
    });
    const v = await provider.verify('psk_123');
    assert.equal(v.providerStatus, 'success');
    assert.equal(v.amountMinor, 250_000);
    assert.equal(v.currency, 'NGN');
  });

  it('throws PAYMENTS_NOT_CONFIGURED without a secret key', async () => {
    const provider = createPaystackProvider({ secretKey: '', fetchImpl: async () => { throw new Error('must not be called'); } });
    await assert.rejects(() => provider.initialize({ email: 'a@b.c', amountMinor: 1, reference: 'x' }),
      (err) => err instanceof PaystackError && err.status === 503);
  });

  it('surfaces provider HTTP errors', async () => {
    const provider = createPaystackProvider({
      secretKey: 'sk_test_fake',
      fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ message: 'Invalid amount' }) })
    });
    await assert.rejects(() => provider.verify('bad'), (err) => err instanceof PaystackError && err.status === 400);
  });
});


// ─── Settlement (DB-backed, real transactions on a replica set) ─────────────

describe('Settlement', () => {
  it('settles a verified payment: PAID, balanced ledger, order PAID', async () => {
    const order = await makeOrder();
    const payment = await makePayment(order);

    const { payment: settled, alreadySettled } = await settleVerifiedPayment(payment.reference, okVerification(payment));

    assert.equal(alreadySettled, false);
    assert.equal(settled.status, PAYMENT_STATUS.PAID);

    const entries = await FinancialLedgerEntry.find({ paymentRef: payment.reference }).lean();
    const debits = entries.filter(e => e.direction === 'DEBIT').reduce((s, e) => s + e.amountMinor, 0);
    const credits = entries.filter(e => e.direction === 'CREDIT').reduce((s, e) => s + e.amountMinor, 0);
    assert.equal(debits, credits, 'ledger must balance');
    assert.equal(credits, payment.amountMinor);

    const feeEntry = entries.find(e => e.category === 'platform_fee');
    assert.equal(feeEntry.amountMinor, payment.platformFeeMinor);

    const updatedOrder = await Order.findOne({ orderId: order.orderId }).lean();
    assert.equal(updatedOrder.status, ORDER_STATUS.PAID);
  });

  it('settling twice credits once (webhook retry / double delivery)', async () => {
    const order = await makeOrder();
    const payment = await makePayment(order);

    await settleVerifiedPayment(payment.reference, okVerification(payment));
    const second = await settleVerifiedPayment(payment.reference, okVerification(payment));
    assert.equal(second.alreadySettled, true);

    const entries = await FinancialLedgerEntry.find({ paymentRef: payment.reference }).lean();
    const credits = entries.filter(e => e.direction === 'CREDIT').reduce((s, e) => s + e.amountMinor, 0);
    assert.equal(credits, payment.amountMinor, 'no double credit after duplicate settlement');
  });

  it('concurrent settlement attempts cannot double-settle', async () => {
    const order = await makeOrder();
    const payment = await makePayment(order);

    const results = await Promise.allSettled([
      settleVerifiedPayment(payment.reference, okVerification(payment)),
      settleVerifiedPayment(payment.reference, okVerification(payment)),
      settleVerifiedPayment(payment.reference, okVerification(payment))
    ]);

    const finalPayment = await Payment.findOne({ reference: payment.reference }).lean();
    assert.equal(finalPayment.status, PAYMENT_STATUS.PAID);
    const entries = await FinancialLedgerEntry.find({ paymentRef: payment.reference }).lean();
    const credits = entries.filter(e => e.direction === 'CREDIT').reduce((s, e) => s + e.amountMinor, 0);
    assert.equal(credits, payment.amountMinor, 'exactly one settlement worth of credits');
    assert.ok(results.some(r => r.status === 'fulfilled'));
  });

  it('rejects an amount mismatch and does NOT mark the payment paid', async () => {
    const order = await makeOrder();
    const payment = await makePayment(order);

    await assert.rejects(
      () => settleVerifiedPayment(payment.reference, { ...okVerification(payment), amountMinor: payment.amountMinor + 100 }),
      (err) => err instanceof SettlementError && err.code === 'AMOUNT_MISMATCH'
    );
    const after = await Payment.findOne({ reference: payment.reference }).lean();
    assert.notEqual(after.status, PAYMENT_STATUS.PAID);
    assert.equal(await FinancialLedgerEntry.countDocuments({ paymentRef: payment.reference }), 0);
  });

  it('rejects a currency mismatch', async () => {
    const order = await makeOrder();
    const payment = await makePayment(order);
    await assert.rejects(
      () => settleVerifiedPayment(payment.reference, { ...okVerification(payment), currency: 'USD' }),
      (err) => err.code === 'CURRENCY_MISMATCH'
    );
  });

  it('marks a provider-failed payment FAILED and posts no ledger entries', async () => {
    const order = await makeOrder();
    const payment = await makePayment(order);

    await assert.rejects(
      () => settleVerifiedPayment(payment.reference, { ...okVerification(payment), providerStatus: 'failed' }),
      (err) => err.code === 'PAYMENT_NOT_SUCCESSFUL'
    );
    const after = await Payment.findOne({ reference: payment.reference }).lean();
    assert.equal(after.status, PAYMENT_STATUS.FAILED);
    assert.equal(await FinancialLedgerEntry.countDocuments({ paymentRef: payment.reference }), 0);
  });

  it('rejects unknown references', async () => {
    await assert.rejects(
      () => settleVerifiedPayment('ECO-PAY-NOPE', {}),
      (err) => err.code === 'PAYMENT_NOT_FOUND'
    );
  });

  it('a terminal payment cannot settle', async () => {
    const order = await makeOrder();
    const payment = await makePayment(order);
    await Payment.updateOne({ _id: payment._id }, { $set: { status: PAYMENT_STATUS.CANCELLED } });
    await assert.rejects(
      () => settleVerifiedPayment(payment.reference, okVerification(payment)),
      (err) => err.code === 'TERMINAL_STATE'
    );
  });

  it('duplicate internal references are rejected by the database', async () => {
    const order = await makeOrder();
    const payment = await makePayment(order);
    await assert.rejects(
      () => Payment.create({
        reference: payment.reference, user: uid(), purpose: PAYMENT_PURPOSE.MARKETPLACE_ORDER,
        relatedRef: order.orderId, currency: 'NGN', amountMinor: 1000, platformFeeMinor: 300,
        netMinor: 700, feeRateBps: 3000, provider: 'paystack'
      }),
      (err) => err.code === 11000
    );
  });
});


// ─── Refunds (compensating entries, immutable originals) ────────────────────

describe('Refunds', () => {
  it('refunding a PAID payment posts balanced reversals and marks REFUNDED', async () => {
    const order = await makeOrder();
    const payment = await makePayment(order);
    await settleVerifiedPayment(payment.reference, okVerification(payment));

    const { payment: refunded, alreadyRefunded } = await refundPayment(payment.reference, { reason: 'customer request' });
    assert.equal(alreadyRefunded, false);
    assert.equal(refunded.status, PAYMENT_STATUS.REFUNDED);

    const all = await FinancialLedgerEntry.find({ paymentRef: { $in: [payment.reference, `${payment.reference}:refund`] } }).lean();
    const netByAccount = new Map();
    for (const e of all) {
      const cur = netByAccount.get(e.account) || 0;
      netByAccount.set(e.account, cur + (e.direction === 'CREDIT' ? e.amountMinor : -e.amountMinor));
    }
    for (const [, net] of netByAccount) {
      assert.equal(net, 0, 'every account nets to zero after full refund');
    }

    const updatedOrder = await Order.findOne({ orderId: order.orderId }).lean();
    assert.equal(updatedOrder.status, ORDER_STATUS.REFUNDED);
  });

  it('refunding twice refunds once', async () => {
    const order = await makeOrder();
    const payment = await makePayment(order);
    await settleVerifiedPayment(payment.reference, okVerification(payment));
    await refundPayment(payment.reference);
    const second = await refundPayment(payment.reference);
    assert.equal(second.alreadyRefunded, true);
  });

  it('a non-PAID payment cannot be refunded', async () => {
    const order = await makeOrder();
    const payment = await makePayment(order);
    await assert.rejects(() => refundPayment(payment.reference), (err) => err.code === 'NOT_REFUNDABLE');
  });
});

