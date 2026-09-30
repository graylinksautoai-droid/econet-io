/**
 * Economy routes — /api/economy
 *
 * EcoCoin accounting endpoints.
 *
 * IMPORTANT: EcoCoins are platform reward credits.
 * They are NOT real money, NOT convertible to fiat, and NOT withdrawable
 * without an approved payment integration that does not yet exist.
 *
 * Routes:
 *   GET  /api/economy/balance           — current user's EcoCoin balance + history
 *   POST /api/economy/earn              — record an earn event (mission evidence etc.)
 *   GET  /api/economy/history           — transaction history for current user
 *
 * Real-money payouts are NOT implemented. Any payout button must be clearly
 * labelled as unavailable until a payment provider is integrated and approved.
 */

import express from 'express';
import mongoose from 'mongoose';
import { protect } from '../middleware/auth.js';

const router = express.Router();

function isMongoReady() {
  return mongoose.connection.readyState === 1;
}
function dbUnavailable(res) {
  return res.status(503).json({
    error: 'EcoCoin service temporarily unavailable — database not connected.',
    code: 'DATABASE_UNAVAILABLE'
  });
}

// ─── GET /api/economy/balance ─────────────────────────────────────────────────

router.get('/balance', protect, async (req, res) => {
  try {
    // Balance is stored on the User model — but only look up MongoDB when
    // the user actually has a valid MongoDB ObjectId (not a DEV_AUTH dev_ id).
    const isMongoUser = isMongoReady() && req.user._id && !String(req.user._id).startsWith('dev_');
    if (isMongoUser) {
      const { default: User } = await import('../models/User.js');
      const user = await User.findById(req.user._id).select('reputation').lean();
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json({
        ecoCoins: user.reputation?.ecoCoins ?? 0,
        leaves:   user.reputation?.leaves   ?? 0,
        seeds:    user.reputation?.seeds    ?? 0,
        currency: 'ECOCOIN',
        note: 'EcoCoins are platform credits, not convertible to cash.'
      });
    }

    // DEV_AUTH or non-Mongo user — return balance from token/request payload
    const reputation = req.user?.reputation || {};
    return res.json({
      ecoCoins: reputation.ecoCoins ?? 0,
      leaves:   reputation.leaves   ?? 0,
      seeds:    reputation.seeds    ?? 0,
      currency: 'ECOCOIN',
      devMode:  true,
      note: 'DEV mode — balance is session-only and not persisted to the database.'
    });
  } catch (err) {
    console.error('[economy] balance error:', err.message);
    return res.status(500).json({ error: 'Failed to get balance' });
  }
});

// ─── POST /api/economy/earn ───────────────────────────────────────────────────

router.post('/earn', protect, async (req, res) => {
  const isMongoUser = isMongoReady() && req.user._id && !String(req.user._id).startsWith('dev_');
  if (!isMongoUser) return dbUnavailable(res);

  const { type, amount, referenceId, referenceType, reason, idempotencyKey } = req.body;

  const VALID_TYPES = ['earn_report', 'earn_mission', 'earn_evidence', 'earn_daily'];
  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({
      error: `type must be one of: ${VALID_TYPES.join(', ')}`,
      code: 'VALIDATION_ERROR'
    });
  }
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number', code: 'VALIDATION_ERROR' });
  }
  if (!idempotencyKey) {
    return res.status(400).json({ error: 'idempotencyKey is required', code: 'VALIDATION_ERROR' });
  }

  try {
    const { default: EcoCoinTransaction } = await import('../models/EcoCoinTransaction.js');
    const { default: User } = await import('../models/User.js');

    // Idempotency: return existing result if key was already processed
    const existing = await EcoCoinTransaction.findOne({ idempotencyKey }).lean();
    if (existing) {
      return res.json({ message: 'Already processed', transaction: existing, idempotent: true });
    }

    // Atomic balance update + transaction record
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $inc: { 'reputation.ecoCoins': amount, 'reputation.seeds': amount } },
      { new: true, select: 'reputation' }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    const tx = await EcoCoinTransaction.create({
      user:            req.user._id,
      type,
      amount,
      balanceAfter:    user.reputation.ecoCoins,
      referenceType:   referenceType || null,
      referenceId:     referenceId   || null,
      reason:          reason        || '',
      idempotencyKey,
      status: 'completed'
    });

    return res.status(201).json({
      message: 'EcoCoins earned',
      transaction: tx,
      newBalance: user.reputation.ecoCoins,
      currency: 'ECOCOIN'
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.json({ message: 'Already processed', idempotent: true });
    }
    console.error('[economy] earn error:', err.message);
    return res.status(500).json({ error: 'Failed to record EcoCoin earn event' });
  }
});

// ─── GET /api/economy/history ─────────────────────────────────────────────────

router.get('/history', protect, async (req, res) => {
  const isMongoUser = isMongoReady() && req.user._id && !String(req.user._id).startsWith('dev_');
  if (!isMongoUser) return dbUnavailable(res);
  try {
    const { default: EcoCoinTransaction } = await import('../models/EcoCoinTransaction.js');
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
    const transactions = await EcoCoinTransaction
      .find({ user: req.user._id, status: 'completed' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      transactions,
      total: transactions.length,
      currency: 'ECOCOIN',
      note: 'EcoCoins are platform credits. Real-money payouts are not available.'
    });
  } catch (err) {
    console.error('[economy] history error:', err.message);
    return res.status(500).json({ error: 'Failed to get transaction history' });
  }
});

export default router;
