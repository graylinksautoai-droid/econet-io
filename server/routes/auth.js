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

/* ─── Forgot Password ─────────────────────────────────────────────────────── */

router.post('/forgot-password', [
  body('email').isEmail().withMessage('Valid email is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return err(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg);
  }

  const { email } = req.body;

  // DEV_AUTH: no email available, return a dev-friendly message
  if (devAuth.enabled) {
    devHeaders(res);
    return res.json({
      message: 'Password reset not available in dev mode. Use the dev login credentials directly.',
      devMode: true
    });
  }

  if (!isMongoReady()) {
    return err(res, 503, 'DATABASE_UNAVAILABLE', 'Authentication service unavailable.');
  }

  try {
    const { default: User }  = await import('../models/User.js');
    const { default: crypto } = await import('crypto');
    const nodemailer = await import('nodemailer');

    const user = await User.findOne({ email: email.toLowerCase() });

    // Always respond with the same message whether the user exists or not —
    // prevents email enumeration attacks.
    if (!user) {
      return res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
    }

    // Generate a cryptographically secure token, store hashed, expire in 1h
    const rawToken    = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.passwordResetToken   = hashedToken;
    user.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save({ validateBeforeSave: false });

    // Construct reset URL — use FRONTEND_URL env var or fall back to request origin
    const frontendOrigin = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
    const resetUrl = `${frontendOrigin}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

    // Send email if credentials are configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('[auth/forgot-password] EMAIL_USER/EMAIL_PASS not set — reset token generated but email not sent.');
      // In development: log the URL so it can be used manually
      if (process.env.NODE_ENV !== 'production') {
        console.log('[auth/forgot-password] DEV reset URL:', resetUrl);
      }
      return res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
    }

    const transporter = nodemailer.default.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    await transporter.sendMail({
      from: `"EcoNet IO" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Reset your EcoNet password',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
          <h2 style="color:#22c55e">Reset your EcoNet password</h2>
          <p>You requested a password reset. Click the link below to set a new password.
             This link expires in <strong>1 hour</strong>.</p>
          <p style="margin:24px 0">
            <a href="${resetUrl}"
               style="background:#22c55e;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
              Reset password
            </a>
          </p>
          <p style="color:#666;font-size:12px">
            If you didn't request this, ignore this email — your password won't change.
          </p>
        </div>
      `
    });

    return res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
  } catch (e) {
    console.error('[auth/forgot-password]', e.message);
    return err(res, 500, 'EMAIL_FAILED', 'Could not send reset email. Try again later.');
  }
});

/* ─── Reset Password ─────────────────────────────────────────────────────── */

router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return err(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg);
  }

  if (devAuth.enabled) {
    devHeaders(res);
    return err(res, 400, 'DEV_MODE', 'Password reset not available in dev mode.');
  }

  if (!isMongoReady()) {
    return err(res, 503, 'DATABASE_UNAVAILABLE', 'Authentication service unavailable.');
  }

  try {
    const { default: User }  = await import('../models/User.js');
    const { default: crypto } = await import('crypto');

    const { token: rawToken, email, password } = req.body;
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const user = await User.findOne({
      email: email.toLowerCase(),
      passwordResetToken:   hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return err(res, 400, 'TOKEN_INVALID', 'Reset token is invalid or has expired.');
    }

    user.password             = password;
    user.passwordResetToken   = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    return res.json({ message: 'Password updated. You can now sign in with your new password.' });
  } catch (e) {
    console.error('[auth/reset-password]', e.message);
    return err(res, 500, 'RESET_FAILED', 'Password reset failed. Try again.');
  }
});

export default router;
