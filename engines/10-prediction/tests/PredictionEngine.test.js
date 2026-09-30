import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from '../../../contracts/commands/Command.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import {
  PredictionEngine,
  PredictionApplicationService,
  InMemoryPredictionRepository,
  EnvironmentalPrediction,
  PredictionStatus,
  ProjectionHorizon,
  calculateImpactProbability,
  calculateConfidenceInterval,
  PREDICTION_GENERATED
} from '../index.js';

const command = (commandType, payload, suffix, actor = null) => new Command({
  commandType,
  targetEngine: '10-prediction',
  payload,
  actor: actor || { actorId: 'forecast-analyst-1', roles: ['analyst'] },
  idempotencyKey: `prediction-test-${suffix}`,
  correlationId: `cor-prediction-${suffix}`
});

const samplePayload = (overrides = {}) => ({
  subjectId: 'coastal-zone-a',
  subjectType: 'region',
  targetMetric: 'flood_extent_km2',
  horizon: ProjectionHorizon.SHORT_TERM,
  projectionWindow: {
    startsAt: '2030-01-01T00:00:00.000Z',
    endsAt: '2030-01-08T00:00:00.000Z'
  },
  baselineValue: 12,
  trajectoryDelta: 8,
  impactFactors: [
    { name: 'rainfall_anomaly', probability: 0.8, weight: 3 },
    { name: 'drainage_capacity', probability: 0.4, weight: 1 }
  ],
  confidenceScore: 0.82,
  errorMargin: 0.1,
  modelVersion: 'forecast-model-1.0',
  metadata: { inputSource: 'direct-command' },
  ...overrides
});

const createFixture = () => {
  const repository = new InMemoryPredictionRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new PredictionEngine({
    repository,
    eventBus,
    idempotencyManager,
    clock: () => new Date('2030-01-01T00:00:00.000Z')
  });
  return { engine, repository, eventBus, idempotencyManager };
};

test('standalone calculation aggregates direct impact factors and clamps confidence intervals', () => {
  assert.equal(calculateImpactProbability([
    { name: 'a', probability: 0.8, weight: 3 },
    { name: 'b', probability: 0.4, weight: 1 }
  ]), 0.7);

  assert.deepEqual(calculateConfidenceInterval(0.95, 0.1), {
    lowerBound: 0.85,
    upperBound: 1
  });
  assert.deepEqual(calculateConfidenceInterval(0.05, 0.1), {
    lowerBound: 0,
    upperBound: 0.15
  });
});

test('EnvironmentalPrediction derives a direct trajectory forecast and is immutable', () => {
  const prediction = new EnvironmentalPrediction(samplePayload());
  assert.match(prediction.predictionId, /^prd_[0-9a-f]{32}$/);
  assert.equal(prediction.projectedValue, 20);
  assert.equal(prediction.impactProbability, 0.7);
  assert.deepEqual(prediction.confidenceInterval, { lowerBound: 0.6, upperBound: 0.8 });
  assert.equal(prediction.status, PredictionStatus.ACTIVE);
  assert.equal(Object.isFrozen(prediction), true);
  assert.equal(Object.isFrozen(prediction.impactFactors), true);
});

test('EnvironmentalPrediction rejects malformed standalone inputs and invalid windows', () => {
  assert.throws(() => new EnvironmentalPrediction(samplePayload({ subjectId: '' })), /non-empty subjectId/);
  assert.throws(() => new EnvironmentalPrediction(samplePayload({ horizon: 'IMMEDIATE' })), /Invalid projection horizon/);
  assert.throws(() => new EnvironmentalPrediction(samplePayload({ confidenceScore: 1.1 })), /Confidence score/);
  assert.throws(() => new EnvironmentalPrediction(samplePayload({ errorMargin: -0.1 })), /Error margin/);
  assert.throws(() => new EnvironmentalPrediction(samplePayload({
    projectionWindow: { startsAt: '2030-01-02T00:00:00.000Z', endsAt: '2030-01-01T00:00:00.000Z' }
  })), /endsAt must be after startsAt/);
  assert.throws(() => new EnvironmentalPrediction(samplePayload({ impactFactors: [] })), /at least one impact factor/);
});

test('prediction lifecycle updates confidence and invalidates once', () => {
  const prediction = new EnvironmentalPrediction(samplePayload());
  const updated = prediction.updateModelConfidence({
    confidenceScore: 0.9,
    errorMargin: 0.05,
    modelVersion: 'forecast-model-1.1'
  });
  assert.equal(updated.confidenceScore, 0.9);
  assert.equal(updated.errorMargin, 0.05);
  assert.equal(updated.modelVersion, 'forecast-model-1.1');
  assert.equal(updated.predictionId, prediction.predictionId);

  const invalidated = updated.invalidate('Observation inputs expired');
  assert.equal(invalidated.status, PredictionStatus.INVALIDATED);
  assert.equal(invalidated.invalidationReason, 'Observation inputs expired');
  assert.equal(invalidated.invalidate('ignored'), invalidated);
  assert.throws(
    () => invalidated.updateModelConfidence({ confidenceScore: 0.5 }),
    /Cannot update confidence for an INVALIDATED prediction/
  );
});

test('GeneratePrediction persists direct input and emits canonical prediction.generated', async () => {
  const { engine, repository, eventBus } = createFixture();
  const result = await engine.executeCommand(command('GeneratePrediction', samplePayload(), 'generate-1'));

  assert.equal(result.predictionChanged, true);
  assert.equal(result.prediction.projectedValue, 20);
  assert.equal(result.prediction.impactProbability, 0.7);
  assert.equal(await repository.count(), 1);

  const events = eventBus.getHistory({ eventType: PREDICTION_GENERATED });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.10.prediction');
  assert.equal(events[0].payload.operation, 'GENERATED');
  assert.equal(events[0].payload.predictionId, result.prediction.predictionId);
  assert.equal(events[0].metadata.provenance, 'engine.10.prediction.GENERATED');
  assert.equal(events[0].metadata.audit.criticalMutation, false);
});

test('UpdateModelConfidence publishes the canonical event with prior model metadata', async () => {
  const { engine, eventBus } = createFixture();
  const created = await engine.executeCommand(command('GeneratePrediction', samplePayload(), 'update-1'));

  const result = await engine.executeCommand(command('UpdateModelConfidence', {
    predictionId: created.prediction.predictionId,
    confidenceScore: 0.91,
    errorMargin: 0.04,
    modelVersion: 'forecast-model-1.2'
  }, 'update-2'));

  assert.equal(result.prediction.confidenceScore, 0.91);
  const events = eventBus.getHistory({ eventType: PREDICTION_GENERATED });
  assert.equal(events.length, 2);
  assert.equal(events[1].payload.operation, 'MODEL_CONFIDENCE_UPDATED');
  assert.equal(events[1].metadata.previousConfidenceScore, 0.82);
  assert.equal(events[1].metadata.previousErrorMargin, 0.1);
  assert.equal(events[1].metadata.previousModelVersion, 'forecast-model-1.0');
});

test('InvalidatePrediction persists invalidation and emits an audit-critical prediction.generated event', async () => {
  const { engine, eventBus } = createFixture();
  const created = await engine.executeCommand(command('GeneratePrediction', samplePayload(), 'invalidate-1'));

  const result = await engine.executeCommand(command('InvalidatePrediction', {
    predictionId: created.prediction.predictionId,
    reason: 'Model inputs superseded'
  }, 'invalidate-2'));

  assert.equal(result.prediction.status, PredictionStatus.INVALIDATED);
  assert.equal(result.prediction.invalidationReason, 'Model inputs superseded');

  const events = eventBus.getHistory({ eventType: PREDICTION_GENERATED });
  assert.equal(events.length, 2);
  assert.equal(events[1].payload.operation, 'INVALIDATED');
  assert.equal(events[1].metadata.audit.criticalMutation, true);
  assert.equal(events[1].metadata.invalidationReason, 'Model inputs superseded');
});

test('prediction queries return active predictions and exclude invalidated aggregates', async () => {
  const { engine } = createFixture();
  const first = await engine.executeCommand(command('GeneratePrediction', samplePayload(), 'query-1'));
  const second = await engine.executeCommand(command('GeneratePrediction', samplePayload({
    subjectId: 'upland-zone-b',
    targetMetric: 'drought_index',
    horizon: ProjectionHorizon.LONG_TERM
  }), 'query-2'));

  await engine.executeCommand(command('InvalidatePrediction', {
    predictionId: first.prediction.predictionId,
    reason: 'Superseded'
  }, 'query-3'));

  assert.equal((await engine.getPrediction(first.prediction.predictionId)).status, PredictionStatus.INVALIDATED);
  assert.equal(await engine.getPrediction('prd_missing'), null);
  assert.equal((await engine.listActivePredictions()).length, 1);
  assert.equal((await engine.listActivePredictions({ subjectId: 'upland-zone-b' }))[0].predictionId, second.prediction.predictionId);
  assert.equal((await engine.listActivePredictions({ targetMetric: 'flood_extent_km2' })).length, 0);
  assert.equal((await engine.listActivePredictions({ horizon: ProjectionHorizon.LONG_TERM })).length, 1);
});

test('governance denial occurs before prediction mutation or event publication', async () => {
  const repository = new InMemoryPredictionRepository();
  const eventBus = new EventBus();
  const engine = new PredictionEngine({
    repository,
    eventBus,
    idempotencyManager: new IdempotencyManager(),
    governance: { async evaluatePolicy() { return { allowed: false, reason: 'FORECAST_FREEZE' }; } }
  });

  await assert.rejects(
    engine.executeCommand(command('GeneratePrediction', samplePayload(), 'governance-denial')),
    /Governance policy denial: FORECAST_FREEZE/
  );
  assert.equal(await repository.count(), 0);
  assert.equal(eventBus.getHistory().length, 0);
});

test('idempotency prevents duplicate prediction state and duplicate event side effects', async () => {
  const { engine, repository, eventBus } = createFixture();
  const cmd = command('GeneratePrediction', samplePayload(), 'idempotency-1');
  const first = await engine.executeCommand(cmd);
  const second = await engine.executeCommand(cmd);

  assert.equal(first.prediction.predictionId, second.prediction.predictionId);
  assert.equal(await repository.count(), 1);
  assert.equal(eventBus.getHistory({ eventType: PREDICTION_GENERATED }).length, 1);
});

test('prediction repositories are isolated across engine instances', async () => {
  const repositoryA = new InMemoryPredictionRepository();
  const repositoryB = new InMemoryPredictionRepository();
  const engineA = new PredictionEngine({ repository: repositoryA, idempotencyManager: new IdempotencyManager() });
  const engineB = new PredictionEngine({ repository: repositoryB, idempotencyManager: new IdempotencyManager() });

  await engineA.executeCommand(command('GeneratePrediction', samplePayload({ subjectId: 'repository-a' }), 'isolation-a'));
  await engineB.executeCommand(command('GeneratePrediction', samplePayload({ subjectId: 'repository-b' }), 'isolation-b'));

  assert.equal(await repositoryA.count(), 1);
  assert.equal(await repositoryB.count(), 1);
  assert.equal((await engineA.listActivePredictions({ subjectId: 'repository-b' })).length, 0);
});

test('Engine 10 has no provisional Engine 09 event or source dependency', () => {
  const engineDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = [
    path.join(engineDirectory, 'index.js'),
    path.join(engineDirectory, 'application', 'services', 'PredictionApplicationService.js'),
    path.join(engineDirectory, 'domain', 'entities', 'EnvironmentalPrediction.js'),
    path.join(engineDirectory, 'domain', 'events', 'PredictionGenerated.js'),
    path.join(engineDirectory, 'domain', 'value-objects', 'ConfidenceScore.js'),
    path.join(engineDirectory, 'domain', 'value-objects', 'ProjectionHorizon.js'),
    path.join(engineDirectory, 'infrastructure', 'repositories', 'InMemoryPredictionRepository.js')
  ];

  const source = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /09-risk|engine\.09\.risk|econet\.risk\./);
  assert.doesNotMatch(source, /\.subscribe\(|subscribeAll\(/);
});

test('unsupported commands, missing idempotency, and missing predictions are rejected', async () => {
  const { engine } = createFixture();
  await assert.rejects(
    engine.executeCommand(command('DeletePrediction', {}, 'unsupported')),
    /Unsupported Prediction command/
  );
  await assert.rejects(
    engine.executeCommand(new Command({
      commandType: 'GeneratePrediction',
      targetEngine: '10-prediction',
      payload: samplePayload()
    })),
    /requires an idempotencyKey/
  );
  await assert.rejects(
    engine.executeCommand(command('InvalidatePrediction', {
      predictionId: 'prd_missing',
      reason: 'unknown'
    }, 'missing-prediction')),
    /EnvironmentalPrediction not found/
  );
});

test('PredictionEngine exposes the canonical lifecycle contract and live health check', async () => {
  const { engine, repository } = createFixture();
  assert.equal(engine.engineId, '10');
  assert.equal(engine.engineName, 'Prediction Engine');
  assert.ok(engine.service instanceof PredictionApplicationService);
  assert.equal(engine.repository, repository);
  assert.equal((await engine.initialize()).ready, true);
  assert.equal((await engine.healthCheck()).details.totalPredictions, 0);

  await engine.executeCommand(command('GeneratePrediction', samplePayload(), 'health-check'));
  const health = await engine.healthCheck();
  assert.equal(health.healthy, true);
  assert.equal(health.details.persistence, 'IN_MEMORY_PREDICTION_ADAPTER');
  assert.equal(health.details.totalPredictions, 1);
  await engine.shutdown();
});