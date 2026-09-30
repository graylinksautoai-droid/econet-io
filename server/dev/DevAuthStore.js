/**
 * DevAuthStore — in-memory user store for local development.
 *
 * ACTIVATED ONLY when DEV_AUTH=true is set in the server environment.
 * Never used in production (NODE_ENV=production blocks it).
 * Explicitly ephemeral — data lost on server restart.
 *
 * Provides the same interface as the Mongoose User model so the
 * auth route can delegate to it transparently when MongoDB is unavailable.
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const IS_ALLOWED = () =>
  process.env.DEV_AUTH === 'true' && process.env.NODE_ENV !== 'production';

// In-memory store: email → { id, name, email, passwordHash, role, createdAt, reputation }
const users = new Map();

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw + 'econet-dev-salt').digest('hex');
}

function makeJwt(userId, email) {
  return jwt.sign(
    { userId, email },
    process.env.JWT_SECRET || 'dev-secret-local-only',
    { expiresIn: '7d' }
  );
}

function publicUser(u) {
  return {
    id:               u.id,
    name:             u.name,
    email:            u.email,
    avatar:           u.avatar || null,
    isVerified:       false,
    reputation:       u.reputation,
    verifiedReporter: false,
    followerCount:    0,
    followingCount:   0,
    role:             u.ecoRole || 'grinder'
  };
}

export const devAuth = {
  /** True when DEV_AUTH mode is active and permitted. */
  get enabled() { return IS_ALLOWED(); },

  /** Register a new dev user. Returns { token, user } or throws. */
  register({ name, email, password }) {
    if (!IS_ALLOWED()) throw new Error('DEV_AUTH not enabled');
    if (!name || !email || !password) throw new Error('name, email and password are required');
    if (password.length < 6) throw new Error('Password must be at least 6 characters');

    const existing = users.get(email.toLowerCase());
    if (existing) throw new Error('User already exists');

    const id   = `dev_${crypto.randomUUID().replace(/-/g, '')}`;
    const user = {
      id,
      name:         name.trim(),
      email:        email.toLowerCase().trim(),
      passwordHash: hashPassword(password),
      avatar:       null,
      ecoRole:      null,
      reputation:   { trustScore: 0, totalReports: 0, verifiedReports: 0, leaves: 0, seeds: 0 },
      createdAt:    new Date().toISOString()
    };

    users.set(user.email, user);
    console.log(`[DEV_AUTH] Registered dev user: ${user.email}`);

    return { token: makeJwt(id, user.email), user: publicUser(user) };
  },

  /** Login an existing dev user. Returns { token, user } or throws. */
  login({ email, password }) {
    if (!IS_ALLOWED()) throw new Error('DEV_AUTH not enabled');
    if (!email || !password) throw new Error('Email and password are required');

    const user = users.get(email.toLowerCase());
    if (!user) throw new Error('Invalid credentials');

    const hash = hashPassword(password);
    if (hash !== user.passwordHash) throw new Error('Invalid credentials');

    console.log(`[DEV_AUTH] Login: ${user.email}`);
    return { token: makeJwt(user.id, user.email), user: publicUser(user) };
  },

  /** Find a dev user by id (for protect middleware). Returns user object or null. */
  findById(id) {
    for (const u of users.values()) {
      if (u.id === id) return publicUser(u);
    }
    return null;
  },

  /** Decode a dev JWT and return { userId, email } or null. */
  decodeToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-local-only');
    } catch {
      return null;
    }
  },

  count() { return users.size; }
};
