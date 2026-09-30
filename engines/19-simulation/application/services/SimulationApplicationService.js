/**
 * Engine 19: Simulation Engine — SimulationApplicationService
 * Orchestrates simulation models, scenarios, runs, and results.
 *
 * Boundaries respected: Engine 19 computes simulations only. It does not own
 * observations, knowledge, dialogue, intelligence, context, geography,
 * temporal, risk, prediction, mission, action, verification, reputation,
 * reward, community, agent, digital twin, external integration, workflow,
 * governance policy, audit, or learning.
 *
 * NO SIMULATION WRITEBACK: this engine never mutates another engine's state.
 * An optional caller-supplied input reference (e.g. a Digital Twin reference)
 * is recorded as opaque provenance only.
 *
 * SAFETY: model execution is a controlled built-in boundary. Callers supply
 * parameters, never code. No eval, dynamic import, network, filesystem, or
 * randomness.
 */

import { Command } from '../../../../contracts/commands/Command.js';
import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import { globalEventBus } from '../../../../infrastructure/messaging/EventBus.js';
import { globalIdempotencyManager } from '../../../../infrastructure/idempotency/IdempotencyManager.js';
import { SimulationModel } from '../../domain/entities/SimulationModel.js';
import { SimulationScenario } from '../../domain/entities/SimulationScenario.js';
import { SimulationRun } from '../../domain/entities/SimulationRun.js';
import { SimulationResult, DATA_ORIGIN_SIMULATED } from '../../domain/entities/SimulationResult.js';
import { ModelStatus, isModelUsable } from '../../domain/value-objects/ModelStatus.js';
import { RunStatus } from '../../domain/value-objects/RunStatus.js';
import { normalizeModelType } from '../../domain/value-objects/ModelType.js';
import { SimulationModelEvaluator } from '../../domain/services/SimulationModelEvaluator.js';
import { InMemorySimulationRepository } from '../../infrastructure/repositories/InMemorySimulationRepository.js';

const ENGINE_SLUG = '19-simulation';
const PRODUCER = 'engine.19.simulation';

const MUTATING_COMMANDS = new Set([
  'RegisterSimulationModel',
  'RetireSimulationModel',
  'CreateScenario',
  'RunSimulation',
  'CancelSimulation'
]);

const DEFAULT_AUTHORIZED_ROLES = Object.freeze([
  'system',
  'admin',
  'simulation_operator',
  'automation'
]);

export class SimulationApplicationService {
  constructor({
    repository = new InMemorySimulationRepository(),
    eventBus = globalEventBus,
    idempotencyManager = globalIdempotencyManager,
    governance = null,
    clock = () => new Date(),
    authorizedRoles = DEFAULT_AUTHORIZED_ROLES
  } = {}) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.idempotencyManager = idempotencyManager;
    this.governance = governance;
    this.clock = clock;
    this.authorizedRoles = Array.isArray(authorizedRoles) ? [...authorizedRoles] : [...DEFAULT_AUTHORIZED_ROLES];
    this.evaluator = new SimulationModelEvaluator();
  }

  async execute(command) {
    const cmd = command instanceof Command ? command : new Command(command);
    if (cmd.targetEngine !== ENGINE_SLUG || !MUTATING_COMMANDS.has(cmd.commandType)) {
      throw new Error(`Unsupported Simulation command: "${cmd.commandType}".`);
    }
    if (!cmd.idempotencyKey) {
      throw new Error(`Simulation command "${cmd.commandType}" requires an idempotencyKey.`);
    }
    if (!cmd.actor || !cmd.actor.actorId) {
      throw new Error('Simulation commands require an authenticated actor.');
    }
    this._assertAuthorized(cmd);

    return this.idempotencyManager.executeIdempotent(
      `${ENGINE_SLUG}:${cmd.commandType}:${cmd.idempotencyKey}`,
      async () => {
        await this._assertGovernance(cmd);
        return this._dispatch(cmd);
      }
    );
  }

  // ---- Queries ----

  async getModel(modelId) {
    const model = await this.repository.findModelById(modelId);
    return model ? model.toJSON() : null;
  }

  async listModels(filter = {}) {
    const models = await this.repository.listModels(filter);
    return models.map(m => m.toJSON());
  }

  async getScenario(scenarioId) {
    const scenario = await this.repository.findScenarioById(scenarioId);
    return scenario ? scenario.toJSON() : null;
  }

  async listScenarios() {
    const scenarios = await this.repository.listScenarios();
    return scenarios.map(s => s.toJSON());
  }

  async getRun(runId) {
    const run = await this.repository.findRunById(runId);
    return run ? run.toJSON() : null;
  }

  async listRunsByScenario(scenarioId) {
    const runs = await this.repository.listRunsByScenario(scenarioId);
    return runs.map(r => r.toJSON());
  }

  async getResultByRunId(runId) {
    const result = await this.repository.findResultByRunId(runId);
    return result ? result.toJSON() : null;
  }

    async _dispatch(cmd) {
    switch (cmd.commandType) {
      case 'RegisterSimulationModel':
        return this._handleRegisterModel(cmd);
      case 'RetireSimulationModel':
        return this._handleRetireModel(cmd);
      case 'CreateScenario':
        return this._handleCreateScenario(cmd);
      case 'RunSimulation':
        return this._handleRunSimulation(cmd);
      case 'CancelSimulation':
        return this._handleCancelSimulation(cmd);
      default:
        throw new Error(`Unhandled Simulation command: ${cmd.commandType}`);
    }
  }

  async _handleRegisterModel(cmd) {
    const { name, version, modelType, parameterNames = [] } = cmd.payload;

    // Validate model type against canonical vocabulary
    const normalizedType = normalizeModelType(modelType);
    const schema = this.evaluator.describeModelType(normalizedType);
    const required = schema.required;
    const known = this.evaluator.knownParameterNames(normalizedType);

    // Every required parameter must be declared by the model
    for (const requiredName of Object.keys(required)) {
      if (!parameterNames.includes(requiredName)) {
        throw new Error(
          `Simulation model registration requires parameter "${requiredName}" to be declared for model type ${normalizedType}.`
        );
      }
    }
    // Only known parameters for the model type may be declared
    for (const declaredName of parameterNames) {
      if (!known.includes(declaredName)) {
        throw new Error(
          `Unknown parameter "${declaredName}" is not supported by model type ${normalizedType}.`
        );
      }
    }

    // Duplicate name+version rejection
    const existing = await this.repository.findModelByNameAndVersion(name.trim(), version.trim());
    if (existing) {
      throw new Error(
        `Simulation model "${name.trim()}" version "${version.trim()}" is already registered.`
      );
    }

    const model = new SimulationModel({
      name: name.trim(),
      version: version.trim(),
      modelType: normalizedType,
      parameterNames,
      status: ModelStatus.ACTIVE,
      createdBy: cmd.actor.actorId,
      createdAt: this.clock().toISOString()
    });
    await this.repository.saveModel(model);

    await this._emit('econet.simulation.model_registered', {
      modelId: model.modelId,
      name: model.name,
      version: model.version,
      modelType: model.modelType,
      parameterNames: model.parameterNames
    }, {
      actor: cmd.actor,
      subject: { entityId: model.modelId, entityType: 'simulation_model' },
      correlationId: cmd.correlationId
    });

    return { model: model.toJSON() };
  }

    async _handleRetireModel(cmd) {
    const { modelId } = cmd.payload;
    const model = await this._requireModel(modelId);
    const retired = model.retire();
    await this.repository.saveModel(retired);

    await this._emit('econet.simulation.model_retired', {
      modelId: retired.modelId,
      name: retired.name,
      version: retired.version,
      modelType: retired.modelType
    }, {
      actor: cmd.actor,
      subject: { entityId: retired.modelId, entityType: 'simulation_model' },
      correlationId: cmd.correlationId
    });

    return { model: retired.toJSON() };
  }

  async _handleCreateScenario(cmd) {
    const { name, description = '', modelId, targetReference = null, parameters = {}, assumptions = [] } = cmd.payload;

    // The referenced model must exist and be usable.
    const model = await this._requireModel(modelId);
    if (!isModelUsable(model.status)) {
      throw new Error(`Simulation model "${modelId}" is ${model.status} and cannot be used.`);
    }

    // Validate parameters against the model's parameter vocabulary.
    this._validateParameterNames(model, parameters);

    const scenario = new SimulationScenario({
      name,
      description,
      modelId,
      modelVersion: model.version,
      targetReference,
      parameters,
      assumptions,
      createdBy: cmd.actor.actorId,
      createdAt: this.clock().toISOString()
    });
    await this.repository.saveScenario(scenario);

    await this._emit('econet.simulation.scenario_created', {
      scenarioId: scenario.scenarioId,
      name: scenario.name,
      modelId: scenario.modelId,
      modelVersion: scenario.modelVersion,
      parameterNames: Object.keys(scenario.parameters)
    }, {
      actor: cmd.actor,
      subject: { entityId: scenario.scenarioId, entityType: 'simulation_scenario' },
      correlationId: cmd.correlationId
    });

    return { scenario: scenario.toJSON() };
  }

    async _handleRunSimulation(cmd) {
    const { scenarioId, inputSnapshot = {} } = cmd.payload;
    const scenario = await this._requireScenario(scenarioId);

    // The scenario's model must exist and be usable.
    const model = await this._requireModel(scenario.modelId);
    if (!isModelUsable(model.status)) {
      throw new Error(`Simulation model "${scenario.modelId}" is ${model.status} and cannot be used.`);
    }

    // Freeze the input snapshot for reproducibility: scenario parameters plus
    // the opaque target reference (e.g. a Digital Twin snapshot) supplied by
    // the caller. The engine never interprets the target reference.
    const inputSnapshotFrozen = {
      parameters: { ...scenario.parameters },
      ...(Object.keys(inputSnapshot).length > 0 ? inputSnapshot : {}),
      targetReference: scenario.targetReference ? { ...scenario.targetReference } : null
    };

    let run = new SimulationRun({
      scenarioId: scenario.scenarioId,
      modelId: scenario.modelId,
      modelVersion: scenario.modelVersion,
      status: RunStatus.RUNNING,
      requestedBy: cmd.actor.actorId,
      inputSnapshot: inputSnapshotFrozen,
      startedAt: this.clock().toISOString(),
      correlationId: cmd.correlationId,
      metadata: { modelType: model.modelType }
    });
    await this.repository.saveRun(run);

    await this._emit('econet.simulation.run_started', {
      runId: run.runId,
      scenarioId: run.scenarioId,
      modelId: run.modelId,
      modelVersion: run.modelVersion,
      modelType: model.modelType,
      requestedBy: run.requestedBy
    }, {
      actor: cmd.actor,
      subject: { entityId: run.runId, entityType: 'simulation_run' },
      correlationId: cmd.correlationId
    });

    try {
      const evaluation = this.evaluator.evaluate({
        modelType: model.modelType,
        parameters: scenario.parameters
      });

      const result = new SimulationResult({
        runId: run.runId,
        scenarioId: scenario.scenarioId,
        modelId: run.modelId,
        modelVersion: run.modelVersion,
        outputs: evaluation.outputs,
        units: evaluation.units,
        provenance: {
          requestedBy: cmd.actor.actorId,
          requestedAt: run.startedAt,
          completedAt: this.clock().toISOString(),
          modelType: model.modelType,
          inputSnapshot: run.inputSnapshot,
          correlationId: cmd.correlationId,
          dataOrigin: DATA_ORIGIN_SIMULATED
        },
        generatedAt: this.clock().toISOString(),
        requestedBy: cmd.actor.actorId
      });
      await this.repository.saveResult(result);

      run = run.transitionTo(RunStatus.COMPLETED);
      await this.repository.saveRun(run);

      await this._emit('econet.simulation.run_completed', {
        runId: run.runId,
        scenarioId: run.scenarioId,
        modelId: run.modelId,
        modelVersion: run.modelVersion,
        resultId: result.resultId,
        dataOrigin: DATA_ORIGIN_SIMULATED
      }, {
        actor: cmd.actor,
        subject: { entityId: run.runId, entityType: 'simulation_run' },
        correlationId: cmd.correlationId
      });

      return { run: run.toJSON(), result: result.toJSON() };
    } catch (err) {
      const failureReason = err && err.message ? err.message : String(err);
      run = run.failWith(failureReason);
      await this.repository.saveRun(run);

      await this._emit('econet.simulation.run_failed', {
        runId: run.runId,
        scenarioId: run.scenarioId,
        modelId: run.modelId,
        modelVersion: run.modelVersion,
        failureReason
      }, {
        actor: cmd.actor,
        subject: { entityId: run.runId, entityType: 'simulation_run' },
        correlationId: cmd.correlationId
      });

      throw err;
    }
  }

  async _handleCancelSimulation(cmd) {
    const { runId, reason = null } = cmd.payload;
    const run = await this._requireRun(runId);

    if ([RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED].includes(run.status)) {
      throw new Error(`Cannot cancel simulation run "${runId}" in status ${run.status}.`);
    }

    const cancelled = run.transitionTo(RunStatus.CANCELLED);
    await this.repository.saveRun(cancelled);

    await this._emit('econet.simulation.run_cancelled', {
      runId: cancelled.runId,
      scenarioId: cancelled.scenarioId,
      modelId: cancelled.modelId,
      reason: reason || 'no reason supplied'
    }, {
      actor: cmd.actor,
      subject: { entityId: cancelled.runId, entityType: 'simulation_run' },
      correlationId: cmd.correlationId
    });

    return { run: cancelled.toJSON() };
  }

    // ---- Internal helpers ----

  _assertAuthorized(cmd) {
    // Canonical pattern (matches Engine 15/18): missing, non-array, or empty
    // roles are treated as no roles and are denied — they never pass silently.
    // actor and actor.actorId are guaranteed non-null by the execute() guard.
    const roles = Array.isArray(cmd.actor.roles) ? cmd.actor.roles : [];
    const allowed = roles.some(role => this.authorizedRoles.includes(role));
    if (!allowed) {
      throw new Error(
        `Simulation command "${cmd.commandType}" denied: actor "${cmd.actor.actorId}" lacks an authorized simulation role.`
      );
    }
  }

  async _assertGovernance(cmd) {
    if (!this.governance) return;
    const decision = await this.governance.evaluatePolicy({
      engine: ENGINE_SLUG,
      commandType: cmd.commandType,
      actor: cmd.actor,
      payload: cmd.payload
    });
    if (!decision.allowed) {
      throw new Error(`Governance policy denial: ${decision.reason || 'Command denied by policy.'}`);
    }
  }

  _validateParameterNames(model, parameters) {
    if (parameters === null || typeof parameters !== 'object' || Array.isArray(parameters)) {
      throw new Error('SimulationScenario parameters must be an object.');
    }
    const known = model.parameterNames;
    const provided = Object.keys(parameters);
    for (const providedName of provided) {
      if (!known.includes(providedName)) {
        throw new Error(
          `Unknown parameter "${providedName}" for simulation model "${model.name}".`
        );
      }
    }
    const missingRequired = this.evaluator
      .requiredParameterNames(model.modelType)
      .filter(name => !provided.includes(name));
    if (missingRequired.length > 0) {
      throw new Error(
        `SimulationScenario is missing required parameters: ${missingRequired.map(n => `"${n}"`).join(', ')}.`
      );
    }
    for (const providedName of provided) {
      const value = parameters[providedName];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Parameter "${providedName}" must be a finite number.`);
      }
    }
  }

  async _requireModel(modelId) {
    if (!modelId || typeof modelId !== 'string' || modelId.trim() === '') {
      throw new Error('modelId is required.');
    }
    const model = await this.repository.findModelById(modelId);
    if (!model) {
      throw new Error(`SimulationModel not found: "${modelId}".`);
    }
    return model;
  }

  async _requireScenario(scenarioId) {
    if (!scenarioId || typeof scenarioId !== 'string' || scenarioId.trim() === '') {
      throw new Error('scenarioId is required.');
    }
    const scenario = await this.repository.findScenarioById(scenarioId);
    if (!scenario) {
      throw new Error(`SimulationScenario not found: "${scenarioId}".`);
    }
    return scenario;
  }

  async _requireRun(runId) {
    if (!runId || typeof runId !== 'string' || runId.trim() === '') {
      throw new Error('runId is required.');
    }
    const run = await this.repository.findRunById(runId);
    if (!run) {
      throw new Error(`SimulationRun not found: "${runId}".`);
    }
    return run;
  }

  async _emit(eventType, payload, { actor = null, subject = null, correlationId = null } = {}) {
    const event = new DomainEvent({
      eventType,
      producer: PRODUCER,
      actor,
      subject,
      correlationId,
      payload
    });
    await this.eventBus.publish(event);
    return event;
  }
}