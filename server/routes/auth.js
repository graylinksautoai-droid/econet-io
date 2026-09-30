/**
 * Auth routes — /api/auth
 *
 * Supports two modes:
 *
 * PRODUCTION (default):
 *   Uses MongoDB / Mongoose User model.
 *   Requires MONGODB_URI and a live database connection.
 *   Returns HTTP 503 immediately when MongoDB is unavailable
 *   (does not buffer for 10 seconds).
 *
 * DEVELOPMENT (DEV_AUTH=true, NODE_ENV ≠ production):
 *   Uses an in-memory DevAuthStore — no database required.
 *   Safe for local development when Atlas DNS is unavailable.
 *   Never activates in production.
 *   Data is ephemeral and lost on server restart.
 *   Returns X-Dev-Mode: true header on all responses so the
 *   frontend can show a visible development indicator.
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { devAuth } from '../dev/DevAuthStore.js';

const router = express.Router();

/* ─── helpers ────────────────────────────────────────────────────────────────── */

/** True when Mongoose is connected to MongoDB. */
function isMongoReady() {
  return mongoose.connection.readyState === 1;
}

/** Structured error response. */
function err(res, status, code, message, extra = {}) {
  return res.status(status).json({ error: message, code, ...extra });
}

/** Dev-mode header added when DEV_AUTH is active. */
function devHeaders(res) {
  if (devAuth.enabled) {
    res.setHeader('X-Dev-Mode', 'true');
    res.setHeader('X-Dev-Auth', 'in-memory-ephemeral');
  }
}

/* ─── Register ───────────────────────────────────────────────────────────────── */

router.post('/register', [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  // 1. Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return err(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg, { errors: errors.array() });
  }

  const { name, email, password, phone, location } = req.body;

  // 2. DEV_AUTH path — in-memory, no MongoDB needed
  if (devAuth.enabled) {
    try {
      devHeaders(res);
      const result = devAuth.register({ name, email, password });
      return res.status(201).json({
        message: 'Dev account created (in-memory, ephemeral)',
        devMode: true,
        ...result
      });
    } catch (e) {
      devHeaders(res);
      const status = e.message === 'User already exists' ? 400 : 500;
      return err(res, status, 'DEV_AUTH_ERROR', e.message);
    }
  }

  // 3. Production path — requires MongoDB
  if (!isMongoReady()) {
    return err(res, 503, 'DATABASE_UNAVAILABLE',
      'Registration is unavailable: database not connected. ' +
      'Set DEV_AUTH=true to use the local development auth path.');
  }

  try {
    // Lazy import of User model — only needed when MongoDB is ready
    const { default: User } = await import('../models/User.js');

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return err(res, 400, 'USER_EXISTS', 'User already exists');
    }

    const user = new User({ name, email, password, phone, location });
    await user.save();

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id:               user._id,
        name:             user.name,
        email:            user.email,
        avatar:           user.avatar,
        isVerified:       user.isVerified,
        reputation:       user.reputation,
        verifiedReporter: user.verifiedReporter,
        followerCount:    user.followers?.length ?? 0,
        followingCount:   user.following?.length ?? 0
      }
    });
  } catch (error) {
    console.error('[auth] Registration error:', error.message);
    return err(res, 500, 'REGISTRATION_FAILED', 'Failed to register user');
  }
});

/* ─── Login ──────────────────────────────────────────────────────────────────── */

router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return err(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg, { errors: errors.array() });
  }

  const { email, password } = req.body;

  // DEV_AUTH path
  if (devAuth.enabled) {
    try {
      devHeaders(res);
      const result = devAuth.login({ email, password });
      return res.json({
        message: 'Login successful (dev mode)',
        devMode: true,
        ...result
      });
    } catch (e) {
      devHeaders(res);
      return err(res, 401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    }
  }

  // Production path — requires MongoDB
  if (!isMongoReady()) {
    return err(res, 503, 'DATABASE_UNAVAILABLE',
      'Login is unavailable: database not connected. ' +
      'Set DEV_AUTH=true to use the local development auth path.');
  }

  try {
    const { default: User } = await import('../models/User.js');

    const user = await User.findOne({ email });
    if (!user) {
      return err(res, 401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return err(res, 401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id:               user._id,
        name:             user.name,
        email:            user.email,
        avatar:           user.avatar,
        isVerified:       user.isVerified,
        reputation:       user.reputation,
        verifiedReporter: user.verifiedReporter,
        followerCount:    user.followers?.length ?? 0,
        followingCount:   user.following?.length ?? 0
      }
    });
  } catch (error) {
    console.error('[auth] Login error:', error.message);
    return err(res, 500, 'LOGIN_FAILED', 'Failed to login');
  }
});

/* ─── Token verify ───────────────────────────────────────────────────────────
 * GET /api/auth/verify
 * Used by the frontend on startup to check whether a stored token is still
 * accepted. Returns 200 with { valid: true } when the token is good, 401
 * when it has expired or is not recognised (e.g. after a DEV_AUTH server
 * restart). The frontend clears localStorage on 401 so the user sees the
 * login screen rather than a broken authenticated state.
 */

router.get('/verify', async (req, res) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    return res.status(401).json({ valid: false, code: 'NO_TOKEN' });
  }

  // DEV_AUTH path
  if (devAuth.enabled) {
    const decoded = devAuth.decodeToken(token);
    if (!decoded) {
      return res.status(401).json({ valid: false, code: 'TOKEN_INVALID' });
    }
    const user = devAuth.findById(decoded.userId);
    if (!user) {
      // Server was restarted — in-memory store cleared, token is stale
      return res.status(401).json({ valid: false, code: 'SESSION_EXPIRED' });
    }
    return res.json({ valid: true, devMode: true });
  }

  // Production path — verify JWT signature + expiry
  try {
    const jwt_ = await import('jsonwebtoken');
    jwt_.default.verify(token, process.env.JWT_SECRET);
    return res.json({ valid: true });
  } catch (e) {
    return res.status(401).json({ valid: false, code: 'TOKEN_INVALID' });
  }
});

export default router;
