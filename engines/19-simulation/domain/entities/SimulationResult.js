/**
 * Engine 19: Simulation Engine — SimulationResult Entity
 * The computed output of a completed run. Results are explicitly marked
 * SIMULATED so downstream consumers cannot mistake them for OBSERVED or
 * VERIFIED data. Results are immutable once produced.
 */

import { randomUUID } from 'crypto';

export const DATA_ORIGIN_SIMULATED = 'SIMULATED';

export class SimulationResult {
  constructor({
    resultId = `res_${randomUUID().replace(/-/g, '')}`,
    runId,
    scenarioId,
    modelId,
    modelVersion,
    outputs = {},
    units = {},
    provenance = {},
    generatedAt = new Date().toISOString(),
    requestedBy = null
  } = {}) {
    if (typeof resultId !== 'string' || resultId.trim() === '') {
      throw new Error('SimulationResult requires a non-empty resultId.');
    }
    if (typeof runId !== 'string' || runId.trim() === '') {
      throw new Error('SimulationResult requires a non-empty runId.');
    }
    if (typeof scenarioId !== 'string' || scenarioId.trim() === '') {
      throw new Error('SimulationResult requires a non-empty scenarioId.');
    }
    if (typeof modelId !== 'string' || modelId.trim() === '') {
      throw new Error('SimulationResult requires a non-empty modelId.');
    }
    if (typeof modelVersion !== 'string' || modelVersion.trim() === '') {
      throw new Error('SimulationResult requires a non-empty modelVersion.');
    }
    if (outputs === null || typeof outputs !== 'object' || Array.isArray(outputs)) {
      throw new Error('SimulationResult outputs must be an object.');
    }

    this.resultId = resultId;
    this.runId = runId.trim();
    this.scenarioId = scenarioId.trim();
    this.modelId = modelId.trim();
    this.modelVersion = modelVersion.trim();
    this.dataOrigin = DATA_ORIGIN_SIMULATED;
    this.outputs = Object.freeze({ ...outputs });
    this.units = Object.freeze({ ...units });
    this.provenance = Object.freeze({ ...provenance });
    this.generatedAt = generatedAt;
    this.requestedBy = requestedBy || null;
    Object.freeze(this);
  }

  toJSON() {
    return {
      resultId: this.resultId,
      runId: this.runId,
      scenarioId: this.scenarioId,
      modelId: this.modelId,
      modelVersion: this.modelVersion,
      dataOrigin: this.dataOrigin,
      outputs: { ...this.outputs },
      units: { ...this.units },
      provenance: { ...this.provenance },
      generatedAt: this.generatedAt,
      requestedBy: this.requestedBy
    };
  }
}