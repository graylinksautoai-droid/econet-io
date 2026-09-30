/**
 * MongoIdempotencyStore
 *
 * A MongoDB-backed persistence store that replaces the in-memory Map inside
 * IdempotencyManager for production deployments.
 *
 * COLLECTION: canonical_idempotency_keys
 * IDENTITY:   _id === idempotency key string
 *
 * KEY FEATURES:
 *  - TTL index on `expiresAt` (seconds epoch) — MongoDB removes expired
 *    entries automatically, matching the 24-hour default TTL behavior of the
 *    in-memory implementation.
 *  - Atomic acquisition via findOneAndUpdate with upsert — safe across
 *    multiple server instances (no in-process lock required).
 *  - Concurrent duplicate acquisition is detected and throws the same error
 *    message as the in-memory implementation so all callers behave identically.
 *
 * BOUNDARY:
 * This file is the only canonical infrastructure file that imports Mongoose
 * for idempotency purposes. IdempotencyManager.js remains database-agnostic.
 */

import mongoose from 'mongoose';

// ─── Schema ───────────────────────────────────────────────────────────────────

const idempotencySchema = new mongoose.Schema({
  _id:       { type: String, required: true },        // === idempotency key
  status:    { type: String, required: true },         // PENDING | COMPLETED | FAILED
  result:    { type: mongoose.Schema.Types.Mixed },    // serialised result
  error:     { type: String, default: null },
  createdAt: { type: Number, required: true },         // Unix ms
  expiresAt: { type: Number, required: true },         // Unix ms — TTL index source
  // Secondary Date field for MongoDB TTL index (must be Date, not Number).
  expiresAtDate: { type: Date, required: true }
}, {
  versionKey: false,
  timestamps: false,
  collection: 'canonical_idempotency_keys'
});

// TTL index — MongoDB automatically deletes documents when expiresAtDate has passed.
idempotencySchema.index({ expiresAtDate: 1 }, { expireAfterSeconds: 0 });

// ─── Store class ──────────────────────────────────────────────────────────────

export class MongoIdempotencyStore {
  /**
   * @param {mongoose.Connection} connection - The canonical Mongoose connection.
   */
  constructor(connection) {
    if (!connection) {
      throw new Error('MongoIdempotencyStore requires a Mongoose connection.');
    }
    this._Model = connection.modelNames().includes('CanonicalIdempotencyKey')
      ? connection.model('CanonicalIdempotencyKey')
      : connection.model('CanonicalIdempotencyKey', idempotencySchema);
  }

  /**
   * Retrieve a stored entry by key.
   * @param {string} key
   * @returns {Promise<{status, result, error, createdAt, expiresAt}|null>}
   */
  async get(key) {
    const doc = await this._Model.findOne({ _id: key }).lean();
    if (!doc) return null;
    return {
      status:    doc.status,
      result:    doc.result ?? null,
      error:     doc.error ?? null,
      createdAt: doc.createdAt,
      expiresAt: doc.expiresAt
    };
  }

  /**
   * Atomically insert a PENDING entry only if the key does not already exist.
   * Returns the existing entry if the key was already present (any status).
   *
   * Uses findOneAndUpdate with $setOnInsert + upsert to guarantee atomicity
   * across multiple server instances — two concurrent callers cannot both
   * successfully insert the same key as PENDING.
   *
   * @param {string} key
   * @param {{status, result, error, createdAt, expiresAt}} entry
   * @returns {Promise<{inserted: boolean, existing: object|null}>}
   */
  async setIfAbsent(key, entry) {
    const expiresAtDate = new Date(entry.expiresAt);
    const result = await this._Model.findOneAndUpdate(
      { _id: key },
      { $setOnInsert: { _id: key, ...entry, expiresAtDate } },
      { upsert: true, new: false, lean: true }
    );
    if (result === null) {
      // Successful insert (Mongo returns null when new:false and doc is new).
      return { inserted: true, existing: null };
    }
    // Document already existed — return it.
    return {
      inserted: false,
      existing: {
        status:    result.status,
        result:    result.result ?? null,
        error:     result.error ?? null,
        createdAt: result.createdAt,
        expiresAt: result.expiresAt
      }
    };
  }

  /**
   * Update the status and result/error of an existing entry.
   * @param {string} key
   * @param {{status, result?, error?}} updates
   */
  async update(key, updates) {
    await this._Model.updateOne({ _id: key }, { $set: updates });
  }

  /**
   * Delete an entry by key.
   * @param {string} key
   */
  async delete(key) {
    await this._Model.deleteOne({ _id: key });
  }

  /**
   * Remove all expired entries manually (belt-and-suspenders; TTL index
   * handles this automatically in production).
   */
  async deleteExpired() {
    const now = Date.now();
    await this._Model.deleteMany({ expiresAt: { $lte: now } });
  }

  /** Remove all entries — test fixtures only. */
  async clear() {
    await this._Model.deleteMany({});
  }
}
