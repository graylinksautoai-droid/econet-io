import test from 'node:test';
import assert from 'node:assert/strict';

import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { DomainEvent } from '../../../contracts/events/DomainEvent.js';
import { AuditJournalEntry, } from '../../../contracts/audit/AuditJournalEntry.js';
import {
  AuditEngine,
  ENGINE_ID,
  ENGINE_NAME,
  GENESIS_HASH
} from '../index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeEvent = (overrides = {}) => new DomainEvent({
  eventType: overrides.eventType ?? 'econet.test.event',
  producer: overrides.producer ?? 'engine.test',
  payload: overrides.payload ?? { data: 'test' },
  actor: overrides.actor ?? { actorId: 'actor-1', roles: ['tester'] },
  subject: overrides.subject ?? { entityId: 'ent-1', entityType: 'test_entity' },
  correlationId: overrides.correlationId ?? 'cor-test-1'
});

const createFixture = (options = {}) => {
  const eventBus = new EventBus();
  const engine = new AuditEngine(eventBus, options);
  return { engine, eventBus };
};

// ─── AuditJournalEntry contract ───────────────────────────────────────────────

test('AuditJournalEntry validates construction and computes a stable hash', () => {
  const entry = new AuditJournalEntry({
    sequenceNumber: 0,
    previousHash: GENESIS_HASH,
    eventType: 'econet.test.event',
    producer: 'engine.23.audit'
  });

  assert.match(entry.entryId, /^aud_/);
  assert.equal(entry.sequenceNumber, 0);
  assert.equal(entry.previousHash, GENESIS_HASH);
  assert.equal(typeof entry.currentHash, 'string');
  assert.equal(entry.currentHash.length, 64);
  assert.equal(entry.isValid(), true);
  assert.equal(Object.isFrozen(entry), true);

  // Determinism: same inputs → same hash
  const entry2 = new AuditJournalEntry({
    sequenceNumber: 0,
    previousHash: GENESIS_HASH,
    eventType: 'econet.test.event',
    producer: 'engine.23.audit',
    occurredAt: entry.occurredAt,
    entryId: entry.entryId
  });
  assert.equal(entry2.currentHash, entry.currentHash);

  // Hash changes when previousHash changes
  const entry3 = new AuditJournalEntry({
    sequenceNumber: 0,
    previousHash: '1'.repeat(64),
    eventType: 'econet.test.event',
    producer: 'engine.23.audit',
    occurredAt: entry.occurredAt,
    entryId: entry.entryId
  });
  assert.notEqual(entry3.currentHash, entry.currentHash);
});

test('AuditJournalEntry rejects invalid construction', () => {
  assert.throws(
    () => new AuditJournalEntry({ sequenceNumber: -1, previousHash: GENESIS_HASH, eventType: 'e', producer: 'p' }),
    /non-negative sequenceNumber/
  );
  assert.throws(
    () => new AuditJournalEntry({ sequenceNumber: 0, previousHash: '', eventType: 'e', producer: 'p' }),
    /previousHash/
  );
  assert.throws(
    () => new AuditJournalEntry({ sequenceNumber: 0, previousHash: GENESIS_HASH, eventType: '', producer: 'p' }),
    /eventType/
  );
  assert.throws(
    () => new AuditJournalEntry({ sequenceNumber: 0, previousHash: GENESIS_HASH, eventType: 'e', producer: '' }),
    /producer/
  );
});

test('AuditJournalEntry.isValid() detects tampered fields', () => {
  const entry = new AuditJournalEntry({
    sequenceNumber: 0,
    previousHash: GENESIS_HASH,
    eventType: 'econet.test.event',
    producer: 'engine.23.audit'
  });

  // Construct a tampered entry by supplying an incorrect currentHash
  const tampered = new AuditJournalEntry({
    ...entry.toJSON(),
    currentHash: 'a'.repeat(64)  // wrong hash
  });

  assert.equal(tampered.isValid(), false);
});

// ─── GENESIS_HASH constant ────────────────────────────────────────────────────

test('GENESIS_HASH is 64 zeros', () => {
  assert.equal(GENESIS_HASH, '0'.repeat(64));
  assert.equal(GENESIS_HASH.length, 64);
});

// ─── recordEvent ─────────────────────────────────────────────────────────────

test('recordEvent appends entries with correct sequence numbers and hash chain', () => {
  const { engine } = createFixture();

  assert.equal(engine.totalEntries, 0);

  const e1 = makeEvent({ eventType: 'econet.test.first' });
  const entry1 = engine.recordEvent(e1);

  assert.equal(entry1.sequenceNumber, 0);
  assert.equal(entry1.previousHash, GENESIS_HASH);
  assert.equal(entry1.eventType, 'econet.test.first');
  assert.equal(entry1.producer, 'engine.test');
  assert.equal(engine.totalEntries, 1);

  const e2 = makeEvent({ eventType: 'econet.test.second', producer: 'engine.other' });
  const entry2 = engine.recordEvent(e2);

  assert.equal(entry2.sequenceNumber, 1);
  assert.equal(entry2.previousHash, entry1.currentHash);
  assert.equal(engine.totalEntries, 2);
});

test('recordEvent preserves actor, subject, correlationId, and payload summary', () => {
  const { engine } = createFixture();

  const event = makeEvent({
    actor: { actorId: 'user-99', roles: ['admin'] },
    subject: { entityId: 'ent-99', entityType: 'reward_grant' },
    correlationId: 'cor-xyz',
    payload: { grantId: 'grt-1', amount: 100 }
  });

  const entry = engine.recordEvent(event);

  assert.equal(entry.actor.actorId, 'user-99');
  assert.equal(entry.subject.entityId, 'ent-99');
  assert.equal(entry.subject.entityType, 'reward_grant');
  assert.equal(entry.correlationId, 'cor-xyz');
  assert.deepEqual(entry.payloadSummary, { grantId: 'grt-1', amount: 100 });
});

test('recordEvent handles events with missing optional fields gracefully', () => {
  const { engine } = createFixture();

  // Minimal raw event (not a full DomainEvent — engine accepts any object)
  const minimal = { eventType: 'econet.test.minimal', producer: 'engine.min' };
  const entry = engine.recordEvent(minimal);

  assert.equal(entry.eventType, 'econet.test.minimal');
  assert.equal(entry.actor, null);
  assert.equal(entry.subject, null);
  assert.equal(entry.correlationId, null);
});

test('recordEvent marks unknown event type when eventType is absent', () => {
  const { engine } = createFixture();
  const entry = engine.recordEvent({ producer: 'engine.x' });
  assert.equal(entry.eventType, 'unknown');
  assert.equal(entry.producer, 'engine.x');
});

// ─── verifyIntegrity ─────────────────────────────────────────────────────────

test('verifyIntegrity returns verified:true on an empty journal', () => {
  const { engine } = createFixture();
  const result = engine.verifyIntegrity();
  assert.equal(result.verified, true);
  assert.equal(result.totalEntries, 0);
});

test('verifyIntegrity returns verified:true on a valid chain', () => {
  const { engine } = createFixture();

  for (let i = 0; i < 5; i++) {
    engine.recordEvent(makeEvent({ eventType: `econet.test.event_${i}` }));
  }

  const result = engine.verifyIntegrity();
  assert.equal(result.verified, true);
  assert.equal(result.totalEntries, 5);
});

test('verifyIntegrity detects a corrupted hash at a specific sequence', () => {
  const { engine } = createFixture();

  engine.recordEvent(makeEvent({ eventType: 'econet.test.e1' }));
  engine.recordEvent(makeEvent({ eventType: 'econet.test.e2' }));
  engine.recordEvent(makeEvent({ eventType: 'econet.test.e3' }));

  // Corrupt entry at index 1 by directly injecting a fake previousHash
  // (simulate storage-layer tampering)
  const corruptEntry = new AuditJournalEntry({
    ...engine._journal[1].toJSON(),
    previousHash: 'deadbeef'.repeat(8),
    currentHash: null  // force recalculation with wrong previousHash
  });
  engine._journal[1] = corruptEntry;

  const result = engine.verifyIntegrity();
  assert.equal(result.verified, false);
  assert.equal(result.brokenAtSequence, 1);
  assert.match(result.error, /Hash chain broken at sequence 1/);
});

test('verifyIntegrity detects a self-hash mismatch', () => {
  const { engine } = createFixture();
  engine.recordEvent(makeEvent());

  // Replace with a tampered entry that has a wrong currentHash
  const original = engine._journal[0].toJSON();
  const tampered = new AuditJournalEntry({
    ...original,
    currentHash: 'f'.repeat(64)  // invalid self-hash
  });
  engine._journal[0] = tampered;

  const result = engine.verifyIntegrity();
  assert.equal(result.verified, false);
  assert.match(result.error, /Entry hash corrupted at sequence 0/);
});

// ─── queryJournal ─────────────────────────────────────────────────────────────

test('queryJournal returns all entries when no filter provided', () => {
  const { engine } = createFixture();

  engine.recordEvent(makeEvent({ eventType: 'econet.a.event', producer: 'engine.a' }));
  engine.recordEvent(makeEvent({ eventType: 'econet.b.event', producer: 'engine.b' }));

  const all = engine.queryJournal();
  assert.equal(all.length, 2);
  assert.equal(all[0].eventType, 'econet.a.event');
  assert.equal(all[1].eventType, 'econet.b.event');
});

test('queryJournal filters by eventType', () => {
  const { engine } = createFixture();

  engine.recordEvent(makeEvent({ eventType: 'econet.reward.granted' }));
  engine.recordEvent(makeEvent({ eventType: 'econet.mission.created' }));
  engine.recordEvent(makeEvent({ eventType: 'econet.reward.granted' }));

  const rewards = engine.queryJournal({ eventType: 'econet.reward.granted' });
  assert.equal(rewards.length, 2);
});

test('queryJournal filters by producer', () => {
  const { engine } = createFixture();

  engine.recordEvent(makeEvent({ producer: 'engine.15.reward' }));
  engine.recordEvent(makeEvent({ producer: 'engine.11.mission' }));

  const reward = engine.queryJournal({ producer: 'engine.15.reward' });
  assert.equal(reward.length, 1);
  assert.equal(reward[0].producer, 'engine.15.reward');
});

test('queryJournal filters by correlationId', () => {
  const { engine } = createFixture();

  engine.recordEvent(makeEvent({ correlationId: 'cor-A' }));
  engine.recordEvent(makeEvent({ correlationId: 'cor-B' }));
  engine.recordEvent(makeEvent({ correlationId: 'cor-A' }));

  const corA = engine.queryJournal({ correlationId: 'cor-A' });
  assert.equal(corA.length, 2);
});

test('queryJournal filters by actorId', () => {
  const { engine } = createFixture();

  engine.recordEvent(makeEvent({ actor: { actorId: 'user-1', roles: ['admin'] } }));
  engine.recordEvent(makeEvent({ actor: { actorId: 'user-2', roles: ['observer'] } }));

  const byUser = engine.queryJournal({ actorId: 'user-1' });
  assert.equal(byUser.length, 1);
  assert.equal(byUser[0].actor.actorId, 'user-1');
});

test('queryJournal returns empty array when filter matches nothing', () => {
  const { engine } = createFixture();
  engine.recordEvent(makeEvent());

  const none = engine.queryJournal({ eventType: 'econet.nonexistent' });
  assert.deepEqual(none, []);
});

test('queryJournal returns serialized toJSON snapshots (not live entries)', () => {
  const { engine } = createFixture();
  engine.recordEvent(makeEvent());

  const results = engine.queryJournal();
  assert.equal(typeof results[0].entryId, 'string');
  assert.equal(typeof results[0].currentHash, 'string');
  assert.equal(typeof results[0].sequenceNumber, 'number');
  // Results are plain objects, not AuditJournalEntry instances
  assert.equal(results[0] instanceof AuditJournalEntry, false);
});

// ─── EventBus integration ─────────────────────────────────────────────────────

test('initialize subscribes to all EventBus events and records them automatically', async () => {
  const { engine, eventBus } = createFixture();

  await engine.initialize();
  assert.equal(engine.totalEntries, 0);

  const event = makeEvent({ eventType: 'econet.observation.submitted' });
  await eventBus.publish(event);

  assert.equal(engine.totalEntries, 1);
  assert.equal(engine._journal[0].eventType, 'econet.observation.submitted');
});

test('multiple published events are journaled in publication order', async () => {
  const { engine, eventBus } = createFixture();
  await engine.initialize();

  await eventBus.publish(makeEvent({ eventType: 'econet.a.first' }));
  await eventBus.publish(makeEvent({ eventType: 'econet.b.second' }));
  await eventBus.publish(makeEvent({ eventType: 'econet.c.third' }));

  assert.equal(engine.totalEntries, 3);
  assert.equal(engine._journal[0].eventType, 'econet.a.first');
  assert.equal(engine._journal[1].eventType, 'econet.b.second');
  assert.equal(engine._journal[2].eventType, 'econet.c.third');

  // Hash chain remains valid after auto-recording
  const integrity = engine.verifyIntegrity();
  assert.equal(integrity.verified, true);
  assert.equal(integrity.totalEntries, 3);
});

test('shutdown unsubscribes from EventBus — no further events are journaled', async () => {
  const { engine, eventBus } = createFixture();
  await engine.initialize();

  await eventBus.publish(makeEvent({ eventType: 'econet.pre.shutdown' }));
  assert.equal(engine.totalEntries, 1);

  await engine.shutdown();

  // Post-shutdown events must NOT be journaled
  await eventBus.publish(makeEvent({ eventType: 'econet.post.shutdown' }));
  assert.equal(engine.totalEntries, 1, 'no new entries after shutdown');
});

test('Engine 23 does not subscribe when initialized without an eventBus', () => {
  // Engine accepts eventBus as optional; if no subscription possible, journal is manual-only
  const engine = new AuditEngine();
  engine.recordEvent(makeEvent({ eventType: 'econet.manual.record' }));
  assert.equal(engine.totalEntries, 1);
});

// ─── Repository isolation ─────────────────────────────────────────────────────

test('Journal isolation: separate AuditEngine instances have independent journals', async () => {
  const busA = new EventBus();
  const busB = new EventBus();
  const engineA = new AuditEngine(busA);
  const engineB = new AuditEngine(busB);

  await engineA.initialize();
  await engineB.initialize();

  await busA.publish(makeEvent({ eventType: 'econet.a.event' }));

  assert.equal(engineA.totalEntries, 1);
  assert.equal(engineB.totalEntries, 0, 'no cross-instance journal leak');
});

test('clear() resets the journal for test teardown', () => {
  const { engine } = createFixture();

  engine.recordEvent(makeEvent());
  engine.recordEvent(makeEvent());
  assert.equal(engine.totalEntries, 2);

  engine.clear();
  assert.equal(engine.totalEntries, 0);

  // Hash chain restarts from genesis after clear
  engine.recordEvent(makeEvent());
  assert.equal(engine._journal[0].previousHash, GENESIS_HASH);
  assert.equal(engine._journal[0].sequenceNumber, 0);
});

// ─── healthCheck ─────────────────────────────────────────────────────────────

test('healthCheck reports VALID integrity when journal is consistent', async () => {
  const { engine } = createFixture();

  engine.recordEvent(makeEvent());
  engine.recordEvent(makeEvent());

  const health = await engine.healthCheck();
  assert.equal(health.healthy, true);
  assert.equal(health.details.integrityStatus, 'VALID');
  assert.equal(health.details.totalJournalEntries, 2);
  assert.equal(health.details.verified, true);
});

test('healthCheck reports CORRUPTED when hash chain is broken', async () => {
  const { engine } = createFixture();

  engine.recordEvent(makeEvent());

  // Corrupt the entry
  engine._journal[0] = new AuditJournalEntry({
    ...engine._journal[0].toJSON(),
    currentHash: 'b'.repeat(64)
  });

  const health = await engine.healthCheck();
  assert.equal(health.healthy, false);
  assert.equal(health.details.integrityStatus, 'CORRUPTED');
});

// ─── Lifecycle contract ───────────────────────────────────────────────────────

test('AuditEngine exposes the canonical lifecycle contract', async () => {
  const { engine } = createFixture();

  assert.equal(engine.engineId, ENGINE_ID);
  assert.equal(engine.engineId, '23');
  assert.equal(engine.engineName, ENGINE_NAME);
  assert.equal(engine.engineName, 'Audit Engine');

  const init = await engine.initialize();
  assert.equal(init.ready, true);
  assert.equal(init.engineId, '23');

  assert.equal(typeof engine.healthCheck, 'function');
  assert.equal(typeof engine.shutdown, 'function');

  await engine.shutdown();
});

// ─── End-to-end: real DomainEvent chain from multiple producers ───────────────

test('Journal correctly chains events from multiple engine producers', async () => {
  const { engine, eventBus } = createFixture();
  await engine.initialize();

  const producers = [
    'engine.15.reward',
    'engine.11.mission',
    'engine.13.verification',
    'engine.22.governance',
    'engine.09.risk'
  ];

  for (const producer of producers) {
    await eventBus.publish(new DomainEvent({
      eventType: `econet.${producer.split('.')[1]}.event`,
      producer,
      payload: { source: producer }
    }));
  }

  assert.equal(engine.totalEntries, 5);

  const integrity = engine.verifyIntegrity();
  assert.equal(integrity.verified, true);
  assert.equal(integrity.totalEntries, 5);

  // Each entry chains correctly
  for (let i = 1; i < engine._journal.length; i++) {
    assert.equal(engine._journal[i].previousHash, engine._journal[i - 1].currentHash);
  }
});
