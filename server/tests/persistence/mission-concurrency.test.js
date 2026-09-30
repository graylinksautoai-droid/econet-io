/**
 * Mission entity — optimistic concurrency (version field) tests
 *
 * These are pure domain tests that use the in-memory repository.
 * They verify that:
 *   - version is 0 on a freshly constructed Mission
 *   - every #revision call increments version by 1
 *   - toJSON includes version
 *   - new Mission({...toJSON()}) round-trips version correctly
 *   - invalid version values are rejected by the constructor
 *
 * A separate test (mongo-mission-repository.test.js §6) verifies that
 * the MongoDB adapter enforces the version guard with a real DB.
 *
 * Run: node --test server/tests/persistence/mission-concurrency.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Mission } from '../../../engines/11-mission/domain/entities/Mission.js';
import { InMemoryMissionRepository } from '../../../engines/11-mission/infrastructure/repositories/InMemoryMissionRepository.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import { MissionEngine } from '../../../engines/11-mission/index.js';

const BASE = {
  title: 'Version Test Mission',
  description: 'Testing optimistic concurrency.',
  priority: 'HIGH',
  targetCriteria: { region: 'test', type: 'unit' }
};

// ─── 1. Version field on the entity ─────────────────────────────────────────

describe('1. Mission entity version field', () => {

  it('new Mission has version 0 by default', () => {
    const m = new Mission(BASE);
    assert.equal(m.version, 0);
  });

  it('transitionTo increments version', () => {
    const m = new Mission({ ...BASE, status: 'DRAFT' });
    const activated = m.transitionTo('ACTIVE');
    assert.equal(activated.version, 1);
    assert.equal(m.version, 0, 'original entity must be unchanged (immutable)');
  });

  it('each successive mutation increments version independently', () => {
    const draft = new Mission(BASE);              // v0
    const active    = draft.transitionTo('ACTIVE');    // v1
    const suspended = active.transitionTo('SUSPENDED'); // v2
    const resumed   = suspended.transitionTo('ACTIVE'); // v3

    assert.equal(draft.version, 0);
    assert.equal(active.version, 1);
    assert.equal(suspended.version, 2);
    assert.equal(resumed.version, 3);
  });

  it('addObjective increments version', () => {
    const m = new Mission(BASE);
    const updated = m.addObjective({ objectiveId: 'obj-1', description: 'Do X' });
    assert.equal(updated.version, 1);
  });

  it('version is included in toJSON()', () => {
    const m = new Mission({ ...BASE, version: 5 });
    const json = m.toJSON();
    assert.equal(json.version, 5);
  });

  it('new Mission from toJSON() round-trips version correctly', () => {
    const m = new Mission({ ...BASE, version: 3 });
    const json = m.toJSON();
    const m2 = new Mission(json);
    assert.equal(m2.version, 3);
  });

  it('version must be a non-negative integer', () => {
    assert.throws(() => new Mission({ ...BASE, version: -1 }), /non-negative integer/);
    assert.throws(() => new Mission({ ...BASE, version: 1.5 }), /non-negative integer/);
    assert.throws(() => new Mission({ ...BASE, version: 'a' }), /non-negative integer/);
  });

  it('version 0 is accepted (default for new entities)', () => {
    assert.doesNotThrow(() => new Mission({ ...BASE, version: 0 }));
  });

});

// ─── 2. In-memory repository ignores version (no guard) ──────────────────────

describe('2. In-memory repository accepts any version', () => {

  it('save with version 2 overwrites version 1 without error (last-write-wins)', async () => {
    const repo = new InMemoryMissionRepository();

    const v1 = new Mission({ ...BASE, version: 1 });
    await repo.save(v1);

    const v2 = new Mission({ ...v1.toJSON(), status: 'ACTIVE', version: 2 });
    await repo.save(v2);

    const found = await repo.findById(v1.missionId);
    assert.equal(found.status, 'ACTIVE');
    assert.equal(found.version, 2);
  });

  it('stale-version save is also accepted (no guard in in-memory adapter)', async () => {
    const repo = new InMemoryMissionRepository();

    const v1 = new Mission({ ...BASE, version: 1 });
    await repo.save(v1);

    const v2 = new Mission({ ...v1.toJSON(), status: 'ACTIVE', version: 2 });
    await repo.save(v2);

    // Stale write using version 2 again — in-memory silently overwrites
    const stale = new Mission({ ...v1.toJSON(), status: 'SUSPENDED', version: 2 });
    await assert.doesNotReject(() => repo.save(stale),
      'in-memory adapter does not enforce version guards (last-write-wins)');
  });

});

// ─── 3. Engine integration — version survives command round-trip ──────────────

describe('3. Engine command round-trip preserves version', () => {

  it('CreateMission produces an entity with version 1', async () => {
    const engine = new MissionEngine({
      repository: new InMemoryMissionRepository(),
      eventBus: new EventBus(),
      idempotencyManager: new IdempotencyManager()
    });
    await engine.initialize();

    const { mission } = await engine.executeCommand({
      commandType: 'CreateMission',
      targetEngine: '11-mission',
      idempotencyKey: 'v-test-create-1',
      actor: { actorId: 'sys', roles: ['system'] },
      payload: { ...BASE }
    });

    assert.equal(mission.version, 1,
      'CreateMission entity must have version 1 after first save');
  });

  it('ActivateMission produces version 2', async () => {
    const repo = new InMemoryMissionRepository();
    const engine = new MissionEngine({
      repository: repo,
      eventBus: new EventBus(),
      idempotencyManager: new IdempotencyManager()
    });
    await engine.initialize();

    const { mission: created } = await engine.executeCommand({
      commandType: 'CreateMission',
      targetEngine: '11-mission',
      idempotencyKey: 'v-test-create-2',
      actor: { actorId: 'sys', roles: ['system'] },
      payload: { ...BASE }
    });

    const { mission: activated } = await engine.executeCommand({
      commandType: 'ActivateMission',
      targetEngine: '11-mission',
      idempotencyKey: 'v-test-activate-2',
      actor: { actorId: 'sys', roles: ['system'] },
      payload: { missionId: created.missionId }
    });

    assert.equal(activated.version, 2,
      'ActivateMission entity must have version 2');
  });

});
