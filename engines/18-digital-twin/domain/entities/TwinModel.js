/**
 * Engine 18: Digital Twin Engine — TwinModel Entity
 * Describes the structure of a digital twin: the set of properties, their
 * units, valid ranges, and assumptions. Model versions are immutable after
 * publication; a state always references the model version that produced it.
 */

import { randomUUID } from 'crypto';

export class TwinModel {
  constructor({
    modelId = `mdl_${randomUUID().replace(/-/g, '')}`,
    twinId,
    modelName,
    modelVersion,
    schema = null,
    propertyDefinitions = {},
    assumptions = [],
    validationEnvelope = null,
    supersedesModelId = null,
    createdAt = new Date().toISOString()
  } = {}) {
    if (typeof modelId !== 'string' || modelId.trim() === '') {
      throw new Error('TwinModel requires a non-empty modelId.');
    }
    if (typeof twinId !== 'string' || twinId.trim() === '') {
      throw new Error('TwinModel requires a non-empty twinId.');
    }
    if (typeof modelName !== 'string' || modelName.trim() === '') {
      throw new Error('TwinModel requires a non-empty modelName.');
    }
    if (typeof modelVersion !== 'string' || modelVersion.trim() === '') {
      throw new Error('TwinModel requires a non-empty modelVersion.');
    }
    if (propertyDefinitions === null || typeof propertyDefinitions !== 'object' || Array.isArray(propertyDefinitions)) {
      throw new Error('TwinModel propertyDefinitions must be an object.');
    }
    if (!Array.isArray(assumptions)) {
      throw new Error('TwinModel assumptions must be an array.');
    }

    this.modelId = modelId;
    this.twinId = twinId.trim();
    this.modelName = modelName.trim();
    this.modelVersion = modelVersion.trim();
    this.schema = schema ? Object.freeze({ ...schema }) : null;
    this.propertyDefinitions = Object.freeze(
      Object.fromEntries(Object.entries(propertyDefinitions).map(([k, v]) => [k, Object.freeze({ ...v })]))
    );
    this.assumptions = Object.freeze(assumptions.map(String));
    this.validationEnvelope = validationEnvelope
      ? Object.freeze({ ...validationEnvelope })
      : null;
    this.supersedesModelId = supersedesModelId || null;
    this.createdAt = createdAt;
    Object.freeze(this);
  }

  /** Verify a property is declared by this model. */
  declaresProperty(propertyPath) {
    return this.propertyDefinitions[propertyPath] !== undefined;
  }

  /** Get a declared property definition (immutable). */
  getPropertyDefinition(propertyPath) {
    return this.propertyDefinitions[propertyPath] || null;
  }

  toJSON() {
    return {
      modelId: this.modelId,
      twinId: this.twinId,
      modelName: this.modelName,
      modelVersion: this.modelVersion,
      schema: this.schema ? { ...this.schema } : null,
      propertyDefinitions: Object.fromEntries(
        Object.entries(this.propertyDefinitions).map(([k, v]) => [k, { ...v }])
      ),
      assumptions: [...this.assumptions],
      validationEnvelope: this.validationEnvelope ? { ...this.validationEnvelope } : null,
      supersedesModelId: this.supersedesModelId,
      createdAt: this.createdAt
    };
  }
}