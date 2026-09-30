import test from 'node:test';
import assert from 'node:assert/strict';

import { Command } from '../../../contracts/commands/Command.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import {
  GeospatialEngine,
  InMemoryGeospatialIndex,
  GeoPoint
} from '../index.js';

const command = (commandType, payload, suffix) => new Command({
  commandType,
  targetEngine: '07-geospatial',
  payload,
  actor: { actorId: 'spatial-service', roles: ['system'] },
  idempotencyKey: `geo-test-${suffix}`,
  correlationId: `cor-${suffix}`
});

const createFixture = () => {
  const repository = new InMemoryGeospatialIndex();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new GeospatialEngine({
    repository,
    eventBus,
    idempotencyManager,
    clock: () => new Date('2029-05-01T12:00:00.000Z')
  });
  return { engine, repository, eventBus, idempotencyManager };
};

test('GeoPoint calculates accurate Haversine distance in kilometers', () => {
  // Abuja Central Area to Garki (~3.0 km)
  const p1 = new GeoPoint({ latitude: 9.05785, longitude: 7.49508, entityId: 'abuja-central' });
  const p2 = new GeoPoint({ latitude: 9.03210, longitude: 7.48910, entityId: 'abuja-garki' });

  const dist = p1.distanceTo(p2);
  assert.ok(dist >= 2.5 && dist <= 3.5, `Expected ~3km, got ${dist}`);
});

test('spatial point indexing and radius search return ordered proximity matches', async () => {
  const { engine } = createFixture();

  // Index 3 points in Abuja
  await engine.executeCommand(command('IndexSpatialPoint', {
    latitude: 9.05785,
    longitude: 7.49508,
    entityId: 'obs-central',
    category: 'FLOOD',
    triggerClusterCheck: false
  }, 'p1'));

  await engine.executeCommand(command('IndexSpatialPoint', {
    latitude: 9.03210,
    longitude: 7.48910,
    entityId: 'obs-garki',
    category: 'FLOOD',
    triggerClusterCheck: false
  }, 'p2'));

  // A point far away in Lagos (6.5244, 3.3792)
  await engine.executeCommand(command('IndexSpatialPoint', {
    latitude: 6.5244,
    longitude: 3.3792,
    entityId: 'obs-lagos',
    category: 'POLLUTION',
    triggerClusterCheck: false
  }, 'p3'));

  // Search within 10km of Abuja Central
  const nearby = await engine.findNearby(9.05785, 7.49508, 10);
  assert.equal(nearby.length, 2);
  assert.equal(nearby[0].point.entityId, 'obs-central');
  assert.equal(nearby[1].point.entityId, 'obs-garki');
});

test('spatial clustering detects dense clusters and emits canonical SpatialClusterDetected event', async () => {
  const { engine, eventBus } = createFixture();

  // Index 3 points close together in Ihiala, Anambra State
  // Ihiala point 1: 5.8542, 6.8601
  await engine.executeCommand(command('IndexSpatialPoint', {
    latitude: 5.8542,
    longitude: 6.8601,
    entityId: 'obs-ihiala-1',
    category: 'EROSION',
    clusterRadiusKm: 5,
    clusterMinPoints: 3
  }, 'cl-1'));

  // Ihiala point 2: 5.8580, 6.8630 (approx 500m away)
  await engine.executeCommand(command('IndexSpatialPoint', {
    latitude: 5.8580,
    longitude: 6.8630,
    entityId: 'obs-ihiala-2',
    category: 'EROSION',
    clusterRadiusKm: 5,
    clusterMinPoints: 3
  }, 'cl-2'));

  // Ihiala point 3: 5.8520, 6.8590 (approx 300m away) -> triggers cluster threshold 3!
  const res3 = await engine.executeCommand(command('IndexSpatialPoint', {
    latitude: 5.8520,
    longitude: 6.8590,
    entityId: 'obs-ihiala-3',
    category: 'EROSION',
    clusterRadiusKm: 5,
    clusterMinPoints: 3
  }, 'cl-3'));

  assert.equal(res3.clustersDetected.length, 1);
  const cluster = res3.clustersDetected[0];
  assert.equal(cluster.pointCount, 3);
  assert.deepEqual(cluster.entityIds.sort(), ['obs-ihiala-1', 'obs-ihiala-2', 'obs-ihiala-3'].sort());
  assert.equal(cluster.dominantCategory, 'EROSION');

  // Verify domain event emitted
  const events = eventBus.getHistory();
  const clusterEvents = events.filter(e => e.eventType === 'econet.spatial.cluster_detected');
  assert.equal(clusterEvents.length, 1);
  assert.equal(clusterEvents[0].producer, 'engine.07.geospatial');
  assert.equal(clusterEvents[0].payload.pointCount, 3);
});

test('indexing is idempotent and rejects governance violations', async () => {
  const { engine, repository } = createFixture();

  const cmd = command('IndexSpatialPoint', {
    latitude: 9.0765,
    longitude: 7.3986,
    entityId: 'obs-idem-1',
    triggerClusterCheck: false
  }, 'idem-key');

  const first = await engine.executeCommand(cmd);
  const second = await engine.executeCommand(cmd);

  assert.equal(first.point.pointId, second.point.pointId);
  assert.equal((await repository.listAll()).length, 1);
});
