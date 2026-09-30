/**
 * Engine 19: Simulation Engine — EcoNet IO 24-Engine Canon
 * Mission: Disaster scenario modeling, atmospheric dispersion simulation, and
 * what-if impact analysis.
 */

import { SimulationApplicationService } from './application/services/SimulationApplicationService.js';
import { InMemorySimulationRepository } from './infrastructure/repositories/InMemorySimulationRepository.js';

export const ENGINE_ID = '19';
export const ENGINE_NAME = 'Simulation Engine';

export class SimulationEngine {
  constructor(options = {}) {
    this.engineId = ENGINE_ID;
    this.engineName = ENGINE_NAME;
    this._service = options.service || new SimulationApplicationService(options);
    this._repository = this._service.repository;
  }

  get service() {
    return this._service;
  }

  get repository() {
    return this._repository;
  }

  async executeCommand(command) {
    return this._service.execute(command);
  }

  async getModel(modelId) {
    return this._service.getModel(modelId);
  }

  async listModels(filter) {
    return this._service.listModels(filter);
  }

  async getScenario(scenarioId) {
    return this._service.getScenario(scenarioId);
  }

  async listScenarios() {
    return this._service.listScenarios();
  }

  async getRun(runId) {
    return this._service.getRun(runId);
  }

  async listRunsByScenario(scenarioId) {
    return this._service.listRunsByScenario(scenarioId);
  }

  async getResultByRunId(runId) {
    return this._service.getResultByRunId(runId);
  }

  async initialize() {
    return { ready: true, engineId: ENGINE_ID, name: ENGINE_NAME };
  }

  async healthCheck() {
    return {
      healthy: true,
      engineId: ENGINE_ID,
      details: {
        status: 'READY',
        persistence: 'IN_MEMORY_SIMULATION_ADAPTER',
        totalModels: await this._repository.countModels()
      }
    };
  }

  async shutdown() {}
}

export const simulationEngine = new SimulationEngine();
export default simulationEngine;

export { SimulationApplicationService } from './application/services/SimulationApplicationService.js';
export { InMemorySimulationRepository } from './infrastructure/repositories/InMemorySimulationRepository.js';
export { SimulationModel } from './domain/entities/SimulationModel.js';
export { SimulationScenario } from './domain/entities/SimulationScenario.js';
export { SimulationRun } from './domain/entities/SimulationRun.js';
export { SimulationResult, DATA_ORIGIN_SIMULATED } from './domain/entities/SimulationResult.js';
export { ModelType, normalizeModelType, isValidModelType } from './domain/value-objects/ModelType.js';
export { RunStatus, canTransitionRunStatus, assertRunStatusTransition, isTerminalRunStatus } from './domain/value-objects/RunStatus.js';
export { ModelStatus, canTransitionModelStatus, assertModelStatusTransition, isModelUsable } from './domain/value-objects/ModelStatus.js';
export { SimulationModelEvaluator } from './domain/services/SimulationModelEvaluator.js';