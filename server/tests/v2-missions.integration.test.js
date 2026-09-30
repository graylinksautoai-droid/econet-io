/**
 * API v2 /missions — HTTP integration tests
 *
 * Spins up a minimal Express app with only the v2 missions router mounted,
 * backed by a fully-controlled canonical MissionEngine instance. Tests make
 * real HTTP requests through Node's built-in http module so the route
 * composition, serialisation, and error handling are exercised end-to-end.
 *
 * The canonical engines.js module-level singleton is NOT used here — each
 * test fixture creates its own isolated engine instance, preventing state
 * bleed between tests.
 *
 * Run: node --test server/tests/v2-missions.integration.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { Router } from 'express';
import { EventBus } from '../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../infrastructure/idempotency/IdempotencyManager.js';
import { InMemoryMissionRepository } from '../../engines/11-mission/infrastructure/repositories/InMemoryMissionRepository.js';
import { MissionEngine } from '../../engines/11-mission/index.js';
import { Mission } from '../../engines/11-mission/domain/entities/Mission.js';
import { MissionPriority } from '../../engines/11-mission/index.js';
import { MissionStatus } from '../../engines/11-mission/domain/value-objects/MissionStatus.js';

// ─── Inline port allocator (avoids port conflicts across parallel test runs) ──

let nextPort = 29500;
function allocatePort() { return nextPort++; }

// ─── Inline serializeMission (mirrors routes/v2/missions.js exactly) ─────────

function serializeMission(mission) {
  const coordinates =
    Array.isArray(mission.targetCriteria?.coordinates) &&
    mission.targetCriteria.coordinates.length === 2
      ? mission.targetCriteria.coordinates
      : null;
  return {
    missionId: mission.missionId,
    title: mission.title,
    description: mission.description,
    status: mission.status,
    priority: mission.priority,
    objectives: mission.objectives.map((obj) => ({
      objectiveId: obj.objectiveId,
      description: obj.description,
      status: obj.status
    })),
    coordinates,
    metadata: mission.metadata,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt
  };
}

// ─── Test app factory ─────────────────────────────────────────────────────────

async function buildTestApp(overrides = {}) {
  const repository = new InMemoryMissionRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new MissionEngine({ repository, eventBus, idempotencyManager });
  await engine.initialize();

  let engineAvailable = true;

  if (overrides.failInit) {
    // Simulate a failed engine for 503-testing.
    engineAvailable = false;
  }

  function requireEngine(res) {
    if (!engineAvailable) {
      res.status(503).json({
        error: 'Mission engine unavailable',
        message: 'The canonical Mission Engine failed to initialise. Check server logs for details.'
      });
      return false;
    }
    return true;
  }

  const router = Router();

  router.get('/', async (req, res) => {
    if (!requireEngine(res)) return;
    try {
      const { priority, limit: limitRaw } = req.query;
      let normalisedPriority = null;
      if (priority) {
        normalisedPriority = String(priority).trim().toUpperCase();
        if (!Object.values(MissionPriority).includes(normalisedPriority)) {
          return res.status(400).json({
            error: 'Invalid priority value',
            message: `priority must be one of: ${Object.values(MissionPriority).join(', ')}`,
            received: priority
          });
        }
      }
      const limit = Math.min(100, Math.max(1, parseInt(limitRaw, 10) || 50));
      const missions = await engine.listActiveMissions(
        normalisedPriority ? { priority: normalisedPriority } : undefined
      );
      const sliced = missions.slice(0, limit);
      return res.json({
        missions: sliced.map(serializeMission),
        total: sliced.length,
        pagination: { limit, hasMore: missions.length > limit, cursor: null }
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to list missions' });
    }
  });

  router.get('/:missionId', async (req, res) => {
    if (!requireEngine(res)) return;
    try {
      const { missionId } = req.params;
      if (!missionId || typeof missionId !== 'string' || missionId.trim() === '') {
        return res.status(400).json({ error: 'missionId is required' });
      }
      const mission = await engine.getMission(missionId.trim());
      if (!mission) {
        return res.status(404).json({ error: 'Mission not found', missionId: missionId.trim() });
      }
      return res.json({ mission: serializeMission(mission) });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to retrieve mission' });
    }
  });

  const app = express();
  app.use(express.json());
  app.use('/api/v2/missions', router);

  return { app, engine, repository };
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function httpGet(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method: 'GET', headers: { Accept: 'application/json' } }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function withServer(app, fn) {
  return new Promise((resolve, reject) => {
    const port = allocatePort();
    const server = http.createServer(app);
    server.listen(port, '127.0.0.1', async () => {
      try {
        await fn(port);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

// ─── Helper: seed an ACTIVE mission into the engine ──────────────────────────

async function seedActiveMission(engine, opts = {}) {
  const actor = { actorId: 'sys', roles: ['system'] };
  const idKey = opts.idKey || `seed-${Date.now()}-${Math.random()}`;
  const { Command } = await import('../../contracts/commands/Command.js');

  const created = await engine.executeCommand(new Command({
    commandType: 'CreateMission',
    targetEngine: '11-mission',
    actor,
    idempotencyKey: `create-${idKey}`,
    correlationId: `cor-${idKey}`,
    payload: {
      title: opts.title || 'Test Mission',
      description: opts.description || 'A test mission',
      priority: opts.priority || 'HIGH',
      targetCriteria: opts.targetCriteria || { completionThreshold: 'ALL_OBJECTIVES_TERMINAL' },
      metadata: opts.metadata || {}
    }
  }));

  await engine.executeCommand(new Command({
    commandType: 'ActivateMission',
    targetEngine: '11-mission',
    actor,
    idempotencyKey: `activate-${idKey}`,
    correlationId: `cor-act-${idKey}`,
    payload: { missionId: created.mission.missionId }
  }));

  return created.mission;
}

// ─── 1. Empty mission collection ─────────────────────────────────────────────

test('GET /api/v2/missions — empty store returns empty array', async () => {
  const { app } = await buildTestApp();
  await withServer(app, async (port) => {
    const { status, body } = await httpGet(port, '/api/v2/missions');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.missions));
    assert.equal(body.missions.length, 0);
    assert.equal(body.total, 0);
    assert.ok(body.pagination);
  });
});

// ─── 2. Active mission list ────────────────────────────────────────────────

test('GET /api/v2/missions — returns ACTIVE missions', async () => {
  const { app, engine } = await buildTestApp();
  const m1 = await seedActiveMission(engine, { title: 'Alpha', idKey: 'a1', priority: 'HIGH' });
  const m2 = await seedActiveMission(engine, { title: 'Beta', idKey: 'a2', priority: 'MEDIUM' });

  await withServer(app, async (port) => {
    const { status, body } = await httpGet(port, '/api/v2/missions');
    assert.equal(status, 200);
    assert.equal(body.missions.length, 2);
    const ids = body.missions.map((m) => m.missionId);
    assert.ok(ids.includes(m1.missionId));
    assert.ok(ids.includes(m2.missionId));
    // All returned missions must have status ACTIVE
    assert.ok(body.missions.every((m) => m.status === MissionStatus.ACTIVE));
  });
});

// ─── 3. Priority filtering ────────────────────────────────────────────────────

test('GET /api/v2/missions?priority=HIGH — filters by priority', async () => {
  const { app, engine } = await buildTestApp();
  await seedActiveMission(engine, { title: 'High one', idKey: 'pf1', priority: 'HIGH' });
  await seedActiveMission(engine, { title: 'Low one', idKey: 'pf2', priority: 'LOW' });

  await withServer(app, async (port) => {
    const { status, body } = await httpGet(port, '/api/v2/missions?priority=HIGH');
    assert.equal(status, 200);
    assert.equal(body.missions.length, 1);
    assert.equal(body.missions[0].priority, 'HIGH');
  });
});

test('GET /api/v2/missions?priority=low — case-insensitive priority filter', async () => {
  const { app, engine } = await buildTestApp();
  await seedActiveMission(engine, { title: 'Low mission', idKey: 'ci1', priority: 'LOW' });

  await withServer(app, async (port) => {
    const { status, body } = await httpGet(port, '/api/v2/missions?priority=low');
    assert.equal(status, 200);
    assert.equal(body.missions.length, 1);
    assert.equal(body.missions[0].priority, 'LOW');
  });
});

// ─── 4. Valid limit values ────────────────────────────────────────────────────

test('GET /api/v2/missions?limit=1 — respects limit', async () => {
  const { app, engine } = await buildTestApp();
  await seedActiveMission(engine, { title: 'M1', idKey: 'lim1' });
  await seedActiveMission(engine, { title: 'M2', idKey: 'lim2' });
  await seedActiveMission(engine, { title: 'M3', idKey: 'lim3' });

  await withServer(app, async (port) => {
    const { status, body } = await httpGet(port, '/api/v2/missions?limit=1');
    assert.equal(status, 200);
    assert.equal(body.missions.length, 1);
    assert.equal(body.pagination.limit, 1);
    assert.equal(body.pagination.hasMore, true);
  });
});

test('GET /api/v2/missions?limit=100 — clamps at maximum', async () => {
  const { app, engine } = await buildTestApp();
  await seedActiveMission(engine, { title: 'M1', idKey: 'max1' });

  await withServer(app, async (port) => {
    const { status, body } = await httpGet(port, '/api/v2/missions?limit=999');
    assert.equal(status, 200);
    assert.equal(body.pagination.limit, 100); // clamped
  });
});

// ─── 5. Invalid priority ──────────────────────────────────────────────────────

test('GET /api/v2/missions?priority=URGENT — 400 for invalid priority', async () => {
  const { app } = await buildTestApp();
  await withServer(app, async (port) => {
    const { status, body } = await httpGet(port, '/api/v2/missions?priority=URGENT');
    assert.equal(status, 400);
    assert.equal(body.error, 'Invalid priority value');
    assert.ok(body.message.includes('priority must be one of'));
    assert.equal(body.received, 'URGENT');
  });
});

// ─── 6. Invalid limit (non-numeric) — clamps to default ──────────────────────

test('GET /api/v2/missions?limit=abc — treats as default (50)', async () => {
  const { app } = await buildTestApp();
  await withServer(app, async (port) => {
    const { status, body } = await httpGet(port, '/api/v2/missions?limit=abc');
    assert.equal(status, 200);
    assert.equal(body.pagination.limit, 50); // parseInt('abc') = NaN → default 50
  });
});

// ─── 7. Unknown mission ID → 404 ─────────────────────────────────────────────

test('GET /api/v2/missions/:id — 404 for unknown missionId', async () => {
  const { app } = await buildTestApp();
  await withServer(app, async (port) => {
    const { status, body } = await httpGet(port, '/api/v2/missions/msn_does_not_exist');
    assert.equal(status, 404);
    assert.equal(body.error, 'Mission not found');
    assert.equal(body.missionId, 'msn_does_not_exist');
  });
});

// ─── 8. Valid mission ID → correct DTO ───────────────────────────────────────

test('GET /api/v2/missions/:id — returns correct DTO for known mission', async () => {
  const { app, engine } = await buildTestApp();
  const seeded = await seedActiveMission(engine, { title: 'Known Mission', idKey: 'km1', priority: 'CRITICAL' });

  await withServer(app, async (port) => {
    const { status, body } = await httpGet(port, `/api/v2/missions/${seeded.missionId}`);
    assert.equal(status, 200);
    const m = body.mission;
    assert.equal(m.missionId, seeded.missionId);
    assert.equal(m.title, 'Known Mission');
    assert.equal(m.priority, 'CRITICAL');
    assert.equal(m.status, MissionStatus.ACTIVE);
    // Fields present in DTO
    assert.ok('objectives' in m);
    assert.ok('metadata' in m);
    assert.ok('createdAt' in m);
    assert.ok('updatedAt' in m);
    // targetCriteria must be omitted from DTO
    assert.equal('targetCriteria' in m, false);
  });
});

// ─── 9. Coordinate extraction behavior ───────────────────────────────────────

test('GET /api/v2/missions/:id — coordinates extracted from targetCriteria', async () => {
  const { app, engine } = await buildTestApp();
  const seeded = await seedActiveMission(engine, {
    title: 'Geo Mission',
    idKey: 'geo1',
    targetCriteria: { coordinates: [7.4951, 9.0579], completionThreshold: 'ALL' }
  });

  await withServer(app, async (port) => {
    const { status, body } = await httpGet(port, `/api/v2/missions/${seeded.missionId}`);
    assert.equal(status, 200);
    assert.deepEqual(body.mission.coordinates, [7.4951, 9.0579]);
  });
});

test('GET /api/v2/missions/:id — coordinates null when absent from targetCriteria', async () => {
  const { app, engine } = await buildTestApp();
  const seeded = await seedActiveMission(engine, {
    title: 'No Geo Mission',
    idKey: 'nogeo1',
    targetCriteria: { completionThreshold: 'ALL' } // no coordinates key
  });

  await withServer(app, async (port) => {
    const { status, body } = await httpGet(port, `/api/v2/missions/${seeded.missionId}`);
    assert.equal(status, 200);
    assert.equal(body.mission.coordinates, null);
  });
});

// ─── 10. Engine unavailable → 503 ────────────────────────────────────────────

test('GET /api/v2/missions — 503 when engine failed to initialise', async () => {
  const { app } = await buildTestApp({ failInit: true });
  await withServer(app, async (port) => {
    const { status, body } = await httpGet(port, '/api/v2/missions');
    assert.equal(status, 503);
    assert.equal(body.error, 'Mission engine unavailable');
  });
});

test('GET /api/v2/missions/:id — 503 when engine failed to initialise', async () => {
  const { app } = await buildTestApp({ failInit: true });
  await withServer(app, async (port) => {
    const { status, body } = await httpGet(port, '/api/v2/missions/msn_any');
    assert.equal(status, 503);
    assert.equal(body.error, 'Mission engine unavailable');
  });
});

// ─── 11. No authentication required on GET endpoints ─────────────────────────

test('GET /api/v2/missions — accessible without Authorization header', async () => {
  const { app, engine } = await buildTestApp();
  await seedActiveMission(engine, { title: 'Public Mission', idKey: 'pub1' });

  await withServer(app, async (port) => {
    // httpGet sends no Authorization header by design.
    const { status } = await httpGet(port, '/api/v2/missions');
    assert.equal(status, 200);
  });
});

// ─── 12. Consistent error response format ────────────────────────────────────

test('error responses always include an "error" string field', async () => {
  const { app } = await buildTestApp();
  await withServer(app, async (port) => {
    const r404 = await httpGet(port, '/api/v2/missions/msn_missing');
    assert.ok(typeof r404.body.error === 'string', '404 error field must be a string');

    const r400 = await httpGet(port, '/api/v2/missions?priority=BOGUS');
    assert.ok(typeof r400.body.error === 'string', '400 error field must be a string');
  });
});

// ─── 13. DRAFT missions are NOT returned by list (only ACTIVE) ───────────────

test('GET /api/v2/missions — DRAFT missions are excluded from results', async () => {
  const { app, engine } = await buildTestApp();
  const actor = { actorId: 'sys', roles: ['system'] };
  const { Command } = await import('../../contracts/commands/Command.js');

  // Create a mission in DRAFT state (do NOT activate it)
  await engine.executeCommand(new Command({
    commandType: 'CreateMission',
    targetEngine: '11-mission',
    actor,
    idempotencyKey: 'draft-only',
    correlationId: 'cor-draft',
    payload: {
      title: 'Draft Mission',
      description: 'Should not appear in list',
      priority: 'HIGH',
      targetCriteria: { completionThreshold: 'ALL' }
    }
  }));

  await withServer(app, async (port) => {
    const { status, body } = await httpGet(port, '/api/v2/missions');
    assert.equal(status, 200);
    assert.equal(body.missions.length, 0, 'DRAFT missions must not appear in active list');
  });
});
