import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CanonicalEngineRegistry,
  EngineStatus
} from '../../architecture/engine-registry/CanonicalEngineRegistry.js';
import { EngineLifecycleManager } from '../../architecture/engine-registry/EngineLifecycleManager.js';

const instanceFor = (engineId, engineName, overrides = {}) => ({
  engineId,
  engineName,
  async initialize() {},
  async healthCheck() { return { healthy: true }; },
  async shutdown() {},
  ...overrides
});

test('lifecycle manager binds exactly one correctly-owned instance per canonical engine', () => {
  const registry = new CanonicalEngineRegistry();
  const manager = new EngineLifecycleManager(registry);
  const identity = instanceFor('01', 'Identity Engine');

  assert.throws(
    () => manager.registerInstance('01', { engineId: '01', engineName: 'Identity Engine' }),
    /must implement initialize\(\)/
  );
  assert.throws(
    () => manager.registerInstance('01', instanceFor('02', 'Observation Engine')),
    /identity does not match canonical definition/
  );
  manager.registerInstance('01', identity);
  assert.equal(manager.getInstance('01'), identity);
  assert.throws(() => manager.registerInstance('01', identity), /already has a registered instance/);
  assert.equal(manager.getInstance('25'), null);
});

test('initialization never marks an unbound engine ready and degrades failed instances', async () => {
  const registry = new CanonicalEngineRegistry();
  const manager = new EngineLifecycleManager(registry);
  let initialized = 0;

  manager.registerInstance('01', instanceFor('01', 'Identity Engine', {
    async initialize() { initialized++; }
  }));
  manager.registerInstance('02', instanceFor('02', 'Observation Engine', {
    async initialize() { throw new Error('offline'); }
  }));

  const results = await manager.initializeAll();
  assert.equal(initialized, 1);
  assert.equal(Object.keys(results).length, 24);
  assert.equal(registry.getStatus('01'), EngineStatus.READY);
  assert.equal(registry.getStatus('02'), EngineStatus.DEGRADED);
  assert.equal(registry.getStatus('03'), EngineStatus.REGISTERED);
  assert.equal(results['03'].status, EngineStatus.REGISTERED);

  await manager.initializeAll();
  assert.equal(initialized, 1, 'ready engines are not reinitialized');
});

test('health and shutdown operations keep lifecycle state authoritative', async () => {
  const registry = new CanonicalEngineRegistry();
  const manager = new EngineLifecycleManager(registry);
  let healthy = true;
  let healthChecks = 0;
  let shutdowns = 0;

  manager.registerInstance('01', instanceFor('01', 'Identity Engine', {
    async healthCheck() {
      healthChecks++;
      return { healthy, details: { probe: healthChecks } };
    },
    async shutdown() { shutdowns++; }
  }));
  await manager.initializeAll();

  healthy = false;
  const degraded = await manager.checkHealth();
  assert.equal(registry.getStatus('01'), EngineStatus.DEGRADED);
  assert.equal(degraded.systemStatus, 'DEGRADED');

  healthy = true;
  const recovered = await manager.checkHealth();
  assert.equal(registry.getStatus('01'), EngineStatus.READY);
  assert.equal(recovered.engines['01'].status, EngineStatus.READY);

  await manager.shutdownAll();
  assert.equal(shutdowns, 1);
  assert.equal(registry.getStatus('01'), EngineStatus.STOPPED);
  await manager.checkHealth();
  assert.equal(healthChecks, 2, 'stopped engines are not probed or revived by health checks');
});
