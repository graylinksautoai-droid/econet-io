/**
 * Engine 09: Risk Engine — RiskAssessment Entity
 * Pure domain model encapsulating environmental risk assessment, hazard factors,
 * severity evaluation, and mitigation tracking.
 */

import { randomUUID } from 'crypto';
import {
  RiskLevel,
  RISK_LEVEL_RANK,
  riskLevelFromScore,
  clampRiskScore,
  assertValidRiskLevel,
  isThresholdBreached,
  isRiskEscalation
} from '../value-objects/RiskLevel.js';
import { normalizeHazardType, hazardWeight } from '../value-objects/HazardType.js';

export const RiskAssessmentStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  MITIGATED: 'MITIGATED',
  CLOSED: 'CLOSED'
});

const VALID_STATUS_TRANSITIONS = Object.freeze({
  [RiskAssessmentStatus.ACTIVE]: new Set([
    RiskAssessmentStatus.MITIGATED,
    RiskAssessmentStatus.CLOSED
  ]),
  [RiskAssessmentStatus.MITIGATED]: new Set([RiskAssessmentStatus.CLOSED]),
  [RiskAssessmentStatus.CLOSED]: new Set()
});

export function canTransitionRiskStatus(currentStatus, nextStatus) {
  if (!Object.values(RiskAssessmentStatus).includes(currentStatus)) return false;
  if (!Object.values(RiskAssessmentStatus).includes(nextStatus)) return false;
  const allowed = VALID_STATUS_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.has(nextStatus));
}

export function assertRiskStatusTransition(currentStatus, nextStatus) {
  if (!canTransitionRiskStatus(currentStatus, nextStatus)) {
    throw new Error(
      `Invalid risk assessment lifecycle transition: "${currentStatus}" -> "${nextStatus}".`
    );
  }
}

const factorLabel = (factor) => factor?.name || factor?.factorId || 'unknown-factor';

const assertMagnitude = (value, label) => {
  const magnitude = Number(value);
  if (Number.isNaN(magnitude) || magnitude < 0 || magnitude > 1) {
    throw new Error(
      `Invalid factor magnitude for "${label}": ${value}. Must be a number between 0 and 1.`
    );
  }
  return magnitude;
};

const assertWeight = (value, label) => {
  const weight = value === undefined || value === null ? 1 : Number(value);
  if (Number.isNaN(weight) || weight <= 0) {
    throw new Error(
      `Invalid factor weight for "${label}": ${value}. Must be a positive number.`
    );
  }
  return weight;
};

const assertExposure = (value) => {
  const exposure = Number(value);
  if (Number.isNaN(exposure) || exposure < 0 || exposure > 1) {
    throw new Error(
      `Invalid exposureIndex: "${value}". Must be a number between 0 and 1.`
    );
  }
  return exposure;
};

/**
 * Deterministic weighted risk score calculation (0-100).
 *
 * score = 100 x hazardWeight x factorIntensity x exposureMultiplier
 *   factorIntensity    = weighted average of hazard factor magnitudes (0-1)
 *   exposureMultiplier = 0.5 + (0.5 x exposureIndex)   (range 0.5-1.0)
 *
 * @param {Object} params
 * @param {string} params.hazardType
 * @param {Array<{name?: string, magnitude: number, weight?: number}>} params.factors
 * @param {number} [params.exposureIndex=0.5]
 * @returns {number} normalized integer risk score
 */
export function calculateRiskScore({ hazardType, factors, exposureIndex = 0.5 }) {
  if (!Array.isArray(factors) || factors.length === 0) {
    throw new Error('Risk score calculation requires at least one hazard factor.');
  }

  const exposure = assertExposure(exposureIndex);

  let weightedMagnitude = 0;
  let totalWeight = 0;

  for (const factor of factors) {
    const label = factorLabel(factor);
    const magnitude = assertMagnitude(factor?.magnitude, label);
    const weight = assertWeight(factor?.weight, label);
    weightedMagnitude += magnitude * weight;
    totalWeight += weight;
  }

  const factorIntensity = weightedMagnitude / totalWeight;
  const exposureMultiplier = 0.5 + (0.5 * exposure);

  return clampRiskScore(100 * hazardWeight(hazardType) * factorIntensity * exposureMultiplier);
}

export class RiskAssessment {
  constructor({
    assessmentId = `rsk_${randomUUID().replace(/-/g, '')}`,
    subjectId,
    subjectType = 'region',
    hazardType,
    factors,
    exposureIndex = 0.5,
    minimumLevel = RiskLevel.HIGH,
    mitigations = [],
    status = RiskAssessmentStatus.ACTIVE,
    closedReason = null,
    metadata = {},
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  } = {}) {
    if (typeof assessmentId !== 'string' || assessmentId.trim() === '') {
      throw new Error('RiskAssessment requires a non-empty assessmentId.');
    }
    if (typeof subjectId !== 'string' || subjectId.trim() === '') {
      throw new Error('RiskAssessment requires a non-empty subjectId.');
    }
    if (typeof subjectType !== 'string' || subjectType.trim() === '') {
      throw new Error('RiskAssessment requires a non-empty subjectType.');
    }
    if (!Array.isArray(factors) || factors.length === 0) {
      throw new Error('RiskAssessment requires at least one hazard factor.');
    }
    if (!Array.isArray(mitigations)) {
      throw new Error('RiskAssessment mitigations must be an array.');
    }
    if (!Object.values(RiskAssessmentStatus).includes(status)) {
      throw new Error(`Unknown risk assessment status: "${status}".`);
    }
    assertValidRiskLevel(minimumLevel);

    const normalizedHazard = normalizeHazardType(hazardType);
    const normalizedFactors = Object.freeze(factors.map(factor => {
      const label = factorLabel(factor);
      return Object.freeze({
        factorId: factor?.factorId || `rskf_${randomUUID().replace(/-/g, '')}`,
        name: factor?.name || label,
        magnitude: assertMagnitude(factor?.magnitude, label),
        weight: assertWeight(factor?.weight, label)
      });
    }));

    const normalizedMitigations = Object.freeze(mitigations.map(m => this._normalizeMitigation(m)));

    this.assessmentId = assessmentId;
    this.subjectId = subjectId.trim();
    this.subjectType = subjectType.trim();
    this.hazardType = normalizedHazard;
    this.factors = normalizedFactors;
    this.exposureIndex = assertExposure(exposureIndex);
    this.minimumLevel = minimumLevel;
    this.mitigations = normalizedMitigations;

    // Deterministic derived state
    this.rawScore = calculateRiskScore({
      hazardType: normalizedHazard,
      factors: normalizedFactors,
      exposureIndex: this.exposureIndex
    });
    this.mitigationReduction = Math.min(
      1,
      normalizedMitigations.reduce((sum, m) => sum + m.effectiveness, 0)
    );
    this.score = clampRiskScore(this.rawScore * (1 - this.mitigationReduction));
    this.riskLevel = riskLevelFromScore(this.score);

    this.status = status;
    this.closedReason = closedReason;
    this.metadata = Object.freeze({ ...metadata });
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    Object.freeze(this);
  }

  _normalizeMitigation(mitigation) {
    const effectiveness = Number(mitigation?.effectiveness);
    if (Number.isNaN(effectiveness) || effectiveness < 0 || effectiveness > 1) {
      throw new Error(
        `Invalid mitigation effectiveness: "${mitigation?.effectiveness}". Must be between 0 and 1.`
      );
    }
    if (typeof mitigation?.action !== 'string' || mitigation.action.trim() === '') {
      throw new Error('RiskAssessment mitigation requires a non-empty action.');
    }
    return Object.freeze({
      mitigationId: mitigation.mitigationId || `mit_${randomUUID().replace(/-/g, '')}`,
      action: mitigation.action.trim(),
      appliedBy: mitigation.appliedBy || null,
      effectiveness,
      appliedAt: mitigation.appliedAt || new Date().toISOString()
    });
  }

  get thresholdBreached() {
    return isThresholdBreached(this.riskLevel, this.minimumLevel);
  }

  get isCritical() {
    return RISK_LEVEL_RANK[this.riskLevel] >= RISK_LEVEL_RANK[RiskLevel.SEVERE];
  }

  get factorIntensity() {
    const totalWeight = this.factors.reduce((sum, f) => sum + f.weight, 0);
    const weighted = this.factors.reduce((sum, f) => sum + (f.magnitude * f.weight), 0);
    return weighted / totalWeight;
  }

  isEscalationFrom(previousLevel) {
    if (!previousLevel) return false;
    return isRiskEscalation(previousLevel, this.riskLevel);
  }

  _revision(changes, now) {
    return new RiskAssessment({
      ...this.toJSON(),
      ...changes,
      createdAt: this.createdAt,
      updatedAt: now
    });
  }

  /**
   * Update the escalation threshold this assessment is evaluated against.
   * @param {string} minimumLevel
   * @param {string} [now]
   * @returns {RiskAssessment}
   */
  withThreshold(minimumLevel, now = new Date().toISOString()) {
    assertValidRiskLevel(minimumLevel);
    if (minimumLevel === this.minimumLevel) {
      return this;
    }
    return this._revision({ minimumLevel }, now);
  }

  /**
   * Record a mitigation action. Applied effectiveness cumulatively reduces the
   * raw hazard score, which may de-escalate the derived risk level.
   * @param {{action: string, appliedBy?: string, effectiveness?: number}} mitigation
   * @param {string} [now]
   * @returns {RiskAssessment}
   */
  addMitigation({ action, appliedBy = null, effectiveness = 0 }, now = new Date().toISOString()) {
    if (this.status === RiskAssessmentStatus.CLOSED) {
      throw new Error('Cannot add mitigation to a CLOSED risk assessment.');
    }
    if (typeof action !== 'string' || action.trim() === '') {
      throw new Error('Risk mitigation requires a non-empty action.');
    }
    const value = Number(effectiveness);
    if (Number.isNaN(value) || value < 0 || value > 1) {
      throw new Error(
        `Invalid mitigation effectiveness: "${effectiveness}". Must be between 0 and 1.`
      );
    }
    const mitigation = {
      action: action.trim(),
      appliedBy,
      effectiveness: value,
      appliedAt: now
    };
    return this._revision({ mitigations: [...this.mitigations, mitigation] }, now);
  }

  markMitigated(now = new Date().toISOString()) {
    assertRiskStatusTransition(this.status, RiskAssessmentStatus.MITIGATED);
    return this._revision({ status: RiskAssessmentStatus.MITIGATED }, now);
  }

  close(reason = null, now = new Date().toISOString()) {
    assertRiskStatusTransition(this.status, RiskAssessmentStatus.CLOSED);
    return this._revision({ status: RiskAssessmentStatus.CLOSED, closedReason: reason }, now);
  }

  /**
   * Re-evaluate the assessment with refreshed hazard factor readings.
   * @param {{factors?: Array, exposureIndex?: number, metadata?: Object}} params
   * @param {string} [now]
   * @returns {RiskAssessment}
   */
  reassess({ factors = this.factors, exposureIndex = this.exposureIndex, metadata = null } = {}, now = new Date().toISOString()) {
    if (this.status === RiskAssessmentStatus.CLOSED) {
      throw new Error('Cannot reassess a CLOSED risk assessment.');
    }
    return this._revision({
      factors,
      exposureIndex,
      metadata: metadata ? { ...this.metadata, ...metadata } : this.metadata
    }, now);
  }

  toJSON() {
    return {
      assessmentId: this.assessmentId,
      subjectId: this.subjectId,
      subjectType: this.subjectType,
      hazardType: this.hazardType,
      factors: this.factors.map(f => ({ ...f })),
      exposureIndex: this.exposureIndex,
      minimumLevel: this.minimumLevel,
      mitigations: this.mitigations.map(m => ({ ...m })),
      status: this.status,
      closedReason: this.closedReason,
      metadata: { ...this.metadata },
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      // Derived read-only projection (recomputed deterministically on construction)
      rawScore: this.rawScore,
      mitigationReduction: this.mitigationReduction,
      score: this.score,
      riskLevel: this.riskLevel,
      thresholdBreached: this.thresholdBreached,
      isCritical: this.isCritical
    };
  }
}