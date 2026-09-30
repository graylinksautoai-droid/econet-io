/**
 * Payments routes — Paystack-backed fiat payments.
 *
 * Endpoints:
 *   GET  /status             — capability status (never leaks keys)
 *   POST /initialize         — create internal payment + provider session
 *   GET  /verify/:reference  — server-side verify + settle (idempotent)
 *   POST /webhook            — provider webhook (raw body + HMAC-SHA512)
 *
 * Amounts are ALWAYS computed server-side from persisted records; a browser
 * redirect is never proof of payment. index.js mounts express.raw() for the
 * webhook path before express.json().
 */
import express from 'express';
import crypto from 'crypto';
import { protect } from '../middleware/auth.js';
import Payment, { PAYMENT_STATUS, PAYMENT_PURPOSE } from '../models/Payment.js';
import Order, { ORDER_STATUS } from '../models/Order.js';
import { paymentConfig } from '../services/payments/paymentConfig.js';
import { paystackProvider, PaystackError, verifyWebhookSignature } from '../services/payments/paystackProvider.js';
import { settleVerifiedPayment, SettlementError } from '../services/payments/settlementService.js';

const router = express.Router();

const newReference = () =>
  `ECO-PAY-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      provider: paymentConfig.provider,
      configured: paymentConfig.configured,
      currency: paymentConfig.currency,
      platformFeeBps: paymentConfig.platformFeeBps,
      minAmountMinor: paymentConfig.minAmountMinor,
      maxAmountMinor: paymentConfig.maxAmountMinor
    }
  });
});

// ── Initialize a payment for a marketplace order ─────────────────────────────
router.post('/initialize', protect, async (req, res) => {
  if (!paymentConfig.configured) {
    return res.status(503).json({ success: false, code: 'PAYMENTS_NOT_CONFIGURED',
      message: 'Online payments are not configured on this deployment yet.' });
  }
  try {
    const { purpose = PAYMENT_PURPOSE.MARKETPLACE_ORDER, orderId } = req.body || {};

    if (purpose !== PAYMENT_PURPOSE.MARKETPLACE_ORDER) {
      // Wallet funding / mission funding require their own canonical flows.
      return res.status(409).json({ success: false, code: 'PURPOSE_NOT_ENABLED',
        message: `Payment purpose "${purpose}" is not enabled on this deployment.` });
    }
    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'orderId is required' });
    }

    // Authoritative amount from the persisted order — never from the client.
    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ success: false, code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    if (String(order.buyer) !== String(req.user._id)) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'This order belongs to another account' });
    }
    if (order.status === ORDER_STATUS.PAID) {
      return res.status(409).json({ success: false, code: 'ALREADY_PAID', message: 'Order is already paid' });
    }
    if (![ORDER_STATUS.PENDING, ORDER_STATUS.PAYMENT_REQUIRED].includes(order.status)) {
      return res.status(409).json({ success: false, code: 'ORDER_TERMINAL_STATE',
        message: `Order is ${order.status} and cannot be paid` });
    }

    const amountMinor = order.totalMinor;
    if (amountMinor < paymentConfig.minAmountMinor || amountMinor > paymentConfig.maxAmountMinor) {
      return res.status(422).json({ success: false, code: 'AMOUNT_OUT_OF_RANGE',
        message: 'Order total is outside the permitted payment range' });
    }

    // Reuse an open payment for this order if one exists (refresh-safe retry).
    let payment = await Payment.findOne({
      relatedRef: orderId,
      purpose: PAYMENT_PURPOSE.MARKETPLACE_ORDER,
      status: { $in: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.PROCESSING] }
    });

    if (!payment) {
      payment = await Payment.create({
        reference: newReference(),
        user: req.user._id,
        purpose: PAYMENT_PURPOSE.MARKETPLACE_ORDER,
        relatedRef: orderId,
        currency: order.currency,
        amountMinor,
        platformFeeMinor: order.platformFeeMinor,
        netMinor: order.subtotalMinor - order.platformFeeMinor,
        feeRateBps: order.feeRateBps,
        status: PAYMENT_STATUS.PENDING,
        provider: paymentConfig.provider
      });
    }

    if (order.paymentMethod === 'cash_on_delivery') {
      return res.status(409).json({ success: false, code: 'COD_NO_ONLINE_PAYMENT',
        message: 'This order is cash on delivery: no online payment can be initialized. It stays PENDING until payment is collected on delivery.' });
    }

    const init = await paystackProvider.initialize({
      email: order.customer.email,
      amountMinor: payment.amountMinor,
      reference: payment.reference,
      currency: payment.currency,
      callbackUrl: paymentConfig.callbackUrl || undefined,
      channels: order.paymentMethod === 'bank_transfer' ? ['bank_transfer'] : ['card'],
      metadata: { internalReference: payment.reference, orderId, purpose: payment.purpose }
    });

    payment.providerReference = init.providerReference;
    payment.authorizationUrl = init.authorizationUrl;
    payment.status = PAYMENT_STATUS.PROCESSING;
    await payment.save();

    await Order.updateOne(
      { orderId, status: ORDER_STATUS.PENDING },
      { $set: { status: ORDER_STATUS.PAYMENT_REQUIRED, paymentRef: payment.reference } }
    );

    return res.status(201).json({
      success: true,
      data: {
        reference: payment.reference,
        authorizationUrl: init.authorizationUrl,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        status: payment.status
      }
    });
  } catch (err) {
    if (err instanceof PaystackError) {
      return res.status(err.status === 503 ? 503 : 502).json({ success: false, code: 'PROVIDER_ERROR', message: err.message });
    }
    console.error('[payments] initialize failed:', err.message);
    return res.status(500).json({ success: false, code: 'INIT_FAILED', message: 'Failed to initialize payment' });
  }
});

// ── Server-side verification + settlement (idempotent) ───────────────────────
// Called by the frontend after the provider redirect. The redirect itself
// proves nothing — this endpoint always re-verifies with the provider.
router.get('/verify/:reference', protect, async (req, res) => {
  if (!paymentConfig.configured) {
    return res.status(503).json({ success: false, code: 'PAYMENTS_NOT_CONFIGURED',
      message: 'Online payments are not configured on this deployment yet.' });
  }
  try {
    const { reference } = req.params;
    const payment = await Payment.findOne({ reference });
    if (!payment) return res.status(404).json({ success: false, code: 'PAYMENT_NOT_FOUND', message: 'Unknown payment reference' });
    if (String(payment.user) !== String(req.user._id)) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'This payment belongs to another account' });
    }

    if (payment.status === PAYMENT_STATUS.PAID) {
      return res.json({ success: true, data: { reference, status: payment.status, alreadySettled: true } });
    }

    const verification = await paystackProvider.verify(payment.providerReference || reference);
    const result = await settleVerifiedPayment(reference, verification);

    return res.json({
      success: true,
      data: {
        reference,
        status: result.payment.status,
        alreadySettled: result.alreadySettled,
        amountMinor: result.payment.amountMinor,
        currency: result.payment.currency
      }
    });
  } catch (err) {
    if (err instanceof SettlementError) {
      const code = err.code === 'AMOUNT_MISMATCH' || err.code === 'CURRENCY_MISMATCH' || err.code === 'REFERENCE_MISMATCH' ? 422 : 409;
      return res.status(code).json({ success: false, code: err.code, message: err.message });
    }
    if (err instanceof PaystackError) {
      return res.status(502).json({ success: false, code: 'PROVIDER_ERROR', message: err.message });
    }
    console.error('[payments] verify failed:', err.message);
    return res.status(500).json({ success: false, code: 'VERIFY_FAILED', message: 'Payment verification failed' });
  }
});

// ── Paystack webhook — raw body + HMAC-SHA512 signature ──────────────────────
// index.js mounts express.raw({ type: 'application/json' }) for this path
// BEFORE express.json(), so req.body is the exact Buffer Paystack signed.
router.post('/webhook', async (req, res) => {
  if (!paymentConfig.configured) return res.sendStatus(503);

  const signature = req.headers['x-paystack-signature'];
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
  if (!verifyWebhookSignature(raw, signature)) return res.sendStatus(401);

  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { return res.sendStatus(400); }
  if (!event || typeof event !== 'object' || !event.event) return res.sendStatus(400);

  // Acknowledge non-payment events without processing.
  if (event.event !== 'charge.success') return res.sendStatus(200);

  const reference = event.data?.metadata?.internalReference || event.data?.reference;
  if (!reference) return res.sendStatus(400);

  try {
    // Re-verify with the provider — a webhook payload alone is not proof.
    const payment = await Payment.findOne({ reference });
    if (!payment) return res.sendStatus(200); // unknown reference: ack to stop retries
    if (payment.status === PAYMENT_STATUS.PAID) return res.sendStatus(200); // idempotent

    const verification = await paystackProvider.verify(payment.providerReference || reference);
    await settleVerifiedPayment(reference, verification);
    return res.sendStatus(200);
  } catch (err) {
    // Retryable failures → 500 so Paystack retries per its delivery policy.
    // Non-retryable validation failures are still acked 200 after the payment
    // was marked FAILED inside settlement, to avoid poison-message loops.
    if (err instanceof SettlementError) return res.sendStatus(200);
    console.error('[payments] webhook processing failed:', err.message);
    return res.sendStatus(500);
  }
});

export default router;

