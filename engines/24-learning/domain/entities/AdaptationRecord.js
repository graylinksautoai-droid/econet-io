/**
 * Engine 24: Learning Engine — AdaptationRecord Entity
 *
 * CANONICAL BASIS: "Model adaptation tracking" is explicitly named in the
 * canonical registry description for Engine 24.
 *
 * An AdaptationRecord captures the provenance of an adaptation event: when a
 * model, algorithm, or system component was changed or reconfigured in response
 * to accumulated feedback or evaluation data.
 *
 * IMPORTANT: Engine 24 records THAT an adaptation occurred and WHY. It does
 * NOT perform the adaptation itself. The actual model or configuration change
 * is owned by the appropriate engine (e.g. Engine 10 Prediction for prediction
 * models). Engine 24 only holds the provenance record.
 *
 * IMMUTABILITY: Instances are frozen after construction.
 */

import { randomUUID } from 'crypto';

export class AdaptationRecord {
  constructor({
    adaptationId = `adp_${randomUUID().replace(/-/g, '')}`,
    subjectEngine,
    subjectId,
    subjectType,
    adaptationType,
    rationale = '',
    feedbackIds = [],
    accuracyRecordIds = [],
    recordedBy = null,
    correlationId = null,
    recordedAt = new Date().toISOString(),
    metadata = {}
  } = {}) {
    if (typeof adaptationId !== 'string' || adaptationId.trim() === '') {
      throw new Error('AdaptationRecord requires a non-empty adaptationId.');
    }
    if (typeof subjectEngine !== 'string' || subjectEngine.trim() === '') {
      throw new Error('AdaptationRecord requires a non-empty subjectEngine.');
    }
    if (typeof subjectId !== 'string' || subjectId.trim() === '') {
      throw new Error('AdaptationRecord requires a non-empty subjectId.');
    }
    if (typeof subjectType !== 'string' || subjectType.trim() === '') {
      throw new Error('AdaptationRecord requires a non-empty subjectType.');
    }
    if (typeof adaptationType !== 'string' || adaptationType.trim() === '') {
      throw new Error('AdaptationRecord requires a non-empty adaptationType (e.g. "THRESHOLD_ADJUSTMENT", "PARAMETER_UPDATE").');
    }
    if (!Array.isArray(feedbackIds)) {
      throw new Error('AdaptationRecord feedbackIds must be an array.');
    }
    if (!Array.isArray(accuracyRecordIds)) {
      throw new Error('AdaptationRecord accuracyRecordIds must be an array.');
    }
    if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new Error('AdaptationRecord metadata must be a plain object.');
    }

    this.adaptationId = adaptationId;
    this.subjectEngine = subjectEngine.trim();
    this.subjectId = subjectId.trim();
    this.subjectType = subjectType.trim();
    this.adaptationType = adaptationType.trim();
    this.rationale = typeof rationale === 'string' ? rationale.trim() : '';
    this.feedbackIds = Object.freeze([...feedbackIds]);
    this.accuracyRecordIds = Object.freeze([...accuracyRecordIds]);
    this.recordedBy = recordedBy || null;
    this.correlationId = correlationId || null;
    this.recordedAt = recordedAt;
    this.metadata = Object.freeze({ ...metadata });
    Object.freeze(this);
  }

  toJSON() {
    return {
      adaptationId: this.adaptationId,
      subjectEngine: this.subjectEngine,
      subjectId: this.subjectId,
      subjectType: this.subjectType,
      adaptationType: this.adaptationType,
      rationale: this.rationale,
      feedbackIds: [...this.feedbackIds],
      accuracyRecordIds: [...this.accuracyRecordIds],
      recordedBy: this.recordedBy,
      correlationId: this.correlationId,
      recordedAt: this.recordedAt,
      metadata: { ...this.metadata }
    };
  }
}
