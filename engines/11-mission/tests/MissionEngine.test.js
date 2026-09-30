import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from '../../../contracts/commands/Command.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import {
  MissionEngine,
  MissionApplicationService,
  InMemoryMissionRepository,
  Mission,
  MissionStatus,
  MissionPriority,
  ObjectiveStatus,
  MISSION_CREATED,
  MISSION_STATUS_CHANGED,
  OBJECTIVE_STATUS_CHANGED,
  canTransitionMissionStatus,
  canTransitionObjectiveStatus
} from '../index.js';

const command = (commandType, payload, suffix, actor = null) => new Command({
  commandType,
  targetEngine: '11-mission',
  payload,
  actor: actor || { actorId: 'mission-lead-1', roles: ['mission_lead'] },
  idempotencyKey: `mission-test-${suffix}`,
  correlationId: `cor-mission-${suffix}`
});

const createFixture = () => {
  const repository = new InMemoryMissionRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new MissionEngine({
    repository,
    eventBus,
    idempotencyManager,
    clock: () => new Date('2030-02-01T00:00:00.000Z')
  });
  return { engine, repository, eventBus, idempotencyManager };
};

const samplePayload = (overrides = {}) => ({
  title: 'Evacuate Ihiala Basin',
  description: 'Coordinate field responder evacuation ahead of predicted flood peak.',
  priority: MissionPriority.HIGH,
  targetCriteria: {
    completionThreshold: 'ALL_OBJECTIVES_TERMINAL',
    affectedZone: 'Ihiala Basin, Anambra State',
    maxResponseHours: 24
  },
  metadata: { requestedBy: 'regional-command' },
  ...overrides
});

const objectivesFor = (...statuses) => statuses.map((status, index) => ({
  objectiveId: `obj-${index + 1}`,
  description: `Objective ${index + 1}`,
  status
}));

test('Mission creation validates required fields and normalizes priority', () => {
  const mission = new Mission(samplePayload());
  assert.match(mission.missionId, /^msn_[0-9a-f]{32}$/);
  assert.equal(mission.status, MissionStatus.DRAFT);
  assert.equal(mission.priority, MissionPriority.HIGH);
  assert.deepEqual(mission.objectives, []);
  assert.equal(Object.isFrozen(mission), true);
  assert.equal(Object.isFrozen(mission.targetCriteria), true);

  assert.equal(new Mission(samplePayload({ priority: 'critical' })).priority, MissionPriority.CRITICAL);
  assert.throws(() => new Mission(samplePayload({ title: '   ' })), /non-empty title/);
  assert.throws(() => new Mission(samplePayload({ description: '' })), /non-empty description/);
  assert.throws(() => new Mission(samplePayload({ priority: 'URGENT' })), /Invalid mission priority/);
  assert.throws(() => new Mission(samplePayload({ targetCriteria: null })), /targetCriteria object/);
  assert.throws(() => new Mission(samplePayload({ targetCriteria: {} })), /targetCriteria cannot be empty/);
  assert.throws(() => new Mission(samplePayload({ status: 'PAUSED' })), /Invalid mission status/);
});

test('mission lifecycle transition table is deterministic and terminal-protected', () => {
  assert.equal(canTransitionMissionStatus(MissionStatus.DRAFT, MissionStatus.ACTIVE), true);
  assert.equal(canTransitionMissionStatus(MissionStatus.ACTIVE, MissionStatus.SUSPENDED), true);
  assert.equal(canTransitionMissionStatus(MissionStatus.SUSPENDED, MissionStatus.ACTIVE), true);
  assert.equal(canTransitionMissionStatus(MissionStatus.ACTIVE, MissionStatus.COMPLETED), true);
  assert.equal(canTransitionMissionStatus(MissionStatus.SUSPENDED, MissionStatus.COMPLETED), false);
  assert.equal(canTransitionMissionStatus(MissionStatus.DRAFT, MissionStatus.COMPLETED), false);
  assert.equal(canTransitionMissionStatus(MissionStatus.COMPLETED, MissionStatus.ACTIVE), false);
  assert.equal(canTransitionMissionStatus(MissionStatus.ABORTED, MissionStatus.ACTIVE), false);
  assert.equal(canTransitionMissionStatus(MissionStatus.DRAFT, MissionStatus.ABORTED), false);

  const mission = new Mission(samplePayload());
  assert.throws(() => mission.transitionTo(MissionStatus.SUSPENDED), /Invalid mission lifecycle transition/);
  assert.throws(() => mission.transitionTo(MissionStatus.COMPLETED), /Invalid mission lifecycle transition/);
  assert.throws(() => mission.transitionTo(MissionStatus.ABORTED), /Invalid mission lifecycle transition/);

  const completed = mission.transitionTo(MissionStatus.ACTIVE).transitionTo(MissionStatus.COMPLETED);
  assert.throws(() => completed.transitionTo(MissionStatus.ACTIVE), /Invalid mission lifecycle transition/);
  assert.throws(() => completed.transitionTo(MissionStatus.ABORTED), /Invalid mission lifecycle transition/);
  assert.throws(() => completed.addObjective({ objectiveId: 'obj-x', description: 'late' }), /COMPLETED mission/);
  assert.throws(
    () => completed.updateObjectiveStatus('obj-x', ObjectiveStatus.COMPLETED),
    /COMPLETED mission/
  );
});

test('objective status transitions follow the baseline state machine', () => {
  assert.equal(canTransitionObjectiveStatus(ObjectiveStatus.PENDING, ObjectiveStatus.IN_PROGRESS), true);
  assert.equal(canTransitionObjectiveStatus(ObjectiveStatus.IN_PROGRESS, ObjectiveStatus.COMPLETED), true);
  assert.equal(canTransitionObjectiveStatus(ObjectiveStatus.IN_PROGRESS, ObjectiveStatus.FAILED), true);
  assert.equal(canTransitionObjectiveStatus(ObjectiveStatus.PENDING, ObjectiveStatus.COMPLETED), false);
  assert.equal(canTransitionObjectiveStatus(ObjectiveStatus.PENDING, ObjectiveStatus.FAILED), false);
  assert.equal(canTransitionObjectiveStatus(ObjectiveStatus.COMPLETED, ObjectiveStatus.IN_PROGRESS), false);
  assert.equal(canTransitionObjectiveStatus(ObjectiveStatus.FAILED, ObjectiveStatus.PENDING), false);

  const mission = new Mission(samplePayload({ objectives: objectivesFor('PENDING') }));
  const inProgress = mission.updateObjectiveStatus('obj-1', ObjectiveStatus.IN_PROGRESS);
  assert.equal(inProgress.objectives[0].status, ObjectiveStatus.IN_PROGRESS);
  assert.throws(
    () => inProgress.updateObjectiveStatus('obj-1', ObjectiveStatus.IN_PROGRESS),
    /Invalid objective status transition/
  );
  assert.throws(
    () => mission.updateObjectiveStatus('obj-missing', ObjectiveStatus.COMPLETED),
    /Objective not found/
  );
});

test('mission completion invariant requires ACTIVE status and terminal objectives', () => {
  const incomplete = new Mission(samplePayload({
    objectives: objectivesFor('COMPLETED', 'IN_PROGRESS')
  })).transitionTo(MissionStatus.ACTIVE);
  assert.equal(incomplete.canBeCompleted(), false);

  const objectivesDone = new Mission(samplePayload({
    objectives: objectivesFor('COMPLETED', 'FAILED')
  }));
  assert.equal(objectivesDone.canBeCompleted(), false, 'DRAFT missions cannot be completed');
  assert.equal(objectivesDone.transitionTo(MissionStatus.ACTIVE).canBeCompleted(), true);

  const zeroObjectives = new Mission(samplePayload()).transitionTo(MissionStatus.ACTIVE);
  assert.equal(zeroObjectives.canBeCompleted(), true, 'baseline: zero objectives is vacuously completable');
});

test('CreateMission persists the aggregate and emits econet.mission.created', async () => {
  const { engine, repository, eventBus } = createFixture();
  const result = await engine.executeCommand(command('CreateMission', samplePayload(), 'create-1'));

  assert.match(result.mission.missionId, /^msn_[0-9a-f]{32}$/);
  assert.equal(result.mission.status, MissionStatus.DRAFT);
  assert.equal(await repository.count(), 1);

  const events = eventBus.getHistory({ eventType: MISSION_CREATED });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.11.mission');
  assert.equal(events[0].subject.entityId, result.mission.missionId);
  assert.equal(events[0].metadata.audit.criticalMutation, false);
  assert.equal(events[0].metadata.provenance, 'engine.11.mission.CreateMission');
});

test('ActivateMission and AddObjective enforce governance, persistence, and events', async () => {
  const { engine, eventBus } = createFixture();
  const created = await engine.executeCommand(command('CreateMission', samplePayload(), 'lifecycle-1'));
  const missionId = created.mission.missionId;

  const activated = await engine.executeCommand(command('ActivateMission', { missionId }, 'lifecycle-2'));
  assert.equal(activated.missionChanged, true);
  assert.equal(activated.previousStatus, MissionStatus.DRAFT);
  assert.equal(activated.newStatus, MissionStatus.ACTIVE);

  const objectiveResult = await engine.executeCommand(command('AddObjective', {
    missionId,
    objectiveId: 'obj-1',
    description: 'Establish evacuation muster points'
  }, 'lifecycle-3'));
  assert.equal(objectiveResult.missionChanged, true);

  const statusEvents = eventBus.getHistory({ eventType: MISSION_STATUS_CHANGED });
  assert.equal(statusEvents.length, 1);
  assert.equal(statusEvents[0].payload.previousStatus, MissionStatus.DRAFT);
  assert.equal(statusEvents[0].payload.newStatus, MissionStatus.ACTIVE);
  assert.equal(statusEvents[0].metadata.triggerCommand, 'ActivateMission');
  assert.equal(statusEvents[0].metadata.audit.criticalMutation, false);
});

test('objective status changes publish econet.mission.objective_status_changed', async () => {
  const { engine, eventBus } = createFixture();
  const created = await engine.executeCommand(command('CreateMission', samplePayload(), 'obj-1'));
  const missionId = created.mission.missionId;
  await engine.executeCommand(command('AddObjective', {
    missionId,
    objectiveId: 'obj-1',
    description: 'Establish muster points'
  }, 'obj-2'));

  const result = await engine.executeCommand(command('UpdateObjectiveStatus', {
    missionId,
    objectiveId: 'obj-1',
    status: ObjectiveStatus.IN_PROGRESS
  }, 'obj-3'));

  assert.equal(result.objectiveChanged, true);
  const events = eventBus.getHistory({ eventType: OBJECTIVE_STATUS_CHANGED });
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.objectiveId, 'obj-1');
  assert.equal(events[0].payload.previousStatus, ObjectiveStatus.PENDING);
  assert.equal(events[0].payload.newStatus, ObjectiveStatus.IN_PROGRESS);
  assert.equal(events[0].metadata.audit.criticalMutation, false);
  assert.equal(events[0].metadata.provenance, 'engine.11.mission.UpdateObjectiveStatus');
});

test('CompleteMission requires terminal objectives and flags audit critical mutation', async () => {
  const { engine, eventBus } = createFixture();
  const created = await engine.executeCommand(command('CreateMission', samplePayload({
    objectives: objectivesFor('COMPLETED')
  }), 'complete-1'));
  const missionId = created.mission.missionId;
  await engine.executeCommand(command('ActivateMission', { missionId }, 'complete-2'));

  await engine.executeCommand(command('AddObjective', {
    missionId,
    objectiveId: 'obj-pending',
    description: 'Non-terminal objective'
  }, 'complete-blocker'));

  await assert.rejects(
    engine.executeCommand(command('CompleteMission', { missionId }, 'complete-blocked')),
    /cannot be completed/
  );

  await engine.executeCommand(command('AddObjective', {
    missionId,
    objectiveId: 'obj-2',
    description: 'Late objective'
  }, 'complete-3'));
  await engine.executeCommand(command('UpdateObjectiveStatus', {
    missionId,
    objectiveId: 'obj-2',
    status: ObjectiveStatus.IN_PROGRESS
  }, 'complete-4'));
  await engine.executeCommand(command('UpdateObjectiveStatus', {
    missionId,
    objectiveId: 'obj-2',
    status: ObjectiveStatus.FAILED
  }, 'complete-5'));

  const failedObjectiveEvents = eventBus.getHistory({ eventType: OBJECTIVE_STATUS_CHANGED });
  assert.equal(failedObjectiveEvents.filter(event => event.payload.newStatus === ObjectiveStatus.FAILED).length, 1);
  assert.equal(
    failedObjectiveEvents.find(event => event.payload.newStatus === ObjectiveStatus.FAILED).metadata.audit.criticalMutation,
    true
  );

  await engine.executeCommand(command('UpdateObjectiveStatus', {
    missionId,
    objectiveId: 'obj-pending',
    status: ObjectiveStatus.IN_PROGRESS
  }, 'complete-blocker-progress'));
  await engine.executeCommand(command('UpdateObjectiveStatus', {
    missionId,
    objectiveId: 'obj-pending',
    status: ObjectiveStatus.COMPLETED
  }, 'complete-blocker-done'));

  const result = await engine.executeCommand(command('CompleteMission', {
    missionId,
    reason: 'All objectives terminal'
  }, 'complete-6'));

  assert.equal(result.newStatus, MissionStatus.COMPLETED);
  const statusEvents = eventBus.getHistory({ eventType: MISSION_STATUS_CHANGED });
  const completion = statusEvents[statusEvents.length - 1];
  assert.equal(completion.payload.newStatus, MissionStatus.COMPLETED);
  assert.equal(completion.metadata.audit.criticalMutation, true);
  assert.equal(completion.metadata.triggerCommand, 'CompleteMission');
});

test('SuspendMission, ResumeMission, and AbortMission emit canonical transitions', async () => {
  const { engine, eventBus } = createFixture();
  const created = await engine.executeCommand(command('CreateMission', samplePayload(), 'suspend-1'));
  const missionId = created.mission.missionId;
  await engine.executeCommand(command('ActivateMission', { missionId }, 'suspend-2'));

  const suspended = await engine.executeCommand(command('SuspendMission', {
    missionId,
    reason: 'Weather stand-down'
  }, 'suspend-3'));
  assert.equal(suspended.newStatus, MissionStatus.SUSPENDED);

  const resumed = await engine.executeCommand(command('ResumeMission', { missionId }, 'suspend-4'));
  assert.equal(resumed.newStatus, MissionStatus.ACTIVE);

  const aborted = await engine.executeCommand(command('AbortMission', {
    missionId,
    reason: 'Threat cleared'
  }, 'suspend-5'));
  assert.equal(aborted.newStatus, MissionStatus.ABORTED);

  const statusEvents = eventBus.getHistory({ eventType: MISSION_STATUS_CHANGED });
  assert.deepEqual(statusEvents.map(event => event.payload.newStatus), [
    MissionStatus.ACTIVE,
    MissionStatus.SUSPENDED,
    MissionStatus.ACTIVE,
    MissionStatus.ABORTED
  ]);
  assert.equal(statusEvents[3].metadata.audit.criticalMutation, true);

  await assert.rejects(
    engine.executeCommand(command('ActivateMission', { missionId }, 'suspend-6')),
    /Invalid mission lifecycle transition/
  );
});

test('GetMissionById and ListActiveMissions return bounded mission data', async () => {
  const { engine } = createFixture();
  const high = await engine.executeCommand(command('CreateMission', samplePayload(), 'query-1'));
  await engine.executeCommand(command('CreateMission', samplePayload({
    title: 'Clear debris routes',
    priority: MissionPriority.LOW
  }), 'query-2'));

  const fetched = await engine.getMission(high.mission.missionId);
  assert.equal(fetched.priority, MissionPriority.HIGH);
  assert.equal(await engine.getMission('msn_unknown'), null);
  await assert.rejects(engine.getMission(null), /missionId is required/);

  assert.equal((await engine.listActiveMissions()).length, 0);
  await engine.executeCommand(command('ActivateMission', {
    missionId: high.mission.missionId
  }, 'query-3'));
  assert.equal((await engine.listActiveMissions()).length, 1);
  assert.equal((await engine.listActiveMissions({ priority: MissionPriority.LOW })).length, 0);
  assert.equal((await engine.listActiveMissions({ priority: MissionPriority.HIGH })).length, 1);
  await assert.rejects(
    engine.listActiveMissions({ priority: 'URGENT' }),
    /Invalid mission priority/
  );
});

test('idempotency prevents duplicate mission state and duplicate events', async () => {
  const { engine, repository, eventBus } = createFixture();
  const cmd = command('CreateMission', samplePayload(), 'idem-1');
  const first = await engine.executeCommand(cmd);
  const second = await engine.executeCommand(cmd);

  assert.equal(first.mission.missionId, second.mission.missionId);
  assert.equal(await repository.count(), 1);
  assert.equal(eventBus.getHistory({ eventType: MISSION_CREATED }).length, 1);
});

test('governance denial produces zero state change and zero mutation events', async () => {
  const repository = new InMemoryMissionRepository();
  const eventBus = new EventBus();
  const engine = new MissionEngine({
    repository,
    eventBus,
    idempotencyManager: new IdempotencyManager(),
    governance: {
      async evaluatePolicy({ commandType }) {
        return commandType === 'ActivateMission'
          ? { allowed: false, reason: 'MISSION_FREEZE' }
          : { allowed: true };
      }
    }
  });

  const created = await engine.executeCommand(command('CreateMission', samplePayload(), 'gov-allow'));
  const missionId = created.mission.missionId;
  await assert.rejects(
    engine.executeCommand(command('ActivateMission', { missionId }, 'gov-deny-activate')),
    /Governance policy denial: MISSION_FREEZE/
  );
  assert.equal(await repository.count(), 1);
  assert.equal(eventBus.getHistory().length, 1);
  assert.equal(eventBus.getHistory({ eventType: MISSION_STATUS_CHANGED }).length, 0);
  const persisted = await repository.findById(created.mission.missionId);
  assert.equal(persisted.status, MissionStatus.DRAFT);
});

test('every mission mutation event carries complete Engine 23 audit metadata', async () => {
  const { engine, eventBus } = createFixture();
  const created = await engine.executeCommand(command('CreateMission', samplePayload(), 'audit-1'));
  const missionId = created.mission.missionId;
  await engine.executeCommand(command('ActivateMission', { missionId }, 'audit-2'));
  await engine.executeCommand(command('AddObjective', {
    missionId,
    objectiveId: 'obj-1',
    description: 'Objective'
  }, 'audit-3'));
  await engine.executeCommand(command('UpdateObjectiveStatus', {
    missionId,
    objectiveId: 'obj-1',
    status: ObjectiveStatus.IN_PROGRESS
  }, 'audit-4a'));
  await engine.executeCommand(command('UpdateObjectiveStatus', {
    missionId,
    objectiveId: 'obj-1',
    status: ObjectiveStatus.FAILED
  }, 'audit-4'));
  await engine.executeCommand(command('AbortMission', { missionId, reason: 'Cancelled' }, 'audit-5'));

  const events = eventBus.getHistory();
  assert.ok(events.length >= 4);
  assert.ok(events.every(event => event.producer === 'engine.11.mission'));
  assert.ok(events.every(event =>
    event.metadata &&
    typeof event.metadata.audit === 'object' &&
    typeof event.metadata.audit.criticalMutation === 'boolean' &&
    typeof event.metadata.audit.isEscalation === 'boolean' &&
    typeof event.metadata.provenance === 'string'
  ));
  assert.ok(events.every(event => event.correlationId.startsWith('cor-mission-')));
});

test('mission repositories are isolated across engine instances', async () => {
  const repositoryA = new InMemoryMissionRepository();
  const repositoryB = new InMemoryMissionRepository();
  const engineA = new MissionEngine({ repository: repositoryA, idempotencyManager: new IdempotencyManager() });
  const engineB = new MissionEngine({ repository: repositoryB, idempotencyManager: new IdempotencyManager() });

  await engineA.executeCommand(command('CreateMission', samplePayload({ title: 'Mission A' }), 'iso-a'));
  await engineB.executeCommand(command('CreateMission', samplePayload({ title: 'Mission B' }), 'iso-b'));

  assert.equal(await repositoryA.count(), 1);
  assert.equal(await repositoryB.count(), 1);
  assert.equal((await engineA.listActiveMissions()).length, 0);
  assert.equal(await engineA.getMission('msn_does_not_exist'), null);
});

test('Engine 11 has no forbidden cross-engine dependency', () => {
  const engineDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = [
    path.join(engineDirectory, 'index.js'),
    path.join(engineDirectory, 'application', 'services', 'MissionApplicationService.js'),
    path.join(engineDirectory, 'domain', 'entities', 'Mission.js'),
    path.join(engineDirectory, 'domain', 'events', 'MissionCreated.js'),
    path.join(engineDirectory, 'domain', 'events', 'MissionStatusChanged.js'),
    path.join(engineDirectory, 'domain', 'events', 'ObjectiveStatusChanged.js'),
    path.join(engineDirectory, 'domain', 'value-objects', 'MissionPriority.js'),
    path.join(engineDirectory, 'domain', 'value-objects', 'MissionStatus.js'),
    path.join(engineDirectory, 'domain', 'value-objects', 'ObjectiveStatus.js'),
    path.join(engineDirectory, 'infrastructure', 'repositories', 'InMemoryMissionRepository.js')
  ];

  const source = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /09-risk|10-prediction|12-action|engine\.09\.|engine\.10\.|engine\.12\./);
  assert.doesNotMatch(source, /econet\.(risk|prediction|action)\./);
  assert.doesNotMatch(source, /\.subscribe\(|subscribeAll\(/);
});

test('unsupported commands, missing idempotency, and missing missions are rejected', async () => {
  const { engine } = createFixture();
  await assert.rejects(
    engine.executeCommand(command('DeleteMission', {}, 'unsupported')),
    /Unsupported Mission command/
  );
  await assert.rejects(
    engine.executeCommand(new Command({
      commandType: 'CreateMission',
      targetEngine: '11-mission',
      payload: samplePayload()
    })),
    /requires an idempotencyKey/
  );
  await assert.rejects(
    engine.executeCommand(command('ActivateMission', { missionId: 'msn_missing' }, 'missing-mission')),
    /Mission not found/
  );
});

test('MissionEngine exposes the canonical lifecycle contract and live health check', async () => {
  const { engine, repository } = createFixture();
  assert.equal(engine.engineId, '11');
  assert.equal(engine.engineName, 'Mission Engine');
  assert.ok(engine.service instanceof MissionApplicationService);
  assert.equal(engine.repository, repository);
  assert.equal((await engine.initialize()).ready, true);
  assert.equal((await engine.healthCheck()).details.totalMissions, 0);

  await engine.executeCommand(command('CreateMission', samplePayload(), 'health-1'));
  const health = await engine.healthCheck();
  assert.equal(health.healthy, true);
  assert.equal(health.details.persistence, 'IN_MEMORY_MISSION_ADAPTER');
  assert.equal(health.details.totalMissions, 1);
  await engine.shutdown();
});








// ── Authorization regression tests ───────────────────────────────────────────
// These tests cover the canonical authorization gap identified during the
// Engine 11 compliance audit. Authorization was missing from the original
// implementation. The pattern matches Engines 15, 18, 19, 20, 21, 22, and 24.

test('Authorization: missing actor is rejected before idempotency and mutation', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(new Command({
      commandType: 'CreateMission',
      targetEngine: '11-mission',
      payload: samplePayload(),
      idempotencyKey: 'auth-no-actor'
    })),
    /require an authenticated actor/
  );
});

test('Authorization: missing roles field is denied, not silently passed', async () => {
  const { engine } = createFixture();
  const noRolesActor = { actorId: 'user-no-roles' };

  await assert.rejects(
    engine.executeCommand(command('CreateMission', samplePayload(), 'auth-no-roles', noRolesActor)),
    /lacks an authorized mission role/
  );
  assert.equal(await engine.repository.count(), 0);
});

test('Authorization: non-array roles are denied', async () => {
  const { engine } = createFixture();

  const variants = [
    { actorId: 'u1', roles: 'mission_lead' },          // string
    { actorId: 'u2', roles: { mission_lead: true } },   // object
    { actorId: 'u3', roles: null },                      // null
    { actorId: 'u4', roles: 42 }                         // number
  ];

  for (const actor of variants) {
    await assert.rejects(
      engine.executeCommand(command('CreateMission', samplePayload(), `non-arr-${actor.actorId}`, actor)),
      /lacks an authorized mission role/,
      `Expected denial for roles=${JSON.stringify(actor.roles)}`
    );
  }
  assert.equal(await engine.repository.count(), 0);
});

test('Authorization: empty roles array is denied', async () => {
  const { engine } = createFixture();
  const emptyActor = { actorId: 'user-empty', roles: [] };

  await assert.rejects(
    engine.executeCommand(command('CreateMission', samplePayload(), 'auth-empty-roles', emptyActor)),
    /lacks an authorized mission role/
  );
});

test('Authorization: unauthorized role is denied on all eight mutating commands', async () => {
  const { engine } = createFixture();

  // Pre-create a mission with valid actor so lifecycle commands have a target
  const created = await engine.executeCommand(command('CreateMission', samplePayload(), 'auth-pre'));
  const missionId = created.mission.missionId;
  await engine.executeCommand(command('ActivateMission', { missionId }, 'auth-pre-act'));
  await engine.executeCommand(command('AddObjective', {
    missionId, objectiveId: 'obj-auth', description: 'Auth test objective'
  }, 'auth-pre-obj'));

  const observer = { actorId: 'observer-1', roles: ['observer'] };
  const cases = [
    ['CreateMission', samplePayload({ title: 'Unauthorized Mission' }), 'auth-d-create'],
    ['ActivateMission', { missionId }, 'auth-d-act'],
    ['SuspendMission', { missionId }, 'auth-d-susp'],
    ['ResumeMission', { missionId }, 'auth-d-res'],
    ['CompleteMission', { missionId }, 'auth-d-comp'],
    ['AbortMission', { missionId }, 'auth-d-abort'],
    ['AddObjective', { missionId, objectiveId: 'obj-2', description: 'Second' }, 'auth-d-obj'],
    ['UpdateObjectiveStatus', { missionId, objectiveId: 'obj-auth', status: ObjectiveStatus.IN_PROGRESS }, 'auth-d-upd']
  ];

  for (const [commandType, payload, suffix] of cases) {
    await assert.rejects(
      engine.executeCommand(command(commandType, payload, suffix, observer)),
      /lacks an authorized mission role/,
      `Expected denial for ${commandType}`
    );
  }

  // Mission state must be completely untouched by the rejected commands
  const unchanged = await engine.getMission(missionId);
  assert.equal(unchanged.status, MissionStatus.ACTIVE);
  assert.equal(unchanged.objectives.length, 1);
});

test('Authorization: all four canonical authorized roles are accepted', async () => {
  const AUTHORIZED_ROLES = ['system', 'admin', 'mission_lead', 'automation'];

  for (const role of AUTHORIZED_ROLES) {
    const { engine } = createFixture();
    const actor = { actorId: `user-${role}`, roles: [role] };

    const res = await engine.executeCommand(command('CreateMission', samplePayload(), `role-${role}`, actor));
    assert.equal(res.mission.status, MissionStatus.DRAFT, `Role "${role}" should be authorized`);
  }
});

test('Authorization denial fires before idempotency, governance, and state mutation', async () => {
  let governanceCalled = false;
  const repository = new InMemoryMissionRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new MissionEngine({
    service: new MissionApplicationService({
      repository,
      eventBus,
      idempotencyManager,
      governance: {
        async evaluatePolicy() {
          governanceCalled = true;
          return { allowed: true };
        }
      }
    })
  });

  const noRolesActor = { actorId: 'user-no-roles' };
  await assert.rejects(
    engine.executeCommand(command('CreateMission', samplePayload(), 'order-check', noRolesActor)),
    /lacks an authorized mission role/
  );

  assert.equal(governanceCalled, false, 'governance must not be consulted when authorization fails');
  assert.equal(await repository.count(), 0, 'no state must be mutated when authorization fails');
  assert.equal(eventBus.getHistory().length, 0, 'no events must be published when authorization fails');
});
