/**
 * Engine 09: Risk Engine — RiskAssessmentEvaluated Domain Event Factory
 * Canonical event emitted whenever a risk assessment is evaluated, re-evaluated,
 * or breaches its configured escalation threshold.
 */

import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import {
  RISK_LEVEL_RANK,
  RiskLevel,
  compareRiskLevels,
  isThresholdBreached
} from '../value-objects/RiskLevel.js';

export const RISK_ASSESSMENT_EVALUATED = 'econet.risk.assessment_evaluated';
const PRODUCER = 'engine.09.risk';

/**
 * Build a canonical RiskAssessmentEvaluated DomainEvent.
 * @param {Object} params
 * @param {Object} params.assessment - RiskAssessment snapshot (toJSON output)
 * @param {string|null} [params.previousLevel]
 * @param {string} [params.reason] - e.g. 'INITIAL_ASSESSMENT', 'MITIGATION_APPLIED'
 * @param {Object} [params.actor]
 * @param {string} [params.correlationId]
 * @param {Object} [params.metadata]
 * @returns {DomainEvent}
 */
export function createRiskAssessmentEvaluatedEvent({
  assessment,
  previousLevel = null,
  reason = 'RE_EVALUATION',
  actor = null,
  correlationId = null,
  metadata = {}
}) {
  if (!assessment || typeof assessment !== 'object') {
    throw new Error('RiskAssessmentEvaluated event requires an assessment snapshot.');
  }

  const newLevel = assessment.riskLevel;
  const levelChanged = Boolean(previousLevel) && previousLevel !== newLevel;
  const isEscalation = levelChanged && compareRiskLevels(newLevel, previousLevel) > 0;
  const isDeescalation = levelChanged && compareRiskLevels(newLevel, previousLevel) < 0;
  const thresholdBreached = Boolean(assessment.minimumLevel) &&
    isThresholdBreached(newLevel, assessment.minimumLevel);

  return new DomainEvent({
    eventType: RISK_ASSESSMENT_EVALUATED,
    producer: PRODUCER,
    actor,
    subject: { entityId: assessment.assessmentId, entityType: 'risk_assessment' },
    correlationId,
    payload: {
      assessmentId: assessment.assessmentId,
      subjectId: assessment.subjectId,
      subjectType: assessment.subjectType,
      hazardType: assessment.hazardType,
      score: assessment.score,
      rawScore: assessment.rawScore,
      riskLevel: newLevel,
      previousLevel,
      minimumLevel: assessment.minimumLevel,
      thresholdBreached,
      isEscalation,
      isDeescalation,
      reason,
      status: assessment.status,
      factorCount: assessment.factors ? assessment.factors.length : 0,
      mitigationCount: assessment.mitigations ? assessment.mitigations.length : 0
    },
    metadata: {
      audit: {
        criticalMutation: isCritical(newLevel),
        isEscalation
      },
      provenance: 'engine.09.risk.RiskAssessmentEvaluated',
      ...metadata
    }
  });
}

/**
 * Determine whether the canonical risk level is at or above SEVERE.
 * @param {string} level
 * @returns {boolean}
 */
function isCritical(level) {
  return RISK_LEVEL_RANK[level] >= RISK_LEVEL_RANK[RiskLevel.SEVERE];
}
