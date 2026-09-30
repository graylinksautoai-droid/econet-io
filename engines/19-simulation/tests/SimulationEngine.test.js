import test from 'node:test';
import assert from 'node:assert/strict';

import { Command } from '../../../contracts/commands/Command.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import {
  SimulationEngine,
  SimulationApplicationService,
  InMemorySimulationRepository,
  SimulationModel,
  SimulationScenario,
  SimulationRun,
  SimulationResult,
  ModelType,
  ModelStatus,
  RunStatus,
  SimulationModelEvaluator,
  normalizeModelType,
  canTransitionRunStatus,
  assertRunStatusTransition,
  isTerminalRunStatus
} from '../index.js';

const command = (commandType, payload, suffix, actor = null) => new Command({
  commandType,
  targetEngine: '19-simulation',
  payload,
  actor: actor || { actorId: 'sim-operator-1', roles: ['simulation_operator'] },
  idempotencyKey: `sim-test-${suffix}`,
  correlationId: `cor-${suffix}`
});

const createFixture = (options = {}) => {
  const repository = new InMemorySimulationRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new SimulationEngine({
    repository,
    eventBus,
    idempotencyManager,
    clock: () => new Date('2029-12-01T10:00:00.000Z'),
    ...options
  });
  return { engine, repository, eventBus, idempotencyManager };
};

const registerModel = async (engine, suffix, modelType = 'ATMOSPHERIC_DISPERSION') => {
  const evaluator = new SimulationModelEvaluator();
  const parameterNames = evaluator.knownParameterNames(modelType);
  const res = await engine.executeCommand(command('RegisterSimulationModel', {
    name: `model-${suffix}`,
    version: '1.0',
    modelType,
    parameterNames
  }, `reg-${suffix}`));
  return res.model;
};

test('ModelType vocabulary is limited to the canonical two and evaluator is deterministic', () => {
  assert.equal(normalizeModelType('disaster_scenario'), ModelType.DISASTER_SCENARIO);
  assert.equal(normalizeModelType('atmospheric_dispersion'), ModelType.ATMOSPHERIC_DISPERSION);
  assert.throws(() => normalizeModelType('CLIMATE'), /Invalid simulation model type/);
  assert.throws(() => normalizeModelType(''), /Invalid simulation model type/);

  // Determinism: same inputs -> same outputs, twice
  const evaluator = new SimulationModelEvaluator();
  const params = { hazardIntensity: 0.8, exposedPopulation: 10000, vulnerabilityIndex: 0.6 };
  const first = evaluator.evaluate({ modelType: 'DISASTER_SCENARIO', parameters: params });
  const second = evaluator.evaluate({ modelType: 'DISASTER_SCENARIO', parameters: { ...params } });
  assert.deepEqual(second, first);
  assert.equal(first.outputs.impactIndex, 0.36);
  assert.equal(first.outputs.projectedAffectedPopulation, 3600);
  assert.equal(first.units.impactIndex, 'dimensionless');
  assert.equal(first.units.projectedAffectedPopulation, 'count');
});

test('Evaluator rejects unknown, missing, NaN, Infinity, and out-of-range parameters', () => {
  const evaluator = new SimulationModelEvaluator();

  assert.throws(() => evaluator.evaluate({ modelType: 'DISASTER_SCENARIO', parameters: { hazardIntensity: 0.5 } }), /Missing required parameter/);
  assert.throws(() => evaluator.evaluate({ modelType: 'DISASTER_SCENARIO', parameters: { hazardIntensity: 0.5, exposedPopulation: 10, vulnerabilityIndex: 0.5, rainfall: 999 } }), /Unknown parameter/);
  assert.throws(() => evaluator.evaluate({ modelType: 'DISASTER_SCENARIO', parameters: { hazardIntensity: Number.NaN, exposedPopulation: 10, vulnerabilityIndex: 0.5 } }), /finite number/);
  assert.throws(() => evaluator.evaluate({ modelType: 'DISASTER_SCENARIO', parameters: { hazardIntensity: Number.POSITIVE_INFINITY, exposedPopulation: 10, vulnerabilityIndex: 0.5 } }), /finite number/);
  assert.throws(() => evaluator.evaluate({ modelType: 'DISASTER_SCENARIO', parameters: { hazardIntensity: 'high', exposedPopulation: 10, vulnerabilityIndex: 0.5 } }), /finite number/);
  assert.throws(() => evaluator.evaluate({ modelType: 'DISASTER_SCENARIO', parameters: { hazardIntensity: 1.5, exposedPopulation: 10, vulnerabilityIndex: 0.5 } }), /above the maximum/);
  assert.throws(() => evaluator.evaluate({ modelType: 'DISASTER_SCENARIO', parameters: { hazardIntensity: 0.5, exposedPopulation: -1, vulnerabilityIndex: 0.5 } }), /below the minimum/);

  const dispersion = evaluator.evaluate({ modelType: 'ATMOSPHERIC_DISPERSION', parameters: { emissionRate: 100, windSpeed: 2, downwindDistance: 100 } });
  assert.ok(typeof dispersion.outputs.groundLevelConcentration === 'number');
  assert.ok(dispersion.outputs.groundLevelConcentration > 0);
  assert.equal(dispersion.units.groundLevelConcentration, 'kg/m^3');
});

test('RunStatus enforces the run lifecycle transitions', () => {
  assert.equal(canTransitionRunStatus(RunStatus.CREATED, RunStatus.RUNNING), true);
  assert.equal(canTransitionRunStatus(RunStatus.CREATED, RunStatus.CANCELLED), true);
  assert.equal(canTransitionRunStatus(RunStatus.RUNNING, RunStatus.COMPLETED), true);
  assert.equal(canTransitionRunStatus(RunStatus.RUNNING, RunStatus.FAILED), true);
  assert.equal(canTransitionRunStatus(RunStatus.RUNNING, RunStatus.CANCELLED), true);
  assert.equal(canTransitionRunStatus(RunStatus.COMPLETED, RunStatus.CANCELLED), false, 'COMPLETED is terminal');
  assert.equal(canTransitionRunStatus(RunStatus.FAILED, RunStatus.RUNNING), false);
  assert.throws(() => assertRunStatusTransition(RunStatus.COMPLETED, RunStatus.CANCELLED), /Invalid simulation run transition/);
});

test('SimulationModel/Scenario/Run/Result entities validate construction and immutability', () => {
  const model = new SimulationModel({ name: 'm', version: '1.0', modelType: 'DISASTER_SCENARIO', parameterNames: ['a'] });
  assert.match(model.modelId, /^sim_/);
  assert.equal(model.status, ModelStatus.ACTIVE);
  assert.equal(Object.isFrozen(model), true);
  assert.throws(() => new SimulationModel({ name: '', version: '1.0', modelType: 'DISASTER_SCENARIO' }), /non-empty name/);
  assert.throws(() => new SimulationModel({ name: 'm', version: '', modelType: 'DISASTER_SCENARIO' }), /non-empty version/);
  assert.throws(() => new SimulationModel({ name: 'm', version: '1.0', modelType: 'ORACLE' }), /Invalid simulation model type/);
  const retired = model.retire();
  assert.equal(retired.status, ModelStatus.RETIRED);

  const scenario = new SimulationScenario({ name: 's', modelId: 'sim-x', modelVersion: '1.0', parameters: { hazardIntensity: 0.5 } });
  assert.match(scenario.scenarioId, /^scn_/);
  assert.throws(() => new SimulationScenario({ name: '', modelId: 'm', modelVersion: '1' }), /non-empty name/);
  assert.throws(() => new SimulationScenario({ name: 's', modelId: 'm', modelVersion: '1', parameters: [] }), /must be an object/);

  const run = new SimulationRun({ scenarioId: 'scn-x', modelId: 'sim-x', modelVersion: '1.0' });
  assert.match(run.runId, /^run_/);
  assert.equal(run.status, RunStatus.CREATED);
  const running = run.transitionTo(RunStatus.RUNNING);
  assert.equal(running.status, RunStatus.RUNNING);
  assert.throws(() => running.transitionTo(RunStatus.CREATED), /Invalid simulation run transition/);
  assert.throws(() => new SimulationRun({ scenarioId: '', modelId: 'm', modelVersion: '1' }), /non-empty scenarioId/);

  const result = new SimulationResult({
    runId: 'run-x', scenarioId: 'scn-x', modelId: 'sim-x', modelVersion: '1.0',
    outputs: { impactIndex: 0.5 }, units: { impactIndex: 'dimensionless' }
  });
  assert.match(result.resultId, /^res_/);
  assert.equal(result.dataOrigin, 'SIMULATED');
  assert.throws(() => new SimulationResult({ runId: '', scenarioId: 's', modelId: 'm', modelVersion: '1', outputs: {} }), /non-empty runId/);
});

test('RegisterSimulationModel registers a versioned model and emits model_registered', async () => {
  const { engine, repository, eventBus } = createFixture();

  const res = await engine.executeCommand(command('RegisterSimulationModel', {
    name: 'river-disaster',
    version: '1.0',
    modelType: 'DISASTER_SCENARIO',
    parameterNames: ['hazardIntensity', 'exposedPopulation', 'vulnerabilityIndex', 'responseCapacityIndex']
  }, 'reg-1'));

  assert.match(res.model.modelId, /^sim_/);
  assert.equal(res.model.version, '1.0');
  assert.equal(res.model.status, ModelStatus.ACTIVE);
  assert.equal(await repository.countModels(), 1);

  const events = eventBus.getHistory({ eventType: 'econet.simulation.model_registered' });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.19.simulation');
  assert.equal(events[0].subject.entityType, 'simulation_model');
});

test('RegisterSimulationModel rejects unknown model types and mismatched parameter sets', async () => {
  const { engine } = createFixture();

  await assert.rejects(engine.executeCommand(command('RegisterSimulationModel', {
    name: 'm', version: '1.0', modelType: 'CLIMATE', parameterNames: []
  }, 'bad-type')), /Invalid simulation model type/);

  await assert.rejects(engine.executeCommand(command('RegisterSimulationModel', {
    name: 'incomplete', version: '1.0', modelType: 'DISASTER_SCENARIO', parameterNames: ['hazardIntensity']
  }, 'miss-req')), /requires parameter/);

  await assert.rejects(engine.executeCommand(command('RegisterSimulationModel', {
    name: 'extra', version: '1.0', modelType: 'DISASTER_SCENARIO',
    parameterNames: ['hazardIntensity', 'exposedPopulation', 'vulnerabilityIndex', 'rainfall']
  }, 'extra')), /not supported by model type/);
});

test('RegisterSimulationModel rejects duplicates and retired models cannot be re-registered', async () => {
  const { engine } = createFixture();

  await engine.executeCommand(command('RegisterSimulationModel', {
    name: 'flood-kernel', version: '1.0', modelType: 'DISASTER_SCENARIO',
    parameterNames: ['hazardIntensity', 'exposedPopulation', 'vulnerabilityIndex']
  }, 'dup-1'));

  await assert.rejects(engine.executeCommand(command('RegisterSimulationModel', {
    name: 'flood-kernel', version: '1.0', modelType: 'DISASTER_SCENARIO',
    parameterNames: ['hazardIntensity', 'exposedPopulation', 'vulnerabilityIndex']
  }, 'dup-2')), /already registered/);

  // Same name, NEW version is a separate immutable model
  const second = await engine.executeCommand(command('RegisterSimulationModel', {
    name: 'flood-kernel', version: '2.0', modelType: 'DISASTER_SCENARIO',
    parameterNames: ['hazardIntensity', 'exposedPopulation', 'vulnerabilityIndex']
  }, 'dup-3'));
  assert.notEqual(second.model.modelId, undefined);

  // Retire v1; RetireModel emits model_retired and the old version stays read-only
  const retired = await engine.executeCommand(command('RetireSimulationModel', {
    modelId: (await engine.listModels())[0].modelId
  }, 'ret-1'));
  assert.equal(retired.model.status, ModelStatus.RETIRED);

  // Retiring again is rejected (no silent re-mutation)
  await assert.rejects(engine.executeCommand(command('RetireSimulationModel', {
    modelId: retired.model.modelId
  }, 'ret-2')), /Invalid simulation model transition/);
});

test('CreateScenario binds scenario to a model version and validates parameters', async () => {
  const { engine, eventBus } = createFixture();

  const model = await registerModel(engine, 'scn', 'DISASTER_SCENARIO');

  const res = await engine.executeCommand(command('CreateScenario', {
    name: 'Flood plain what-if',
    description: 'High-intensity flood with moderate response',
    modelId: model.modelId,
    targetReference: { twinId: 'twn-river-1', stateVersion: 4 },
    parameters: { hazardIntensity: 0.9, exposedPopulation: 20000, vulnerabilityIndex: 0.7 },
    assumptions: ['Response arrives within 6 hours', 'Population static during event']
  }, 'scn-1'));

  assert.match(res.scenario.scenarioId, /^scn_/);
  assert.equal(res.scenario.modelVersion, '1.0');
  assert.equal(res.scenario.targetReference.twinId, 'twn-river-1');
  assert.equal(res.scenario.assumptions.length, 2);
  assert.equal(res.scenario.createdBy, 'sim-operator-1');

  const events = eventBus.getHistory({ eventType: 'econet.simulation.scenario_created' });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.19.simulation');

  // Unknown model
  await assert.rejects(engine.executeCommand(command('CreateScenario', {
    name: 'bad', modelId: 'sim-missing', parameters: {}
  }, 'scn-bad')), /SimulationModel not found/);

  // Unknown parameter in scenario
  await assert.rejects(engine.executeCommand(command('CreateScenario', {
    name: 'bad2', modelId: model.modelId, parameters: { hazardIntensity: 0.5, exposedPopulation: 10, vulnerabilityIndex: 0.5, temperature: 28 }
  }, 'scn-bad2')), /Unknown parameter/);

  // Missing required parameter in scenario
  await assert.rejects(engine.executeCommand(command('CreateScenario', {
    name: 'bad3', modelId: model.modelId, parameters: { hazardIntensity: 0.5 }
  }, 'scn-bad3')), /missing required parameters/);

  // Non-finite parameter value
  await assert.rejects(engine.executeCommand(command('CreateScenario', {
    name: 'bad4', modelId: model.modelId,
    parameters: { hazardIntensity: Number.NaN, exposedPopulation: 10, vulnerabilityIndex: 0.5 }
  }, 'scn-bad4')), /finite number/);
});

test('RunSimulation executes deterministically with full provenance', async () => {
  const { engine, eventBus } = createFixture();

  const model = await registerModel(engine, 'run', 'DISASTER_SCENARIO');
  const scenario = await engine.executeCommand(command('CreateScenario', {
    name: 'what-if A',
    modelId: model.modelId,
    targetReference: { twinId: 'twn-river-1', stateVersion: 4 },
    parameters: { hazardIntensity: 0.8, exposedPopulation: 10000, vulnerabilityIndex: 0.6 }
  }, 'run-scn'));

  const res = await engine.executeCommand(command('RunSimulation', {
    scenarioId: scenario.scenario.scenarioId
  }, 'run-1'));

  assert.equal(res.run.status, RunStatus.COMPLETED);
  assert.equal(res.result.dataOrigin, 'SIMULATED');
  assert.equal(res.result.outputs.impactIndex, 0.36);
  assert.equal(res.result.outputs.projectedAffectedPopulation, 3600);
  assert.equal(res.result.modelVersion, '1.0');
  // Provenance answers WHO / WHAT / WHICH model-version / WHICH inputs / WHEN
  assert.equal(res.result.provenance.modelType, 'DISASTER_SCENARIO');
  assert.deepEqual(res.result.provenance.inputSnapshot.targetReference, { twinId: 'twn-river-1', stateVersion: 4 });
  assert.equal(res.result.provenance.correlationId, 'cor-run-1');

  const startedEvents = eventBus.getHistory({ eventType: 'econet.simulation.run_started' });
  const completedEvents = eventBus.getHistory({ eventType: 'econet.simulation.run_completed' });
  assert.equal(startedEvents.length, 1);
  assert.equal(completedEvents.length, 1);

  // Determinism: run the same scenario again — identical outputs, distinct runs
  const again = await engine.executeCommand(command('RunSimulation', {
    scenarioId: scenario.scenario.scenarioId
  }, 'run-2'));
  assert.deepEqual(again.result.outputs, res.result.outputs);
  assert.notEqual(again.run.runId, res.run.runId);

  const runs = await engine.listRunsByScenario(scenario.scenario.scenarioId);
  assert.equal(runs.length, 2, 'history retains both runs');
});

test('RunSimulation with a dispersion model produces dimensionally-coherent concentration', async () => {
  const { engine } = createFixture();

  const model = await registerModel(engine, 'disp', 'ATMOSPHERIC_DISPERSION');
  const scenario = await engine.executeCommand(command('CreateScenario', {
    name: 'release what-if',
    modelId: model.modelId,
    parameters: { emissionRate: 100, windSpeed: 2, downwindDistance: 100 }
  }, 'disp-scn'));

  const res = await engine.executeCommand(command('RunSimulation', {
    scenarioId: scenario.scenario.scenarioId
  }, 'disp-run'));

  assert.equal(res.run.status, RunStatus.COMPLETED);
  assert.ok(typeof res.result.outputs.groundLevelConcentration === 'number');
  assert.ok(res.result.outputs.groundLevelConcentration > 0);
  // Exact steady-state kernel value: 100 / (pi x 2 x (1 + 0.1 x 100)^2)
  const expected = 100 / (Math.PI * 2 * 11 * 11);
  assert.ok(Math.abs(res.result.outputs.groundLevelConcentration - Number(expected.toFixed(12))) < 1e-9);

  // Monotonicity: nearer receptors get higher concentrations
  const near = await engine.executeCommand(command('CreateScenario', {
    name: 'near', modelId: model.modelId,
    parameters: { emissionRate: 100, windSpeed: 2, downwindDistance: 10 }
  }, 'disp-near'));
  const nearRes = await engine.executeCommand(command('RunSimulation', {
    scenarioId: near.scenario.scenarioId
  }, 'disp-near-run'));
  assert.ok(nearRes.result.outputs.groundLevelConcentration > res.result.outputs.groundLevelConcentration);
});

test('RunSimulation against a retired model is rejected without mutation', async () => {
  const { engine, repository } = createFixture();

  const model = await registerModel(engine, 'rt', 'DISASTER_SCENARIO');
  const scenario = await engine.executeCommand(command('CreateScenario', {
    name: 'retired-what-if', modelId: model.modelId,
    parameters: { hazardIntensity: 0.5, exposedPopulation: 100, vulnerabilityIndex: 0.5 }
  }, 'rt-scn'));

  await engine.executeCommand(command('RetireSimulationModel', { modelId: model.modelId }, 'rt-ret'));

  await assert.rejects(engine.executeCommand(command('RunSimulation', {
    scenarioId: scenario.scenario.scenarioId
  }, 'rt-run')), /cannot be used/);

  const stored = await engine.getScenario(scenario.scenario.scenarioId);
  assert.ok(stored, 'scenario still exists');
  assert.equal((await repository.findResultByRunId('run-missing')), null);
});

test('CancelSimulation cancels a pending run but never erases a completed result', async () => {
  const { engine, eventBus } = createFixture();

  const model = await registerModel(engine, 'cx', 'DISASTER_SCENARIO');
  const scenario = await engine.executeCommand(command('CreateScenario', {
    name: 'cancelable', modelId: model.modelId,
    parameters: { hazardIntensity: 0.3, exposedPopulation: 50, vulnerabilityIndex: 0.4 }
  }, 'cx-scn'));

  const run = await engine.executeCommand(command('RunSimulation', {
    scenarioId: scenario.scenario.scenarioId
  }, 'cx-run'));
  // Completed runs cannot be cancelled
  await assert.rejects(engine.executeCommand(command('CancelSimulation', {
    runId: run.run.runId
  }, 'cx-cancel')), /Cannot cancel simulation run/);

  // History is intact: result survives the failed cancellation
  const result = await engine.getResultByRunId(run.run.runId);
  assert.ok(result, 'completed result is preserved');
  assert.equal(result.dataOrigin, 'SIMULATED');
  assert.equal(eventBus.getHistory({ eventType: 'econet.simulation.run_cancelled' }).length, 0);
});

test('RunSimulation idempotency: same command key returns the cached run', async () => {
  const { engine, repository, eventBus } = createFixture();

  const model = await registerModel(engine, 'idem', 'DISASTER_SCENARIO');
  const scenario = await engine.executeCommand(command('CreateScenario', {
    name: 'idem-what-if', modelId: model.modelId,
    parameters: { hazardIntensity: 0.4, exposedPopulation: 500, vulnerabilityIndex: 0.5 }
  }, 'idem-scn'));

  const payload = { scenarioId: scenario.scenario.scenarioId };
  const first = await engine.executeCommand(command('RunSimulation', payload, 'idem-run'));
  const second = await engine.executeCommand(command('RunSimulation', payload, 'idem-run'));

  assert.equal(second.run.runId, first.run.runId);
  const runs = await repository.listRunsByScenario(scenario.scenario.scenarioId);
  assert.equal(runs.length, 1, 'no duplicate run created by replay');
  assert.equal(eventBus.getHistory({ eventType: 'econet.simulation.run_completed' }).length, 1);
});

test('Authorization is enforced on every mutating command', async () => {
  const { engine, repository, eventBus } = createFixture();

  const model = await registerModel(engine, 'auth', 'DISASTER_SCENARIO');
  const scenario = await engine.executeCommand(command('CreateScenario', {
    name: 'auth-what-if', modelId: model.modelId,
    parameters: { hazardIntensity: 0.5, exposedPopulation: 100, vulnerabilityIndex: 0.5 }
  }, 'auth-scn'));

  const unauthorized = { actorId: 'random-user', roles: ['observer'] };
  const cmds = [
    ['RegisterSimulationModel', { name: 'x', version: '1.0', modelType: 'DISASTER_SCENARIO', parameterNames: [] }, 'a-reg'],
    ['RetireSimulationModel', { modelId: model.modelId }, 'a-ret'],
    ['CreateScenario', { name: 'x', modelId: model.modelId, parameters: {} }, 'a-scn'],
    ['RunSimulation', { scenarioId: scenario.scenario.scenarioId }, 'a-run'],
    ['CancelSimulation', { runId: 'run-missing' }, 'a-can']
  ];

  for (const [commandType, payload, suffix] of cmds) {
    await assert.rejects(
      engine.executeCommand(command(commandType, payload, suffix, unauthorized)),
      /lacks an authorized simulation role/
    );
  }

  assert.equal((await engine.listScenarios()).length, 1);
  assert.equal((await repository.listRunsByScenario(scenario.scenario.scenarioId)).length, 0);
  assert.equal(eventBus.getHistory({ eventType: 'econet.simulation.run_completed' }).length, 0);

  await assert.rejects(
    engine.executeCommand(new Command({
      commandType: 'RunSimulation',
      targetEngine: '19-simulation',
      idempotencyKey: 'auth-2b',
      payload: { scenarioId: scenario.scenario.scenarioId }
    })),
    /require an authenticated actor/
  );
});

test('Governance denial blocks mutation before any state change or event', async () => {
  const repository = new InMemorySimulationRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new SimulationEngine({
    service: new SimulationApplicationService({
      repository,
      eventBus,
      idempotencyManager,
        governance: {
        async evaluatePolicy({ commandType }) {
          if (commandType === 'RunSimulation') {
            return { allowed: false, reason: 'SIMULATION_FROZEN' };
          }
          return { allowed: true };
        }
      }
    })
  });

  const model = await engine.executeCommand(command('RegisterSimulationModel', {
    name: 'gov-model', version: '1.0', modelType: 'DISASTER_SCENARIO',
    parameterNames: ['hazardIntensity', 'exposedPopulation', 'vulnerabilityIndex']
  }, 'gov-reg'));

  const scenario = await engine.executeCommand(command('CreateScenario', {
    name: 'gov-what-if', modelId: model.model.modelId,
    parameters: { hazardIntensity: 0.5, exposedPopulation: 100, vulnerabilityIndex: 0.5 }
  }, 'gov-scn'));

  await assert.rejects(
    engine.executeCommand(command('RunSimulation', {
      scenarioId: scenario.scenario.scenarioId
    }, 'gov-run')),
    /Governance policy denial: SIMULATION_FROZEN/
  );

  assert.equal((await repository.listRunsByScenario(scenario.scenario.scenarioId)).length, 0);
  assert.equal(eventBus.getHistory({ eventType: 'econet.simulation.run_completed' }).length, 0);
});

test('Queries return models, scenarios, runs, results; unknown IDs are null', async () => {
  const { engine } = createFixture();

  const model = await registerModel(engine, 'qry', 'DISASTER_SCENARIO');
  const scenario = await engine.executeCommand(command('CreateScenario', {
    name: 'qry-what-if', modelId: model.modelId,
    parameters: { hazardIntensity: 0.6, exposedPopulation: 1000, vulnerabilityIndex: 0.5 }
  }, 'qry-scn'));

  assert.equal((await engine.getModel(model.modelId)).modelId, model.modelId);
  assert.equal(await engine.getModel('sim-missing'), null);
  assert.equal((await engine.listModels()).length, 1);
  assert.equal((await engine.listModels({ modelType: 'DISASTER_SCENARIO' })).length, 1);
  assert.equal((await engine.listModels({ modelType: 'ATMOSPHERIC_DISPERSION' })).length, 0);

  assert.equal((await engine.getScenario(scenario.scenario.scenarioId)).name, 'qry-what-if');
  assert.equal(await engine.getScenario('scn-missing'), null);
  assert.equal((await engine.listScenarios()).length, 1);

  const run = await engine.executeCommand(command('RunSimulation', {
    scenarioId: scenario.scenario.scenarioId
  }, 'qry-run'));

  assert.equal((await engine.getRun(run.run.runId)).status, RunStatus.COMPLETED);
  assert.equal(await engine.getRun('run-missing'), null);
  assert.equal((await engine.listRunsByScenario(scenario.scenario.scenarioId)).length, 1);
  assert.equal((await engine.listRunsByScenario('scn-missing')).length, 0);

  const result = await engine.getResultByRunId(run.run.runId);
  assert.equal(result.dataOrigin, 'SIMULATED');
  assert.equal(result.modelVersion, '1.0');
  assert.equal(await engine.getResultByRunId('run-missing'), null);
});

test('Repository isolation: Engine 19 does not leak state between engine instances', async () => {
  const repoA = new InMemorySimulationRepository();
  const repoB = new InMemorySimulationRepository();
  const engineA = new SimulationEngine({ repository: repoA });
  const engineB = new SimulationEngine({ repository: repoB });

  await engineA.executeCommand(command('RegisterSimulationModel', {
    name: 'iso', version: '1.0', modelType: 'DISASTER_SCENARIO',
    parameterNames: ['hazardIntensity', 'exposedPopulation', 'vulnerabilityIndex']
  }, 'iso-a'));

  assert.equal(await repoA.countModels(), 1);
  assert.equal(await repoB.countModels(), 0, 'no cross-engine state leak');
});

test('Unsupported commands and missing idempotency keys are rejected', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(command('DeleteAllSimulations', {}, 'bad-cmd')),
    /Unsupported Simulation command/
  );

  await assert.rejects(
    engine.executeCommand(new Command({
      commandType: 'RunSimulation',
      targetEngine: '19-simulation',
      payload: { scenarioId: 'scn-x' }
    })),
    /requires an idempotencyKey/
  );
});

test('SimulationEngine exposes the canonical lifecycle contract', async () => {
  const { engine, repository } = createFixture();

  assert.equal(engine.engineId, '19');
  assert.equal(engine.engineName, 'Simulation Engine');

  const init = await engine.initialize();
  assert.equal(init.ready, true);

  const health = await engine.healthCheck();
  assert.equal(health.healthy, true);
  assert.equal(health.details.status, 'READY');
  assert.equal(health.details.persistence, 'IN_MEMORY_SIMULATION_ADAPTER');
  assert.equal(health.details.totalModels, 0);

  await engine.shutdown();

  assert.equal(await repository.countModels(), 0);
});

// ── Authorization regression: malformed and missing actor.roles ──────────────

// Helper that builds a command with a fully custom actor object (bypassing
// default fixture actor) so we can exercise every roles edge case.
const commandWithActor = (commandType, payload, suffix, actor) => new Command({
  commandType,
  targetEngine: '19-simulation',
  payload,
  actor,
  idempotencyKey: `auth-roles-${suffix}`,
  correlationId: `cor-roles-${suffix}`
});

// One valid payload per mutating command so we can reuse them across actor variations.
const VALID_MODEL_PAYLOAD = {
  name: 'roles-test-model',
  version: '1.0',
  modelType: 'DISASTER_SCENARIO',
  parameterNames: ['hazardIntensity', 'exposedPopulation', 'vulnerabilityIndex']
};

test('Authorization: missing roles field is denied, not silently passed', async () => {
  const { engine } = createFixture();

  // actor has actorId but no roles property at all
  const noRolesActor = { actorId: 'user-no-roles' };

  await assert.rejects(
    engine.executeCommand(commandWithActor('RegisterSimulationModel', VALID_MODEL_PAYLOAD, 'no-roles', noRolesActor)),
    /lacks an authorized simulation role/
  );

  // Confirm: no model was registered
  assert.equal((await engine.listModels()).length, 0);
});

test('Authorization: roles supplied as a non-array value is denied', async () => {
  const { engine } = createFixture();

  const nonArrayVariants = [
    { actorId: 'u1', roles: 'simulation_operator' },    // string
    { actorId: 'u2', roles: { simulation_operator: true } }, // plain object
    { actorId: 'u3', roles: 42 },                        // number
    { actorId: 'u4', roles: null },                      // null
    { actorId: 'u5', roles: true }                       // boolean
  ];

  for (const actor of nonArrayVariants) {
    await assert.rejects(
      engine.executeCommand(commandWithActor(
        'RegisterSimulationModel', VALID_MODEL_PAYLOAD,
        `non-arr-${actor.actorId}`, actor
      )),
      /lacks an authorized simulation role/,
      `Expected denial for roles=${JSON.stringify(actor.roles)}`
    );
  }

  assert.equal((await engine.listModels()).length, 0);
});

test('Authorization: empty roles array is denied', async () => {
  const { engine } = createFixture();

  const emptyRolesActor = { actorId: 'user-empty-roles', roles: [] };

  await assert.rejects(
    engine.executeCommand(commandWithActor('RegisterSimulationModel', VALID_MODEL_PAYLOAD, 'empty-roles', emptyRolesActor)),
    /lacks an authorized simulation role/
  );

  assert.equal((await engine.listModels()).length, 0);
});

test('Authorization: unauthorized role is denied on every mutating command', async () => {
  const { engine } = createFixture();

  // First register a model and scenario with a valid actor so we have targets.
  const model = await registerModel(engine, 'authz-denied', 'DISASTER_SCENARIO');
  const scenarioRes = await engine.executeCommand(command('CreateScenario', {
    name: 'authz-denied-scn',
    modelId: model.modelId,
    parameters: { hazardIntensity: 0.5, exposedPopulation: 100, vulnerabilityIndex: 0.5 }
  }, 'authz-denied-scn'));
  const scenarioId = scenarioRes.scenario.scenarioId;

  const badActor = { actorId: 'observer-only', roles: ['observer'] };

  const cases = [
    ['RegisterSimulationModel', VALID_MODEL_PAYLOAD, 'deny-reg'],
    ['RetireSimulationModel', { modelId: model.modelId }, 'deny-ret'],
    ['CreateScenario', { name: 'x', modelId: model.modelId, parameters: { hazardIntensity: 0.5, exposedPopulation: 100, vulnerabilityIndex: 0.5 } }, 'deny-scn'],
    ['RunSimulation', { scenarioId }, 'deny-run'],
    ['CancelSimulation', { runId: 'run-does-not-exist' }, 'deny-cancel']
  ];

  for (const [commandType, payload, suffix] of cases) {
    await assert.rejects(
      engine.executeCommand(commandWithActor(commandType, payload, suffix, badActor)),
      /lacks an authorized simulation role/,
      `Expected denial for ${commandType}`
    );
  }

  // State must be completely untouched by the rejected commands
  assert.equal((await engine.listModels()).length, 1, 'no extra models created');
  assert.equal((await engine.listScenarios()).length, 1, 'no extra scenarios created');
  assert.equal((await engine.listRunsByScenario(scenarioId)).length, 0, 'no runs created');
});

test('Authorization: all five canonical authorized roles are accepted', async () => {
  // Each authorized role must be able to execute RegisterSimulationModel successfully.
  const AUTHORIZED_ROLES = ['system', 'admin', 'simulation_operator', 'automation'];

  for (const role of AUTHORIZED_ROLES) {
    const { engine } = createFixture();
    const actor = { actorId: `user-${role}`, roles: [role] };

    const res = await engine.executeCommand(commandWithActor(
      'RegisterSimulationModel',
      { name: `role-model-${role}`, version: '1.0', modelType: 'DISASTER_SCENARIO', parameterNames: ['hazardIntensity', 'exposedPopulation', 'vulnerabilityIndex'] },
      `role-${role}`,
      actor
    ));

    assert.equal(res.model.status, 'ACTIVE', `Role "${role}" should be authorized`);
  }
});

test('Authorization: denial occurs before idempotency, governance, and state mutation', async () => {
  // Governance and idempotency are never reached when authorization fails.
  let governanceCalled = false;
  const repository = new InMemorySimulationRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new SimulationEngine({
    service: new SimulationApplicationService({
      repository,
      eventBus,
      idempotencyManager,
      governance: {
        async evaluatePolicy() {
          governanceCalled = true;
          return { allowed: true };
        }
      }
    })
  });

  const missingRolesActor = { actorId: 'user-no-roles' };

  await assert.rejects(
    engine.executeCommand(commandWithActor('RegisterSimulationModel', VALID_MODEL_PAYLOAD, 'order-check', missingRolesActor)),
    /lacks an authorized simulation role/
  );

  assert.equal(governanceCalled, false, 'governance must not be consulted when authorization fails');
  assert.equal(await repository.countModels(), 0, 'no state must be mutated when authorization fails');
  assert.equal(eventBus.getHistory().length, 0, 'no events must be published when authorization fails');
});
