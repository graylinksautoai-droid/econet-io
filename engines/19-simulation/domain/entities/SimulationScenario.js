/**
 * Engine 19: Simulation Engine — SimulationScenario Entity
 * A defined hypothetical configuration to be simulated: an explicit, validated,
 * reproducible parameter set bound to a specific model version, plus optional
 * opaque target/input references (e.g. a Digital Twin reference supplied by the
 * caller). A scenario never contains executable code.
 */

import { randomUUID } from 'crypto';

export class SimulationScenario {
  constructor({
    scenarioId = `scn_${randomUUID().replace(/-/g, '')}`,
    name,
    description = '',
    modelId,
    modelVersion,
    targetReference = null,
    parameters = {},
    assumptions = [],
    createdBy = null,
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  } = {}) {
    if (typeof scenarioId !== 'string' || scenarioId.trim() === '') {
      throw new Error('SimulationScenario requires a non-empty scenarioId.');
    }
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('SimulationScenario requires a non-empty name.');
    }
    if (typeof description !== 'string') {
      throw new Error('SimulationScenario description must be a string.');
    }
    if (typeof modelId !== 'string' || modelId.trim() === '') {
      throw new Error('SimulationScenario requires a non-empty modelId.');
    }
    if (typeof modelVersion !== 'string' || modelVersion.trim() === '') {
      throw new Error('SimulationScenario requires a non-empty modelVersion.');
    }
    if (parameters === null || typeof parameters !== 'object' || Array.isArray(parameters)) {
      throw new Error('SimulationScenario parameters must be an object.');
    }
    if (!Array.isArray(assumptions)) {
      throw new Error('SimulationScenario assumptions must be an array.');
    }

    this.scenarioId = scenarioId;
    this.name = name.trim();
    this.description = description.trim();
    this.modelId = modelId.trim();
    this.modelVersion = modelVersion.trim();
    this.targetReference = targetReference ? Object.freeze({ ...targetReference }) : null;
    this.parameters = Object.freeze({ ...parameters });
    this.assumptions = Object.freeze(assumptions.map(a => String(a).trim()).filter(Boolean));
    this.createdBy = createdBy || null;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    Object.freeze(this);
  }

  toJSON() {
    return {
      scenarioId: this.scenarioId,
      name: this.name,
      description: this.description,
      modelId: this.modelId,
      modelVersion: this.modelVersion,
      targetReference: this.targetReference ? { ...this.targetReference } : null,
      parameters: { ...this.parameters },
      assumptions: [...this.assumptions],
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}