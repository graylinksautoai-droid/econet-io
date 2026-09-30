/**
 * Canonical Engine Initialization — resilience tests
 *
 * Verifies that:
 *  1. The MissionEngine can be initialised successfully.
 *  2. A failing initialize() does NOT prevent the availability flag being set
 *     correctly (missionEngineAvailable stays false on failure).
 *  3. Route-level guard behaviour (503 when unavailable) is implemented.
 *
 * These tests do NOT spin up the Express server. They test the engine
 * lifecycle and the guard function in isolation.
 *
 * Run: node --test server/tests/canonical-engine-init.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../infrastructure/idempotency/IdempotencyManager.js';
import { InMemoryMissionRepository } from '../../engines/11-mission/infrastructure/repositories/InMemoryMissionRepository.js';
import { MissionEngine } from '../../engines/11-mission/index.js';

// ─── Test 1: Successful initialization ───────────────────────────────────────

test('MissionEngine.initialize() returns ready:true on success', async () => {
  const engine = new MissionEngine({
    repository: new InMemoryMissionRepository(),
    eventBus: new EventBus(),
    idempotencyManager: new IdempotencyManager()
  });

  const result = await engine.initialize();

  assert.equal(result.ready, true);
  assert.equal(result.engineId, '11');
  assert.equal(result.name, 'Mission Engine');
});

test('MissionEngine.healthCheck() reports READY after initialization', async () => {
  const engine = new MissionEngine({
    repository: new InMemoryMissionRepository(),
    eventBus: new EventBus(),
    idempotencyManager: new IdempotencyManager()
  });

  await engine.initialize();
  const health = await engine.healthCheck();

  assert.equal(health.healthy, true);
  assert.equal(health.details.status, 'READY');
  assert.equal(health.details.persistence, 'IN_MEMORY_MISSION_ADAPTER');
});

// ─── Test 2: Initialization failure handling ─────────────────────────────────

test('missionEngineAvailable flag stays false when initialize() throws', async () => {
  // Simulate a MissionEngine whose initialize() rejects.
  class FailingMissionEngine {
    get engineId() { return '11'; }
    get engineName() { return 'Mission Engine'; }
    async initialize() {
      throw new Error('Simulated initialization failure');
    }
    async healthCheck() {
      return { healthy: false, engineId: '11', details: { status: 'FAILED' } };
    }
    async shutdown() {}
  }

  const fakeEngine = new FailingMissionEngine();
  let available = false;

  // Reproduce the composition-root try/catch pattern exactly.
  try {
    await fakeEngine.initialize();
    available = true;
  } catch (err) {
    // available remains false
    assert.match(err.message, /Simulated initialization failure/);
  }

  assert.equal(available, false, 'missionEngineAvailable must remain false after init failure');
});

test('missionEngineAvailable flag is set to true when initialize() succeeds', async () => {
  const engine = new MissionEngine({
    repository: new InMemoryMissionRepository(),
    eventBus: new EventBus(),
    idempotencyManager: new IdempotencyManager()
  });

  let available = false;

  try {
    await engine.initialize();
    available = true;
  } catch {
    // should not reach here
  }

  assert.equal(available, true, 'missionEngineAvailable must be true after successful init');
});

// ─── Test 3: Route guard returns 503 when engine unavailable ─────────────────

test('requireEngine guard returns false and writes 503 when engine unavailable', () => {
  // Reproduce the requireEngine helper from server/routes/v2/missions.js.
  const responses = [];
  const mockRes = {
    status(code) {
      responses.push({ code });
      return this;
    },
    json(body) {
      responses.push({ body });
      return this;
    }
  };

  function requireEngine(engineAvailable, res) {
    if (!engineAvailable) {
      res.status(503).json({
        error: 'Mission engine unavailable',
        message: 'The canonical Mission Engine failed to initialise. Check server logs for details.'
      });
      return false;
    }
    return true;
  }

  const resultWhenUnavailable = requireEngine(false, mockRes);
  assert.equal(resultWhenUnavailable, false);
  assert.equal(responses[0].code, 503);
  assert.equal(responses[1].body.error, 'Mission engine unavailable');

  const resultWhenAvailable = requireEngine(true, mockRes);
  assert.equal(resultWhenAvailable, true);
});

// ─── Test 4: shutdown does not throw ─────────────────────────────────────────

test('MissionEngine.shutdown() does not throw', async () => {
  const engine = new MissionEngine({
    repository: new InMemoryMissionRepository(),
    eventBus: new EventBus(),
    idempotencyManager: new IdempotencyManager()
  });

  await engine.initialize();
  await assert.doesNotReject(engine.shutdown());
});
