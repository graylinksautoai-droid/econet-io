import test from 'node:test';
import assert from 'node:assert/strict';

import { Command } from '../../../contracts/commands/Command.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import {
  DigitalTwinEngine,
  DigitalTwinApplicationService,
  InMemoryDigitalTwinRepository,
  DigitalTwin,
  TwinModel,
  TwinState,
  SynchronizationRecord,
  TwinStatus,
  SynchronizationStatus,
  canTransitionTwinStatus,
  assertTwinStatusTransition,
  canSynchronizeTwin,
  evaluateFreshness,
  isOlderThanCurrent
} from '../index.js';

const command = (commandType, payload, suffix, actor = null) => new Command({
  commandType,
  targetEngine: '18-digital-twin',
  payload,
  actor: actor || { actorId: 'twin-manager-1', roles: ['twin_manager'] },
  idempotencyKey: `dtw-test-${suffix}`,
  correlationId: `cor-${suffix}`
});

const createFixture = (options = {}) => {
  const repository = new InMemoryDigitalTwinRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new DigitalTwinEngine({
    repository,
    eventBus,
    idempotencyManager,
    clock: () => new Date('2029-11-01T09:00:00.000Z'),
    ...options
  });
  return { engine, repository, eventBus, idempotencyManager };
};

test('TwinStatus enforces valid vocabulary and lifecycle transitions', () => {
  assert.equal(canTransitionTwinStatus(TwinStatus.DRAFT, TwinStatus.ACTIVE), true);
  assert.equal(canTransitionTwinStatus(TwinStatus.DRAFT, TwinStatus.RETIRED), true);
  assert.equal(canTransitionTwinStatus(TwinStatus.ACTIVE, TwinStatus.PAUSED), true);
  assert.equal(canTransitionTwinStatus(TwinStatus.ACTIVE, TwinStatus.STALE), true);
  assert.equal(canTransitionTwinStatus(TwinStatus.ACTIVE, TwinStatus.OUT_OF_SYNC), true);
  assert.equal(canTransitionTwinStatus(TwinStatus.ACTIVE, TwinStatus.RETIRED), true);
  assert.equal(canTransitionTwinStatus(TwinStatus.PAUSED, TwinStatus.ACTIVE), true);
  assert.equal(canTransitionTwinStatus(TwinStatus.STALE, TwinStatus.ACTIVE), true);
  assert.equal(canTransitionTwinStatus(TwinStatus.STALE, TwinStatus.OUT_OF_SYNC), true);
  assert.equal(canTransitionTwinStatus(TwinStatus.OUT_OF_SYNC, TwinStatus.ACTIVE), true);
  assert.equal(canTransitionTwinStatus(TwinStatus.RETIRED, TwinStatus.ACTIVE), false);
  assert.equal(canTransitionTwinStatus(TwinStatus.DRAFT, TwinStatus.PAUSED), false);
  assert.equal(canTransitionTwinStatus(TwinStatus.PAUSED, TwinStatus.OUT_OF_SYNC), false);
  assert.throws(() => assertTwinStatusTransition(TwinStatus.RETIRED, TwinStatus.ACTIVE), /Invalid twin lifecycle transition/);
  assert.equal(canSynchronizeTwin(TwinStatus.ACTIVE), true);
  assert.equal(canSynchronizeTwin(TwinStatus.STALE), true);
  assert.equal(canSynchronizeTwin(TwinStatus.OUT_OF_SYNC), true);
  assert.equal(canSynchronizeTwin(TwinStatus.DRAFT), false);
  assert.equal(canSynchronizeTwin(TwinStatus.PAUSED), false);
  assert.equal(canSynchronizeTwin(TwinStatus.RETIRED), false);
});

test('TwinStateService: evaluateFreshness and isOlderThanCurrent behave deterministically', () => {
  const fresh = evaluateFreshness('2029-11-01T09:00:00.000Z', '2029-11-01T09:00:00.000Z', 3600000);
  assert.equal(fresh.stale, false);
  assert.equal(fresh.synchronizationStatus, 'CURRENT');
  const stale = evaluateFreshness('2029-11-01T07:00:00.000Z', '2029-11-01T09:00:00.000Z', 3600000);
  assert.equal(stale.stale, true);
  assert.equal(stale.synchronizationStatus, 'STALE');
  const unknown = evaluateFreshness(null, '2029-11-01T09:00:00.000Z', 3600000);
  assert.equal(unknown.stale, true);
  assert.equal(unknown.synchronizationStatus, 'UNKNOWN');
  assert.equal(isOlderThanCurrent('2029-11-01T08:00:00.000Z', '2029-11-01T09:00:00.000Z', { policy: 'REJECT_OLDER_UPDATE' }), true);
  assert.equal(isOlderThanCurrent('2029-11-01T10:00:00.000Z', '2029-11-01T09:00:00.000Z', { policy: 'REJECT_OLDER_UPDATE' }), false);
  assert.equal(isOlderThanCurrent('2029-11-01T08:00:00.000Z', null), false);
});

test('DigitalTwin entity validates identity and lifecycle', () => {
  const twin = new DigitalTwin({ targetEntityId: 'river_basin_001', targetEntityType: 'river_basin', name: 'Basin Twin' });
  assert.match(twin.twinId, /^twn_/);
  assert.equal(twin.status, TwinStatus.DRAFT);
  assert.equal(Object.isFrozen(twin), true);
  const active = twin.transitionTo(TwinStatus.ACTIVE);
  assert.equal(active.status, TwinStatus.ACTIVE);
  const retired = active.transitionTo(TwinStatus.RETIRED);
  assert.equal(retired.status, TwinStatus.RETIRED);
  assert.ok(retired.retiredAt);
  assert.throws(() => new DigitalTwin({ targetEntityId: '', targetEntityType: 'x', name: 'n' }), /non-empty targetEntityId/);
  assert.throws(() => new DigitalTwin({ targetEntityId: 'x', targetEntityType: 'y', name: '' }), /non-empty name/);
  assert.throws(() => active.transitionTo(TwinStatus.DRAFT), /Invalid twin lifecycle transition/);
});

test('TwinModel entity validates model identity and property definitions', () => {
  const model = new TwinModel({
    twinId: 'twn_1',
    modelName: 'river-level-v1',
    modelVersion: '1.0',
    propertyDefinitions: { waterLevel: { type: 'number', units: 'm', min: 0, max: 20 } }
  });
  assert.match(model.modelId, /^mdl_/);
  assert.equal(model.declaresProperty('waterLevel'), true);
  assert.equal(model.declaresProperty('unknown'), false);
  assert.throws(() => new TwinModel({ twinId: '', modelName: 'm', modelVersion: '1' }), /non-empty twinId/);
  assert.throws(() => new TwinModel({ twinId: 't', modelName: '', modelVersion: '1' }), /non-empty modelName/);
  assert.throws(() => new TwinModel({ twinId: 't', modelName: 'm', modelVersion: '' }), /non-empty modelVersion/);
});

test('TwinState entity validates version, timestamps, and provenance', () => {
  const state = new TwinState({
    twinId: 'twn_1',
    stateVersion: 1,
    observedAt: '2029-11-01T08:00:00.000Z',
    acceptedAt: '2029-11-01T09:00:00.000Z',
    modelVersion: '1.0',
    properties: { waterLevel: 1.5 },
    sourceReferences: [{ source: { observationId: 'obs-1' } }]
  });
  assert.match(state.stateId, /^stt_/);
  assert.equal(state.stateVersion, 1);
  assert.equal(state.properties.waterLevel, 1.5);
  assert.equal(Object.isFrozen(state), true);

  assert.throws(() => new TwinState({ twinId: '', stateVersion: 1, observedAt: '2029-11-01T08:00:00.000Z', acceptedAt: '2029-11-01T09:00:00.000Z', modelVersion: '1', properties: {} }), /non-empty twinId/);
  assert.throws(() => new TwinState({ twinId: 't', stateVersion: 0, observedAt: '2029-11-01T08:00:00.000Z', acceptedAt: '2029-11-01T09:00:00.000Z', modelVersion: '1', properties: {} }), /stateVersion/);
  assert.throws(() => new TwinState({ twinId: 't', stateVersion: 1, observedAt: 'not-a-date', acceptedAt: '2029-11-01T09:00:00.000Z', modelVersion: '1', properties: {} }), /observedAt/);
  assert.throws(() => new TwinState({ twinId: 't', stateVersion: 1, observedAt: '2029-11-01T08:00:00.000Z', acceptedAt: 'not-a-date', modelVersion: '1', properties: {} }), /acceptedAt/);
  assert.throws(() => new TwinState({ twinId: 't', stateVersion: 1, observedAt: '2029-11-01T08:00:00.000Z', acceptedAt: '2029-11-01T09:00:00.000Z', modelVersion: '', properties: {} }), /modelVersion/);
  assert.throws(() => new TwinState({ twinId: 't', stateVersion: 1, observedAt: '2029-11-01T08:00:00.000Z', acceptedAt: '2029-11-01T09:00:00.000Z', modelVersion: '1', properties: [] }), /properties must be an object/);
});

test('SynchronizationRecord entity validates required fields', () => {
  const record = new SynchronizationRecord({
    twinId: 'twn_1',
    startedAt: '2029-11-01T09:00:00.000Z',
    completedAt: '2029-11-01T09:00:01.000Z',
    status: 'SYNCHRONIZED',
    previousStateVersion: 1,
    resultingStateVersion: 2,
    acceptedChanges: 2,
    rejectedChanges: 0
  });
  assert.match(record.recordId, /^syn_/);
  assert.equal(record.status, 'SYNCHRONIZED');
  assert.equal(Object.isFrozen(record), true);

  assert.throws(() => new SynchronizationRecord({ twinId: '', startedAt: '2029-11-01T09:00:00.000Z' }), /non-empty twinId/);
  assert.throws(() => new SynchronizationRecord({ twinId: 't', startedAt: 'not-a-date' }), /startedAt/);
});


test('RegisterDigitalTwin creates a draft twin with provenance and event', async () => {
  const { engine, repository, eventBus } = createFixture();

  const res = await engine.executeCommand(command('RegisterDigitalTwin', {
    targetEntityId: 'river_basin_001',
    targetEntityType: 'river_basin',
    name: 'River Basin 001 Twin'
  }, 'reg-1'));

  assert.match(res.twin.twinId, /^twn_/);
  assert.equal(res.twin.status, TwinStatus.DRAFT);
  assert.equal(res.twin.targetEntityId, 'river_basin_001');
  assert.equal(res.twin.createdBy, 'twin-manager-1');
  assert.equal(await repository.countTwins(), 1);

  const events = eventBus.getHistory({ eventType: 'econet.digital_twin.registered' });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.18.digital-twin');
  assert.equal(events[0].subject.entityType, 'digital_twin');
});

test('RegisterDigitalTwin rejects invalid input and unauthorized actors', async () => {
  const { engine, repository, eventBus } = createFixture();

  await assert.rejects(
    engine.executeCommand(command('RegisterDigitalTwin', {
      targetEntityType: 'river_basin', name: 'X'
    }, 'reg-invalid-1')),
    /non-empty targetEntityId/
  );

  await assert.rejects(
    engine.executeCommand(command('RegisterDigitalTwin', {
      targetEntityId: 'river_basin_002', targetEntityType: 'river_basin', name: 'Y'
    }, 'reg-unauth', { actorId: 'observer-1', roles: ['observer'] })),
    /lacks an authorized twin role/
  );

  assert.equal(await repository.countTwins(), 0);
  assert.equal(eventBus.getHistory().length, 0);
});

test('RegisterDigitalTwin is idempotent at command level', async () => {
  const { engine, repository } = createFixture();

  const cmd = command('RegisterDigitalTwin', {
    targetEntityId: 'wetland_004', targetEntityType: 'wetland', name: 'Wetland Twin'
  }, 'reg-idem');

  const first = await engine.executeCommand(cmd);
  const second = await engine.executeCommand(cmd);

  assert.equal(first.twin.twinId, second.twin.twinId);
  assert.equal(await repository.countTwins(), 1);
});

test('Twin lifecycle commands enforce valid transitions only', async () => {
  const { engine } = createFixture();

  const res = await engine.executeCommand(command('RegisterDigitalTwin', {
    targetEntityId: 'forest_002', targetEntityType: 'forest', name: 'Forest Twin'
  }, 'lc-1'));
  const twinId = res.twin.twinId;

  const activated = await engine.executeCommand(command('ActivateDigitalTwin', { twinId }, 'lc-2'));
  assert.equal(activated.twin.status, TwinStatus.ACTIVE);

  const paused = await engine.executeCommand(command('PauseDigitalTwin', { twinId }, 'lc-3'));
  assert.equal(paused.twin.status, TwinStatus.PAUSED);

  const resumed = await engine.executeCommand(command('ResumeDigitalTwin', { twinId }, 'lc-4'));
  assert.equal(resumed.twin.status, TwinStatus.ACTIVE);

  const outOfSync = await engine.executeCommand(command('MarkTwinOutOfSync', { twinId }, 'lc-5'));
  assert.equal(outOfSync.twin.status, TwinStatus.OUT_OF_SYNC);

  const restored = await engine.executeCommand(command('ResumeDigitalTwin', { twinId }, 'lc-6'));
  assert.equal(restored.twin.status, TwinStatus.ACTIVE);

  const retired = await engine.executeCommand(command('RetireDigitalTwin', { twinId }, 'lc-7'));
  assert.equal(retired.twin.status, TwinStatus.RETIRED);
  assert.ok(retired.twin.retiredAt);

  await assert.rejects(
    engine.executeCommand(command('ActivateDigitalTwin', { twinId }, 'lc-8')),
    /Invalid twin lifecycle transition/
  );
  await assert.rejects(
    engine.executeCommand(command('PauseDigitalTwin', { twinId }, 'lc-9')),
    /Invalid twin lifecycle transition/
  );
});

test('RegisterTwinModel registers a model and emits model_registered event', async () => {
  const { engine, eventBus } = createFixture();

  const reg = await engine.executeCommand(command('RegisterDigitalTwin', {
    targetEntityId: 'river_basin_003', targetEntityType: 'river_basin', name: 'Basin 003'
  }, 'mdl-0'));
  const twinId = reg.twin.twinId;

  const res = await engine.executeCommand(command('RegisterTwinModel', {
    twinId,
    modelName: 'river-level-v1',
    modelVersion: '1.0',
    propertyDefinitions: {
      waterLevel: { type: 'number', units: 'm', min: 0, max: 20 },
      temperature: { type: 'number', units: 'C', min: -10, max: 50 }
    }
  }, 'mdl-1'));

  assert.match(res.model.modelId, /^mdl_/);
  assert.equal(res.model.twinId, twinId);
  assert.equal(res.twin.modelVersion, '1.0', 'twin is attached to model version');

  const events = eventBus.getHistory({ eventType: 'econet.digital_twin.model_registered' });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.18.digital-twin');
});

test('RegisterTwinModel rejects duplicate version, unknown twin, and unauthorized actor', async () => {
  const { engine, eventBus } = createFixture();

  const reg = await engine.executeCommand(command('RegisterDigitalTwin', {
    targetEntityId: 'landfill_002', targetEntityType: 'landfill', name: 'Landfill Twin'
  }, 'mdl-bad-0'));
  const twinId = reg.twin.twinId;

  await engine.executeCommand(command('RegisterTwinModel', {
    twinId, modelName: 'm1', modelVersion: '1.0', propertyDefinitions: { a: { type: 'number' } }
  }, 'mdl-bad-1'));

  await assert.rejects(
    engine.executeCommand(command('RegisterTwinModel', {
      twinId, modelName: 'm1', modelVersion: '1.0', propertyDefinitions: { a: { type: 'number' } }
    }, 'mdl-bad-2')),
    /already registered/
  );

  await assert.rejects(
    engine.executeCommand(command('RegisterTwinModel', {
      twinId: 'twn_missing', modelName: 'm', modelVersion: '2.0', propertyDefinitions: {}
    }, 'mdl-bad-3')),
    /DigitalTwin not found/
  );

  await assert.rejects(
    engine.executeCommand(command('RegisterTwinModel', {
      twinId, modelName: 'm2', modelVersion: '2.0', propertyDefinitions: {}
    }, 'mdl-bad-4', { actorId: 'viewer-1', roles: ['viewer'] })),
    /lacks an authorized twin role/
  );

  assert.equal(eventBus.getHistory({ eventType: 'econet.digital_twin.model_registered' }).length, 1);
});

test('SynchronizeTwin applies a valid model-validated state with provenance', async () => {
  const { engine, repository, eventBus } = createFixture();

  const reg = await engine.executeCommand(command('RegisterDigitalTwin', {
    targetEntityId: 'river_basin_004', targetEntityType: 'river_basin', name: 'Basin 004'
  }, 'sync-0'));
  const twinId = reg.twin.twinId;
  await engine.executeCommand(command('RegisterTwinModel', {
    twinId, modelName: 'river-model', modelVersion: '1.0',
    propertyDefinitions: { waterLevel: { type: 'number', units: 'm', min: 0, max: 20 } }
  }, 'sync-1'));
  await engine.executeCommand(command('ActivateDigitalTwin', { twinId }, 'sync-1b'));

  const res = await engine.executeCommand(command('SynchronizeTwin', {
    twinId,
    modelVersion: '1.0',
    observedAt: '2029-11-01T08:30:00.000Z',
    properties: { waterLevel: 2.5 },
    sourceReference: { engine: '02-observation', observationId: 'obs-100' }
  }, 'sync-2'));
  assert.equal(res.stateVersion, 1);
  assert.equal(res.state.properties.waterLevel, 2.5);
  assert.equal(res.state.sourceReferences.length, 1);
  assert.equal(res.state.createdBy, 'twin-manager-1');

  const current = await engine.getTwinState(twinId);
  assert.equal(current.stateVersion, 1);
  const history = await engine.getTwinStateHistory(twinId);
  assert.equal(history.length, 1);

  const syncHistory = await engine.getSynchronizationHistory(twinId);
  assert.equal(syncHistory.length, 1);
  assert.equal(syncHistory[0].status, 'SYNCHRONIZED');
  const syncEvents = eventBus.getHistory({ eventType: 'econet.digital_twin.synchronized' });
  assert.equal(syncEvents.length, 1);
  assert.equal(syncEvents[0].producer, 'engine.18.digital-twin');
  assert.equal(syncEvents[0].correlationId, 'cor-sync-2');
});

test('SynchronizeTwin preserves state history across multiple syncs', async () => {
  const { engine } = createFixture();

  const reg = await engine.executeCommand(command('RegisterDigitalTwin', {
    targetEntityId: 'river_basin_005', targetEntityType: 'river_basin', name: 'Basin 005'
  }, 'hist-0'));
  const twinId = reg.twin.twinId;
  await engine.executeCommand(command('RegisterTwinModel', {
    twinId, modelName: 'm', modelVersion: '1.0',
    propertyDefinitions: { waterLevel: { type: 'number', units: 'm', min: 0, max: 20 } }
  }, 'hist-1'));
  await engine.executeCommand(command('ActivateDigitalTwin', { twinId }, 'hist-1b'));

  await engine.executeCommand(command('SynchronizeTwin', {
    twinId, modelVersion: '1.0', observedAt: '2029-11-01T08:00:00.000Z', properties: { waterLevel: 1.0 }
  }, 'hist-2'));
  await engine.executeCommand(command('SynchronizeTwin', {
    twinId, modelVersion: '1.0', observedAt: '2029-11-01T08:15:00.000Z', properties: { waterLevel: 1.5 }
  }, 'hist-3'));
  await engine.executeCommand(command('SynchronizeTwin', {
    twinId, modelVersion: '1.0', observedAt: '2029-11-01T08:30:00.000Z', properties: { waterLevel: 2.0 }
  }, 'hist-4'));

  const history = await engine.getTwinStateHistory(twinId);
  assert.equal(history.length, 3);
  assert.deepEqual(history.map(s => s.stateVersion), [1, 2, 3]);
  assert.deepEqual(history.map(s => s.properties.waterLevel), [1.0, 1.5, 2.0]);
  const current = await engine.getTwinState(twinId);
  assert.equal(current.stateVersion, 3);
});

test('SynchronizeTwin rejects unknown properties without state mutation', async () => {
  const { engine, eventBus } = createFixture();

  const reg = await engine.executeCommand(command('RegisterDigitalTwin', {
    targetEntityId: 'river_basin_006', targetEntityType: 'river_basin', name: 'Basin 006'
  }, 'up-0'));
  const twinId = reg.twin.twinId;
  await engine.executeCommand(command('RegisterTwinModel', {
    twinId, modelName: 'm', modelVersion: '1.0',
    propertyDefinitions: { waterLevel: { type: 'number', units: 'm', min: 0, max: 20 } }
  }, 'up-1'));
  await engine.executeCommand(command('ActivateDigitalTwin', { twinId }, 'up-1b'));

  const res = await engine.executeCommand(command('SynchronizeTwin', {
    twinId, modelVersion: '1.0', observedAt: '2029-11-01T08:00:00.000Z',
    properties: { waterLevel: 1.0, pollutantLevel: 99 }
  }, 'up-2'));

  assert.equal(res.synchronized, false);
  assert.equal(res.rejectedChanges.length, 1);
  assert.match(res.rejectedChanges[0].reason, /UNKNOWN_PROPERTY/);

  assert.equal(await engine.getTwinState(twinId), null);
  assert.equal(eventBus.getHistory({ eventType: 'econet.digital_twin.synchronized' }).length, 0);
  assert.equal(eventBus.getHistory({ eventType: 'econet.digital_twin.synchronization_rejected' }).length, 1);
  const syncHistory = await engine.getSynchronizationHistory(twinId);
  assert.equal(syncHistory[0].status, 'REJECTED');
});

test('SynchronizeTwin rejects out-of-range and invalid-unit values', async () => {
  const { engine, eventBus } = createFixture();

  const reg = await engine.executeCommand(command('RegisterDigitalTwin', {
    targetEntityId: 'river_basin_007', targetEntityType: 'river_basin', name: 'Basin 007'
  }, 'rng-0'));
  const twinId = reg.twin.twinId;
  await engine.executeCommand(command('RegisterTwinModel', {
    twinId, modelName: 'm', modelVersion: '1.0',
    propertyDefinitions: { waterLevel: { type: 'number', units: 'm', min: 0, max: 20 } }
  }, 'rng-1'));
  await engine.executeCommand(command('ActivateDigitalTwin', { twinId }, 'rng-1b'));

  const out = await engine.executeCommand(command('SynchronizeTwin', {
    twinId, modelVersion: '1.0', observedAt: '2029-11-01T08:00:00.000Z', properties: { waterLevel: 500 }
  }, 'rng-2'));
  assert.equal(out.synchronized, false);
  assert.match(out.rejectedChanges[0].reason, /OUT_OF_RANGE/);

  const badUnit = await engine.executeCommand(command('SynchronizeTwin', {
    twinId, modelVersion: '1.0', observedAt: '2029-11-01T08:00:00.000Z', properties: { waterLevel: 'high' }
  }, 'rng-3'));
  assert.equal(badUnit.synchronized, false);
  assert.equal(badUnit.rejectedChanges.length, 1);

  assert.equal(await engine.getTwinState(twinId), null);
  assert.equal(eventBus.getHistory({ eventType: 'econet.digital_twin.synchronized' }).length, 0);
});

test('SynchronizeTwin rejects an older update than current state', async () => {
  const { engine, eventBus } = createFixture();

  const reg = await engine.executeCommand(command('RegisterDigitalTwin', {
    targetEntityId: 'river_basin_008', targetEntityType: 'river_basin', name: 'Basin 008'
  }, 'old-0'));
  const twinId = reg.twin.twinId;
  await engine.executeCommand(command('RegisterTwinModel', {
    twinId, modelName: 'm', modelVersion: '1.0',
    propertyDefinitions: { waterLevel: { type: 'number', units: 'm', min: 0, max: 20 } }
  }, 'old-1'));
  await engine.executeCommand(command('ActivateDigitalTwin', { twinId }, 'old-1b'));

  await engine.executeCommand(command('SynchronizeTwin', {
    twinId, modelVersion: '1.0', observedAt: '2029-11-01T09:00:00.000Z', properties: { waterLevel: 2.0 }
  }, 'old-2'));

  const older = await engine.executeCommand(command('SynchronizeTwin', {
    twinId, modelVersion: '1.0', observedAt: '2029-11-01T08:00:00.000Z', properties: { waterLevel: 0.5 }
  }, 'old-3'));

  assert.equal(older.synchronized, false);
  assert.match(older.rejectedChanges[0].reason, /OLDER_UPDATE_REJECTED/);

  const current = await engine.getTwinState(twinId);
  assert.equal(current.stateVersion, 1);
  assert.equal(current.properties.waterLevel, 2.0);
  const history = await engine.getTwinStateHistory(twinId);
  assert.equal(history.length, 1);
  assert.equal(eventBus.getHistory({ eventType: 'econet.digital_twin.synchronized' }).length, 1);
});


test('Unauthorized actors are denied on all mutating commands', async () => {
  const { engine, repository, eventBus } = createFixture();

  const reg = await engine.executeCommand(command('RegisterDigitalTwin', {
    targetEntityId: 'river_basin_010', targetEntityType: 'river_basin', name: 'Basin 010'
  }, 'auth-0'));
  const twinId = reg.twin.twinId;
  await engine.executeCommand(command('ActivateDigitalTwin', { twinId }, 'auth-0b'));

  const unauthorized = { actorId: 'sneaky-1', roles: ['observer'] };
  const cmds = [
    command('RegisterDigitalTwin', { targetEntityId: 'x', targetEntityType: 'y', name: 'z' }, 'auth-r', unauthorized),
    command('ActivateDigitalTwin', { twinId }, 'auth-a', unauthorized),
    command('PauseDigitalTwin', { twinId }, 'auth-p', unauthorized),
    command('ResumeDigitalTwin', { twinId }, 'auth-rs', unauthorized),
    command('RetireDigitalTwin', { twinId }, 'auth-rt', unauthorized),
    command('MarkTwinOutOfSync', { twinId }, 'auth-oos', unauthorized),
    command('RegisterTwinModel', { twinId, modelName: 'm', modelVersion: '1.0', propertyDefinitions: {} }, 'auth-m', unauthorized),
    command('SynchronizeTwin', { twinId, modelVersion: '1.0', observedAt: '2029-11-01T08:00:00.000Z', properties: {} }, 'auth-s', unauthorized)
  ];

  for (const cmd of cmds) {
    await assert.rejects(engine.executeCommand(cmd), /lacks an authorized twin role/);
  }

  assert.equal(await repository.countTwins(), 1);
  assert.equal(await repository.getCurrentState(twinId), null);
  const allEvents = eventBus.getHistory();
  assert.equal(allEvents.filter(e => e.eventType === 'econet.digital_twin.registered').length, 1);
  assert.equal(allEvents.filter(e => e.eventType === 'econet.digital_twin.state_changed').length, 1, 'only the legit activation');
  assert.equal(allEvents.filter(e => e.eventType === 'econet.digital_twin.synchronized').length, 0);
  assert.equal(allEvents.filter(e => e.eventType === 'econet.digital_twin.model_registered').length, 0);
});

test('Governance denial blocks mutation before any state change or event', async () => {
  const repository = new InMemoryDigitalTwinRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new DigitalTwinApplicationService({
    repository,
    eventBus,
    idempotencyManager,
    governance: {
      async evaluatePolicy({ commandType }) {
        if (commandType === 'RegisterDigitalTwin') {
          return { allowed: false, reason: 'TWIN_REGISTRATION_FROZEN' };
        }
        return { allowed: true };
      }
    }
  });

  await assert.rejects(
    engine.execute(command('RegisterDigitalTwin', {
      targetEntityId: 'river_basin_011', targetEntityType: 'river_basin', name: 'Blocked'
    }, 'gov-1')),
    /Governance policy denial: TWIN_REGISTRATION_FROZEN/
  );

  assert.equal(await repository.countTwins(), 0);
  assert.equal(eventBus.getHistory().length, 0);
});

test('SynchronizeTwin is rejected for paused and retired twins', async () => {
  const { engine } = createFixture();

  const reg = await engine.executeCommand(command('RegisterDigitalTwin', {
    targetEntityId: 'river_basin_012', targetEntityType: 'river_basin', name: 'Basin 012'
  }, 'pa-0'));
  const twinId = reg.twin.twinId;
  await engine.executeCommand(command('RegisterTwinModel', {
    twinId, modelName: 'm', modelVersion: '1.0', propertyDefinitions: {}
  }, 'pa-1'));
  await engine.executeCommand(command('ActivateDigitalTwin', { twinId }, 'pa-2'));
  await engine.executeCommand(command('PauseDigitalTwin', { twinId }, 'pa-3'));

  await assert.rejects(
    engine.executeCommand(command('SynchronizeTwin', {
      twinId, modelVersion: '1.0', observedAt: '2029-11-01T08:00:00.000Z', properties: {}
    }, 'pa-4')),
    /Synchronization is not permitted while twin is PAUSED/
  );

  const reg2 = await engine.executeCommand(command('RegisterDigitalTwin', {
    targetEntityId: 'river_basin_013', targetEntityType: 'river_basin', name: 'Basin 013'
  }, 'pa-6'));
  await engine.executeCommand(command('RegisterTwinModel', {
    twinId: reg2.twin.twinId, modelName: 'm', modelVersion: '1.0', propertyDefinitions: {}
  }, 'pa-7'));
  await engine.executeCommand(command('ActivateDigitalTwin', { twinId: reg2.twin.twinId }, 'pa-8'));
  await engine.executeCommand(command('RetireDigitalTwin', { twinId: reg2.twin.twinId }, 'pa-9'));

  await assert.rejects(
    engine.executeCommand(command('SynchronizeTwin', {
      twinId: reg2.twin.twinId, modelVersion: '1.0', observedAt: '2029-11-01T08:00:00.000Z', properties: {}
    }, 'pa-10')),
    /Synchronization is not permitted while twin is RETIRED/
  );
});


test('Queries return correct records and handle unknown IDs', async () => {
  const { engine } = createFixture();

  const reg = await engine.executeCommand(command('RegisterDigitalTwin', {
    targetEntityId: 'river_basin_014', targetEntityType: 'river_basin', name: 'Basin 014'
  }, 'q-0'));
  const twinId = reg.twin.twinId;
  await engine.executeCommand(command('RegisterTwinModel', {
    twinId, modelName: 'm', modelVersion: '1.0',
    propertyDefinitions: { waterLevel: { type: 'number', units: 'm', min: 0, max: 20 } }
  }, 'q-1'));

  const twin = await engine.getDigitalTwin(twinId);
  assert.equal(twin.twinId, twinId);
  assert.equal(twin.status, TwinStatus.DRAFT);
  assert.equal(await engine.getDigitalTwin('twn_missing'), null);

  const list = await engine.listDigitalTwins();
  assert.equal(list.length, 1);
  assert.equal((await engine.listDigitalTwins({ status: TwinStatus.DRAFT })).length, 1);
  assert.equal((await engine.listDigitalTwins({ status: TwinStatus.ACTIVE })).length, 0);

  assert.equal((await engine.getTwinsByTargetEntity('river_basin_014')).length, 1);
  assert.equal((await engine.getTwinsByTargetEntity('nope')).length, 0);

  assert.equal(await engine.getTwinModel('mdl_missing'), null);
  assert.equal(await engine.getTwinState(twinId), null);
  assert.deepEqual(await engine.getTwinStateHistory(twinId), []);

  const syncStatus = await engine.getSynchronizationStatus(twinId);
  assert.equal(syncStatus.twinStatus, TwinStatus.DRAFT);
  assert.equal(syncStatus.syncStatus, 'UNKNOWN');
  assert.equal((await engine.getSynchronizationHistory(twinId)).length, 0);
});

test('Repository isolation: Engine 18 does not leak state between engine instances', async () => {
  const repoA = new InMemoryDigitalTwinRepository();
  const repoB = new InMemoryDigitalTwinRepository();
  const engineA = new DigitalTwinEngine({ repository: repoA });
  const engineB = new DigitalTwinEngine({ repository: repoB });

  await engineA.executeCommand(command('RegisterDigitalTwin', {
    targetEntityId: 'a', targetEntityType: 'river', name: 'A'
  }, 'iso-a'));

  assert.equal(await repoA.countTwins(), 1);
  assert.equal(await repoB.countTwins(), 0, 'no cross-engine state leak');
});

test('DigitalTwinEngine exposes the canonical lifecycle contract', async () => {
  const { engine, repository } = createFixture();

  assert.equal(engine.engineId, '18');
  assert.equal(engine.engineName, 'Digital Twin Engine');

  const init = await engine.initialize();
  assert.equal(init.ready, true);

  const health = await engine.healthCheck();
  assert.equal(health.healthy, true);
  assert.equal(health.details.status, 'READY');
  assert.equal(health.details.persistence, 'IN_MEMORY_DIGITAL_TWIN_ADAPTER');
  assert.equal(health.details.totalTwins, 0);

  await engine.shutdown();
  assert.equal(await repository.countTwins(), 0);
});

