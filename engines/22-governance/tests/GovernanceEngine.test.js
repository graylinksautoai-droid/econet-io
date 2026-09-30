import test from 'node:test';
import assert from 'node:assert/strict';

import { Command } from '../../../contracts/commands/Command.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import {
  GovernanceEngine,
  GovernanceApplicationService,
  InMemoryPolicyRepository,
  GovernancePolicy,
  PolicyStatus,
  canTransitionPolicyStatus,
  assertPolicyStatusTransition
} from '../index.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

const MANAGER = { actorId: 'gov-mgr-1', roles: ['governance_manager'] };

const cmd = (commandType, payload, suffix, actor = MANAGER) => new Command({
  commandType,
  targetEngine: '22-governance',
  payload,
  actor,
  idempotencyKey: `gov-test-${suffix}`,
  correlationId: `cor-${suffix}`
});

const createFixture = (options = {}) => {
  const repository = new InMemoryPolicyRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new GovernanceEngine({
    repository,
    eventBus,
    idempotencyManager,
    clock: () => new Date('2030-09-01T12:00:00.000Z'),
    ...options
  });
  return { engine, repository, eventBus, idempotencyManager };
};

// Minimal server-side evaluator — always allows
const ALLOW_ALL = () => ({ allowed: true });
// Always denies
const DENY_ALL = (reason) => () => ({ allowed: false, reason });

const VALID_REGISTER = {
  policyId: 'POL_TEST_001',
  name: 'Test Policy',
  target: 'RunSimulation',
  description: 'Blocks simulation in test scenarios',
  evaluator: ALLOW_ALL
};

// ─── PolicyStatus value object ────────────────────────────────────────────────

test('PolicyStatus lifecycle transitions are correctly enforced', () => {
  assert.equal(canTransitionPolicyStatus(PolicyStatus.ACTIVE, PolicyStatus.INACTIVE), true);
  assert.equal(canTransitionPolicyStatus(PolicyStatus.INACTIVE, PolicyStatus.ACTIVE), true);
  assert.equal(canTransitionPolicyStatus(PolicyStatus.ACTIVE, PolicyStatus.ACTIVE), false);
  assert.equal(canTransitionPolicyStatus(PolicyStatus.INACTIVE, PolicyStatus.INACTIVE), false);

  assert.throws(
    () => assertPolicyStatusTransition(PolicyStatus.ACTIVE, PolicyStatus.ACTIVE),
    /Invalid policy status transition/
  );
  assert.throws(
    () => assertPolicyStatusTransition(PolicyStatus.INACTIVE, PolicyStatus.INACTIVE),
    /Invalid policy status transition/
  );
});

// ─── GovernancePolicy contract ────────────────────────────────────────────────

test('GovernancePolicy validates construction and evaluates correctly', () => {
  const policy = new GovernancePolicy({
    policyId: 'POL-1',
    name: 'Test',
    target: 'SubmitObservation',
    evaluator: (ctx) => ({ allowed: ctx.actor?.roles?.includes('admin') ?? false, reason: 'admin only' })
  });

  assert.equal(policy.policyId, 'POL-1');
  assert.equal(policy.active, true);
  assert.equal(Object.isFrozen(policy), true);

  const denied = policy.evaluate({ actor: { roles: ['observer'] } });
  assert.equal(denied.allowed, false);
  assert.equal(denied.policyId, 'POL-1');

  const allowed = policy.evaluate({ actor: { roles: ['admin'] } });
  assert.equal(allowed.allowed, true);

  // Inactive policy always passes
  const inactivePolicy = new GovernancePolicy({
    policyId: 'POL-2',
    name: 'Inactive',
    target: '*',
    evaluator: DENY_ALL('should not run'),
    active: false
  });
  const result = inactivePolicy.evaluate({ actor: null });
  assert.equal(result.allowed, true);
  assert.match(result.reason, /inactive/i);

  // Invalid construction
  assert.throws(() => new GovernancePolicy({ name: 'x', target: 'y', evaluator: ALLOW_ALL }), /policyId/);
  assert.throws(() => new GovernancePolicy({ policyId: 'p', target: 'y', evaluator: ALLOW_ALL }), /name/);
  assert.throws(() => new GovernancePolicy({ policyId: 'p', name: 'n', evaluator: ALLOW_ALL }), /target/);
  assert.throws(() => new GovernancePolicy({ policyId: 'p', name: 'n', target: 't', evaluator: 'not-fn' }), /evaluator/);
});

// ─── InMemoryPolicyRepository ─────────────────────────────────────────────────

test('InMemoryPolicyRepository persists, finds, lists, and counts policies', async () => {
  const repo = new InMemoryPolicyRepository();

  const p1 = new GovernancePolicy({ policyId: 'P1', name: 'P1', target: 'cmd1', evaluator: ALLOW_ALL });
  const p2 = new GovernancePolicy({ policyId: 'P2', name: 'P2', target: '*', evaluator: ALLOW_ALL, active: false });

  await repo.save(p1);
  await repo.save(p2);

  assert.equal(await repo.count(), 2);
  assert.equal(await repo.countActive(), 1);

  const found = await repo.findById('P1');
  assert.equal(found.policyId, 'P1');
  assert.equal(await repo.findById('MISSING'), null);

  const all = await repo.list();
  assert.equal(all.length, 2);

  const active = await repo.list({ activeOnly: true });
  assert.equal(active.length, 1);

  const byTarget = await repo.findByTarget('cmd1');
  assert.equal(byTarget.length, 2); // p1 (exact) + p2 (wildcard *)

  const wildcard = await repo.findByTarget('anything_else');
  assert.equal(wildcard.length, 1); // only p2 via target='*'

  await repo.clear();
  assert.equal(await repo.count(), 0);
});

// ─── RegisterPolicy command ───────────────────────────────────────────────────

test('RegisterPolicy registers a policy and emits policy_registered', async () => {
  const { engine, repository, eventBus } = createFixture();

  const res = await engine.executeCommand(cmd('RegisterPolicy', VALID_REGISTER, 'reg-1'));

  assert.equal(res.policy.policyId, 'POL_TEST_001');
  assert.equal(res.policy.name, 'Test Policy');
  assert.equal(res.policy.target, 'RunSimulation');
  assert.equal(res.policy.active, true);
  assert.equal(await repository.count(), 1);

  const events = eventBus.getHistory({ eventType: 'econet.governance.policy_registered' });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.22.governance');
  assert.equal(events[0].subject.entityType, 'governance_policy');
  assert.equal(events[0].subject.entityId, 'POL_TEST_001');
  assert.equal(events[0].payload.registeredBy, 'gov-mgr-1');
});

test('RegisterPolicy validates required fields', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(cmd('RegisterPolicy', { ...VALID_REGISTER, policyId: '' }, 'reg-bad-id')),
    /non-empty policyId/
  );
  await assert.rejects(
    engine.executeCommand(cmd('RegisterPolicy', { ...VALID_REGISTER, name: '' }, 'reg-bad-name')),
    /non-empty name/
  );
  await assert.rejects(
    engine.executeCommand(cmd('RegisterPolicy', { ...VALID_REGISTER, target: '' }, 'reg-bad-target')),
    /non-empty target/
  );
  await assert.rejects(
    engine.executeCommand(cmd('RegisterPolicy', { ...VALID_REGISTER, evaluator: 'not-a-function' }, 'reg-bad-eval')),
    /server-side evaluator function/
  );
});

test('RegisterPolicy rejects duplicate policyIds', async () => {
  const { engine } = createFixture();

  await engine.executeCommand(cmd('RegisterPolicy', VALID_REGISTER, 'dup-1'));

  await assert.rejects(
    engine.executeCommand(cmd('RegisterPolicy', VALID_REGISTER, 'dup-2')),
    /already registered/
  );
});

// ─── DeactivatePolicy command ─────────────────────────────────────────────────

test('DeactivatePolicy deactivates an active policy and emits policy_deactivated', async () => {
  const { engine, eventBus } = createFixture();

  await engine.executeCommand(cmd('RegisterPolicy', VALID_REGISTER, 'deact-reg'));
  const res = await engine.executeCommand(cmd('DeactivatePolicy', { policyId: 'POL_TEST_001' }, 'deact-1'));

  assert.equal(res.policy.active, false);

  const found = await engine.getPolicy('POL_TEST_001');
  assert.equal(found.active, false);

  const events = eventBus.getHistory({ eventType: 'econet.governance.policy_deactivated' });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.22.governance');
  assert.equal(events[0].payload.deactivatedBy, 'gov-mgr-1');
});

test('DeactivatePolicy rejects already-inactive policies', async () => {
  const { engine } = createFixture();

  await engine.executeCommand(cmd('RegisterPolicy', VALID_REGISTER, 'deact-pre'));
  await engine.executeCommand(cmd('DeactivatePolicy', { policyId: 'POL_TEST_001' }, 'deact-once'));

  await assert.rejects(
    engine.executeCommand(cmd('DeactivatePolicy', { policyId: 'POL_TEST_001' }, 'deact-twice')),
    /already INACTIVE/
  );
});

test('DeactivatePolicy rejects unknown policyId', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(cmd('DeactivatePolicy', { policyId: 'MISSING' }, 'deact-miss')),
    /GovernancePolicy not found/
  );
});

// ─── ReactivatePolicy command ─────────────────────────────────────────────────

test('ReactivatePolicy reactivates an inactive policy and emits policy_reactivated', async () => {
  const { engine, eventBus } = createFixture();

  await engine.executeCommand(cmd('RegisterPolicy', VALID_REGISTER, 'react-reg'));
  await engine.executeCommand(cmd('DeactivatePolicy', { policyId: 'POL_TEST_001' }, 'react-deact'));
  const res = await engine.executeCommand(cmd('ReactivatePolicy', { policyId: 'POL_TEST_001' }, 'react-1'));

  assert.equal(res.policy.active, true);

  const events = eventBus.getHistory({ eventType: 'econet.governance.policy_reactivated' });
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.reactivatedBy, 'gov-mgr-1');
});

test('ReactivatePolicy rejects already-active policies', async () => {
  const { engine } = createFixture();

  await engine.executeCommand(cmd('RegisterPolicy', VALID_REGISTER, 'react-pre'));

  await assert.rejects(
    engine.executeCommand(cmd('ReactivatePolicy', { policyId: 'POL_TEST_001' }, 'react-already')),
    /already ACTIVE/
  );
});

// ─── evaluatePolicy (governance adapter contract) ─────────────────────────────

test('evaluatePolicy returns allowed:true when no policies match', async () => {
  const { engine } = createFixture();

  const result = await engine.evaluatePolicy({
    engine: '19-simulation',
    commandType: 'RunSimulation',
    actor: { actorId: 'u1', roles: ['simulation_operator'] },
    payload: {}
  });

  assert.equal(result.allowed, true);
});

test('evaluatePolicy returns allowed:true when active policy permits', async () => {
  const { engine } = createFixture();

  await engine.registerPolicy(new GovernancePolicy({
    policyId: 'POL_ALLOW',
    name: 'Allow All Runs',
    target: 'RunSimulation',
    evaluator: ALLOW_ALL
  }));

  const result = await engine.evaluatePolicy({
    engine: '19-simulation',
    commandType: 'RunSimulation',
    actor: { actorId: 'u1', roles: ['simulation_operator'] },
    payload: {}
  });

  assert.equal(result.allowed, true);
});

test('evaluatePolicy returns allowed:false when active policy denies', async () => {
  const { engine } = createFixture();

  await engine.registerPolicy(new GovernancePolicy({
    policyId: 'POL_SIM_FREEZE',
    name: 'Simulation Freeze',
    target: 'RunSimulation',
    evaluator: DENY_ALL('SIMULATION_GLOBALLY_FROZEN')
  }));

  const result = await engine.evaluatePolicy({
    engine: '19-simulation',
    commandType: 'RunSimulation',
    actor: { actorId: 'u1', roles: ['simulation_operator'] },
    payload: {}
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'SIMULATION_GLOBALLY_FROZEN');
});

test('evaluatePolicy skips INACTIVE policies', async () => {
  const { engine } = createFixture();

  await engine.registerPolicy(new GovernancePolicy({
    policyId: 'POL_INACTIVE_DENY',
    name: 'Inactive Denial',
    target: 'RunSimulation',
    evaluator: DENY_ALL('should be skipped'),
    active: false
  }));

  const result = await engine.evaluatePolicy({
    engine: '19-simulation',
    commandType: 'RunSimulation',
    actor: { actorId: 'u1', roles: ['simulation_operator'] },
    payload: {}
  });

  assert.equal(result.allowed, true);
});

test('evaluatePolicy wildcard target (*) matches any commandType', async () => {
  const { engine } = createFixture();

  await engine.registerPolicy(new GovernancePolicy({
    policyId: 'POL_GLOBAL_FREEZE',
    name: 'Global Freeze',
    target: '*',
    evaluator: DENY_ALL('SYSTEM_FROZEN')
  }));

  for (const commandType of ['RunSimulation', 'RegisterConnector', 'EnqueueJob', 'CreateMission']) {
    const result = await engine.evaluatePolicy({
      engine: 'any',
      commandType,
      actor: { actorId: 'u', roles: [] },
      payload: {}
    });
    assert.equal(result.allowed, false, `Expected denial for ${commandType}`);
    assert.equal(result.reason, 'SYSTEM_FROZEN');
  }
});

test('evaluatePolicy evaluates context-sensitive policies correctly', async () => {
  const { engine } = createFixture();

  // Policy: only admin actors can grant rewards
  await engine.registerPolicy(new GovernancePolicy({
    policyId: 'POL_REWARD_ADMIN_ONLY',
    name: 'Reward Admin Gate',
    target: 'GrantReward',
    evaluator: (ctx) => {
      if (ctx.actor?.roles?.includes('admin')) return { allowed: true };
      return { allowed: false, reason: 'Only admin can grant rewards during freeze.' };
    }
  }));

  const adminResult = await engine.evaluatePolicy({
    engine: '15-reward',
    commandType: 'GrantReward',
    actor: { actorId: 'admin1', roles: ['admin'] },
    payload: {}
  });
  assert.equal(adminResult.allowed, true);

  const userResult = await engine.evaluatePolicy({
    engine: '15-reward',
    commandType: 'GrantReward',
    actor: { actorId: 'user1', roles: ['reward_issuer'] },
    payload: {}
  });
  assert.equal(userResult.allowed, false);
  assert.match(userResult.reason, /Only admin/);
});

test('Deactivated policy no longer blocks evaluatePolicy', async () => {
  const { engine } = createFixture();

  await engine.registerPolicy(new GovernancePolicy({
    policyId: 'POL_TEMP_FREEZE',
    name: 'Temp Freeze',
    target: 'RegisterConnector',
    evaluator: DENY_ALL('TEMP_FREEZE')
  }));

  // Blocked initially
  let result = await engine.evaluatePolicy({
    engine: '20-integration', commandType: 'RegisterConnector',
    actor: { actorId: 'u', roles: ['integration_manager'] }, payload: {}
  });
  assert.equal(result.allowed, false);

  // Register via Command to deactivate
  await engine.executeCommand(cmd('DeactivatePolicy', { policyId: 'POL_TEMP_FREEZE' }, 'deact-cmd'));

  // No longer blocked
  result = await engine.evaluatePolicy({
    engine: '20-integration', commandType: 'RegisterConnector',
    actor: { actorId: 'u', roles: ['integration_manager'] }, payload: {}
  });
  assert.equal(result.allowed, true);
});

// ─── evaluateCompliance (legacy API) ─────────────────────────────────────────

test('evaluateCompliance returns compliant:true when no violations', async () => {
  const { engine } = createFixture();

  const result = await engine.evaluateCompliance('SubmitObservation', {
    actor: { actorId: 'u', roles: ['observer'] }
  });
  assert.equal(result.compliant, true);
  assert.deepEqual(result.violations, []);
});

test('evaluateCompliance returns compliant:false with violation list on denial', async () => {
  const { engine } = createFixture();

  await engine.registerPolicy(new GovernancePolicy({
    policyId: 'POL_OBS_LIMIT',
    name: 'Media Limit',
    target: 'SubmitObservation',
    evaluator: (ctx) => {
      const media = ctx.payload?.media || [];
      if (media.length > 3) return { allowed: false, reason: 'Too many media attachments.' };
      return { allowed: true };
    }
  }));

  const result = await engine.evaluateCompliance('SubmitObservation', {
    actor: { actorId: 'u', roles: ['observer'] },
    payload: { media: ['a', 'b', 'c', 'd'] }
  });
  assert.equal(result.compliant, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].policyId, 'POL_OBS_LIMIT');
  assert.match(result.violations[0].reason, /Too many/);
});

// ─── Queries ─────────────────────────────────────────────────────────────────

test('Queries return policies and handle unknown IDs', async () => {
  const { engine } = createFixture();

  assert.equal(await engine.getPolicy('MISSING'), null);
  assert.deepEqual(await engine.listPolicies(), []);

  await engine.executeCommand(cmd('RegisterPolicy', VALID_REGISTER, 'qry-reg'));

  const found = await engine.getPolicy('POL_TEST_001');
  assert.equal(found.policyId, 'POL_TEST_001');

  const all = await engine.listPolicies();
  assert.equal(all.length, 1);

  const active = await engine.listPolicies({ activeOnly: true });
  assert.equal(active.length, 1);

  await engine.executeCommand(cmd('DeactivatePolicy', { policyId: 'POL_TEST_001' }, 'qry-deact'));
  const inactive = await engine.listPolicies({ activeOnly: true });
  assert.equal(inactive.length, 0);
});

test('getPolicies (legacy API) returns all registered policies', async () => {
  const { engine } = createFixture();

  await engine.registerPolicy(new GovernancePolicy({
    policyId: 'P1', name: 'P1', target: 't1', evaluator: ALLOW_ALL
  }));
  await engine.registerPolicy(new GovernancePolicy({
    policyId: 'P2', name: 'P2', target: 't2', evaluator: ALLOW_ALL
  }));

  const policies = await engine.getPolicies();
  assert.equal(policies.length, 2);
});

// ─── Authorization ────────────────────────────────────────────────────────────

test('Authorization: missing actor is rejected', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(new Command({
      commandType: 'RegisterPolicy',
      targetEngine: '22-governance',
      payload: VALID_REGISTER,
      idempotencyKey: 'auth-no-actor'
    })),
    /require an authenticated actor/
  );
});

test('Authorization: missing roles is denied', async () => {
  const { engine } = createFixture();
  const noRoles = { actorId: 'user-no-roles' };

  await assert.rejects(
    engine.executeCommand(cmd('RegisterPolicy', VALID_REGISTER, 'auth-no-roles', noRoles)),
    /lacks an authorized governance role/
  );
  assert.equal(await engine.repository.count(), 0);
});

test('Authorization: non-array and empty roles are denied', async () => {
  const { engine } = createFixture();

  const variants = [
    { actorId: 'u1', roles: 'governance_manager' },
    { actorId: 'u2', roles: null },
    { actorId: 'u3', roles: {} },
    { actorId: 'u4', roles: [] }
  ];

  for (const actor of variants) {
    await assert.rejects(
      engine.executeCommand(cmd('RegisterPolicy', VALID_REGISTER, `auth-bad-${actor.actorId}`, actor)),
      /lacks an authorized governance role/
    );
  }
});

test('Authorization: unauthorized role is denied on all three mutating commands', async () => {
  const { engine } = createFixture();

  // Register a policy with valid actor for deactivate/reactivate targets
  await engine.executeCommand(cmd('RegisterPolicy', VALID_REGISTER, 'auth-deny-pre'));

  const observer = { actorId: 'obs-1', roles: ['observer'] };
  const cases = [
    ['RegisterPolicy', { ...VALID_REGISTER, policyId: 'POL_NEW' }, 'auth-d-reg'],
    ['DeactivatePolicy', { policyId: 'POL_TEST_001' }, 'auth-d-deact'],
    ['ReactivatePolicy', { policyId: 'POL_TEST_001' }, 'auth-d-react']
  ];

  for (const [commandType, payload, suffix] of cases) {
    await assert.rejects(
      engine.executeCommand(cmd(commandType, payload, suffix, observer)),
      /lacks an authorized governance role/,
      `Expected denial for ${commandType}`
    );
  }

  // Policy state must be unchanged
  const stored = await engine.getPolicy('POL_TEST_001');
  assert.equal(stored.active, true);
});

test('Authorization: all four canonical authorized roles are accepted', async () => {
  const AUTHORIZED_ROLES = ['system', 'admin', 'governance_manager', 'automation'];

  for (const role of AUTHORIZED_ROLES) {
    const { engine } = createFixture();
    const actor = { actorId: `user-${role}`, roles: [role] };

    const res = await engine.executeCommand(cmd('RegisterPolicy', {
      ...VALID_REGISTER,
      policyId: `POL_ROLE_${role.toUpperCase()}`
    }, `role-${role}`, actor));
    assert.equal(res.policy.active, true, `Role "${role}" should be authorized`);
  }
});

// ─── Authorization ordering ───────────────────────────────────────────────────

test('Authorization denial fires before idempotency and mutation', async () => {
  const repository = new InMemoryPolicyRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new GovernanceEngine({ repository, eventBus, idempotencyManager });

  const noRoles = { actorId: 'user-no-roles' };
  await assert.rejects(
    engine.executeCommand(cmd('RegisterPolicy', VALID_REGISTER, 'order-chk', noRoles)),
    /lacks an authorized governance role/
  );

  assert.equal(await repository.count(), 0);
  assert.equal(eventBus.getHistory().length, 0);
});

// ─── Idempotency ──────────────────────────────────────────────────────────────

test('RegisterPolicy idempotency: same command key returns cached result', async () => {
  const { engine, repository, eventBus } = createFixture();

  const first = await engine.executeCommand(cmd('RegisterPolicy', VALID_REGISTER, 'idem-reg'));
  const second = await engine.executeCommand(cmd('RegisterPolicy', VALID_REGISTER, 'idem-reg'));

  assert.equal(second.policy.policyId, first.policy.policyId);
  assert.equal(await repository.count(), 1);
  assert.equal(eventBus.getHistory({ eventType: 'econet.governance.policy_registered' }).length, 1);
});

test('Commands without idempotencyKey are rejected', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(new Command({
      commandType: 'RegisterPolicy',
      targetEngine: '22-governance',
      payload: VALID_REGISTER,
      actor: MANAGER
    })),
    /requires an idempotencyKey/
  );
});

// ─── Unsupported commands ─────────────────────────────────────────────────────

test('Unsupported commands are rejected', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(cmd('DeleteAllPolicies', {}, 'bad-cmd')),
    /Unsupported Governance command/
  );
});

// ─── Event correctness ────────────────────────────────────────────────────────

test('All three events carry correct producer and subject entityType', async () => {
  const { engine, eventBus } = createFixture();

  await engine.executeCommand(cmd('RegisterPolicy', VALID_REGISTER, 'ev-reg'));
  await engine.executeCommand(cmd('DeactivatePolicy', { policyId: 'POL_TEST_001' }, 'ev-deact'));
  await engine.executeCommand(cmd('ReactivatePolicy', { policyId: 'POL_TEST_001' }, 'ev-react'));

  const expected = [
    'econet.governance.policy_registered',
    'econet.governance.policy_deactivated',
    'econet.governance.policy_reactivated'
  ];

  for (const eventType of expected) {
    const events = eventBus.getHistory({ eventType });
    assert.equal(events.length, 1, `Expected one ${eventType}`);
    assert.equal(events[0].producer, 'engine.22.governance');
    assert.equal(events[0].subject.entityType, 'governance_policy');
    assert.equal(events[0].subject.entityId, 'POL_TEST_001');
  }
});

test('No success event is emitted when a command fails', async () => {
  const { engine, eventBus } = createFixture();

  // Deactivate a non-existent policy → fails
  await assert.rejects(
    engine.executeCommand(cmd('DeactivatePolicy', { policyId: 'NONEXISTENT' }, 'ev-fail')),
    /not found/
  );

  assert.equal(eventBus.getHistory().length, 0);
});

// ─── Repository isolation ─────────────────────────────────────────────────────

test('Repository isolation: no cross-instance state leak', async () => {
  const engineA = new GovernanceEngine({ repository: new InMemoryPolicyRepository() });
  const engineB = new GovernanceEngine({ repository: new InMemoryPolicyRepository() });

  await engineA.executeCommand(cmd('RegisterPolicy', VALID_REGISTER, 'iso-a'));

  assert.equal((await engineA.listPolicies()).length, 1);
  assert.equal((await engineB.listPolicies()).length, 0, 'no cross-engine state leak');
});

// ─── createCommandMiddleware (legacy API) ─────────────────────────────────────

test('createCommandMiddleware passes when no policy denies', async () => {
  const { engine } = createFixture();
  const middleware = engine.createCommandMiddleware();

  let nextCalled = false;
  await middleware({ commandType: 'RunSimulation', actor: {}, payload: {}, correlationId: null },
    async () => { nextCalled = true; return 'ok'; });
  assert.equal(nextCalled, true);
});

test('createCommandMiddleware throws Governance Compliance Violation when policy denies', async () => {
  const { engine } = createFixture();

  await engine.registerPolicy(new GovernancePolicy({
    policyId: 'POL_BLOCK',
    name: 'Block Gate',
    target: 'RunSimulation',
    evaluator: DENY_ALL('FROZEN')
  }));

  const middleware = engine.createCommandMiddleware();
  await assert.rejects(
    middleware({ commandType: 'RunSimulation', actor: {}, payload: {}, correlationId: null }, async () => {}),
    /Governance Compliance Violation/
  );
});

// ─── registerPolicy (legacy direct API) ──────────────────────────────────────

test('registerPolicy (direct) adds a policy without requiring a Command', async () => {
  const { engine } = createFixture();

  engine.registerPolicy(new GovernancePolicy({
    policyId: 'POL_DIRECT', name: 'Direct', target: 'cmd', evaluator: ALLOW_ALL
  }));

  assert.equal(await engine.repository.count(), 1);
  const found = await engine.getPolicy('POL_DIRECT');
  assert.equal(found.policyId, 'POL_DIRECT');
});

test('registerPolicy rejects non-GovernancePolicy instances', () => {
  const { engine } = createFixture();
  assert.throws(
    () => engine.registerPolicy({ policyId: 'P1', name: 'X', evaluator: ALLOW_ALL }),
    /requires an instance of GovernancePolicy/
  );
});

// ─── Lifecycle contract ───────────────────────────────────────────────────────

test('GovernanceEngine exposes the canonical lifecycle contract', async () => {
  const { engine, repository } = createFixture();

  assert.equal(engine.engineId, '22');
  assert.equal(engine.engineName, 'Governance Engine');

  const init = await engine.initialize();
  assert.equal(init.ready, true);

  const health = await engine.healthCheck();
  assert.equal(health.healthy, true);
  assert.equal(health.details.status, 'READY');
  assert.equal(health.details.persistence, 'IN_MEMORY_GOVERNANCE_ADAPTER');
  assert.equal(health.details.totalPolicies, 0);
  assert.equal(health.details.activePolicies, 0);

  await engine.executeCommand(cmd('RegisterPolicy', VALID_REGISTER, 'lc-reg'));
  const health2 = await engine.healthCheck();
  assert.equal(health2.details.totalPolicies, 1);
  assert.equal(health2.details.activePolicies, 1);

  await engine.shutdown();
  // No state change on shutdown (in-memory)
  assert.equal(await repository.count(), 1);
});
