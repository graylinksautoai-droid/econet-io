/**
 * Engine 19: Simulation Engine — SimulationModel Entity
 * A registered, versioned simulation model. A model pairs a canonical model
 * TYPE (which selects the built-in deterministic evaluator) with a declared
 * parameter vocabulary. Model versions are immutable in meaning: a change
 * requires a new version.
 */

import { randomUUID } from 'crypto';
import { normalizeModelType } from '../value-objects/ModelType.js';
import { ModelStatus, assertModelStatusTransition } from '../value-objects/ModelStatus.js';

export class SimulationModel {
  constructor({
    modelId = `sim_${randomUUID().replace(/-/g, '')}`,
    name,
    version,
    modelType,
    parameterNames = [],
    status = ModelStatus.ACTIVE,
    createdBy = null,
    createdAt = new Date().toISOString()
  } = {}) {
    if (typeof modelId !== 'string' || modelId.trim() === '') {
      throw new Error('SimulationModel requires a non-empty modelId.');
    }
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('SimulationModel requires a non-empty name.');
    }
    if (typeof version !== 'string' || version.trim() === '') {
      throw new Error('SimulationModel requires a non-empty version.');
    }
    if (!Object.values(ModelStatus).includes(status)) {
      throw new Error(`Unknown simulation model status: "${status}".`);
    }
    if (!Array.isArray(parameterNames)) {
      throw new Error('SimulationModel parameterNames must be an array.');
    }

    this.modelId = modelId;
    this.name = name.trim();
    this.version = version.trim();
    this.modelType = normalizeModelType(modelType);
    this.parameterNames = Object.freeze(parameterNames.map(n => String(n).trim()).filter(Boolean));
    this.status = status;
    this.createdBy = createdBy || null;
    this.createdAt = createdAt;
    Object.freeze(this);
  }

  retire() {
    assertModelStatusTransition(this.status, ModelStatus.RETIRED);
    return new SimulationModel({ ...this.toJSON(), status: ModelStatus.RETIRED });
  }

  toJSON() {
    return {
      modelId: this.modelId,
      name: this.name,
      version: this.version,
      modelType: this.modelType,
      parameterNames: [...this.parameterNames],
      status: this.status,
      createdBy: this.createdBy,
      createdAt: this.createdAt
    };
  }
}