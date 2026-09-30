/**
 * MongoMissionRepository — contract tests
 *
 * Runs against an in-process MongoDB instance (mongodb-memory-server).
 * Tests the full interface contract: create, read, list, update, delete,
 * rehydration, concurrency version guard, and persistence across
 * repository instances sharing the same connection.
 *
 * Run: node --test server/tests/persistence/mongo-mission-repository.test.js
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  MongoMissionRepository,
  MissionConcurrentModificationError
} from '../../../engines/11-mission/infrastructure/repositories/MongoMissionRepository.js';
import { Mission } from '../../../engines/11-mission/domain/entities/Mission.js';

// ─── shared test infrastructure ───────────────────────────────────────────────

let mongod;
let conn;
let repo;

const BASE_PAYLOAD = {
  title: 'Flood Response Delta',
  description: 'Coordinate field evacuation in the Niger Delta.',
  priority: 'HIGH',
  targetCriteria: { region: 'Niger Delta', type: 'flood-response' },
  metadata: { requestedBy: 'test-suite' }
};

function makePayload(overrides = {}) {
  return { ...BASE_PAYLOAD, ...overrides };
}

/** Build a new Mission entity and run it through one save cycle. */
async function createAndSave(r, overrides = {}) {
  // Mission starts at version 0; after _handleCreateMission calls save(),
  // the entity passed in has version 1 (incremented by #revision).
  // We simulate this by constructing with version 1 directly so the repo
  // treats it as a first insert.
  const m = new Mission({ ...makePayload(overrides), version: 1 });
  await r.save(m);
  return m;
}

before(async () => {
  try {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    conn = await mongoose.createConnection(uri, {
      serverSelectionTimeoutMS: 10_000
    }).asPromise();
    repo = new MongoMissionRepository(conn);
  } catch (err) {
    console.warn('[mongo-repo-test] MongoMemoryServer unavailable (binary not downloaded). Skipping all tests.', err.message);
    // conn/repo remain undefined; tests will skip via the beforeEach guard below
  }
});

after(async () => {
  if (conn) await conn.close();
  if (mongod) await mongod.stop();
});

beforeEach(async (t) => {
  if (!repo) { t.skip(); return; }
  await repo.clear();
});

// ─── 1. Create ────────────────────────────────────────────────────────────────

describe('1. Create', () => {

  it('saves a new Mission and returns the entity unchanged', async () => {
    const m = new Mission({ ...makePayload(), version: 1 });
    const saved = await repo.save(m);
    assert.equal(saved.missionId, m.missionId);
    assert.equal(saved.title, 'Flood Response Delta');
    assert.equal(saved.version, 1);
  });

  it('persists an entity that can be found by ID', async () => {
    const m = await createAndSave(repo);
    const found = await repo.findById(m.missionId);
    assert.ok(found, 'entity must be findable after save');
    assert.equal(found.missionId, m.missionId);
  });

  it('rejects save when missionId is absent', async () => {
    const badEntity = { missionId: null };
    await assert.rejects(() => repo.save(badEntity), /missionId is required/);
  });

});

// ─── 2. Read ──────────────────────────────────────────────────────────────────

describe('2. Read', () => {

  it('findById returns null for an unknown ID', async () => {
    const result = await repo.findById('msn_does_not_exist');
    assert.equal(result, null);
  });

  it('findById returns a fully rehydrated Mission instance', async () => {
    const m = await createAndSave(repo, { priority: 'CRITICAL' });
    const found = await repo.findById(m.missionId);

    // Must be a real Mission, not a plain object.
    assert.ok(found instanceof Mission, 'rehydrated value must be a Mission instance');
    assert.equal(found.priority, 'CRITICAL');
    assert.equal(found.status, 'DRAFT');
    assert.equal(found.version, 1);

    // Domain methods must work on the rehydrated entity.
    const activated = found.transitionTo('ACTIVE');
    assert.equal(activated.status, 'ACTIVE');
  });

  it('rehydrated entity preserves targetCriteria and metadata', async () => {
    const m = new Mission({
      ...makePayload({
        targetCriteria: { zone: 'Warri', maxHours: 12 },
        metadata: { ref: 'CMD-001' }
      }),
      version: 1
    });
    await repo.save(m);
    const found = await repo.findById(m.missionId);
    assert.deepEqual(found.targetCriteria, { zone: 'Warri', maxHours: 12 });
    assert.deepEqual(found.metadata, { ref: 'CMD-001' });
  });

  it('rehydrated entity preserves objectives array', async () => {
    const m = new Mission({
      ...makePayload(),
      objectives: [{ objectiveId: 'obj-1', description: 'Evacuate sector A', status: 'PENDING' }],
      version: 1
    });
    await repo.save(m);
    const found = await repo.findById(m.missionId);
    assert.equal(found.objectives.length, 1);
    assert.equal(found.objectives[0].objectiveId, 'obj-1');
    assert.equal(found.objectives[0].status, 'PENDING');
  });

  it('malformed document field causes rehydration to throw rather than silently corrupt', async () => {
    // Inject a document with an invalid status value directly to simulate DB corruption.
    const raw = repo._Mission;
    const id = 'msn_corrupted_test_001';
    await raw.create({
      _id: id, title: 'T', description: 'D', priority: 'LOW',
      targetCriteria: { x: 1 }, objectives: [], status: 'INVALID_STATUS',
      metadata: {}, createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), version: 1
    });
    await assert.rejects(
      () => repo.findById(id),
      /Invalid mission status/
    );
  });

});

// ─── 3. List ──────────────────────────────────────────────────────────────────

describe('3. List', () => {

  it('listAll returns all saved missions', async () => {
    await createAndSave(repo, { title: 'Alpha' });
    await createAndSave(repo, { title: 'Beta' });
    const all = await repo.listAll();
    assert.equal(all.length, 2);
  });

  it('findByStatus returns only matching missions', async () => {
    const draft = await createAndSave(repo, { title: 'Draft M' });
    // Simulate an ACTIVE mission by saving with status ACTIVE directly.
    const active = new Mission({ ...makePayload({ title: 'Active M' }), status: 'ACTIVE', version: 1 });
    await repo.save(active);

    const drafts = await repo.findByStatus('DRAFT');
    const actives = await repo.findByStatus('ACTIVE');
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].missionId, draft.missionId);
    assert.equal(actives.length, 1);
    assert.equal(actives[0].missionId, active.missionId);
  });

  it('findActive returns only ACTIVE missions', async () => {
    await createAndSave(repo, { title: 'Draft Only' });
    const active = new Mission({ ...makePayload({ title: 'Active One' }), status: 'ACTIVE', version: 1 });
    await repo.save(active);

    const result = await repo.findActive();
    assert.equal(result.length, 1);
    assert.equal(result[0].status, 'ACTIVE');
  });

  it('findByPriority returns only matching missions', async () => {
    await createAndSave(repo, { title: 'High', priority: 'HIGH' });
    await createAndSave(repo, { title: 'Critical', priority: 'CRITICAL' });

    const highs = await repo.findByPriority('HIGH');
    assert.equal(highs.length, 1);
    assert.equal(highs[0].priority, 'HIGH');
  });

  it('count returns the correct document count', async () => {
    assert.equal(await repo.count(), 0);
    await createAndSave(repo);
    await createAndSave(repo);
    assert.equal(await repo.count(), 2);
  });

});

// ─── 4. Update ────────────────────────────────────────────────────────────────

describe('4. Update (version-guarded)', () => {

  it('saves a mutated entity with incremented version', async () => {
    // First save: version 1
    const m = new Mission({ ...makePayload(), version: 1 });
    await repo.save(m);

    // Simulate domain mutation: version incremented by #revision
    const activated = new Mission({ ...m.toJSON(), status: 'ACTIVE', version: 2 });
    await repo.save(activated);

    const found = await repo.findById(m.missionId);
    assert.equal(found.status, 'ACTIVE');
    assert.equal(found.version, 2);
  });

  it('successive mutations each increment version', async () => {
    const m = new Mission({ ...makePayload(), version: 1 });
    await repo.save(m);

    const v2 = new Mission({ ...m.toJSON(), status: 'ACTIVE', version: 2 });
    await repo.save(v2);

    const v3 = new Mission({ ...v2.toJSON(), status: 'SUSPENDED', version: 3 });
    await repo.save(v3);

    const found = await repo.findById(m.missionId);
    assert.equal(found.status, 'SUSPENDED');
    assert.equal(found.version, 3);
  });

});

// ─── 5. Delete ────────────────────────────────────────────────────────────────

describe('5. Delete', () => {

  it('delete removes an existing mission', async () => {
    const m = await createAndSave(repo);
    const deleted = await repo.delete(m.missionId);
    assert.equal(deleted, true);
    assert.equal(await repo.findById(m.missionId), null);
  });

  it('delete returns false for a non-existent ID', async () => {
    const result = await repo.delete('msn_nonexistent');
    assert.equal(result, false);
  });

});

// ─── 6. Concurrency ───────────────────────────────────────────────────────────

describe('6. Optimistic concurrency', () => {

  it('concurrent modification throws MissionConcurrentModificationError', async () => {
    // Save first version
    const m = new Mission({ ...makePayload(), version: 1 });
    await repo.save(m);

    // Both readers get version 1
    const reader1 = await repo.findById(m.missionId); // version 1
    const reader2 = await repo.findById(m.missionId); // version 1

    // First writer succeeds: version 1 → 2
    const v2 = new Mission({ ...reader1.toJSON(), status: 'ACTIVE', version: 2 });
    await repo.save(v2);

    // Second writer uses stale version 1 → 2 but stored is already 2 → conflict
    const stale = new Mission({ ...reader2.toJSON(), status: 'SUSPENDED', version: 2 });
    await assert.rejects(
      () => repo.save(stale),
      MissionConcurrentModificationError
    );
  });

  it('MissionConcurrentModificationError carries the missionId and statusHint', async () => {
    const m = new Mission({ ...makePayload(), version: 1 });
    await repo.save(m);

    const v2 = new Mission({ ...m.toJSON(), status: 'ACTIVE', version: 2 });
    await repo.save(v2);

    const stale = new Mission({ ...m.toJSON(), status: 'ACTIVE', version: 2 });
    let caught;
    try {
      await repo.save(stale);
    } catch (e) {
      caught = e;
    }
    assert.ok(caught instanceof MissionConcurrentModificationError);
    assert.equal(caught.missionId, m.missionId);
    assert.equal(caught.statusHint, 409);
  });

  it('sequential updates succeed when using the latest version each time', async () => {
    const m = new Mission({ ...makePayload(), version: 1 });
    await repo.save(m);

    let current = await repo.findById(m.missionId);
    const activated = new Mission({ ...current.toJSON(), status: 'ACTIVE', version: current.version + 1 });
    await repo.save(activated);

    current = await repo.findById(m.missionId);
    assert.equal(current.status, 'ACTIVE');
    assert.equal(current.version, 2);

    const suspended = new Mission({ ...current.toJSON(), status: 'SUSPENDED', version: current.version + 1 });
    await repo.save(suspended);

    current = await repo.findById(m.missionId);
    assert.equal(current.status, 'SUSPENDED');
    assert.equal(current.version, 3);
  });

});

// ─── 7. Persistence across repository instances ───────────────────────────────

describe('7. Persistence across repository instances', () => {

  it('a second repository instance on the same connection sees saved data', async () => {
    const m = await createAndSave(repo);

    // New repo instance, same connection — simulates a process restart
    // where the connection is re-established to the same DB.
    const repo2 = new MongoMissionRepository(conn);
    const found = await repo2.findById(m.missionId);

    assert.ok(found, 'data must be visible to a second repository instance');
    assert.equal(found.missionId, m.missionId);
    assert.equal(found.title, 'Flood Response Delta');
  });

});
