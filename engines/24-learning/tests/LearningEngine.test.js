import test from 'node:test';
import assert from 'node:assert/strict';

import { Command } from '../../../contracts/commands/Command.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import {
  LearningEngine,
  LearningApplicationService,
  InMemoryLearningRepository,
  OutcomeFeedback,
  AccuracyRecord,
  AdaptationRecord
} from '../index.js';

// ── Helpers ────────────────────────────────────────────────────────────────

const MANAGER = { actorId: 'learn-mgr-1', roles: ['learning_manager'] };

const cmd = (commandType, payload, suffix, actor = MANAGER) => new Command({
  commandType,
  targetEngine: '24-learning',
  payload,
  actor,
  idempotencyKey: `learn-test-${suffix}`,
  correlationId: `cor-${suffix}`
});

const createFixture = (options = {}) => {
  const repository = new InMemoryLearningRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new LearningEngine({
    repository,
    eventBus,
    idempotencyManager,
    clock: () => new Date('2030-11-01T10:00:00.000Z'),
    ...options
  });
  return { engine, repository, eventBus, idempotencyManager };
};

const VALID_FEEDBACK = {
  sourceEngine: 'engine.10.prediction',
  sourceId: 'pred-abc-123',
  sourceType: 'prediction',
  predictedOutcome: { hazardLevel: 'HIGH', confidence: 0.87 },
  actualOutcome: { hazardLevel: 'MEDIUM', observedAt: '2030-10-31T06:00:00Z' },
  deltaDescription: 'Prediction overestimated hazard by one tier'
};

const VALID_ACCURACY = {
  subjectEngine: 'engine.10.prediction',
  subjectId: 'model-flood-v2',
  subjectType: 'prediction_model',
  metricName: 'precision',
  metricValue: 0.82,
  evaluationContext: { evaluationPeriod: '2030-Q3', sampleSize: 150 }
};

const VALID_ADAPTATION = {
  subjectEngine: 'engine.10.prediction',
  subjectId: 'model-flood-v2',
  subjectType: 'prediction_model',
  adaptationType: 'THRESHOLD_ADJUSTMENT',
  rationale: 'Precision below 0.85 threshold over Q3; adjusting sensitivity parameter.',
  feedbackIds: ['fb-001', 'fb-002'],
  accuracyRecordIds: ['acc-001']
};

// ── OutcomeFeedback entity ────────────────────────────────────────────────

test('OutcomeFeedback validates construction and is immutable', () => {
  const record = new OutcomeFeedback({
    sourceEngine: 'engine.10.prediction',
    sourceId: 'pred-1',
    sourceType: 'prediction',
    predictedOutcome: { value: 5 },
    actualOutcome: { value: 3 }
  });

  assert.match(record.feedbackId, /^fb_/);
  assert.equal(record.sourceEngine, 'engine.10.prediction');
  assert.equal(record.sourceId, 'pred-1');
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.metadata), true);

  // Required field validation
  assert.throws(() => new OutcomeFeedback({
    sourceEngine: '',
    sourceId: 'x', sourceType: 'y',
    predictedOutcome: 1, actualOutcome: 2
  }), /non-empty sourceEngine/);

  assert.throws(() => new OutcomeFeedback({
    sourceEngine: 'eng', sourceId: '', sourceType: 'y',
    predictedOutcome: 1, actualOutcome: 2
  }), /non-empty sourceId/);

  assert.throws(() => new OutcomeFeedback({
    sourceEngine: 'eng', sourceId: 'x', sourceType: '',
    predictedOutcome: 1, actualOutcome: 2
  }), /non-empty sourceType/);

  assert.throws(() => new OutcomeFeedback({
    sourceEngine: 'eng', sourceId: 'x', sourceType: 'y',
    predictedOutcome: null, actualOutcome: 2
  }), /predictedOutcome/);

  assert.throws(() => new OutcomeFeedback({
    sourceEngine: 'eng', sourceId: 'x', sourceType: 'y',
    predictedOutcome: 1, actualOutcome: undefined
  }), /actualOutcome/);
});

// ── AccuracyRecord entity ─────────────────────────────────────────────────

test('AccuracyRecord validates construction and is immutable', () => {
  const record = new AccuracyRecord({
    subjectEngine: 'engine.10.prediction',
    subjectId: 'model-v1',
    subjectType: 'prediction_model',
    metricName: 'recall',
    metricValue: 0.75
  });

  assert.match(record.recordId, /^acc_/);
  assert.equal(record.metricValue, 0.75);
  assert.equal(Object.isFrozen(record), true);

  // metricValue must be a finite number
  assert.throws(() => new AccuracyRecord({
    subjectEngine: 'eng', subjectId: 'x', subjectType: 'y',
    metricName: 'precision', metricValue: Number.NaN
  }), /finite number/);
  assert.throws(() => new AccuracyRecord({
    subjectEngine: 'eng', subjectId: 'x', subjectType: 'y',
    metricName: 'precision', metricValue: Number.POSITIVE_INFINITY
  }), /finite number/);
  assert.throws(() => new AccuracyRecord({
    subjectEngine: 'eng', subjectId: 'x', subjectType: 'y',
    metricName: '', metricValue: 0.5
  }), /non-empty metricName/);
});

// ── AdaptationRecord entity ───────────────────────────────────────────────

test('AdaptationRecord validates construction and is immutable', () => {
  const record = new AdaptationRecord({
    subjectEngine: 'engine.10.prediction',
    subjectId: 'model-v1',
    subjectType: 'prediction_model',
    adaptationType: 'THRESHOLD_ADJUSTMENT',
    feedbackIds: ['fb-1', 'fb-2'],
    accuracyRecordIds: ['acc-1']
  });

  assert.match(record.adaptationId, /^adp_/);
  assert.equal(record.adaptationType, 'THRESHOLD_ADJUSTMENT');
  assert.equal(record.feedbackIds.length, 2);
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.feedbackIds), true);

  assert.throws(() => new AdaptationRecord({
    subjectEngine: 'eng', subjectId: 'x', subjectType: 'y',
    adaptationType: ''
  }), /non-empty adaptationType/);

  assert.throws(() => new AdaptationRecord({
    subjectEngine: 'eng', subjectId: 'x', subjectType: 'y',
    adaptationType: 'TYPE', feedbackIds: 'not-an-array'
  }), /feedbackIds must be an array/);
});

// ── InMemoryLearningRepository ────────────────────────────────────────────

test('InMemoryLearningRepository persists, finds, lists, and counts all three record types', async () => {
  const repo = new InMemoryLearningRepository();

  const fb = new OutcomeFeedback({
    sourceEngine: 'engine.10.prediction', sourceId: 'p1', sourceType: 'prediction',
    predictedOutcome: 1, actualOutcome: 2
  });
  await repo.saveFeedback(fb);
  assert.equal(await repo.countFeedback(), 1);
  assert.equal((await repo.findFeedbackById(fb.feedbackId)).feedbackId, fb.feedbackId);
  assert.equal(await repo.findFeedbackById('missing'), null);

  const acc = new AccuracyRecord({
    subjectEngine: 'engine.10.prediction', subjectId: 'm1', subjectType: 'model',
    metricName: 'precision', metricValue: 0.9
  });
  await repo.saveAccuracy(acc);
  assert.equal(await repo.countAccuracy(), 1);
  assert.equal((await repo.findAccuracyById(acc.recordId)).recordId, acc.recordId);

  const adp = new AdaptationRecord({
    subjectEngine: 'engine.10.prediction', subjectId: 'm1', subjectType: 'model',
    adaptationType: 'CONFIG_UPDATE'
  });
  await repo.saveAdaptation(adp);
  assert.equal(await repo.countAdaptations(), 1);

  await repo.clear();
  assert.equal(await repo.countFeedback(), 0);
  assert.equal(await repo.countAccuracy(), 0);
  assert.equal(await repo.countAdaptations(), 0);
});

// ── RecordOutcomeFeedback command ─────────────────────────────────────────

test('RecordOutcomeFeedback creates a feedback record and emits outcome_feedback_recorded', async () => {
  const { engine, repository, eventBus } = createFixture();

  const res = await engine.executeCommand(cmd('RecordOutcomeFeedback', VALID_FEEDBACK, 'fb-1'));

  assert.match(res.feedback.feedbackId, /^fb_/);
  assert.equal(res.feedback.sourceEngine, 'engine.10.prediction');
  assert.equal(res.feedback.sourceId, 'pred-abc-123');
  assert.equal(res.feedback.recordedBy, 'learn-mgr-1');
  assert.equal(await repository.countFeedback(), 1);

  const events = eventBus.getHistory({ eventType: 'econet.learning.outcome_feedback_recorded' });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.24.learning');
  assert.equal(events[0].subject.entityType, 'outcome_feedback');
  assert.equal(events[0].payload.recordedBy, 'learn-mgr-1');
});

test('RecordOutcomeFeedback validates required payload fields', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(cmd('RecordOutcomeFeedback', {
      ...VALID_FEEDBACK, sourceEngine: ''
    }, 'fb-bad-eng')),
    /non-empty sourceEngine/
  );

  await assert.rejects(
    engine.executeCommand(cmd('RecordOutcomeFeedback', {
      ...VALID_FEEDBACK, predictedOutcome: null
    }, 'fb-bad-pred')),
    /predictedOutcome/
  );
});

// ── RecordAccuracyEvaluation command ──────────────────────────────────────

test('RecordAccuracyEvaluation creates an accuracy record and emits accuracy_recorded', async () => {
  const { engine, repository, eventBus } = createFixture();

  const res = await engine.executeCommand(cmd('RecordAccuracyEvaluation', VALID_ACCURACY, 'acc-1'));

  assert.match(res.accuracy.recordId, /^acc_/);
  assert.equal(res.accuracy.metricName, 'precision');
  assert.equal(res.accuracy.metricValue, 0.82);
  assert.equal(await repository.countAccuracy(), 1);

  const events = eventBus.getHistory({ eventType: 'econet.learning.accuracy_recorded' });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.24.learning');
  assert.equal(events[0].subject.entityType, 'accuracy_record');
  assert.equal(events[0].payload.metricValue, 0.82);
});

test('RecordAccuracyEvaluation rejects non-finite metricValue', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(cmd('RecordAccuracyEvaluation', {
      ...VALID_ACCURACY, metricValue: Number.NaN
    }, 'acc-nan')),
    /finite number/
  );
});

// ── RecordAdaptation command ──────────────────────────────────────────────

test('RecordAdaptation creates an adaptation record and emits adaptation_recorded', async () => {
  const { engine, repository, eventBus } = createFixture();

  const res = await engine.executeCommand(cmd('RecordAdaptation', VALID_ADAPTATION, 'adp-1'));

  assert.match(res.adaptation.adaptationId, /^adp_/);
  assert.equal(res.adaptation.adaptationType, 'THRESHOLD_ADJUSTMENT');
  assert.equal(res.adaptation.feedbackIds.length, 2);
  assert.equal(res.adaptation.accuracyRecordIds.length, 1);
  assert.equal(await repository.countAdaptations(), 1);

  const events = eventBus.getHistory({ eventType: 'econet.learning.adaptation_recorded' });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.24.learning');
  assert.equal(events[0].subject.entityType, 'adaptation_record');
  assert.equal(events[0].payload.feedbackCount, 2);
});

// ── Queries ────────────────────────────────────────────────────────────────

test('Queries return records and handle unknown IDs as null', async () => {
  const { engine } = createFixture();

  assert.equal(await engine.getFeedback('missing'), null);
  assert.deepEqual(await engine.listFeedback(), []);
  assert.equal(await engine.getAccuracyRecord('missing'), null);
  assert.deepEqual(await engine.listAccuracyRecords(), []);
  assert.equal(await engine.getAdaptation('missing'), null);
  assert.deepEqual(await engine.listAdaptations(), []);

  const fbRes = await engine.executeCommand(cmd('RecordOutcomeFeedback', VALID_FEEDBACK, 'qry-fb'));
  const accRes = await engine.executeCommand(cmd('RecordAccuracyEvaluation', VALID_ACCURACY, 'qry-acc'));
  const adpRes = await engine.executeCommand(cmd('RecordAdaptation', VALID_ADAPTATION, 'qry-adp'));

  assert.equal((await engine.getFeedback(fbRes.feedback.feedbackId)).feedbackId, fbRes.feedback.feedbackId);
  assert.equal((await engine.getAccuracyRecord(accRes.accuracy.recordId)).metricName, 'precision');
  assert.equal((await engine.getAdaptation(adpRes.adaptation.adaptationId)).adaptationType, 'THRESHOLD_ADJUSTMENT');

  // Filtering
  const byEngine = await engine.listFeedback({ sourceEngine: 'engine.10.prediction' });
  assert.equal(byEngine.length, 1);
  const byOther = await engine.listFeedback({ sourceEngine: 'engine.19.simulation' });
  assert.equal(byOther.length, 0);

  const accByMetric = await engine.listAccuracyRecords({ metricName: 'precision' });
  assert.equal(accByMetric.length, 1);
  const accByOther = await engine.listAccuracyRecords({ metricName: 'recall' });
  assert.equal(accByOther.length, 0);
});

// ── Authorization ──────────────────────────────────────────────────────────

test('Authorization: missing actor is rejected', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(new Command({
      commandType: 'RecordOutcomeFeedback',
      targetEngine: '24-learning',
      payload: VALID_FEEDBACK,
      idempotencyKey: 'auth-no-actor'
    })),
    /require an authenticated actor/
  );
});

test('Authorization: missing roles is denied', async () => {
  const { engine } = createFixture();
  const noRoles = { actorId: 'user-no-roles' };

  await assert.rejects(
    engine.executeCommand(cmd('RecordOutcomeFeedback', VALID_FEEDBACK, 'auth-no-roles', noRoles)),
    /lacks an authorized learning role/
  );
  assert.equal(await engine.repository.countFeedback(), 0);
});

test('Authorization: non-array and empty roles are denied', async () => {
  const { engine } = createFixture();

  const variants = [
    { actorId: 'u1', roles: 'learning_manager' },
    { actorId: 'u2', roles: null },
    { actorId: 'u3', roles: {} },
    { actorId: 'u4', roles: [] }
  ];

  for (const actor of variants) {
    await assert.rejects(
      engine.executeCommand(cmd('RecordOutcomeFeedback', VALID_FEEDBACK, `bad-${actor.actorId}`, actor)),
      /lacks an authorized learning role/
    );
  }
  assert.equal(await engine.repository.countFeedback(), 0);
});

test('Authorization: unauthorized role is denied on all three commands', async () => {
  const { engine } = createFixture();

  const observer = { actorId: 'obs-1', roles: ['observer'] };
  const cases = [
    ['RecordOutcomeFeedback', VALID_FEEDBACK, 'd-fb'],
    ['RecordAccuracyEvaluation', VALID_ACCURACY, 'd-acc'],
    ['RecordAdaptation', VALID_ADAPTATION, 'd-adp']
  ];

  for (const [commandType, payload, suffix] of cases) {
    await assert.rejects(
      engine.executeCommand(cmd(commandType, payload, suffix, observer)),
      /lacks an authorized learning role/,
      `Expected denial for ${commandType}`
    );
  }
});

test('Authorization: all four canonical authorized roles are accepted', async () => {
  const AUTHORIZED_ROLES = ['system', 'admin', 'learning_manager', 'automation'];

  for (const role of AUTHORIZED_ROLES) {
    const { engine } = createFixture();
    const actor = { actorId: `user-${role}`, roles: [role] };
    const res = await engine.executeCommand(
      cmd('RecordOutcomeFeedback', VALID_FEEDBACK, `role-${role}`, actor)
    );
    assert.match(res.feedback.feedbackId, /^fb_/, `Role "${role}" should be authorized`);
  }
});

// ── Authorization ordering ─────────────────────────────────────────────────

test('Authorization denial fires before idempotency, governance, and mutation', async () => {
  let governanceCalled = false;
  const repository = new InMemoryLearningRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new LearningEngine({
    service: new LearningApplicationService({
      repository, eventBus, idempotencyManager,
      governance: {
        async evaluatePolicy() {
          governanceCalled = true;
          return { allowed: true };
        }
      }
    })
  });

  const noRoles = { actorId: 'no-roles' };
  await assert.rejects(
    engine.executeCommand(cmd('RecordOutcomeFeedback', VALID_FEEDBACK, 'order-chk', noRoles)),
    /lacks an authorized learning role/
  );

  assert.equal(governanceCalled, false, 'governance must not be called when authorization fails');
  assert.equal(await repository.countFeedback(), 0);
  assert.equal(eventBus.getHistory().length, 0);
});

// ── Governance ─────────────────────────────────────────────────────────────

test('Governance denial blocks mutation before any state change or event', async () => {
  const repository = new InMemoryLearningRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new LearningEngine({
    service: new LearningApplicationService({
      repository, eventBus, idempotencyManager,
      governance: {
        async evaluatePolicy({ commandType }) {
          if (commandType === 'RecordOutcomeFeedback') {
            return { allowed: false, reason: 'LEARNING_FROZEN' };
          }
          return { allowed: true };
        }
      }
    })
  });

  await assert.rejects(
    engine.executeCommand(cmd('RecordOutcomeFeedback', VALID_FEEDBACK, 'gov-fb')),
    /Governance policy denial: LEARNING_FROZEN/
  );

  assert.equal(await repository.countFeedback(), 0);
  assert.equal(eventBus.getHistory({ eventType: 'econet.learning.outcome_feedback_recorded' }).length, 0);
});

// ── Idempotency ────────────────────────────────────────────────────────────

test('Idempotency: same command key returns cached result without duplicate record', async () => {
  const { engine, repository, eventBus } = createFixture();

  const first = await engine.executeCommand(cmd('RecordOutcomeFeedback', VALID_FEEDBACK, 'idem-fb'));
  const second = await engine.executeCommand(cmd('RecordOutcomeFeedback', VALID_FEEDBACK, 'idem-fb'));

  assert.equal(second.feedback.feedbackId, first.feedback.feedbackId);
  assert.equal(await repository.countFeedback(), 1);
  assert.equal(eventBus.getHistory({ eventType: 'econet.learning.outcome_feedback_recorded' }).length, 1);
});

test('Commands without idempotencyKey are rejected', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(new Command({
      commandType: 'RecordOutcomeFeedback',
      targetEngine: '24-learning',
      payload: VALID_FEEDBACK,
      actor: MANAGER
    })),
    /requires an idempotencyKey/
  );
});

// ── Events ─────────────────────────────────────────────────────────────────

test('All three events carry correct producer and subject entityType', async () => {
  const { engine, eventBus } = createFixture();

  const fbRes = await engine.executeCommand(cmd('RecordOutcomeFeedback', VALID_FEEDBACK, 'ev-fb'));
  const accRes = await engine.executeCommand(cmd('RecordAccuracyEvaluation', VALID_ACCURACY, 'ev-acc'));
  const adpRes = await engine.executeCommand(cmd('RecordAdaptation', VALID_ADAPTATION, 'ev-adp'));

  const checks = [
    ['econet.learning.outcome_feedback_recorded', 'outcome_feedback', fbRes.feedback.feedbackId],
    ['econet.learning.accuracy_recorded', 'accuracy_record', accRes.accuracy.recordId],
    ['econet.learning.adaptation_recorded', 'adaptation_record', adpRes.adaptation.adaptationId]
  ];

  for (const [eventType, entityType, entityId] of checks) {
    const events = eventBus.getHistory({ eventType });
    assert.equal(events.length, 1, `Expected one ${eventType}`);
    assert.equal(events[0].producer, 'engine.24.learning');
    assert.equal(events[0].subject.entityType, entityType);
    assert.equal(events[0].subject.entityId, entityId);
  }
});

test('No success event is emitted when a command fails authorization', async () => {
  const { engine, eventBus } = createFixture();
  const obs = { actorId: 'obs', roles: ['observer'] };

  await assert.rejects(
    engine.executeCommand(cmd('RecordOutcomeFeedback', VALID_FEEDBACK, 'ev-auth-fail', obs))
  );
  assert.equal(eventBus.getHistory().length, 0);
});

// ── Unsupported commands ───────────────────────────────────────────────────

test('Unsupported commands are rejected', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(cmd('DeleteAllFeedback', {}, 'bad-cmd')),
    /Unsupported Learning command/
  );
});

// ── Repository isolation ───────────────────────────────────────────────────

test('Repository isolation: no cross-instance state leak', async () => {
  const engineA = new LearningEngine({ repository: new InMemoryLearningRepository() });
  const engineB = new LearningEngine({ repository: new InMemoryLearningRepository() });

  await engineA.executeCommand(cmd('RecordOutcomeFeedback', VALID_FEEDBACK, 'iso-a'));

  assert.equal((await engineA.listFeedback()).length, 1);
  assert.equal((await engineB.listFeedback()).length, 0, 'no cross-engine state leak');
});

// ── Lifecycle contract ─────────────────────────────────────────────────────

test('LearningEngine exposes the canonical lifecycle contract', async () => {
  const { engine, repository } = createFixture();

  assert.equal(engine.engineId, '24');
  assert.equal(engine.engineName, 'Learning Engine');

  const init = await engine.initialize();
  assert.equal(init.ready, true);

  const health = await engine.healthCheck();
  assert.equal(health.healthy, true);
  assert.equal(health.details.status, 'READY');
  assert.equal(health.details.persistence, 'IN_MEMORY_LEARNING_ADAPTER');
  assert.equal(health.details.totalFeedback, 0);
  assert.equal(health.details.totalAccuracyRecords, 0);
  assert.equal(health.details.totalAdaptations, 0);

  await engine.executeCommand(cmd('RecordOutcomeFeedback', VALID_FEEDBACK, 'lc-fb'));
  const health2 = await engine.healthCheck();
  assert.equal(health2.details.totalFeedback, 1);

  await engine.shutdown();
  assert.equal(await repository.countFeedback(), 1); // state retained after shutdown
});
