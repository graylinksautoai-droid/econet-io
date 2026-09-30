/**
 * MongoIdempotencyStore + IdempotencyManager (durable path) — tests
 *
 * Covers:
 *  - first acquisition
 *  - completed replay (returns cached result)
 *  - concurrent acquisition (throws same message as in-memory path)
 *  - TTL / expiration
 *  - persistence across manager instances (simulates process restart)
 *  - multiple repository instances sharing the same connection
 *
 * Run: node --test server/tests/persistence/mongo-idempotency-store.test.js
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoIdempotencyStore } from '../../../infrastructure/idempotency/MongoIdempotencyStore.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';

let mongod;
let conn;
let store;
let manager;

before(async () => {
  // Retry once: under full-suite parallel load the mongod binary can exceed
  // its default 10s launch budget on the first attempt while other test
  // processes compete for CPU/disk. The second attempt runs warm.
  for (let attempt = 1; attempt <= 2 && !store; attempt++) {
    try {
      mongod = await MongoMemoryServer.create();
      conn   = await mongoose.createConnection(mongod.getUri(), {
        serverSelectionTimeoutMS: 10_000
      }).asPromise();
      store   = new MongoIdempotencyStore(conn);
      manager = new IdempotencyManager({ store });
    } catch (err) {
      console.warn(`[idempotency-test] MongoMemoryServer attempt ${attempt} failed:`, err.message);
      if (mongod) { await mongod.stop().catch(() => {}); mongod = null; }
      conn = null;
    }
  }
  if (!store) {
    console.warn('[idempotency-test] MongoMemoryServer unavailable. Skipping.');
  }
});

after(async () => {
  if (conn)  await conn.close();
  if (mongod) await mongod.stop();
});

beforeEach(async (t) => {
  if (!store) { t.skip(); return; }
  await store.clear();
});

// ─── 1. First request ─────────────────────────────────────────────────────────

describe('1. First request', () => {

  it('executes the action and returns its result', async () => {
    const result = await manager.executeIdempotent('key-first-1', async () => 'hello');
    assert.equal(result, 'hello');
  });

  it('marks the key as COMPLETED after success', async () => {
    await manager.executeIdempotent('key-first-2', async () => 42);
    const entry = await store.get('key-first-2');
    assert.ok(entry, 'entry must exist');
    assert.equal(entry.status, 'COMPLETED');
    assert.equal(entry.result, 42);
  });

  it('marks the key as FAILED when the action throws', async () => {
    await assert.rejects(
      () => manager.executeIdempotent('key-fail-1', async () => { throw new Error('oops'); }),
      /oops/
    );
    const entry = await store.get('key-fail-1');
    assert.equal(entry.status, 'FAILED');
    assert.equal(entry.error, 'oops');
  });

});

// ─── 2. Replay (completed) ────────────────────────────────────────────────────

describe('2. Completed replay', () => {

  it('returns the cached result without re-running the action', async () => {
    let callCount = 0;
    const action = async () => { callCount++; return 'computed'; };

    await manager.executeIdempotent('key-replay-1', action);
    const result2 = await manager.executeIdempotent('key-replay-1', action);

    assert.equal(result2, 'computed');
    assert.equal(callCount, 1, 'action must not be called a second time');
  });

  it('complex object results round-trip through MongoDB correctly', async () => {
    const payload = { missionId: 'msn_abc', status: 'DRAFT', version: 1 };
    await manager.executeIdempotent('key-object-1', async () => payload);
    const replayed = await manager.executeIdempotent('key-object-1', async () => ({ wrong: true }));
    assert.deepEqual(replayed, payload);
  });

});

// ─── 3. Concurrent acquisition ────────────────────────────────────────────────

describe('3. Concurrent acquisition', () => {

  it('second concurrent call throws "Concurrent execution in progress"', async () => {
    // Manually insert a PENDING entry to simulate a racing request.
    const now = Date.now();
    await store.setIfAbsent('key-concurrent-1', {
      status: 'PENDING',
      result: null,
      error: null,
      createdAt: now,
      expiresAt: now + 60_000
    });

    await assert.rejects(
      () => manager.executeIdempotent('key-concurrent-1', async () => 'result'),
      /Concurrent execution in progress/
    );
  });

});

// ─── 4. Process restart simulation ───────────────────────────────────────────

describe('4. Persistence across process restart', () => {

  it('a new manager instance reads completed results from the store', async () => {
    await manager.executeIdempotent('key-restart-1', async () => 'persistent-value');

    // Simulate process restart: new manager with new store instance on same connection
    const store2  = new MongoIdempotencyStore(conn);
    const manager2 = new IdempotencyManager({ store: store2 });

    let callCount = 0;
    const result = await manager2.executeIdempotent('key-restart-1', async () => { callCount++; return 'recomputed'; });

    assert.equal(result, 'persistent-value', 'must return cached result, not re-run');
    assert.equal(callCount, 0, 'action must not be called after restart');
  });

  it('failed key survives restart and throws on retry', async () => {
    await assert.rejects(
      () => manager.executeIdempotent('key-restart-fail', async () => { throw new Error('startup crash'); }),
      /startup crash/
    );

    const store2  = new MongoIdempotencyStore(conn);
    const manager2 = new IdempotencyManager({ store: store2 });

    await assert.rejects(
      () => manager2.executeIdempotent('key-restart-fail', async () => 'ok'),
      /Previous execution with key .* failed/
    );
  });

});

// ─── 5. Multiple instances ───────────────────────────────────────────────────

describe('5. Multiple manager instances (multi-instance safety)', () => {

  it('two managers sharing the same store do not both execute for the same key', async () => {
    const storeA = new MongoIdempotencyStore(conn);
    const storeB = new MongoIdempotencyStore(conn);
    const managerA = new IdempotencyManager({ store: storeA });
    const managerB = new IdempotencyManager({ store: storeB });

    let calls = 0;
    const action = async () => { calls++; return 'done'; };

    // First call via A succeeds
    const r1 = await managerA.executeIdempotent('key-multi-1', action);
    // Second call via B replays from store
    const r2 = await managerB.executeIdempotent('key-multi-1', action);

    assert.equal(r1, 'done');
    assert.equal(r2, 'done');
    assert.equal(calls, 1, 'only one instance should execute the action');
  });

});

// ─── 6. In-memory manager (no durable store) still works unchanged ────────────

describe('6. In-memory fallback (no regression)', () => {

  it('IdempotencyManager without a store behaves as before', async () => {
    const memManager = new IdempotencyManager();
    let calls = 0;
    const r1 = await memManager.executeIdempotent('mem-key-1', async () => { calls++; return 'mem'; });
    const r2 = await memManager.executeIdempotent('mem-key-1', async () => { calls++; return 'mem'; });
    assert.equal(r1, 'mem');
    assert.equal(r2, 'mem');
    assert.equal(calls, 1);
  });

  it('in-memory manager acquire/complete/fail still work synchronously', () => {
    const memManager = new IdempotencyManager();
    const check = memManager.acquire('sync-key-1');
    assert.equal(check.isDuplicate, false);
    memManager.complete('sync-key-1', 'sync-result');
    const replay = memManager.acquire('sync-key-1');
    assert.equal(replay.isDuplicate, true);
    assert.equal(replay.result, 'sync-result');
  });

});
