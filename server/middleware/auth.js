/**
 * Auth middleware — protect()
 *
 * Supports DEV_AUTH in-memory tokens when DEV_AUTH=true.
 * Falls back to Mongoose User lookup for production tokens.
 * Returns a clear 503 when MongoDB is unavailable and DEV_AUTH is off.
 */

import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { devAuth } from '../dev/DevAuthStore.js';

function isMongoReady() {
  return mongoose.connection.readyState === 1;
}

export const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ error: 'Not authorized, no token', code: 'NO_TOKEN' });
    }

    // DEV_AUTH path — verify against in-memory store
    if (devAuth.enabled) {
      const decoded = devAuth.decodeToken(token);
      if (!decoded) {
        return res.status(401).json({ error: 'Token invalid', code: 'TOKEN_INVALID' });
      }
      const user = devAuth.findById(decoded.userId);
      if (!user) {
        return res.status(401).json({ error: 'Dev user not found', code: 'USER_NOT_FOUND' });
      }
      req.user = { ...user, _id: user.id };
      return next();
    }

    // Production path — requires MongoDB
    if (!isMongoReady()) {
      return res.status(503).json({
        error: 'Authentication service unavailable: database not connected.',
        code: 'DATABASE_UNAVAILABLE'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { default: User } = await import('../models/User.js');
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }

    req.user = user;
    req.user._id = user._id;
    next();
  } catch (error) {
    console.error('[auth middleware]', error.message);
    res.status(401).json({ error: 'Not authorized, token failed', code: 'TOKEN_FAILED' });
  }
};
