import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CanonicalEngineRegistry,
  EngineStatus
} from '../../architecture/engine-registry/CanonicalEngineRegistry.js';

const canonicalNames = [
  'Identity Engine', 'Observation Engine', 'Knowledge Engine', 'Dialogue Engine',
  'Intelligence Engine', 'Context Engine', 'Geospatial Engine', 'Temporal Engine',
  'Risk Engine', 'Prediction Engine', 'Mission Engine', 'Action Engine',
  'Verification Engine', 'Reputation Engine', 'Reward Engine', 'Community Engine',
  'Agent Engine', 'Digital Twin Engine', 'Simulation Engine', 'Integration Engine',
  'Automation Engine', 'Governance Engine', 'Audit Engine', 'Learning Engine'
];

test('canonical registry contains the exact immutable 24-engine identity set', () => {
  const registry = new CanonicalEngineRegistry();
  const engines = registry.getAllEngines();

  assert.equal(registry.totalEngines, 24);
  assert.deepEqual(engines.map(({ id }) => id), canonicalNames.map((_, index) => String(index + 1).padStart(2, '0')));
  assert.deepEqual(engines.map(({ name }) => name), canonicalNames);
  assert.equal(new Set(engines.map(({ slug }) => slug)).size, 24);
  assert.ok(Object.isFrozen(engines));
  assert.ok(engines.every(Object.isFrozen));
  assert.equal(registry.getEngineById('1'), null);
  assert.equal(registry.getEngineById('25'), null);
  assert.equal(registry.getEngineByName(null), null);
  assert.equal(registry.getEngineBySlug(null), null);
  assert.equal(registry.isCanonical('01', 'Identity Engine'), true);
  assert.equal(registry.isCanonical('01', 'Renamed Engine'), false);
});

test('registry permits only canonical lifecycle transitions', () => {
  const registry = new CanonicalEngineRegistry();

  assert.throws(() => registry.setStatus('01', EngineStatus.READY), /Invalid lifecycle transition/);
  assert.throws(() => registry.setStatus('1', EngineStatus.INITIALIZED), /not in the Canonical Registry/);
  assert.throws(() => registry.setStatus('25', EngineStatus.INITIALIZED), /not in the Canonical Registry/);
  assert.equal(registry.getStatus('25'), null);

  registry.setStatus('01', EngineStatus.INITIALIZED);
  registry.setStatus('01', EngineStatus.READY);
  registry.setStatus('01', EngineStatus.DEGRADED);
  registry.setStatus('01', EngineStatus.INITIALIZED);
  registry.setStatus('01', EngineStatus.READY);
  registry.setStatus('01', EngineStatus.STOPPED);
  registry.setStatus('01', EngineStatus.REGISTERED);
  assert.equal(registry.getStatus('01'), EngineStatus.REGISTERED);
});
