/**
 * Engine 10: Prediction Engine — EnvironmentalPrediction Entity.
 * Pure aggregate for a standalone environmental trajectory forecast.
 */

import { randomUUID } from 'crypto';
import {
  assertConfidenceScore,
  assertErrorMargin,
  calculateConfidenceInterval,
  normalizeScorePrecision
} from '../value-objects/ConfidenceScore.js';
import {
  ProjectionHorizon,
  assertValidProjectionHorizon,
  normalizeProjectionWindow
} from '../value-objects/ProjectionHorizon.js';

export const PredictionStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  INVALIDATED: 'INVALIDATED'
});

const requireNonEmptyString = (value, fieldName) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`EnvironmentalPrediction requires a non-empty ${fieldName}.`);
  }
  return value.trim();
};

const assertFiniteNumber = (value, fieldName) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`EnvironmentalPrediction requires ${fieldName} to be a finite number.`);
  }
  return value;
};

const normalizeImpactFactors = (impactFactors) => {
  if (!Array.isArray(impactFactors) || impactFactors.length === 0) {
    throw new Error('EnvironmentalPrediction requires at least one impact factor.');
  }

  return Object.freeze(impactFactors.map((factor, index) => {
    const name = requireNonEmptyString(factor?.name, `impactFactors[${index}].name`);
    const probability = typeof factor?.probability === 'number' ? factor.probability : factor?.score;
    assertConfidenceScore(probability);
    const weight = factor?.weight === undefined ? 1 : factor.weight;
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) {
      throw new Error(`EnvironmentalPrediction impact factor "${name}" requires a positive finite weight.`);
    }
    return Object.freeze({
      name,
      probability,
      weight
    });
  }));
};

/**
 * Deterministically aggregate caller-supplied impact likelihood factors.
 * The engine does not infer factors from another engine or event stream.
 * @param {Array<{ probability: number, weight: number }>} impactFactors
 * @returns {number}
 */
export function calculateImpactProbability(impactFactors) {
  const factors = normalizeImpactFactors(impactFactors);
  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  return normalizeScorePrecision(
    factors.reduce((sum, factor) => sum + (factor.probability * factor.weight), 0) / totalWeight
  );
}

export class EnvironmentalPrediction {
  constructor({
    predictionId = `prd_${randomUUID().replace(/-/g, '')}`,
    subjectId,
    subjectType = 'environmental_subject',
    targetMetric,
    horizon = ProjectionHorizon.SHORT_TERM,
    projectionWindow,
    baselineValue,
    trajectoryDelta,
    impactFactors,
    confidenceScore,
    errorMargin = 0,
    modelVersion = '1.0',
    status = PredictionStatus.ACTIVE,
    invalidationReason = null,
    metadata = {},
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  } = {}) {
    this.predictionId = requireNonEmptyString(predictionId, 'predictionId');
    this.subjectId = requireNonEmptyString(subjectId, 'subjectId');
    this.subjectType = requireNonEmptyString(subjectType, 'subjectType');
    this.targetMetric = requireNonEmptyString(targetMetric, 'targetMetric');
    assertValidProjectionHorizon(horizon);
    this.horizon = horizon;
    this.projectionWindow = normalizeProjectionWindow(projectionWindow);
    this.baselineValue = assertFiniteNumber(baselineValue, 'baselineValue');
    this.trajectoryDelta = assertFiniteNumber(trajectoryDelta, 'trajectoryDelta');
    this.impactFactors = normalizeImpactFactors(impactFactors);
    this.confidenceScore = assertConfidenceScore(confidenceScore);
    this.errorMargin = assertErrorMargin(errorMargin);
    this.modelVersion = requireNonEmptyString(modelVersion, 'modelVersion');
    if (!Object.values(PredictionStatus).includes(status)) {
      throw new Error(`Unknown prediction status: "${status}".`);
    }
    if (status === PredictionStatus.INVALIDATED &&
        (typeof invalidationReason !== 'string' || invalidationReason.trim() === '')) {
      throw new Error('Invalidated EnvironmentalPrediction requires an invalidationReason.');
    }
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new Error('EnvironmentalPrediction metadata must be an object.');
    }

    this.projectedValue = this.baselineValue + this.trajectoryDelta;
    this.impactProbability = calculateImpactProbability(this.impactFactors);
    this.confidenceInterval = calculateConfidenceInterval(this.impactProbability, this.errorMargin);
    this.status = status;
    this.invalidationReason = invalidationReason ? invalidationReason.trim() : null;
    this.metadata = Object.freeze({ ...metadata });
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    Object.freeze(this);
  }

  updateModelConfidence({ confidenceScore, errorMargin = this.errorMargin, modelVersion = this.modelVersion }, now = new Date().toISOString()) {
    if (this.status === PredictionStatus.INVALIDATED) {
      throw new Error('Cannot update confidence for an INVALIDATED prediction.');
    }
    return new EnvironmentalPrediction({
      ...this.toJSON(),
      confidenceScore,
      errorMargin,
      modelVersion,
      createdAt: this.createdAt,
      updatedAt: now
    });
  }

  invalidate(reason, now = new Date().toISOString()) {
    if (this.status === PredictionStatus.INVALIDATED) {
      return this;
    }
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new Error('Invalidation requires a non-empty reason.');
    }
    return new EnvironmentalPrediction({
      ...this.toJSON(),
      status: PredictionStatus.INVALIDATED,
      invalidationReason: reason,
      createdAt: this.createdAt,
      updatedAt: now
    });
  }

  toJSON() {
    return {
      predictionId: this.predictionId,
      subjectId: this.subjectId,
      subjectType: this.subjectType,
      targetMetric: this.targetMetric,
      horizon: this.horizon,
      projectionWindow: { ...this.projectionWindow },
      baselineValue: this.baselineValue,
      trajectoryDelta: this.trajectoryDelta,
      impactFactors: this.impactFactors.map(factor => ({ ...factor })),
      confidenceScore: this.confidenceScore,
      errorMargin: this.errorMargin,
      modelVersion: this.modelVersion,
      status: this.status,
      invalidationReason: this.invalidationReason,
      metadata: { ...this.metadata },
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      projectedValue: this.projectedValue,
      impactProbability: this.impactProbability,
      confidenceInterval: { ...this.confidenceInterval }
    };
  }
}