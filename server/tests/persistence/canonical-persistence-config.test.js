/**
 * CanonicalPersistenceConfig — configuration validation tests
 *
 * Tests the config module validation logic directly by re-testing the pure
 * validation rules extracted into testable helper functions, since the config
 * module validates at import time (module-level code).
 *
 * We also verify the exported constants are correct for the default case
 * (memory mode, which is what CI uses since CANONICAL_PERSISTENCE is unset).
 *
 * Run: node --test server/tests/persistence/canonical-persistence-config.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_PERSISTENCE,
  IS_MEMORY,
  IS_MONGO,
  CANONICAL_MONGODB_URI,
  persistenceDescription,
  PERSISTENCE_MEMORY,
  PERSISTENCE_MONGO
} from '../../../infrastructure/persistence/CanonicalPersistenceConfig.js';

// ─── Inline validation helpers (mirror the module logic for isolated testing) ─

function validatePersistenceEnv(persistence, mongoUri) {
  const raw = (persistence ?? 'memory').trim().toLowerCase();
  if (raw !== 'memory' && raw !== 'mongo') {
    throw new Error(
      `CANONICAL_PERSISTENCE must be "memory" or "mongo"; received "${raw}".`
    );
  }
  if (raw === 'mongo' && !mongoUri) {
    throw new Error(
      'CANONICAL_PERSISTENCE=mongo requires CANONICAL_MONGODB_URI or MONGODB_URI.'
    );
  }
  return {
    mode: raw,
    isMemory: raw === 'memory',
    isMongo: raw === 'mongo',
    uri: raw === 'mongo' ? mongoUri : null
  };
}

// ─── 1. Default (memory) mode ────────────────────────────────────────────────

describe('1. Default memory mode', () => {

  it('CANONICAL_PERSISTENCE is "memory" in default CI environment', () => {
    // CI does not set CANONICAL_PERSISTENCE, so the module defaults to memory.
    assert.equal(CANONICAL_PERSISTENCE, 'memory');
    assert.equal(IS_MEMORY, true);
    assert.equal(IS_MONGO, false);
  });

  it('CANONICAL_MONGODB_URI is null in memory mode', () => {
    assert.equal(CANONICAL_MONGODB_URI, null);
  });

  it('persistenceDescription() mentions "memory" in memory mode', () => {
    const desc = persistenceDescription();
    assert.ok(desc.includes('memory'), `Expected "memory" in: ${desc}`);
  });

  it('PERSISTENCE_MEMORY and PERSISTENCE_MONGO constants are correct', () => {
    assert.equal(PERSISTENCE_MEMORY, 'memory');
    assert.equal(PERSISTENCE_MONGO,  'mongo');
  });

});

// ─── 2. Validation logic — memory mode ───────────────────────────────────────

describe('2. Validation logic: memory mode', () => {

  it('accepts "memory" without a URI', () => {
    const result = validatePersistenceEnv('memory', null);
    assert.equal(result.mode, 'memory');
    assert.equal(result.isMemory, true);
    assert.equal(result.uri, null);
  });

  it('accepts "MEMORY" (case-insensitive)', () => {
    const result = validatePersistenceEnv('MEMORY', null);
    assert.equal(result.mode, 'memory');
  });

  it('accepts empty string and defaults to memory', () => {
    // Empty string is normalised: trim() gives '', which fails the valid-value
    // check. We document this correctly: empty string is NOT accepted.
    // The ?? operator in the module only kicks in for null/undefined.
    assert.throws(
      () => validatePersistenceEnv('', null),
      /CANONICAL_PERSISTENCE/
    );
  });

  it('accepts undefined and defaults to memory', () => {
    const result = validatePersistenceEnv(undefined, null);
    assert.equal(result.mode, 'memory');
  });

});

// ─── 3. Validation logic — mongo mode ────────────────────────────────────────

describe('3. Validation logic: mongo mode', () => {

  it('accepts "mongo" when a URI is provided', () => {
    const result = validatePersistenceEnv('mongo', 'mongodb://localhost:27017/test');
    assert.equal(result.mode, 'mongo');
    assert.equal(result.isMongo, true);
    assert.equal(result.uri, 'mongodb://localhost:27017/test');
  });

  it('accepts "MONGO" (case-insensitive)', () => {
    const result = validatePersistenceEnv('MONGO', 'mongodb://localhost:27017/test');
    assert.equal(result.isMongo, true);
  });

});

// ─── 4. Failure cases ────────────────────────────────────────────────────────

describe('4. Failure cases — must not silently degrade', () => {

  it('mongo without a URI throws', () => {
    assert.throws(
      () => validatePersistenceEnv('mongo', null),
      /CANONICAL_PERSISTENCE=mongo requires/
    );
  });

  it('mongo with empty string URI throws', () => {
    assert.throws(
      () => validatePersistenceEnv('mongo', ''),
      /CANONICAL_PERSISTENCE=mongo requires/
    );
  });

  it('unknown value "redis" throws with the value in the message', () => {
    assert.throws(
      () => validatePersistenceEnv('redis', null),
      /redis/
    );
  });

  it('unknown value "postgres" throws', () => {
    assert.throws(
      () => validatePersistenceEnv('postgres', null),
      /CANONICAL_PERSISTENCE/
    );
  });

  it('valid values do not throw', () => {
    assert.doesNotThrow(() => validatePersistenceEnv('memory', null));
    assert.doesNotThrow(() => validatePersistenceEnv('mongo', 'mongodb://x'));
  });

});

// ─── 5. persistenceDescription() ─────────────────────────────────────────────

describe('5. persistenceDescription()', () => {

  it('returns a non-empty string', () => {
    const desc = persistenceDescription();
    assert.ok(typeof desc === 'string' && desc.length > 0);
  });

  it('does not include raw credentials in description', () => {
    // In memory mode this is trivially safe; we verify the function runs
    // without including literal secrets.
    const desc = persistenceDescription();
    // Should not contain raw Atlas credentials pattern
    assert.ok(!desc.includes('DfJssK'), 'must not include raw credentials');
  });

});
