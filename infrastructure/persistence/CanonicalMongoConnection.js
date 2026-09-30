/**
 * Canonical MongoDB Connection
 *
 * Manages a dedicated Mongoose connection for the canonical engine layer.
 * This connection is intentionally SEPARATE from the legacy server's
 * mongoose.connect() call in server/index.js — the two systems must be
 * independently operational and use separate Mongoose connection instances
 * so that a canonical connection failure does not affect legacy routes
 * and vice-versa.
 *
 * Usage (in composition root, engines.js):
 *   import { canonicalConnection } from '.../CanonicalMongoConnection.js';
 *   await canonicalConnection.connect(uri);
 *   // ... register models, build repositories ...
 *   await canonicalConnection.disconnect();
 *
 * The connection is a singleton within the canonical infrastructure.
 * Callers must not create additional CanonicalMongoConnection instances.
 */

import mongoose from 'mongoose';

export class CanonicalMongoConnection {
  #conn = null;
  #uri  = null;

  /**
   * Open the connection to MongoDB.
   * Idempotent — calling connect() when already connected is a no-op.
   * @param {string} uri - MongoDB connection string
   * @returns {Promise<mongoose.Connection>}
   */
  async connect(uri) {
    if (this.#conn && this.#conn.readyState === 1) {
      return this.#conn;
    }
    this.#uri  = uri;
    this.#conn = await mongoose.createConnection(uri, {
      // Do NOT set tls:true or tlsAllowInvalidCertificates — the Atlas connection
      // string (mongodb+srv://) enables TLS automatically. Forcing tls:true with
      // tlsAllowInvalidCertificates causes an OpenSSL TLS alert (error 80) on
      // Node.js 24 / OpenSSL 3.x. Let the driver negotiate TLS from the URI.
      retryWrites: true,
      w: 'majority',
      maxPoolSize: 10,
      // M0 free clusters can take up to 30s to wake from auto-pause.
      // Use a longer server selection timeout to accommodate this.
      serverSelectionTimeoutMS: 45_000,
      socketTimeoutMS: 45_000,
      // Force IPv4 to avoid ETIMEDOUT on IPv6 network interfaces
      family: 4,
    }).asPromise();

    this.#conn.on('error', (err) => {
      console.error('[canonical-mongo] Connection error:', err.message);
    });
    this.#conn.on('disconnected', () => {
      console.warn('[canonical-mongo] Disconnected from MongoDB');
    });

    return this.#conn;
  }

  /**
   * Close the connection gracefully.
   * Safe to call even if the connection was never opened.
   */
  async disconnect() {
    if (this.#conn) {
      await this.#conn.close();
      this.#conn = null;
    }
  }

  /**
   * Return the active Mongoose connection, or throw if not connected.
   * @returns {mongoose.Connection}
   */
  get connection() {
    if (!this.#conn || this.#conn.readyState !== 1) {
      throw new Error(
        '[canonical-mongo] Connection not open. ' +
        'Call canonicalConnection.connect(uri) before accessing the connection.'
      );
    }
    return this.#conn;
  }

  /** True when the connection is currently open. */
  get isConnected() {
    return this.#conn !== null && this.#conn.readyState === 1;
  }

  /**
   * Register a Mongoose model on this connection.
   * Using connection.model() instead of mongoose.model() ensures the model
   * is scoped to the canonical connection, not the global default connection
   * used by the legacy server.
   *
   * @param {string} name - Model name
   * @param {mongoose.Schema} schema - Mongoose schema
   * @returns {mongoose.Model}
   */
  model(name, schema) {
    return this.connection.model(name, schema);
  }
}

// Singleton — import this instance everywhere in the canonical layer.
export const canonicalConnection = new CanonicalMongoConnection();
