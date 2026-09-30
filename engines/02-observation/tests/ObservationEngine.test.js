import test from 'node:test';
import assert from 'node:assert/strict';

import { Command } from '../../../contracts/commands/Command.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import {
  ObservationEngine,
  InMemoryObservationRepository,
  ObservationStatus,
  ObservationCategory
} from '../index.js';

const command = (commandType, payload, suffix, actor = null) => new Command({
  commandType,
  targetEngine: '02-observation',
  payload,
  actor: actor || { actorId: 'observer-42', roles: ['observer'] },
  idempotencyKey: `obs-test-${suffix}`,
  correlationId: `cor-${suffix}`
});

const createFixture = () => {
  const repository = new InMemoryObservationRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new ObservationEngine({
    repository,
    eventBus,
    idempotencyManager,
    clock: () => new Date('2029-05-01T12:00:00.000Z')
  });
  return { engine, repository, eventBus, idempotencyManager };
};

const samplePayload = (overrides = {}) => ({
  observerId: 'observer-42',
  category: ObservationCategory.FLOOD,
  severity: 'CRITICAL',
  urgency: 'IMMEDIATE',
  location: {
    latitude: 9.0765,
    longitude: 7.3986,
    address: 'Central Business District, Abuja',
    city: 'Abuja',
    state: 'FCT'
  },
  description: 'Severe flash flooding near Shehu Shagari Way following heavy rainfall.',
  evidence: [
    {
      id: 'evi-1',
      mediaType: 'IMAGE',
      url: 'https://storage.econet.io/evidence/flood-01.jpg',
      mimeType: 'image/jpeg'
    }
  ],
  metadata: { sensorType: 'mobile-app' },
  ...overrides
});

test('observation lifecycle enforces valid transitions and emits canonical domain events', async () => {
  const { engine, eventBus } = createFixture();

  // 1. Submit Observation
  const submitRes = await engine.executeCommand(command('SubmitObservation', samplePayload(), 'submit-1'));
  assert.ok(submitRes.observation);
  assert.equal(submitRes.observation.status, ObservationStatus.SUBMITTED);
  assert.match(submitRes.observation.observationId, /^obs_[0-9a-f]{32}$/);
  assert.equal(submitRes.observation.evidence.length, 1);
  assert.match(submitRes.observation.evidence[0].hashSha256, /^[0-9a-f]{64}$/);

  const obsId = submitRes.observation.observationId;

  // 2. Validate Evidence
  const valRes = await engine.executeCommand(command('ValidateObservationEvidence', {
    observationId: obsId,
    validationDetails: { imageIntegrity: 'PASS' }
  }, 'validate-1'));
  assert.equal(valRes.observation.status, ObservationStatus.VALIDATED);

  // 3. Reject invalid transition (e.g. directly to SUBMITTED)
  await assert.rejects(
    engine.executeCommand(command('UpdateObservationStatus', {
      observationId: obsId,
      status: ObservationStatus.SUBMITTED
    }, 'invalid-trans-1')),
    /Invalid observation lifecycle transition/
  );

  // 4. Archive observation
  const archiveRes = await engine.executeCommand(command('ArchiveObservation', {
    observationId: obsId
  }, 'archive-1'));
  assert.equal(archiveRes.observation.status, ObservationStatus.ARCHIVED);

  // Check event bus sequence
  const events = eventBus.getHistory();
  assert.deepEqual(events.map(e => e.eventType), [
    'econet.observation.submitted',
    'econet.observation.validated',
    'econet.observation.archived'
  ]);
  assert.equal(events[0].subject.entityId, obsId);
  assert.equal(events[0].producer, 'engine.02.observation');
});

test('observation submission is idempotent and prevents duplicate state', async () => {
  const { engine, repository } = createFixture();

  const cmd = command('SubmitObservation', samplePayload(), 'idem-key-1');
  const first = await engine.executeCommand(cmd);
  const second = await engine.executeCommand(cmd);

  assert.equal(first.observation.observationId, second.observation.observationId);
  assert.equal(await repository.count(), 1);
});

test('observation rejects invalid coordinates, empty descriptions, or unknown categories', async () => {
  const { engine } = createFixture();

  // Invalid latitude (> 90)
  await assert.rejects(
    engine.executeCommand(command('SubmitObservation', samplePayload({
      location: { latitude: 95.0, longitude: 7.0 }
    }), 'bad-lat')),
    /Invalid latitude/
  );

  // Unknown category
  await assert.rejects(
    engine.executeCommand(command('SubmitObservation', samplePayload({
      category: 'NUCLEAR_FALLOUT'
    }), 'bad-cat')),
    /Invalid observation category/
  );

  // Empty description
  await assert.rejects(
    engine.executeCommand(command('SubmitObservation', samplePayload({
      description: '   '
    }), 'bad-desc')),
    /requires a non-empty description/
  );
});

test('observation queries retrieve by ID and filter by category and status', async () => {
  const { engine } = createFixture();

  const obs1 = await engine.executeCommand(command('SubmitObservation', samplePayload({
    category: ObservationCategory.FIRE
  }), 'query-1'));
  const obs2 = await engine.executeCommand(command('SubmitObservation', samplePayload({
    category: ObservationCategory.FLOOD
  }), 'query-2'));

  const fetched = await engine.getObservation(obs1.observation.observationId);
  assert.equal(fetched.category, ObservationCategory.FIRE);

  const fireList = await engine.listObservations({ category: ObservationCategory.FIRE });
  assert.equal(fireList.length, 1);
  assert.equal(fireList[0].observationId, obs1.observation.observationId);

  const allList = await engine.listObservations();
  assert.equal(allList.length, 2);
});

test('governance policy failure halts observation mutation', async () => {
  const repository = new InMemoryObservationRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const mockGovernance = {
    async evaluatePolicy() {
      return { allowed: false, reason: 'EMBARGO_ZONE_ACTIVE' };
    }
  };

  const engine = new ObservationEngine({
    repository,
    eventBus,
    idempotencyManager,
    governance: mockGovernance
  });

  await assert.rejects(
    engine.executeCommand(command('SubmitObservation', samplePayload(), 'gov-deny')),
    /Governance policy denial: EMBARGO_ZONE_ACTIVE/
  );
  assert.equal(await repository.count(), 0);
  assert.equal(eventBus.getHistory().length, 0);
});
