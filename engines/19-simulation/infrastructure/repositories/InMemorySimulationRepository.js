/**
 * Engine 19: Simulation Engine — InMemorySimulationRepository
 * Isolated in-memory persistence adapter for simulation models, scenarios,
 * runs, and results. Run history is preserved; completed runs/results are
 * immutable.
 */

export class InMemorySimulationRepository {
  #models = new Map();
  #scenarios = new Map();
  #runs = new Map();
  #results = new Map();

  // ---- Models ----

  async saveModel(model) {
    if (!model || !model.modelId) {
      throw new Error('Cannot save invalid SimulationModel.');
    }
    this.#models.set(model.modelId, model);
    return model;
  }

  async findModelById(modelId) {
    return this.#models.get(modelId) || null;
  }

  async findModelByNameAndVersion(name, version) {
    for (const model of this.#models.values()) {
      if (model.name === name && model.version === version) {
        return model;
      }
    }
    return null;
  }

  async listModels({ modelType = null, status = null } = {}) {
    let results = Array.from(this.#models.values());
    if (modelType) results = results.filter(m => m.modelType === modelType);
    if (status) results = results.filter(m => m.status === status);
    return results;
  }

  // ---- Scenarios ----

  async saveScenario(scenario) {
    if (!scenario || !scenario.scenarioId) {
      throw new Error('Cannot save invalid SimulationScenario.');
    }
    this.#scenarios.set(scenario.scenarioId, scenario);
    return scenario;
  }

  async findScenarioById(scenarioId) {
    return this.#scenarios.get(scenarioId) || null;
  }

  async listScenarios() {
    return Array.from(this.#scenarios.values());
  }

  // ---- Runs ----

  async saveRun(run) {
    if (!run || !run.runId) {
      throw new Error('Cannot save invalid SimulationRun.');
    }
    this.#runs.set(run.runId, run);
    return run;
  }

  async findRunById(runId) {
    return this.#runs.get(runId) || null;
  }

  async listRunsByScenario(scenarioId) {
    const results = [];
    for (const run of this.#runs.values()) {
      if (run.scenarioId === scenarioId) {
        results.push(run);
      }
    }
    return results;
  }

  // ---- Results ----

  async saveResult(result) {
    if (!result || !result.resultId) {
      throw new Error('Cannot save invalid SimulationResult.');
    }
    this.#results.set(result.resultId, result);
    return result;
  }

  async findResultByRunId(runId) {
    for (const result of this.#results.values()) {
      if (result.runId === runId) {
        return result;
      }
    }
    return null;
  }

  async countModels() {
    return this.#models.size;
  }

  async clear() {
    this.#models.clear();
    this.#scenarios.clear();
    this.#runs.clear();
    this.#results.clear();
  }
}