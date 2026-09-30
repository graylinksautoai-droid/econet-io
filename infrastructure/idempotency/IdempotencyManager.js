/**
 * EcoNet IO Idempotency Manager
 * Prevents duplicate command execution and duplicate event side effects.
 *
 * STORAGE ABSTRACTION:
 * By default uses an in-memory Map (for local development and CI).
 * A durable store can be injected via the constructor options for production:
 *
 *   new IdempotencyManager({ store: new MongoIdempotencyStore(connection) })
 *
 * The injected store must implement:
 *   get(key): Promise<entry|null>
 *   setIfAbsent(key, entry): Promise<{inserted, existing}>
 *   update(key, updates): Promise<void>
 *   delete(key): Promise<void>
 *   deleteExpired(): Promise<void>
 *   clear(): Promise<void>
 *
 * When no store is injected the manager uses an internal in-memory Map and
 * behaves exactly as before — no breaking change to existing callers.
 */

export const IdempotencyStatus = Object.freeze({
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
});

export class IdempotencyManager {
  constructor(options = {}) {
    this._store = new Map(); // key -> { status, result, error, createdAt, expiresAt }
    this._defaultTtlMs = options.defaultTtlMs || 24 * 60 * 60 * 1000; // 24 hours
    // Optional durable store injection (e.g. MongoIdempotencyStore).
    // When present, the durable store is the source of truth and the internal
    // Map is bypassed entirely.
    this._durableStore = options.store || null;
  }

  /**
   * Acquire execution lock for an idempotency key.
   * If the key was already completed, returns the cached result.
   * @param {string} key
   * @param {number} [ttlMs]
   * @returns {{ isDuplicate: boolean, status: string, result?: any, error?: string }}
   */
  acquire(key, ttlMs = this._defaultTtlMs) {
    if (!key) {
      return { isDuplicate: false, status: null };
    }

    if (this._durableStore) {
      // Durable path is async — callers must use executeIdempotent() instead
      // of calling acquire/complete/fail directly when a durable store is set.
      // Surfacing a clear error prevents misuse.
      throw new Error(
        'IdempotencyManager: acquire() cannot be called synchronously when a durable store is configured. ' +
        'Use executeIdempotent() instead.'
      );
    }

    this._cleanupExpired();

    const existing = this._store.get(key);
    if (existing) {
      if (existing.status === IdempotencyStatus.COMPLETED) {
        return { isDuplicate: true, status: IdempotencyStatus.COMPLETED, result: existing.result };
      }
      if (existing.status === IdempotencyStatus.PENDING) {
        throw new Error(`Concurrent execution in progress for idempotency key: "${key}".`);
      }
      if (existing.status === IdempotencyStatus.FAILED) {
        return { isDuplicate: true, status: IdempotencyStatus.FAILED, error: existing.error };
      }
    }

    const now = Date.now();
    this._store.set(key, {
      status: IdempotencyStatus.PENDING,
      result: null,
      error: null,
      createdAt: now,
      expiresAt: now + ttlMs
    });

    return { isDuplicate: false, status: IdempotencyStatus.PENDING };
  }

  /**
   * Mark an idempotency key as successfully completed with its result payload.
   * @param {string} key
   * @param {any} result
   */
  complete(key, result) {
    if (!key) return;
    if (this._durableStore) {
      throw new Error(
        'IdempotencyManager: complete() cannot be called synchronously when a durable store is configured. ' +
        'Use executeIdempotent() instead.'
      );
    }
    const entry = this._store.get(key);
    if (entry) {
      entry.status = IdempotencyStatus.COMPLETED;
      entry.result = result;
    }
  }

  /**
   * Mark an idempotency key as failed.
   * @param {string} key
   * @param {string|Error} error
   */
  fail(key, error) {
    if (!key) return;
    if (this._durableStore) {
      throw new Error(
        'IdempotencyManager: fail() cannot be called synchronously when a durable store is configured. ' +
        'Use executeIdempotent() instead.'
      );
    }
    const entry = this._store.get(key);
    if (entry) {
      entry.status = IdempotencyStatus.FAILED;
      entry.error = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Execute an async action idempotently.
   * Works with both in-memory (synchronous acquire/complete/fail) and
   * durable stores (async setIfAbsent/update).
   * @param {string} key
   * @param {Function} action - async () => result
   * @returns {Promise<any>}
   */
  async executeIdempotent(key, action) {
    if (!key) {
      return action();
    }

    if (this._durableStore) {
      return this._executeIdempotentDurable(key, action);
    }

    return this._executeIdempotentMemory(key, action);
  }

  /** @private — in-memory path (unchanged behavior) */
  async _executeIdempotentMemory(key, action) {
    const check = this.acquire(key);
    if (check.isDuplicate) {
      if (check.status === IdempotencyStatus.COMPLETED) {
        return check.result;
      }
      if (check.status === IdempotencyStatus.FAILED) {
        throw new Error(`Previous execution with key "${key}" failed: ${check.error}`);
      }
    }

    try {
      const result = await action();
      const entry = this._store.get(key);
      if (entry) {
        entry.status = IdempotencyStatus.COMPLETED;
        entry.result = result;
      }
      return result;
    } catch (err) {
      const entry = this._store.get(key);
      if (entry) {
        entry.status = IdempotencyStatus.FAILED;
        entry.error = err instanceof Error ? err.message : String(err);
      }
      throw err;
    }
  }

  /** @private — durable store path (async, multi-instance safe) */
  async _executeIdempotentDurable(key, action) {
    const now = Date.now();
    const entry = {
      status:    IdempotencyStatus.PENDING,
      result:    null,
      error:     null,
      createdAt: now,
      expiresAt: now + this._defaultTtlMs
    };

    const { inserted, existing } = await this._durableStore.setIfAbsent(key, entry);

    if (!inserted && existing) {
      if (existing.status === IdempotencyStatus.COMPLETED) {
        return existing.result;
      }
      if (existing.status === IdempotencyStatus.PENDING) {
        throw new Error(`Concurrent execution in progress for idempotency key: "${key}".`);
      }
      if (existing.status === IdempotencyStatus.FAILED) {
        throw new Error(`Previous execution with key "${key}" failed: ${existing.error}`);
      }
    }

    try {
      const result = await action();
      await this._durableStore.update(key, {
        status: IdempotencyStatus.COMPLETED,
        result
      });
      return result;
    } catch (err) {
      await this._durableStore.update(key, {
        status: IdempotencyStatus.FAILED,
        error:  err instanceof Error ? err.message : String(err)
      });
      throw err;
    }
  }

  /**
   * CommandBus middleware wrapper.
   */
  createCommandMiddleware() {
    return async (command, next) => {
      if (!command.idempotencyKey) {
        return next(command);
      }
      return this.executeIdempotent(command.idempotencyKey, () => next(command));
    };
  }

  _cleanupExpired() {
    const now = Date.now();
    for (const [key, entry] of this._store.entries()) {
      if (entry.expiresAt <= now) {
        this._store.delete(key);
      }
    }
  }

  clear() {
    this._store.clear();
  }
}

// Global Singleton Instance
export const globalIdempotencyManager = new IdempotencyManager();
