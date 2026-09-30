import test from 'node:test';
import assert from 'node:assert/strict';

import { DomainEvent } from '../../contracts/events/DomainEvent.js';

const eventInput = (overrides = {}) => ({
  eventType: 'econet.observation.report.submitted',
  producer: 'engine.02.observation',
  payload: { reportId: 'report-1', evidence: { source: 'field' } },
  actor: { actorId: 'actor-1', roles: ['observer'] },
  subject: { entityId: 'report-1', entityType: 'observation' },
  metadata: { region: 'lagos' },
  ...overrides
});

test('DomainEvent emits all canonical metadata with immutable, independent records', () => {
  const input = eventInput();
  const event = new DomainEvent(input);
  const json = event.toJSON();

  assert.match(event.eventId, /^evt_[0-9a-f]{32}$/);
  assert.match(event.correlationId, /^cor_[0-9a-f]{32}$/);
  assert.equal(event.causationId, null, 'a root event does not cause itself');
  assert.equal(event.metadata.schemaVersion, '1.0');
  assert.deepEqual(Object.keys(json), [
    'eventId', 'eventType', 'eventVersion', 'occurredAt', 'producer',
    'correlationId', 'causationId', 'actor', 'subject', 'payload', 'metadata'
  ]);
  assert.ok(Object.isFrozen(event));
  assert.ok(Object.isFrozen(event.payload));
  assert.ok(Object.isFrozen(event.payload.evidence));
  assert.ok(Object.isFrozen(event.actor.roles));

  input.payload.evidence.source = 'tampered';
  assert.equal(event.payload.evidence.source, 'field');
});

test('DomainEvent validates schema fields and propagates a causal chain to child events', () => {
  assert.throws(() => new DomainEvent(eventInput({ eventType: '  ' })), /eventType/);
  assert.throws(() => new DomainEvent(eventInput({ payload: [] })), /payload/);
  assert.throws(() => new DomainEvent(eventInput({ metadata: [] })), /metadata/);
  assert.throws(() => new DomainEvent(eventInput({ actor: 'actor-1' })), /actor/);
  assert.throws(() => new DomainEvent(eventInput({ occurredAt: 'not-a-date' })), /occurredAt/);

  const parent = new DomainEvent(eventInput({ correlationId: 'correlation-1', metadata: { origin: 'test' } }));
  const child = parent.createChildEvent({
    eventType: 'econet.risk.evaluated',
    producer: 'engine.09.risk',
    payload: { riskId: 'risk-1' },
    metadata: { rule: 'severity-v1' }
  });

  assert.equal(child.correlationId, parent.correlationId);
  assert.equal(child.causationId, parent.eventId);
  assert.equal(child.actor.actorId, parent.actor.actorId);
  assert.equal(child.metadata.origin, 'test');
  assert.equal(child.metadata.rule, 'severity-v1');
  assert.equal(child.metadata.schemaVersion, '1.0');
});
