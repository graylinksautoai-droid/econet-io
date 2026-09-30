import test from 'node:test';
import assert from 'node:assert/strict';

import { Command } from '../../../contracts/commands/Command.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import {
  RewardEngine,
  InMemoryRewardRepository,
  RewardGrant,
  RewardGrantStatus,
  RewardRule,
  RewardLedgerEntry,
  LedgerSide,
  RewardType,
  normalizeRewardType,
  assertValidRewardAmount
} from '../index.js';

const command = (commandType, payload, suffix, actor = null) => new Command({
  commandType,
  targetEngine: '15-reward',
  payload,
  actor: actor || { actorId: 'reward-issuer-1', roles: ['reward_issuer'] },
  idempotencyKey: `rew-test-${suffix}`,
  correlationId: `cor-${suffix}`
});

const createFixture = () => {
  const repository = new InMemoryRewardRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new RewardEngine({
    repository,
    eventBus,
    idempotencyManager,
    clock: () => new Date('2029-08-01T09:00:00.000Z')
  });
  return { engine, repository, eventBus, idempotencyManager };
};

const registerRule = async (engine, { ruleName, rewardType, suffix }) => {
  const res = await engine.executeCommand(command('RegisterRewardRule', {
    ruleName,
    rewardType
  }, suffix));
  return res.rule;
};

test('RewardType value object validates canonical vocabulary and explicit amounts', () => {
  assert.equal(normalizeRewardType('xP'), RewardType.XP);
  assert.equal(normalizeRewardType('POINTS'), RewardType.POINTS);
  assert.equal(normalizeRewardType('token'), RewardType.TOKEN);
  assert.equal(normalizeRewardType('ACHIEVEMENT'), RewardType.ACHIEVEMENT);
  assert.throws(() => normalizeRewardType('MONEY'), /Invalid reward type/);
  assert.throws(() => normalizeRewardType(''), /Invalid reward type/);

  // No invented economics: amounts must be explicit positive finite numbers.
  assert.equal(assertValidRewardAmount(100), 100);
  assert.throws(() => assertValidRewardAmount(0), /Invalid reward amount/);
  assert.throws(() => assertValidRewardAmount(-5), /Invalid reward amount/);
  assert.throws(() => assertValidRewardAmount('abc'), /Invalid reward amount/);
  assert.throws(() => assertValidRewardAmount(null), /Invalid reward amount/);
});

test('RewardRule entity requires name/type and normalizes type', () => {
  const rule = new RewardRule({ ruleName: 'Verified Observation', rewardType: 'xp' });
  assert.match(rule.ruleId, /^rwl_/);
  assert.equal(rule.rewardType, RewardType.XP);
  assert.equal(rule.active, true);

  assert.throws(() => new RewardRule({ ruleName: '', rewardType: 'XP' }), /non-empty ruleName/);
  assert.throws(() => new RewardRule({ ruleName: 'x', rewardType: 'MONEY' }), /Invalid reward type/);
});

test('RewardGrant entity is provenance-complete and protected', () => {
  const grant = new RewardGrant({
    recipientId: 'actor-42',
    rewardType: RewardType.XP,
    amount: 100,
    ruleId: 'rwl-1',
    ruleName: 'Verified Observation',
    sourceEventRef: 'evt-verified-obs-1',
    reason: 'Verified environmental claim',
    eligibility: { verificationStatus: 'VERIFIED', claimId: 'vcl-1' }
  });

  assert.match(grant.grantId, /^rgr_/);
  assert.equal(grant.recipientId, 'actor-42');
  assert.equal(grant.amount, 100);
  assert.equal(grant.status, RewardGrantStatus.GRANTED);
  assert.equal(grant.operationKey(), 'evt-verified-obs-1:rwl-1:actor-42:XP');
  assert.deepEqual(grant.eligibility, { verificationStatus: 'VERIFIED', claimId: 'vcl-1' });
  assert.equal(Object.isFrozen(grant), true);

  // Achievement grants require achievementId, not amount
  const ach = new RewardGrant({
    recipientId: 'actor-42',
    rewardType: RewardType.ACHIEVEMENT,
    achievementId: 'ACH_FIRST_VERIFIED',
    ruleId: 'rwl-2',
    sourceEventRef: 'evt-verified-obs-2'
  });
  assert.equal(ach.amount, null);
  assert.equal(ach.achievementId, 'ACH_FIRST_VERIFIED');
  assert.throws(() => new RewardGrant({
    recipientId: 'a', rewardType: 'ACHIEVEMENT', ruleId: 'r', sourceEventRef: 'e'
  }), /ACHIEVEMENT grant requires an achievementId/);
  assert.throws(() => new RewardGrant({
    recipientId: 'a', rewardType: 'XP', ruleId: 'r', sourceEventRef: 'e'
  }), /requires an explicit positive amount/);
});

test('RewardGrant reversal preserves the historical record and is terminal-conservative', () => {
  const grant = new RewardGrant({
    recipientId: 'actor-42',
    rewardType: RewardType.POINTS,
    amount: 50,
    ruleId: 'rwl-1',
    sourceEventRef: 'evt-1'
  });

  const reversed = grant.reverse({ reversedBy: 'admin-1', reason: 'Evidence invalidated' });
  assert.equal(reversed.status, RewardGrantStatus.REVERSED);
  assert.equal(reversed.reversedBy, 'admin-1');
  assert.equal(reversed.reversalReason, 'Evidence invalidated');
  assert.ok(reversed.reversedAt);
  assert.equal(reversed.grantId, grant.grantId, 'same grant record, corrected status');

  // Reversal of an already-reversed grant is rejected
  assert.throws(() => reversed.reverse({ reversedBy: 'admin-2', reason: 'oops' }), /Cannot reverse grant/);
});

test('RewardLedgerEntry validates double-entry constraints', () => {
  const credit = new RewardLedgerEntry({
    grantId: 'rgr-1', recipientId: 'actor-42', rewardType: RewardType.XP,
    side: LedgerSide.CREDIT, amount: 100, sourceEventRef: 'evt-1'
  });
  assert.equal(credit.side, LedgerSide.CREDIT);
  assert.equal(credit.amount, 100);
  assert.throws(() => new RewardLedgerEntry({
    grantId: '', recipientId: 'a', rewardType: 'XP', side: 'CREDIT', amount: 1
  }), /non-empty grantId/);
  assert.throws(() => new RewardLedgerEntry({
    grantId: 'g', recipientId: 'a', rewardType: 'XP', side: 'MAYBE', amount: 1
  }), /Invalid ledger side/);
  assert.throws(() => new RewardLedgerEntry({
    grantId: 'g', recipientId: 'a', rewardType: 'XP', side: 'CREDIT', amount: 0
  }), /Invalid ledger amount/);
});

test('RegisterRewardRule persists rule and emits rule_registered event', async () => {
  const { engine, eventBus } = createFixture();

  const res = await engine.executeCommand(command('RegisterRewardRule', {
    ruleName: 'Verified Flood Report',
    rewardType: RewardType.XP,
    description: 'Granted for each verified flood report'
  }, 'rule-1'));

  assert.match(res.rule.ruleId, /^rwl_/);
  assert.equal(res.rule.rewardType, RewardType.XP);

  const events = eventBus.getHistory({ eventType: 'econet.reward.rule_registered' });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.15.reward');
  assert.equal(events[0].subject.entityType, 'reward_rule');
});

test('GrantReward creates a provenance-complete grant with balanced double-entry ledger', async () => {
  const { engine, eventBus } = createFixture();

  const rule = await registerRule(engine, { ruleName: 'Verified Claim', rewardType: 'POINTS', suffix: 'g1' });

  const res = await engine.executeCommand(command('GrantReward', {
    recipientId: 'actor-42',
    ruleId: rule.ruleId,
    sourceEventRef: 'evt-verified-1',
    amount: 500,
    reason: 'Verified environmental contribution',
    eligibility: { verificationStatus: 'VERIFIED', claimId: 'vcl-1' }
  }, 'grant-1'));

  assert.equal(res.duplicated, false);
  assert.equal(res.grant.recipientId, 'actor-42');
  assert.equal(res.grant.rewardType, RewardType.POINTS);
  assert.equal(res.grant.amount, 500);
  assert.equal(res.grant.status, RewardGrantStatus.GRANTED);
  assert.equal(res.grant.sourceEventRef, 'evt-verified-1');
  assert.equal(res.grant.eligibility.verificationStatus, 'VERIFIED');

  // Double-entry: balanced ledger, correct balance
  assert.equal(await engine.isLedgerBalanced(), true);
  const balance = await engine.getBalance('actor-42', RewardType.POINTS);
  assert.equal(balance.balance, 500);

  // Ledger has exactly 2 entries (credit to recipient, debit from reserve)
  const ledger = await engine.getLedger();
  assert.equal(ledger.length, 2);
  assert.equal(ledger.filter(e => e.side === LedgerSide.CREDIT).length, 1);
  assert.equal(ledger.filter(e => e.side === LedgerSide.DEBIT).length, 1);

  // Event emission
  const events = eventBus.getHistory({ eventType: 'econet.reward.granted' });
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.grantId, res.grant.grantId);
  assert.equal(events[0].producer, 'engine.15.reward');
});

test('GrantReward duplicate protection: same event+rule+recipient is idempotent', async () => {
  const { engine } = createFixture();

  const rule = await registerRule(engine, { ruleName: 'Once Per Event', rewardType: 'XP', suffix: 'd1' });

  const first = await engine.executeCommand(command('GrantReward', {
    recipientId: 'actor-7',
    ruleId: rule.ruleId,
    sourceEventRef: 'evt-same-1',
    amount: 100
  }, 'dup-1'));

  const second = await engine.executeCommand(command('GrantReward', {
    recipientId: 'actor-7',
    ruleId: rule.ruleId,
    sourceEventRef: 'evt-same-1',
    amount: 100
  }, 'dup-2'));

  // Domain-level duplicate protection: same logical grant returned, no double-issue
  assert.equal(second.duplicated, true);
  assert.equal(second.grant.grantId, first.grant.grantId);
  const balance = await engine.getBalance('actor-7', RewardType.XP);
  assert.equal(balance.balance, 100, 'XP granted exactly once');

  // Same event but different recipient gets a distinct grant
  const other = await engine.executeCommand(command('GrantReward', {
    recipientId: 'actor-8',
    ruleId: rule.ruleId,
    sourceEventRef: 'evt-same-1',
    amount: 100
  }, 'dup-3'));
  assert.equal(other.duplicated, false);
});

test('Command idempotency: replaying the same command returns the cached result', async () => {
  const { engine, eventBus } = createFixture();

  const rule = await registerRule(engine, { ruleName: 'Idempotent Grant', rewardType: 'POINTS', suffix: 'id1' });

  const payload = {
    recipientId: 'actor-9',
    ruleId: rule.ruleId,
    sourceEventRef: 'evt-idem-1',
    amount: 250
  };
  const cmd = command('GrantReward', payload, 'idem-1');

  const first = await engine.executeCommand(cmd);
  const second = await engine.executeCommand(cmd);

  assert.equal(second.grant.grantId, first.grant.grantId);
  const balance = await engine.getBalance('actor-9', RewardType.POINTS);
  assert.equal(balance.balance, 250);
  assert.equal(eventBus.getHistory({ eventType: 'econet.reward.granted' }).length, 1);
});

test('EvaluateRewardEligibility returns false for already-granted duplicates and true for reversed', async () => {
  const { engine } = createFixture();

  const rule = await registerRule(engine, { ruleName: 'Eligibility Rule', rewardType: 'POINTS', suffix: 'e1' });

  const res = await engine.executeCommand(command('EvaluateRewardEligibility', {
    recipientId: 'actor-50',
    ruleId: rule.ruleId,
    sourceEventRef: 'evt-elig-1'
  }, 'elig-1'));
  assert.equal(res.eligible, true);
  assert.equal(res.duplicate, false);

  await engine.executeCommand(command('GrantReward', {
    recipientId: 'actor-50',
    ruleId: rule.ruleId,
    sourceEventRef: 'evt-elig-1',
    amount: 100
  }, 'elig-2'));

  const afterGrant = await engine.executeCommand(command('EvaluateRewardEligibility', {
    recipientId: 'actor-50',
    ruleId: rule.ruleId,
    sourceEventRef: 'evt-elig-1'
  }, 'elig-3'));
  assert.equal(afterGrant.eligible, false);
  assert.equal(afterGrant.duplicate, true);

  // Reversal re-opens eligibility
  const grants = await engine.getGrantsByRecipient('actor-50');
  await engine.executeCommand(command('ReverseReward', {
    grantId: grants[0].grantId,
    reason: 'Duplicated evidence'
  }, 'elig-4'));

  const afterReverse = await engine.executeCommand(command('EvaluateRewardEligibility', {
    recipientId: 'actor-50',
    ruleId: rule.ruleId,
    sourceEventRef: 'evt-elig-1'
  }, 'elig-5'));
  assert.equal(afterReverse.eligible, true);
});

test('Achievement unlock emits achievement_unlocked event exactly once per recipient', async () => {
  const { engine, eventBus } = createFixture();

  const rule = await registerRule(engine, { ruleName: 'First Verified', rewardType: 'ACHIEVEMENT', suffix: 'ach1' });

  const first = await engine.executeCommand(command('GrantReward', {
    recipientId: 'actor-11',
    ruleId: rule.ruleId,
    sourceEventRef: 'evt-ach-1',
    achievementId: 'ACH_FIRST_VERIFIED'
  }, 'ach-1'));

  assert.equal(first.grant.achievementId, 'ACH_FIRST_VERIFIED');
  assert.equal(first.grant.amount, null);

  // A second grant of the same achievement (different event) does not re-emit unlock
  await engine.executeCommand(command('GrantReward', {
    recipientId: 'actor-11',
    ruleId: rule.ruleId,
    sourceEventRef: 'evt-ach-2',
    achievementId: 'ACH_FIRST_VERIFIED'
  }, 'ach-2'));

  const unlocks = eventBus.getHistory({ eventType: 'econet.reward.achievement_unlocked' });
  assert.equal(unlocks.length, 1);
  assert.equal(unlocks[0].payload.achievementId, 'ACH_FIRST_VERIFIED');
  assert.equal(unlocks[0].payload.recipientId, 'actor-11');
});

test('ReverseReward preserves history and posts compensating ledger entries', async () => {
  const { engine, eventBus } = createFixture();

  const rule = await registerRule(engine, { ruleName: 'Reversible', rewardType: 'TOKEN', suffix: 'rv1' });

  const granted = await engine.executeCommand(command('GrantReward', {
    recipientId: 'actor-33',
    ruleId: rule.ruleId,
    sourceEventRef: 'evt-rev-1',
    amount: 100,
    reason: 'Temporary grant'
  }, 'rev-1'));

  const balanceBefore = await engine.getBalance('actor-33', RewardType.TOKEN);
  assert.equal(balanceBefore.balance, 100);

  const reversed = await engine.executeCommand(command('ReverseReward', {
    grantId: granted.grant.grantId,
    reason: 'Evidence invalidated by Verification Engine'
  }, 'rev-2'));

  assert.equal(reversed.grant.status, RewardGrantStatus.REVERSED);
  assert.equal(reversed.grant.reversalReason, 'Evidence invalidated by Verification Engine');

  // Balance returns to zero; ledger remains balanced with compensating entries
  const balanceAfter = await engine.getBalance('actor-33', RewardType.TOKEN);
  assert.equal(balanceAfter.balance, 0);
  assert.equal(await engine.isLedgerBalanced(), true);

  const ledger = await engine.getLedger();
  assert.equal(ledger.length, 4, '2 original + 2 compensating entries');

  const events = eventBus.getHistory({ eventType: 'econet.reward.reversed' });
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.grantId, granted.grant.grantId);
  assert.equal(events[0].producer, 'engine.15.reward');
});

test('GrantReward rejects ineligible/missing active rule and invalid amounts', async () => {
  const { engine } = createFixture();

  // Missing rule
  await assert.rejects(
    engine.executeCommand(command('GrantReward', {
      recipientId: 'actor-1', ruleId: 'rwl-does-not-exist', sourceEventRef: 'evt-x', amount: 10
    }, 'bad-1')),
    /Active reward rule not found/
  );

  // Register an XP rule, then grant without amount
  const rule = await registerRule(engine, { ruleName: 'Strict', rewardType: 'XP', suffix: 'bad2' });
  await assert.rejects(
    engine.executeCommand(command('GrantReward', {
      recipientId: 'actor-1', ruleId: rule.ruleId, sourceEventRef: 'evt-y'
    }, 'bad-2')),
    /requires an explicit positive amount/
  );

  // Structure must enforce provenance: missing sourceEventRef
  await assert.rejects(
    engine.executeCommand(command('GrantReward', {
      recipientId: 'actor-1', ruleId: rule.ruleId, amount: 10
    }, 'bad-3')),
    /requires a valid string "sourceEventRef"/
  );
});

test('Authorization boundary: actors without a reward role are denied', async () => {
  const { engine, repository, eventBus } = createFixture();

  const rule = await registerRule(engine, { ruleName: 'Protected', rewardType: 'XP', suffix: 'auth0' });

  const unauthorized = command('GrantReward', {
    recipientId: 'actor-1',
    ruleId: rule.ruleId,
    sourceEventRef: 'evt-auth',
    amount: 10
  }, 'auth-1', { actorId: 'random-user', roles: ['observer'] });

  await assert.rejects(
    engine.executeCommand(unauthorized),
    /lacks an authorized reward role/
  );

  // No grant state change, no granted events (only rule_registered from setup)
  assert.equal(await repository.countGrants(), 0);
  const grantedEvents = eventBus.getHistory({ eventType: 'econet.reward.granted' });
  assert.equal(grantedEvents.length, 0);

  // Missing actor is rejected
  await assert.rejects(
    engine.executeCommand(new Command({
      commandType: 'GrantReward',
      targetEngine: '15-reward',
      idempotencyKey: 'auth-2b',
      payload: { recipientId: 'actor-1', ruleId: rule.ruleId, sourceEventRef: 'evt-auth-2', amount: 10 }
    })),
    /require an authenticated actor/
  );
});

test('Governance denial blocks reward mutation before state change or event', async () => {
  const repository = new InMemoryRewardRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new RewardEngine({
    repository,
    eventBus,
    idempotencyManager,
    governance: {
      async evaluatePolicy({ commandType }) {
        if (commandType === 'GrantReward') {
          return { allowed: false, reason: 'REWARD_ISSUANCE_FROZEN' };
        }
        return { allowed: true };
      }
    }
  });

  const rule = await registerRule(engine, { ruleName: 'Governed', rewardType: 'XP', suffix: 'gov0' });

  await assert.rejects(
    engine.executeCommand(command('GrantReward', {
      recipientId: 'actor-1',
      ruleId: rule.ruleId,
      sourceEventRef: 'evt-gov',
      amount: 10
    }, 'gov-1')),
    /Governance policy denial: REWARD_ISSUANCE_FROZEN/
  );

  assert.equal(await repository.countGrants(), 0);
  const grantedEvents = eventBus.getHistory({ eventType: 'econet.reward.granted' });
  assert.equal(grantedEvents.length, 0, 'no granted event was emitted after governance denial');
});

test('RewardEngine exposes canonical lifecycle contract and isolated persistence', async () => {
  const { engine, repository } = createFixture();

  assert.equal(engine.engineId, '15');
  assert.equal(engine.engineName, 'Reward Engine');

  const init = await engine.initialize();
  assert.equal(init.ready, true);

  const health = await engine.healthCheck();
  assert.equal(health.healthy, true);
  assert.equal(health.details.status, 'READY');
  assert.equal(health.details.persistence, 'IN_MEMORY_REWARD_ADAPTER');
  assert.equal(health.details.totalGrants, 0);
  assert.equal(health.details.ledgerBalanced, true);

  await engine.shutdown();

  // Isolated repository does not leak across engines
  const repo2 = new InMemoryRewardRepository();
  const engine2 = new RewardEngine({ repository: repo2 });
  const rule = await registerRule(engine2, { ruleName: 'Isolated', rewardType: 'POINTS', suffix: 'iso1' });
  await engine2.executeCommand(command('GrantReward', {
    recipientId: 'actor-a', ruleId: rule.ruleId, sourceEventRef: 'evt-iso', amount: 5
  }, 'iso-2'));

  assert.equal(await repository.countGrants(), 0);
  assert.equal(await repo2.countGrants(), 1);
});

test('Queries return grant history, source-event lookups, and balances', async () => {
  const { engine } = createFixture();

  const rule = await registerRule(engine, { ruleName: 'Queryable', rewardType: 'TOKEN', suffix: 'q0' });

  await engine.executeCommand(command('GrantReward', {
    recipientId: 'actor-77', ruleId: rule.ruleId, sourceEventRef: 'evt-q-1', amount: 10
  }, 'q-1'));
  await engine.executeCommand(command('GrantReward', {
    recipientId: 'actor-77', ruleId: rule.ruleId, sourceEventRef: 'evt-q-2', amount: 20
  }, 'q-2'));

  const byRecipient = await engine.getGrantsByRecipient('actor-77');
  assert.equal(byRecipient.length, 2);

  const bySource = await engine.getGrantsBySourceEvent('evt-q-1');
  assert.equal(bySource.length, 1);
  assert.equal(bySource[0].amount, 10);

  const balance = await engine.getBalance('actor-77');
  assert.equal(balance.balances[RewardType.TOKEN], 30);

  const grant = await engine.getGrant(bySource[0].grantId);
  assert.equal(grant.status, RewardGrantStatus.GRANTED);

  assert.equal(await engine.getGrant('rgr-missing'), null);
  assert.equal(await engine.isLedgerBalanced(), true);
});
