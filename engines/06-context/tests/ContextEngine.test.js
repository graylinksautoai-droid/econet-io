import test from 'node:test';
import assert from 'node:assert/strict';

import { Command } from '../../../contracts/commands/Command.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import {
  ContextEngine,
  InMemoryContextRepository,
  EnvironmentalContext,
  ContextAlertLevel,
  alertLevelFromRiskScore,
  isEscalation,
  isDeescalation,
  CONTEXT_ALERT_LEVEL_CHANGED
} from '../index.js';
const command = (commandType, payload, suffix, actor = null) => new Command({
  commandType,
  targetEngine: '06-context',
  payload,
  actor: actor || { actorId: 'observer-42', roles: ['observer'] },
  idempotencyKey: `ctx-test-${suffix}`,
  correlationId: `cor-${suffix}`
});

const createFixture = () => {
  const repository = new InMemoryContextRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new ContextEngine({
    repository,
    eventBus,
    idempotencyManager,
    clock: () => new Date('2029-05-01T12:00:00.000Z')
  });
  return { engine, repository, eventBus, idempotencyManager };
};

const sampleBoundary = () => ({
  centerLatitude: 9.0765,
  centerLongitude: 7.3986,
  radiusKm: 25
});

test('EnvironmentalContext instantiation validates fields and defaults', () => {
  const ctx = new EnvironmentalContext({
    regionId: 'abuja-fct-01',
    boundary: sampleBoundary()
  });
  assert.match(ctx.contextId, /^ctx_[0-9a-f]{32}$/);
  assert.equal(ctx.alertLevel, ContextAlertLevel.NORMAL);
  assert.deepEqual(ctx.boundary, { centerLatitude: 9.0765, centerLongitude: 7.3986, radiusKm: 25 });
  assert.deepEqual(ctx.metrics, {});
  assert.deepEqual(ctx.contributingEntityIds, []);
});

test('EnvironmentalContext changeAlertLevel returns same instance when unchanged', () => {
  const ctx = new EnvironmentalContext({
    regionId: 'abuja-fct-01',
    boundary: sampleBoundary()
  });
  const same = ctx.changeAlertLevel(ContextAlertLevel.NORMAL);
  assert.equal(ctx, same);
});

test('EnvironmentalContext invalid boundary throws', () => {
  assert.throws(() => new EnvironmentalContext({
    regionId: 'bad',
    boundary: { centerLatitude: 200, centerLongitude: 0, radiusKm: 10 }
  }), /Invalid boundary centerLatitude/);
  assert.throws(() => new EnvironmentalContext({
    regionId: 'bad',
    boundary: { centerLatitude: 0, centerLongitude: 0, radiusKm: -5 }
  }), /Invalid boundary radiusKm/);
});

test('alertLevelFromRiskScore maps thresholds correctly', () => {
  assert.equal(alertLevelFromRiskScore(0), ContextAlertLevel.NORMAL);
  assert.equal(alertLevelFromRiskScore(14), ContextAlertLevel.NORMAL);
  assert.equal(alertLevelFromRiskScore(15), ContextAlertLevel.ADVISORY);
  assert.equal(alertLevelFromRiskScore(39), ContextAlertLevel.ADVISORY);
  assert.equal(alertLevelFromRiskScore(40), ContextAlertLevel.WATCH);
  assert.equal(alertLevelFromRiskScore(69), ContextAlertLevel.WATCH);
  assert.equal(alertLevelFromRiskScore(70), ContextAlertLevel.WARNING);
  assert.equal(alertLevelFromRiskScore(89), ContextAlertLevel.WARNING);
  assert.equal(alertLevelFromRiskScore(90), ContextAlertLevel.EMERGENCY);
  assert.equal(alertLevelFromRiskScore(100), ContextAlertLevel.EMERGENCY);
});
test('CreateContext command persists entity and emits canonical event', async () => {
  const { engine, repository, eventBus } = createFixture();

  const res = await engine.executeCommand(command('CreateContext', {
    regionId: 'abuja-fct-01',
    regionName: 'Abuja FCT Central',
    boundary: sampleBoundary(),
    metrics: { avgTemperatureC: 32 },
    metadata: { source: 'test-harness' }
  }, 'create-1'));

  assert.match(res.context.contextId, /^ctx_[0-9a-f]{32}$/);
  assert.equal(res.context.regionId, 'abuja-fct-01');
  assert.equal(res.context.alertLevel, ContextAlertLevel.NORMAL);
  assert.equal(await repository.count(), 1);

  const events = eventBus.getHistory({ eventType: 'econet.context.created' });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.06.context');
  assert.equal(events[0].subject.entityId, res.context.contextId);
  assert.equal(events[0].payload.metrics.avgTemperatureC, 32);
});

test('CreateContext with WARNING alert emits ContextAlertLevelChanged immediately', async () => {
  const { engine, eventBus } = createFixture();

  const res = await engine.executeCommand(command('CreateContext', {
    regionId: 'crisis-zone',
    boundary: sampleBoundary(),
    alertLevel: ContextAlertLevel.WARNING
  }, 'create-warn'));

  assert.equal(res.context.alertLevel, ContextAlertLevel.WARNING);

  const alertEvents = eventBus.getHistory({ eventType: CONTEXT_ALERT_LEVEL_CHANGED });
  assert.equal(alertEvents.length, 1);
  assert.equal(alertEvents[0].payload.previousLevel, ContextAlertLevel.NORMAL);
  assert.equal(alertEvents[0].payload.newLevel, ContextAlertLevel.WARNING);
  assert.equal(alertEvents[0].payload.isEscalation, true);
  assert.equal(alertEvents[0].metadata.audit.criticalMutation, true);
});

test('UpdateContextAlert transitions alert level and publishes event', async () => {
  const { engine, eventBus } = createFixture();

  const created = await engine.executeCommand(command('CreateContext', {
    regionId: 'abuja-fct-01',
    boundary: sampleBoundary()
  }, 'update-1'));
  const ctxId = created.context.contextId;

  const updated = await engine.executeCommand(command('UpdateContextAlert', {
    contextId: ctxId,
    newAlertLevel: ContextAlertLevel.WARNING,
    reason: 'Rising flood sensor readings'
  }, 'update-2'));

  assert.equal(updated.alertChanged, true);
  assert.equal(updated.context.alertLevel, ContextAlertLevel.WARNING);
  assert.equal(updated.previousLevel, ContextAlertLevel.NORMAL);

  const alertEvents = eventBus.getHistory({ eventType: CONTEXT_ALERT_LEVEL_CHANGED });
  assert.equal(alertEvents.length, 1);
  assert.equal(alertEvents[0].payload.isEscalation, true);
  assert.equal(alertEvents[0].metadata.reason, 'Rising flood sensor readings');
test('UpdateContextAlert to same level is a no-op', async () => {
  const { engine, eventBus } = createFixture();

  const created = await engine.executeCommand(command('CreateContext', {
    regionId: 'abuja-fct-01',
    boundary: sampleBoundary()
  }, 'same-1'));
  const ctxId = created.context.contextId;

  const result = await engine.executeCommand(command('UpdateContextAlert', {
    contextId: ctxId,
    newAlertLevel: ContextAlertLevel.NORMAL
  }, 'same-2'));

  assert.equal(result.alertChanged, false);
  assert.equal(eventBus.getHistory({ eventType: CONTEXT_ALERT_LEVEL_CHANGED }).length, 0);
});

test('FuseMetrics merges metrics and recalculates alert from riskScore', async () => {
  const { engine, eventBus } = createFixture();

  const created = await engine.executeCommand(command('CreateContext', {
    regionId: 'abuja-fct-01',
    boundary: sampleBoundary(),
    metrics: { humidityPct: 60 }
  }, 'fuse-1'));
  const ctxId = created.context.contextId;

  const fused = await engine.executeCommand(command('FuseMetrics', {
    contextId: ctxId,
    metrics: { riskScore: 75, humidityPct: 88 },
    entityIds: ['obs-001']
  }, 'fuse-2'));

  assert.equal(fused.alertChanged, true);
  assert.equal(fused.context.alertLevel, ContextAlertLevel.WARNING);
  assert.equal(fused.context.metrics.riskScore, 75);
  assert.equal(fused.context.metrics.humidityPct, 88);
  assert.deepEqual(fused.context.contributingEntityIds, ['obs-001']);

  const fuseEvents = eventBus.getHistory({ eventType: 'econet.context.metrics_fused' });
  assert.equal(fuseEvents.length, 1);
  assert.equal(fuseEvents[0].payload.previousMetrics.humidityPct, 60);
  assert.equal(fuseEvents[0].payload.fusedMetrics.riskScore, 75);
});

test('DeriveAlertFromRiskScore emits event when level changes', async () => {
  const { engine, eventBus } = createFixture();

  const created = await engine.executeCommand(command('CreateContext', {
    regionId: 'abuja-fct-01',
    boundary: sampleBoundary()
  }, 'derive-1'));
  const ctxId = created.context.contextId;

  const result = await engine.executeCommand(command('DeriveAlertFromRiskScore', {
    contextId: ctxId,
    riskScore: 95,
    reason: 'Heat index exceeded threshold'
  }, 'derive-2'));
test('DeriveAlertFromRiskScore to EMERGENCY flags audit critical mutation', async () => {
  const { engine, eventBus } = createFixture();

  const created = await engine.executeCommand(command('CreateContext', {
    regionId: 'abuja-fct-01',
    boundary: sampleBoundary()
  }, 'audit-crit-1'));
  const ctxId = created.context.contextId;

  await engine.executeCommand(command('DeriveAlertFromRiskScore', {
    contextId: ctxId,
    riskScore: 99
  }, 'audit-crit-2'));

  const alertEvents = eventBus.getHistory({ eventType: CONTEXT_ALERT_LEVEL_CHANGED });
  assert.equal(alertEvents[0].metadata.audit.criticalMutation, true);
  assert.equal(alertEvents[0].metadata.audit.isEscalation, true);
});

test('CreateContext without audit flag on normal level does not mark critical', async () => {
  const { engine, eventBus } = createFixture();

  await engine.executeCommand(command('CreateContext', {
    regionId: 'safe-region',
    boundary: sampleBoundary()
  }, 'no-audit'));

  const createdEvents = eventBus.getHistory({ eventType: 'econet.context.created' });
  assert.equal(createdEvents[0].metadata.audit.criticalMutation, false);
});

test('getContextById and getContextsInRegion queries work', async () => {
  const { engine } = createFixture();

  const c1 = await engine.executeCommand(command('CreateContext', {
    regionId: 'abuja-fct-01',
    boundary: { centerLatitude: 9.0765, centerLongitude: 7.3986, radiusKm: 25 }
  }, 'q-1'));

  const c2 = await engine.executeCommand(command('CreateContext', {
    regionId: 'lagos-ibeju',
    boundary: { centerLatitude: 6.5244, centerLongitude: 3.3792, radiusKm: 50 }
  }, 'q-2'));

  const fetched = await engine.getContext(c1.context.contextId);
  assert.equal(fetched.regionId, 'abuja-fct-01');

  const inRegion = await engine.getContextsInRegion({
    latitude: 9.0765,
    longitude: 7.3986,
    radiusKm: 30
  });
  assert.ok(inRegion.length >= 1);
  assert.ok(inRegion.some(c => c.contextId === c1.context.contextId));
});

test('listContexts filters by alert level', async () => {
  const { engine } = createFixture();

  await engine.executeCommand(command('CreateContext', {
    regionId: 'r1',
    boundary: sampleBoundary(),
    alertLevel: ContextAlertLevel.WARNING
  }, 'list-1'));
  await engine.executeCommand(command('CreateContext', {
    regionId: 'r2',
    boundary: sampleBoundary()
  }, 'list-2'));

  const warnings = await engine.listContexts({ alertLevel: ContextAlertLevel.WARNING });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].regionId, 'r1');

  const all = await engine.listContexts();
  assert.equal(all.length, 2);
test('Repository isolation: contexts do not leak between fixtures', async () => {
  const repo1 = new InMemoryContextRepository();
  const repo2 = new InMemoryContextRepository();

  const engine1 = new ContextEngine({ repository: repo1 });
  const engine2 = new ContextEngine({ repository: repo2 });

  await engine1.executeCommand(command('CreateContext', {
    regionId: 'isolated-1',
    boundary: sampleBoundary()
  }, 'iso-1'));
  await engine2.executeCommand(command('CreateContext', {
    regionId: 'isolated-2',
    boundary: sampleBoundary()
  }, 'iso-2'));

  assert.equal(await repo1.count(), 1);
  assert.equal(await repo2.count(), 1);
  assert.equal(await engine1.getContext('nonexistent'), null);
});

test('Idempotency: duplicate command returns same context', async () => {
  const { engine, repository } = createFixture();

  const cmd = command('CreateContext', {
    regionId: 'abuja-fct-01',
    boundary: sampleBoundary()
  }, 'idem-1');

  const first = await engine.executeCommand(cmd);
  const second = await engine.executeCommand(cmd);

  assert.equal(first.context.contextId, second.context.contextId);
  assert.equal(await repository.count(), 1);
});

test('Governance denial blocks CreateContext mutation', async () => {
  const repository = new InMemoryContextRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const mockGovernance = {
    async evaluatePolicy() {
      return { allowed: false, reason: 'REGION_LOCKDOWN_ACTIVE' };
    }
  };

  const engine = new ContextEngine({
    repository,
    eventBus,
    idempotencyManager,
    governance: mockGovernance
  });

  await assert.rejects(
    engine.executeCommand(command('CreateContext', {
      regionId: 'locked-region',
      boundary: sampleBoundary()
    }, 'gov-deny')),
    /Governance policy denial: REGION_LOCKDOWN_ACTIVE/
  );
  assert.equal(await repository.count(), 0);
  assert.equal(eventBus.getHistory().length, 0);
});

test('UpdateContextAlert to missing context throws', async () => {
  const { engine } = createFixture();
  await assert.rejects(
    engine.executeCommand(command('UpdateContextAlert', {
      contextId: 'ctx_does_not_exist',
      newAlertLevel: ContextAlertLevel.WARNING
    }, 'missing-ctx')),
    /EnvironmentalContext not found/
  );
});

test('Unsupported command type throws', async () => {
  const { engine } = createFixture();
  await assert.rejects(
    engine.executeCommand(command('DeleteEverything', {}, 'bad-cmd')),
    /Unsupported Context command/
  );
});

test('Audit handoff: critical alert events carry full audit metadata for Engine 23', async () => {
  const { engine, eventBus } = createFixture();

  const created = await engine.executeCommand(command('CreateContext', {
    regionId: 'audit-handoff-region',
    boundary: sampleBoundary()
  }, 'handoff-1'));

  await engine.executeCommand(command('UpdateContextAlert', {
    contextId: created.context.contextId,
    newAlertLevel: ContextAlertLevel.EMERGENCY,
    reason: 'Cascade failure detected'
  }, 'handoff-2'));

  const alertEvents = eventBus.getHistory({ eventType: CONTEXT_ALERT_LEVEL_CHANGED });
  const auditReady = alertEvents.every(e =>
    e.metadata &&
    typeof e.metadata.audit === 'object' &&
    typeof e.metadata.audit.criticalMutation === 'boolean' &&
    typeof e.metadata.provenance === 'string'
  );
  assert.equal(auditReady, true);
  assert.equal(alertEvents[0].producer, 'engine.06.context');
});

});


  assert.equal(result.context.alertLevel, ContextAlertLevel.EMERGENCY);
  assert.equal(result.alertChanged, true);

  const alertEvents = eventBus.getHistory({ eventType: CONTEXT_ALERT_LEVEL_CHANGED });
  assert.equal(alertEvents.length, 1);
  assert.equal(alertEvents[0].payload.newLevel, ContextAlertLevel.EMERGENCY);
  assert.equal(alertEvents[0].payload.previousLevel, ContextAlertLevel.NORMAL);
  assert.equal(alertEvents[0].metadata.provenance, 'engine.06.context.DeriveAlertFromRiskScore');
});

  assert.equal(alertEvents[0].metadata.audit.criticalMutation, true);
});


test('alertLevelFromRiskScore rejects non-numeric input', () => {
  assert.throws(() => alertLevelFromRiskScore('not-a-number'), /Invalid risk score/);
});

test('isEscalation and isDeescalation compare alert levels correctly', () => {
  assert.equal(isEscalation(ContextAlertLevel.NORMAL, ContextAlertLevel.WARNING), true);
  assert.equal(isEscalation(ContextAlertLevel.WARNING, ContextAlertLevel.NORMAL), false);
  assert.equal(isEscalation(ContextAlertLevel.WARNING, ContextAlertLevel.WARNING), false);
  assert.equal(isDeescalation(ContextAlertLevel.EMERGENCY, ContextAlertLevel.WATCH), true);
  assert.equal(isDeescalation(ContextAlertLevel.NORMAL, ContextAlertLevel.ADVISORY), false);
});

