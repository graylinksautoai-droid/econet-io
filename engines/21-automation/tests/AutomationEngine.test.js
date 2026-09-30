import test from 'node:test';
import assert from 'node:assert/strict';

import { Command } from '../../../contracts/commands/Command.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import {
  AutomationEngine,
  AutomationApplicationService,
  InMemoryJobRepository,
  BackgroundJob,
  JobStatus,
  TaskType,
  normalizeTaskType,
  isValidTaskType
} from '../index.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

const OPERATOR = { actorId: 'auto-mgr-1', roles: ['automation_manager'] };

const cmd = (commandType, payload, suffix, actor = OPERATOR) => new Command({
  commandType,
  targetEngine: '21-automation',
  payload,
  actor,
  idempotencyKey: `auto-test-${suffix}`,
  correlationId: `cor-${suffix}`
});

const createFixture = (options = {}) => {
  const repository = new InMemoryJobRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new AutomationEngine({
    repository,
    eventBus,
    idempotencyManager,
    clock: () => new Date('2030-06-01T09:00:00.000Z'),
    ...options
  });
  return { engine, repository, eventBus, idempotencyManager };
};

const VALID_ENQUEUE = {
  taskType: 'BACKGROUND_JOB',
  payload: { operation: 'reconcile_predictions', batchId: 'b-001' },
  priority: 5,
  maxRetries: 3
};

// ─── TaskType value object ────────────────────────────────────────────────────

test('TaskType vocabulary covers the six canonical types', () => {
  assert.equal(normalizeTaskType('background_job'), TaskType.BACKGROUND_JOB);
  assert.equal(normalizeTaskType('EVENT_TRIGGER'), TaskType.EVENT_TRIGGER);
  assert.equal(normalizeTaskType('pipeline_step'), TaskType.PIPELINE_STEP);
  assert.equal(normalizeTaskType('SCHEDULED_JOB'), TaskType.SCHEDULED_JOB);
  assert.equal(normalizeTaskType('notification_job'), TaskType.NOTIFICATION_JOB);
  assert.equal(normalizeTaskType('INTEGRATION_JOB'), TaskType.INTEGRATION_JOB);

  assert.equal(isValidTaskType('BACKGROUND_JOB'), true);
  assert.equal(isValidTaskType('BOGUS'), false);

  assert.throws(() => normalizeTaskType('CRON_JOB'), /Invalid task type/);
  assert.throws(() => normalizeTaskType(''), /Invalid task type/);
  assert.throws(() => normalizeTaskType(null), /Invalid task type/);
});

// ─── BackgroundJob contract ───────────────────────────────────────────────────

test('BackgroundJob contract validates construction and sets defaults', () => {
  const job = new BackgroundJob({
    taskType: 'BACKGROUND_JOB',
    payload: { key: 'value' }
  });

  assert.match(job.jobId, /^job_/);
  assert.equal(job.taskType, 'BACKGROUND_JOB');
  assert.equal(job.status, JobStatus.QUEUED);
  assert.equal(job.retryCount, 0);
  assert.equal(job.maxRetries, 3);
  assert.equal(job.priority, 10);
  assert.ok(job.correlationId);

  assert.throws(
    () => new BackgroundJob({ taskType: '', payload: {} }),
    /valid string taskType/
  );
  assert.throws(
    () => new BackgroundJob({ taskType: 'BACKGROUND_JOB', payload: null }),
    /object payload/
  );
});

// ─── JobStatus vocabulary ─────────────────────────────────────────────────────

test('JobStatus vocabulary covers all five canonical statuses', () => {
  assert.equal(JobStatus.QUEUED, 'QUEUED');
  assert.equal(JobStatus.PROCESSING, 'PROCESSING');
  assert.equal(JobStatus.COMPLETED, 'COMPLETED');
  assert.equal(JobStatus.FAILED, 'FAILED');
  assert.equal(JobStatus.DEAD_LETTER, 'DEAD_LETTER');
  assert.equal(Object.isFrozen(JobStatus), true);
});

// ─── InMemoryJobRepository ────────────────────────────────────────────────────

test('InMemoryJobRepository persists, finds, lists, and counts jobs', async () => {
  const repo = new InMemoryJobRepository();

  const job = new BackgroundJob({ taskType: 'BACKGROUND_JOB', payload: { x: 1 } });
  await repo.save(job);
  assert.equal(await repo.count(), 1);

  const found = await repo.findById(job.jobId);
  assert.equal(found.jobId, job.jobId);
  assert.equal(found.taskType, 'BACKGROUND_JOB');

  assert.equal(await repo.findById('missing'), null);

  const all = await repo.list();
  assert.equal(all.length, 1);

  const byStatus = await repo.list({ status: JobStatus.QUEUED });
  assert.equal(byStatus.length, 1);

  const byType = await repo.list({ taskType: 'EVENT_TRIGGER' });
  assert.equal(byType.length, 0);

  assert.equal(await repo.countByStatus(JobStatus.QUEUED), 1);
  assert.equal(await repo.countByStatus(JobStatus.COMPLETED), 0);

  await repo.clear();
  assert.equal(await repo.count(), 0);
});

// ─── Worker registration ──────────────────────────────────────────────────────

test('registerWorker accepts valid workers and rejects non-functions and invalid types', () => {
  const { engine } = createFixture();

  // Valid registration
  engine.registerWorker('BACKGROUND_JOB', async (job) => ({ done: true }));

  // Non-function worker
  assert.throws(
    () => engine.registerWorker('BACKGROUND_JOB', 'not-a-function'),
    /must be a function/
  );

  // Invalid task type
  assert.throws(
    () => engine.registerWorker('ARBITRARY_SHELL_EXEC', async () => {}),
    /Invalid task type/
  );
});

// ─── EnqueueJob command ───────────────────────────────────────────────────────

test('EnqueueJob creates a QUEUED job and emits job_enqueued', async () => {
  const { engine, repository, eventBus } = createFixture();

  const res = await engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, 'enq-1'));

  assert.match(res.job.jobId, /^job_/);
  assert.equal(res.job.taskType, TaskType.BACKGROUND_JOB);
  assert.equal(res.job.status, JobStatus.QUEUED);
  assert.equal(res.job.priority, 5);
  assert.equal(res.job.maxRetries, 3);
  assert.equal(await repository.count(), 1);

  const events = eventBus.getHistory({ eventType: 'econet.automation.job_enqueued' });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.21.automation');
  assert.equal(events[0].subject.entityType, 'background_job');
  assert.equal(events[0].payload.enqueuedBy, 'auto-mgr-1');
});

test('EnqueueJob validates taskType and payload', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(cmd('EnqueueJob', { taskType: 'UNKNOWN_TYPE', payload: {} }, 'bad-type')),
    /Invalid task type/
  );

  await assert.rejects(
    engine.executeCommand(cmd('EnqueueJob', { taskType: 'BACKGROUND_JOB', payload: null }, 'bad-payload')),
    /object payload/
  );

  await assert.rejects(
    engine.executeCommand(cmd('EnqueueJob', { taskType: 'BACKGROUND_JOB', payload: [1, 2] }, 'arr-payload')),
    /object payload/
  );
});

test('EnqueueJob clamps priority and maxRetries to safe bounds', async () => {
  const { engine } = createFixture();

  const res = await engine.executeCommand(cmd('EnqueueJob', {
    taskType: 'BACKGROUND_JOB',
    payload: { x: 1 },
    priority: 9999,
    maxRetries: 99
  }, 'bounds'));

  assert.equal(res.job.priority, 100);   // clamped to MAX_PRIORITY
  assert.equal(res.job.maxRetries, 10);  // clamped to MAX_RETRIES_LIMIT
});

// ─── CancelJob command ────────────────────────────────────────────────────────

test('CancelJob cancels a QUEUED job and removes it from the queue', async () => {
  const { engine, eventBus } = createFixture();

  const enqRes = await engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, 'cx-enq'));
  const { jobId } = enqRes.job;

  const cancelRes = await engine.executeCommand(cmd('CancelJob', { jobId }, 'cx-can'));
  assert.equal(cancelRes.job.status, JobStatus.FAILED);

  // Job removed from in-memory queue
  const stats = await engine.getQueueStats();
  assert.equal(stats.queueDepth, 0);

  // Repository persists cancelled state
  const stored = await engine.getJob(jobId);
  assert.equal(stored.status, JobStatus.FAILED);

  const events = eventBus.getHistory({ eventType: 'econet.automation.job_cancelled' });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.21.automation');
});

test('CancelJob rejects non-QUEUED jobs', async () => {
  const { engine } = createFixture();

  // Register a worker so the job can complete
  engine.registerWorker('BACKGROUND_JOB', async () => ({ done: true }));

  const enqRes = await engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, 'cx-comp-enq'));
  const { jobId } = enqRes.job;

  // Process it to COMPLETED
  await engine.processNext();

  await assert.rejects(
    engine.executeCommand(cmd('CancelJob', { jobId }, 'cx-comp-can')),
    /Only QUEUED jobs can be cancelled/
  );
});

test('CancelJob rejects unknown jobId', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(cmd('CancelJob', { jobId: 'job-missing' }, 'cx-miss')),
    /BackgroundJob not found/
  );
});

// ─── RetryJob command ─────────────────────────────────────────────────────────

test('RetryJob creates a new QUEUED job from a FAILED job', async () => {
  const { engine, repository } = createFixture();

  // Fail a job manually by enqueueing with a worker that throws
  const enqRes = await engine.executeCommand(cmd('EnqueueJob', {
    taskType: 'BACKGROUND_JOB',
    payload: { op: 'failing' },
    maxRetries: 0   // immediate dead-letter on first failure
  }, 'rt-enq'));
  const { jobId } = enqRes.job;

  // Register a failing worker and process
  engine.registerWorker('BACKGROUND_JOB', async () => { throw new Error('simulated failure'); });
  await engine.processNext();   // -> DEAD_LETTER (maxRetries=0, retryCount becomes 0 then >= 0)

  // Verify DEAD_LETTER state
  const deadJob = await engine.getJob(jobId);
  assert.equal(deadJob.status, JobStatus.DEAD_LETTER);

  // Retry: creates a NEW job
  const retryRes = await engine.executeCommand(cmd('RetryJob', { jobId }, 'rt-retry'));
  assert.match(retryRes.job.jobId, /^job_/);
  assert.notEqual(retryRes.job.jobId, jobId, 'retry creates a new job');
  assert.equal(retryRes.job.status, JobStatus.QUEUED);
  assert.equal(retryRes.retriedFrom, jobId);
  assert.equal(await repository.count(), 2);
});

test('RetryJob rejects non-FAILED/non-DEAD_LETTER jobs', async () => {
  const { engine } = createFixture();

  const enqRes = await engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, 'rt-q-enq'));

  await assert.rejects(
    engine.executeCommand(cmd('RetryJob', { jobId: enqRes.job.jobId }, 'rt-q-ret')),
    /Only FAILED or DEAD_LETTER jobs can be retried/
  );
});

// ─── processNext / processAll ─────────────────────────────────────────────────

test('processNext executes a job with a registered worker and emits job_completed', async () => {
  const { engine, eventBus } = createFixture();

  engine.registerWorker('BACKGROUND_JOB', async (job) => ({ processed: job.payload.operation }));

  await engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, 'pn-enq'));
  const result = await engine.processNext();

  assert.equal(result.success, true);
  assert.equal(result.job.status, JobStatus.COMPLETED);
  assert.deepEqual(result.result, { processed: 'reconcile_predictions' });

  const events = eventBus.getHistory({ eventType: 'econet.automation.job_completed' });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.21.automation');

  // Queue is now empty
  assert.equal((await engine.getQueueStats()).queueDepth, 0);
});

test('processNext returns null when queue is empty', async () => {
  const { engine } = createFixture();
  assert.equal(await engine.processNext(), null);
});

test('processNext sends job to dead-letter when no worker is registered', async () => {
  const { engine, eventBus } = createFixture();

  await engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, 'no-worker'));
  const result = await engine.processNext();

  assert.equal(result.success, false);
  assert.equal(result.deadLetter, true);
  assert.match(result.error, /No worker registered/);

  const events = eventBus.getHistory({ eventType: 'econet.automation.job_dead_lettered' });
  assert.equal(events.length, 1);
});

test('processNext retries a job and eventually dead-letters it', async () => {
  const { engine, eventBus } = createFixture();

  let attempts = 0;
  engine.registerWorker('BACKGROUND_JOB', async () => {
    attempts++;
    throw new Error('transient failure');
  });

  // maxRetries=2 → DEAD_LETTER after 2 retries (retryCount becomes 2, which >= 2)
  await engine.executeCommand(cmd('EnqueueJob', {
    taskType: 'BACKGROUND_JOB',
    payload: { op: 'flaky' },
    maxRetries: 2,
    priority: 10
  }, 'retry-enq'));

  // First attempt → fails, retryCount=1, re-queued
  const r1 = await engine.processNext();
  assert.equal(r1.retrying, true);
  assert.equal(r1.job.retryCount, 1);

  // Second attempt → retryCount=2, dead-letter (>= maxRetries)
  const r2 = await engine.processNext();
  assert.equal(r2.deadLetter, true);
  assert.equal(r2.job.status, JobStatus.DEAD_LETTER);

  assert.equal(attempts, 2);

  const failedEvents = eventBus.getHistory({ eventType: 'econet.automation.job_failed' });
  const deadLetterEvents = eventBus.getHistory({ eventType: 'econet.automation.job_dead_lettered' });
  assert.equal(failedEvents.length, 1);
  assert.equal(deadLetterEvents.length, 1);
});

test('processAll drains the entire queue', async () => {
  const { engine } = createFixture();

  engine.registerWorker('BACKGROUND_JOB', async () => ({ ok: true }));

  for (let i = 0; i < 3; i++) {
    await engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, `all-${i}`));
  }
  assert.equal((await engine.getQueueStats()).queueDepth, 3);

  const results = await engine.processAll();
  assert.equal(results.length, 3);
  assert.ok(results.every(r => r.success));
  assert.equal((await engine.getQueueStats()).queueDepth, 0);
});

test('Priority ordering: lower priority value is processed first', async () => {
  const { engine } = createFixture();

  const order = [];
  engine.registerWorker('BACKGROUND_JOB', async (job) => {
    order.push(job.payload.label);
  });

  // Enqueue in reverse priority order
  await engine.executeCommand(cmd('EnqueueJob', { taskType: 'BACKGROUND_JOB', payload: { label: 'low' }, priority: 50 }, 'prio-low'));
  await engine.executeCommand(cmd('EnqueueJob', { taskType: 'BACKGROUND_JOB', payload: { label: 'high' }, priority: 1 }, 'prio-high'));
  await engine.executeCommand(cmd('EnqueueJob', { taskType: 'BACKGROUND_JOB', payload: { label: 'mid' }, priority: 10 }, 'prio-mid'));

  await engine.processAll();
  assert.deepEqual(order, ['high', 'mid', 'low']);
});

// ─── Queries ──────────────────────────────────────────────────────────────────

test('Queries return jobs and handle unknown IDs', async () => {
  const { engine } = createFixture();

  assert.equal(await engine.getJob('missing'), null);
  assert.deepEqual(await engine.listJobs(), []);

  const enqRes = await engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, 'qry-enq'));
  const { jobId } = enqRes.job;

  const found = await engine.getJob(jobId);
  assert.equal(found.jobId, jobId);

  const all = await engine.listJobs();
  assert.equal(all.length, 1);

  const byStatus = await engine.listJobs({ status: JobStatus.QUEUED });
  assert.equal(byStatus.length, 1);

  const byType = await engine.listJobs({ taskType: 'EVENT_TRIGGER' });
  assert.equal(byType.length, 0);
});

test('getQueueStats reflects current queue state', async () => {
  const { engine } = createFixture();

  engine.registerWorker('BACKGROUND_JOB', async () => ({}));

  const stats0 = await engine.getQueueStats();
  assert.equal(stats0.queueDepth, 0);
  assert.deepEqual(stats0.registeredWorkers, ['BACKGROUND_JOB']);

  await engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, 'stats-enq'));
  const stats1 = await engine.getQueueStats();
  assert.equal(stats1.queueDepth, 1);

  await engine.processNext();
  const stats2 = await engine.getQueueStats();
  assert.equal(stats2.queueDepth, 0);
  assert.equal(stats2.persisted.completed, 1);
});

// ─── Authorization ────────────────────────────────────────────────────────────

test('Authorization: missing actor is rejected', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(new Command({
      commandType: 'EnqueueJob',
      targetEngine: '21-automation',
      payload: VALID_ENQUEUE,
      idempotencyKey: 'auth-no-actor'
    })),
    /require an authenticated actor/
  );
});

test('Authorization: missing roles field is denied', async () => {
  const { engine } = createFixture();
  const noRoles = { actorId: 'user-no-roles' };

  await assert.rejects(
    engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, 'auth-no-roles', noRoles)),
    /lacks an authorized automation role/
  );
  assert.equal(await engine.repository.count(), 0);
});

test('Authorization: non-array roles are denied', async () => {
  const { engine } = createFixture();

  const variants = [
    { actorId: 'u1', roles: 'automation_manager' },
    { actorId: 'u2', roles: { automation_manager: true } },
    { actorId: 'u3', roles: null },
    { actorId: 'u4', roles: 42 }
  ];

  for (const actor of variants) {
    await assert.rejects(
      engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, `non-arr-${actor.actorId}`, actor)),
      /lacks an authorized automation role/
    );
  }
});

test('Authorization: empty roles array is denied', async () => {
  const { engine } = createFixture();
  const emptyActor = { actorId: 'user-empty', roles: [] };

  await assert.rejects(
    engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, 'auth-empty', emptyActor)),
    /lacks an authorized automation role/
  );
});

test('Authorization: unauthorized role is denied on all three mutating commands', async () => {
  const { engine } = createFixture();

  const observer = { actorId: 'obs-1', roles: ['observer'] };

  // Pre-create a job with valid actor so CancelJob/RetryJob have a target
  const enqRes = await engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, 'auth-d-pre'));
  const { jobId } = enqRes.job;

  const cases = [
    ['EnqueueJob', { ...VALID_ENQUEUE }, 'auth-d-enq'],
    ['CancelJob', { jobId }, 'auth-d-can'],
    ['RetryJob', { jobId }, 'auth-d-ret']
  ];

  for (const [commandType, payload, suffix] of cases) {
    await assert.rejects(
      engine.executeCommand(cmd(commandType, payload, suffix, observer)),
      /lacks an authorized automation role/,
      `Expected denial for ${commandType}`
    );
  }

  // State untouched — job is still QUEUED
  const stored = await engine.getJob(jobId);
  assert.equal(stored.status, JobStatus.QUEUED);
});

test('Authorization: all four canonical authorized roles are accepted', async () => {
  const AUTHORIZED_ROLES = ['system', 'admin', 'automation_manager', 'automation'];

  for (const role of AUTHORIZED_ROLES) {
    const { engine } = createFixture();
    const actor = { actorId: `user-${role}`, roles: [role] };

    const res = await engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, `role-${role}`, actor));
    assert.equal(res.job.status, JobStatus.QUEUED, `Role "${role}" should be authorized`);
  }
});

// ─── Authorization ordering ───────────────────────────────────────────────────

test('Authorization denial fires before idempotency, governance, and mutation', async () => {
  let governanceCalled = false;
  const repository = new InMemoryJobRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new AutomationEngine({
    service: new AutomationApplicationService({
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

  const noRoles = { actorId: 'user-no-roles' };
  await assert.rejects(
    engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, 'order-chk', noRoles)),
    /lacks an authorized automation role/
  );

  assert.equal(governanceCalled, false, 'governance must not be called when authorization fails');
  assert.equal(await repository.count(), 0, 'no state must be mutated');
  assert.equal(eventBus.getHistory().length, 0, 'no events must be published');
});

// ─── Governance ───────────────────────────────────────────────────────────────

test('Governance denial blocks mutation before any state change or event', async () => {
  const repository = new InMemoryJobRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new AutomationEngine({
    service: new AutomationApplicationService({
      repository,
      eventBus,
      idempotencyManager,
      governance: {
        async evaluatePolicy({ commandType }) {
          if (commandType === 'EnqueueJob') {
            return { allowed: false, reason: 'AUTOMATION_FROZEN' };
          }
          return { allowed: true };
        }
      }
    })
  });

  await assert.rejects(
    engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, 'gov-enq')),
    /Governance policy denial: AUTOMATION_FROZEN/
  );

  assert.equal(await repository.count(), 0);
  assert.equal(eventBus.getHistory({ eventType: 'econet.automation.job_enqueued' }).length, 0);
});

// ─── Idempotency ──────────────────────────────────────────────────────────────

test('EnqueueJob idempotency: same command key returns cached result, no duplicate job', async () => {
  const { engine, repository, eventBus } = createFixture();

  const first = await engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, 'idem-enq'));
  const second = await engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, 'idem-enq'));

  assert.equal(second.job.jobId, first.job.jobId);
  assert.equal(await repository.count(), 1);
  assert.equal(eventBus.getHistory({ eventType: 'econet.automation.job_enqueued' }).length, 1);
});

test('Commands without idempotencyKey are rejected', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(new Command({
      commandType: 'EnqueueJob',
      targetEngine: '21-automation',
      payload: VALID_ENQUEUE,
      actor: OPERATOR
    })),
    /requires an idempotencyKey/
  );
});

// ─── Unsupported commands ─────────────────────────────────────────────────────

test('Unsupported commands are rejected', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(cmd('DeleteAllJobs', {}, 'bad-cmd')),
    /Unsupported Automation command/
  );
});

// ─── Security: no arbitrary code execution ────────────────────────────────────

test('EnqueueJob cannot execute arbitrary code — only registered worker types are dispatched', async () => {
  const { engine } = createFixture();

  // An attacker attempts to enqueue a job type with an executable payload
  await assert.rejects(
    engine.executeCommand(cmd('EnqueueJob', {
      taskType: 'eval("process.exit(1)")',
      payload: { evil: true }
    }, 'sec-eval')),
    /Invalid task type/
  );

  await assert.rejects(
    engine.executeCommand(cmd('EnqueueJob', {
      taskType: 'require("child_process").exec("rm -rf /")',
      payload: {}
    }, 'sec-shell')),
    /Invalid task type/
  );

  // Only canonical task types can be enqueued
  // Even with a canonical type, if no worker is registered it goes to dead-letter (not arbitrary execution)
  await engine.executeCommand(cmd('EnqueueJob', {
    taskType: 'INTEGRATION_JOB',
    payload: { connectorRef: 'con-abc', operation: 'ping' }
  }, 'sec-safe'));

  const result = await engine.processNext();
  assert.equal(result.deadLetter, true);  // No worker → dead-letter, not code execution
  assert.match(result.error, /No worker registered/);
});

// ─── Event correctness ────────────────────────────────────────────────────────

test('All automation events carry correct producer and subject entityType', async () => {
  const { engine, eventBus } = createFixture();

  engine.registerWorker('BACKGROUND_JOB', async () => ({}));

  // Enqueue + complete
  const enqRes = await engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, 'ev-enq'));
  await engine.processNext();

  const enqueuedEvents = eventBus.getHistory({ eventType: 'econet.automation.job_enqueued' });
  const completedEvents = eventBus.getHistory({ eventType: 'econet.automation.job_completed' });

  assert.equal(enqueuedEvents.length, 1);
  assert.equal(completedEvents.length, 1);

  for (const e of [...enqueuedEvents, ...completedEvents]) {
    assert.equal(e.producer, 'engine.21.automation');
  }
  assert.equal(enqueuedEvents[0].subject.entityType, 'background_job');
  assert.equal(enqueuedEvents[0].subject.entityId, enqRes.job.jobId);
});

test('No false success event is emitted for a dead-lettered job', async () => {
  const { engine, eventBus } = createFixture();
  // No worker registered → dead-letter

  await engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, 'no-worker-ev'));
  await engine.processNext();

  assert.equal(eventBus.getHistory({ eventType: 'econet.automation.job_completed' }).length, 0);
  assert.equal(eventBus.getHistory({ eventType: 'econet.automation.job_dead_lettered' }).length, 1);
});

// ─── Repository isolation ─────────────────────────────────────────────────────

test('Repository isolation: no cross-instance state leak', async () => {
  const engineA = new AutomationEngine({ repository: new InMemoryJobRepository() });
  const engineB = new AutomationEngine({ repository: new InMemoryJobRepository() });

  await engineA.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, 'iso-a'));

  assert.equal((await engineA.listJobs()).length, 1);
  assert.equal((await engineB.listJobs()).length, 0, 'no cross-engine state leak');
});

// ─── Lifecycle contract ───────────────────────────────────────────────────────

test('AutomationEngine exposes the canonical lifecycle contract', async () => {
  const { engine, repository } = createFixture();

  assert.equal(engine.engineId, '21');
  assert.equal(engine.engineName, 'Automation Engine');

  const init = await engine.initialize();
  assert.equal(init.ready, true);

  const health = await engine.healthCheck();
  assert.equal(health.healthy, true);
  assert.equal(health.details.status, 'READY');
  assert.equal(health.details.persistence, 'IN_MEMORY_AUTOMATION_ADAPTER');
  assert.equal(health.details.queueDepth, 0);

  await engine.executeCommand(cmd('EnqueueJob', VALID_ENQUEUE, 'lc-enq'));
  assert.equal((await engine.healthCheck()).details.queueDepth, 1);

  await engine.shutdown();
  assert.equal((await engine.healthCheck()).details.queueDepth, 0);
  // Repository still has the job record after shutdown
  assert.equal(await repository.count(), 1);
});
