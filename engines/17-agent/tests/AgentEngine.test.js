import test from 'node:test';
import assert from 'node:assert/strict';

import { Command } from '../../../contracts/commands/Command.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import {
  AgentEngine,
  AgentApplicationService,
  InMemoryAgentRepository,
  Agent,
  AgentTask,
  AgentExecution,
  AgentKind,
  AgentStatus,
  ExecutionStatus,
  normalizeAgentKind,
  canTransitionAgentStatus,
  canTransitionExecution,
  isTerminalExecution,
  assertAgentStatusTransition,
  assertExecutionTransition
} from '../index.js';

const command = (commandType, payload, suffix, actor = null) => new Command({
  commandType,
  targetEngine: '17-agent',
  payload,
  actor: actor || { actorId: 'agent-manager-1', roles: ['agent_manager'] },
  idempotencyKey: `agt-test-${suffix}`,
  correlationId: `cor-${suffix}`
});

const createFixture = (options = {}) => {
  const repository = new InMemoryAgentRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new AgentEngine({
    repository,
    eventBus,
    idempotencyManager,
    clock: () => new Date('2029-10-01T10:00:00.000Z'),
    ...options
  });
  return { engine, repository, eventBus, idempotencyManager };
};

test('AgentKind/AgentStatus/ExecutionStatus value objects validate canonical vocabularies', () => {
  assert.equal(normalizeAgentKind('scout'), AgentKind.SCOUT);
  assert.equal(normalizeAgentKind('ANALYST'), AgentKind.ANALYST);
  assert.equal(normalizeAgentKind('guardian'), AgentKind.GUARDIAN);
  assert.equal(normalizeAgentKind('guide'), AgentKind.GUIDE);
  assert.equal(normalizeAgentKind('coordinator'), AgentKind.COORDINATOR);
  assert.throws(() => normalizeAgentKind('oracle'), /Invalid agent kind/);

  // Agent status
  assert.equal(canTransitionAgentStatus(AgentStatus.DRAFT, AgentStatus.ACTIVE), true);
  assert.equal(canTransitionAgentStatus(AgentStatus.ACTIVE, AgentStatus.SUSPENDED), true);
  assert.equal(canTransitionAgentStatus(AgentStatus.ACTIVE, AgentStatus.RETIRED), true);
  assert.equal(canTransitionAgentStatus(AgentStatus.SUSPENDED, AgentStatus.ACTIVE), true);
  assert.equal(canTransitionAgentStatus(AgentStatus.RETIRED, AgentStatus.ACTIVE), false);
  assert.throws(() => assertAgentStatusTransition(AgentStatus.RETIRED, AgentStatus.ACTIVE), /Invalid agent lifecycle transition/);

  // Execution status
  assert.equal(canTransitionExecution(ExecutionStatus.PENDING, ExecutionStatus.RUNNING), true);
  assert.equal(canTransitionExecution(ExecutionStatus.RUNNING, ExecutionStatus.COMPLETED), true);
  assert.equal(canTransitionExecution(ExecutionStatus.RUNNING, ExecutionStatus.FAILED), true);
  assert.equal(canTransitionExecution(ExecutionStatus.RUNNING, ExecutionStatus.CANCELLED), true);
  assert.equal(canTransitionExecution(ExecutionStatus.RUNNING, ExecutionStatus.TIMED_OUT), true);
  assert.equal(canTransitionExecution(ExecutionStatus.COMPLETED, ExecutionStatus.RUNNING), false);
  assert.equal(isTerminalExecution(ExecutionStatus.COMPLETED), true);
  assert.throws(() => assertExecutionTransition(ExecutionStatus.COMPLETED, ExecutionStatus.RUNNING), /Invalid execution lifecycle transition/);
});

test('Agent entity requires name/kind and protects lifecycle', () => {
  const agent = new Agent({ name: 'Scout-1', kind: 'SCOUT', capabilities: ['disaster_detection'] });
  assert.match(agent.agentId, /^agt_/);
  assert.equal(agent.kind, AgentKind.SCOUT);
  assert.equal(agent.status, AgentStatus.DRAFT);
  assert.equal(Object.isFrozen(agent), true);

  const activated = agent.transitionTo(AgentStatus.ACTIVE);
  assert.equal(activated.status, AgentStatus.ACTIVE);
  assert.equal(agent.status, AgentStatus.DRAFT, 'original unchanged');

  assert.throws(() => new Agent({ name: '', kind: 'SCOUT' }), /non-empty name/);
  assert.throws(() => new Agent({ name: 'x', kind: 'ORACLE' }), /Invalid agent kind/);
});

test('AgentTask enforces execution state transitions', () => {
  const task = new AgentTask({
    agentId: 'agt-1',
    kind: 'SCOUT',
    input: { text: 'flood' },
    requestedBy: 'actor-1'
  });
  assert.equal(task.status, ExecutionStatus.PENDING);

  const running = task.markRunning();
  assert.equal(running.status, ExecutionStatus.RUNNING);

  const completed = running.markCompleted({ ok: true });
  assert.equal(completed.status, ExecutionStatus.COMPLETED);
  assert.deepEqual(completed.result, { ok: true });

  // Terminal transitions are rejected
  assert.throws(() => completed.markRunning(), /Invalid execution lifecycle transition/);
  assert.throws(() => task.markCompleted({}), /Invalid execution lifecycle transition/);

  // Failure requires an error string
  assert.throws(() => running.markFailed(''), /requires an error string/);
});

test('RunAgentTask completes with bounded capability and provenance', async () => {
  const { engine, eventBus } = createFixture();

  const reg = await engine.executeCommand(command('RegisterAgent', {
    name: 'Text Analyzer',
    kind: 'ANALYST',
    capabilities: ['summarize']
  }, 'run-0'));
  const agentId = reg.agent.agentId;
  await engine.executeCommand(command('ChangeAgentStatus', {
    agentId, status: AgentStatus.ACTIVE
  }, 'run-0b'));

  const res = await engine.executeCommand(command('RunAgentTask', {
    agentId,
    capability: 'summarize',
    input: { text: 'A'.repeat(500) },
    timeoutMs: 5000
  }, 'run-1'));

  assert.equal(res.status, ExecutionStatus.COMPLETED);
  assert.equal(res.task.status, ExecutionStatus.COMPLETED);
  assert.equal(res.task.result.truncated, true);
  assert.equal(res.execution.agentId, agentId);
  assert.equal(res.execution.requestedBy, 'agent-manager-1');
  assert.ok(res.execution.startedAt);

  const events = eventBus.getHistory({ eventType: 'econet.agent.task_completed' });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.17.agent');
  assert.equal(events[0].subject.entityType, 'agent_task');
});

test('RunAgentTask rejects undeclared capabilities and non-operational agents', async () => {
  const { engine } = createFixture();

  const reg = await engine.executeCommand(command('RegisterAgent', {
    name: 'Guardian', kind: 'GUARDIAN', capabilities: ['noop']
  }, 'cap-0'));

  // DRAFT agent is not operational (checked before capability)
  await assert.rejects(
    engine.executeCommand(command('RunAgentTask', {
      agentId: reg.agent.agentId,
      capability: 'noop',
      input: {}
    }, 'cap-2')),
    /not operational/
  );

  // Activate, then undeclared capability is rejected
  await engine.executeCommand(command('ChangeAgentStatus', {
    agentId: reg.agent.agentId, status: AgentStatus.ACTIVE
  }, 'cap-0b'));
  await assert.rejects(
    engine.executeCommand(command('RunAgentTask', {
      agentId: reg.agent.agentId,
      capability: 'destroy_the_db',
      input: {}
    }, 'cap-1')),
    /does not declare capability/
  );
});

test('Unsafe capability is rejected by the safe-execution allowlist', async () => {
  const { engine } = createFixture();

  const reg = await engine.executeCommand(command('RegisterAgent', {
    name: 'Scout', kind: 'SCOUT', capabilities: ['disaster_detection']
  }, 'safe-0'));
  await engine.executeCommand(command('ChangeAgentStatus', {
    agentId: reg.agent.agentId, status: AgentStatus.ACTIVE
  }, 'safe-0b'));

  // The default executor refuses arbitrary capabilities not in its allowlist.
  const res = await engine.executeCommand(command('RunAgentTask', {
    agentId: reg.agent.agentId,
    capability: 'disaster_detection',
    input: { text: 'flood' }
  }, 'safe-1'));

  assert.equal(res.status, ExecutionStatus.FAILED);
  assert.equal(res.task.status, ExecutionStatus.FAILED);
  assert.match(res.task.error, /not in the Engine 17 safe execution allowlist/);
});

test('RunAgentTask times out and records TIMED_OUT with event', async () => {
  const { engine, eventBus } = createFixture({
    executor: {
      async execute() {
        // Never resolves => hits timeout
        return new Promise(() => {});
      }
    }
  });

  const reg = await engine.executeCommand(command('RegisterAgent', {
    name: 'Slow', kind: 'GENERIC', capabilities: ['noop']
  }, 'to-0'));
  await engine.executeCommand(command('ChangeAgentStatus', {
    agentId: reg.agent.agentId, status: AgentStatus.ACTIVE
  }, 'to-0b'));

  const res = await engine.executeCommand(command('RunAgentTask', {
    agentId: reg.agent.agentId,
    capability: 'noop',
    input: {},
    timeoutMs: 20
  }, 'to-1'));

  assert.equal(res.status, ExecutionStatus.TIMED_OUT);
  assert.equal(res.task.status, ExecutionStatus.TIMED_OUT);
  assert.match(res.execution.error, /timed out/);
  assert.equal(eventBus.getHistory({ eventType: 'econet.agent.task_failed' }).length, 1);
});

test('RunAgentTask records FAILED when executor rejects', async () => {
  const { engine, eventBus } = createFixture({
    executor: {
      async execute() {
        throw new Error('dependency unavailable');
      }
    }
  });

  const reg = await engine.executeCommand(command('RegisterAgent', {
    name: 'Flaky', kind: 'GENERIC', capabilities: ['noop']
  }, 'fe-0'));
  await engine.executeCommand(command('ChangeAgentStatus', {
    agentId: reg.agent.agentId, status: AgentStatus.ACTIVE
  }, 'fe-0b'));

  const res = await engine.executeCommand(command('RunAgentTask', {
    agentId: reg.agent.agentId,
    capability: 'noop',
    input: {}
  }, 'fe-1'));

  assert.equal(res.status, ExecutionStatus.FAILED);
  assert.match(res.execution.error, /dependency unavailable/);
  assert.equal(eventBus.getHistory({ eventType: 'econet.agent.task_failed' }).length, 1);
});

test('CancelAgentTask transitions a RUNNING task to CANCELLED', async () => {
  // Controllable executor: stays in-flight until we release it.
  let release;
  const hang = new Promise((resolve) => { release = resolve; });
  const { engine: eng, repository, eventBus } = createFixture({
    executor: { async execute() { return hang; } }
  });

  const reg = await eng.executeCommand(command('RegisterAgent', {
    name: 'Cancellable', kind: 'GENERIC', capabilities: ['noop']
  }, 'cc-0'));
  await eng.executeCommand(command('ChangeAgentStatus', {
    agentId: reg.agent.agentId, status: AgentStatus.ACTIVE
  }, 'cc-0b'));

  // Start the task WITHOUT awaiting it (the in-flight run stays RUNNING).
  let settled = false;
  const runPromise = eng.executeCommand(command('RunAgentTask', {
    agentId: reg.agent.agentId,
    capability: 'noop',
    input: {},
    timeoutMs: 60000
  }, 'cc-1')).then((res) => { settled = true; return res; });

  // Poll for the task id (RUNNING or PENDING) from the repository.
  let taskId = null;
  for (let i = 0; i < 50 && !taskId; i++) {
    const tasks = await repository.findTasksByAgent(reg.agent.agentId);
    if (tasks.length > 0) {
      taskId = tasks[0].taskId;
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.ok(taskId, 'task was created');

  const cancelled = await eng.executeCommand(command('CancelAgentTask', {
    taskId,
    reason: 'operator intervention'
  }, 'cc-2'));

  assert.equal(cancelled.status, ExecutionStatus.CANCELLED);
  assert.equal(cancelled.task.status, ExecutionStatus.CANCELLED);
  assert.equal(eventBus.getHistory({ eventType: 'econet.agent.task_cancelled' }).length, 1);

  // Release the in-flight executor so the abandoned run settles (its completion
  // write races the cancellation; the assertion is only that it settles).
  release({ ok: true });
  await runPromise.catch(() => {});
  assert.equal(settled, true, 'in-flight run settled');
});

test('DelegateAgentTask preserves parent→child provenance', async () => {
  const { engine, eventBus } = createFixture();

  const parentReg = await engine.executeCommand(command('RegisterAgent', {
    name: 'Coordinator', kind: 'COORDINATOR', capabilities: ['noop']
  }, 'dg-0'));
  await engine.executeCommand(command('ChangeAgentStatus', {
    agentId: parentReg.agent.agentId, status: AgentStatus.ACTIVE
  }, 'dg-0b'));

  const childReg = await engine.executeCommand(command('RegisterAgent', {
    name: 'Worker', kind: 'SCOUT', capabilities: ['echo']
  }, 'dg-1'));
  await engine.executeCommand(command('ChangeAgentStatus', {
    agentId: childReg.agent.agentId, status: AgentStatus.ACTIVE
  }, 'dg-1b'));

  const parent = await engine.executeCommand(command('RunAgentTask', {
    agentId: parentReg.agent.agentId,
    capability: 'noop',
    input: { phase: 1 }
  }, 'dg-2'));
  assert.equal(parent.status, ExecutionStatus.COMPLETED);

  const delegated = await engine.executeCommand(command('DelegateAgentTask', {
    parentTaskId: parent.task.taskId,
    childAgentId: childReg.agent.agentId,
    capability: 'echo',
    input: { value: 'scout-report' }
  }, 'dg-3'));

  assert.equal(delegated.status, ExecutionStatus.COMPLETED);
  assert.equal(delegated.task.parentTaskId, parent.task.taskId);
  assert.equal(delegated.task.result.echoed, 'scout-report');
  assert.ok(delegated.execution.parentExecutionId, 'child execution carries parent execution id');

  const childTasks = await engine.getTasksByAgent(childReg.agent.agentId);
  assert.equal(childTasks.length, 1);
  assert.equal(childTasks[0].parentTaskId, parent.task.taskId);

  const delegatedEvents = eventBus.getHistory({ eventType: 'econet.agent.task_delegated' });
  assert.equal(delegatedEvents.length, 1);
  assert.equal(delegatedEvents[0].payload.parentTaskId, parent.task.taskId);
  assert.equal(delegatedEvents[0].payload.childTaskId, delegated.task.taskId);
});

test('Idempotent duplicate commands do not create duplicate tasks', async () => {
  const { engine, repository } = createFixture();

  const reg = await engine.executeCommand(command('RegisterAgent', {
    name: 'Idem Agent', kind: 'GENERIC', capabilities: ['noop']
  }, 'id-0'));
  await engine.executeCommand(command('ChangeAgentStatus', {
    agentId: reg.agent.agentId, status: AgentStatus.ACTIVE
  }, 'id-0b'));

  const cmd = command('RunAgentTask', {
    agentId: reg.agent.agentId,
    capability: 'noop',
    input: {}
  }, 'idem-run');

  const first = await engine.executeCommand(cmd);
  const second = await engine.executeCommand(cmd);

  assert.equal(second.task.taskId, first.task.taskId);
  const tasks = await repository.findTasksByAgent(reg.agent.agentId);
  assert.equal(tasks.length, 1);
});

test('Authorization: an arbitrary actor cannot register or run agents', async () => {
  const { engine, repository, eventBus } = createFixture();

  await assert.rejects(
    engine.executeCommand(command('RegisterAgent', {
      name: 'Hax', kind: 'GENERIC', capabilities: ['noop']
    }, 'au-0', { actorId: 'random-user', roles: ['observer'] })),
    /lacks an authorized agent role/
  );
  assert.equal(await repository.countAgents(), 0);
  assert.equal(eventBus.getHistory().length, 0);

  await assert.rejects(
    engine.executeCommand(new Command({
      commandType: 'RegisterAgent',
      targetEngine: '17-agent',
      idempotencyKey: 'au-1',
      payload: { name: 'X', kind: 'GENERIC', capabilities: [] }
    })),
    /require an authenticated actor/
  );
});

test('Governance denial blocks agent mutation before state change or event', async () => {
  const repository = new InMemoryAgentRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const service = new AgentApplicationService({
    repository,
    eventBus,
    idempotencyManager,
    governance: {
      async evaluatePolicy({ commandType }) {
        if (commandType === 'RegisterAgent') {
          return { allowed: false, reason: 'AGENT_REGISTRATION_FROZEN' };
        }
        return { allowed: true };
      }
    }
  });
  const engine = new AgentEngine({ service });

  await assert.rejects(
    engine.executeCommand(command('RegisterAgent', {
      name: 'Blocked', kind: 'GENERIC', capabilities: []
    }, 'gv-1')),
    /Governance policy denial: AGENT_REGISTRATION_FROZEN/
  );
  assert.equal(await repository.countAgents(), 0);
  assert.equal(eventBus.getHistory().length, 0);
});

test('AgentEngine exposes canonical lifecycle contract and isolated persistence', async () => {
  const { engine, repository } = createFixture();

  assert.equal(engine.engineId, '17');
  assert.equal(engine.engineName, 'Agent Engine');

  const init = await engine.initialize();
  assert.equal(init.ready, true);

  const health = await engine.healthCheck();
  assert.equal(health.healthy, true);
  assert.equal(health.details.status, 'READY');
  assert.equal(health.details.persistence, 'IN_MEMORY_AGENT_ADAPTER');
  assert.equal(health.details.totalAgents, 0);

  await engine.executeCommand(command('RegisterAgent', {
    name: 'Health Agent', kind: 'GENERIC', capabilities: ['noop']
  }, 'hc-1'));
  const health2 = await engine.healthCheck();
  assert.equal(health2.details.totalAgents, 1);

  await engine.shutdown();

  const repo2 = new InMemoryAgentRepository();
  const engine2 = new AgentEngine({ repository: repo2 });
  await engine2.executeCommand(command('RegisterAgent', {
    name: 'Isolated', kind: 'GENERIC', capabilities: ['noop']
  }, 'iso-1'));
  assert.equal(await repository.countAgents(), 1);
  assert.equal(await repo2.countAgents(), 1);
});

test('Query functions return agents, tasks, and executions', async () => {
  const { engine } = createFixture();

  const reg = await engine.executeCommand(command('RegisterAgent', {
    name: 'Queryable', kind: 'ANALYST', capabilities: ['summarize']
  }, 'q-0'));
  await engine.executeCommand(command('ChangeAgentStatus', {
    agentId: reg.agent.agentId, status: AgentStatus.ACTIVE
  }, 'q-0b'));

  const analysts = await engine.listAgents({ kind: 'ANALYST' });
  assert.equal(analysts.length, 1);

  const run = await engine.executeCommand(command('RunAgentTask', {
    agentId: reg.agent.agentId,
    capability: 'summarize',
    input: { text: 'short' }
  }, 'q-1'));
  const task = await engine.getTask(run.task.taskId);
  assert.equal(task.status, ExecutionStatus.COMPLETED);

  const executions = await engine.getExecutionsByTask(run.task.taskId);
  assert.ok(executions.length >= 1);
  const byAgent = await engine.getExecutionByTaskAndAgent(run.task.taskId, reg.agent.agentId);
  assert.equal(byAgent.agentId, reg.agent.agentId);
});
