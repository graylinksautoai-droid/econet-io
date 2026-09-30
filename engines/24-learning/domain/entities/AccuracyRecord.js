/**
 * Engine 24: Learning Engine — AccuracyRecord Entity
 *
 * CANONICAL BASIS: "Accuracy evaluation" is explicitly named in the canonical
 * registry description for Engine 24.
 *
 * An AccuracyRecord is a point-in-time accuracy measurement for a named
 * model, algorithm, or system component. It captures what was evaluated,
 * the metric used, the resulting value, and the source of evaluation — forming
 * an immutable audit trail of how well a component has been performing over
 * time.
 *
 * OWNERSHIP BOUNDARY:
 * - Engine 24 owns this evaluation record.
 * - The model or algorithm being evaluated (e.g. a Prediction model) is
 *   referenced only by opaque identifiers.
 * - Engine 24 does NOT modify prediction models, simulation models, or any
 *   other engine's authoritative data.
 *
 * IMMUTABILITY: Instances are frozen after construction.
 */

import { randomUUID } from 'crypto';

export class AccuracyRecord {
  constructor({
    recordId = `acc_${randomUUID().replace(/-/g, '')}`,
    subjectEngine,
    subjectId,
    subjectType,
    metricName,
    metricValue,
    evaluationContext = {},
    recordedBy = null,
    correlationId = null,
    recordedAt = new Date().toISOString(),
    metadata = {}
  } = {}) {
    if (typeof recordId !== 'string' || recordId.trim() === '') {
      throw new Error('AccuracyRecord requires a non-empty recordId.');
    }
    if (typeof subjectEngine !== 'string' || subjectEngine.trim() === '') {
      throw new Error('AccuracyRecord requires a non-empty subjectEngine (e.g. "engine.10.prediction").');
    }
    if (typeof subjectId !== 'string' || subjectId.trim() === '') {
      throw new Error('AccuracyRecord requires a non-empty subjectId.');
    }
    if (typeof subjectType !== 'string' || subjectType.trim() === '') {
      throw new Error('AccuracyRecord requires a non-empty subjectType (e.g. "prediction_model", "simulation_model").');
    }
    if (typeof metricName !== 'string' || metricName.trim() === '') {
      throw new Error('AccuracyRecord requires a non-empty metricName (e.g. "precision", "recall", "mae").');
    }
    if (typeof metricValue !== 'number' || !Number.isFinite(metricValue)) {
      throw new Error('AccuracyRecord metricValue must be a finite number.');
    }
    if (evaluationContext === null || typeof evaluationContext !== 'object' || Array.isArray(evaluationContext)) {
      throw new Error('AccuracyRecord evaluationContext must be a plain object.');
    }
    if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new Error('AccuracyRecord metadata must be a plain object.');
    }

    this.recordId = recordId;
    this.subjectEngine = subjectEngine.trim();
    this.subjectId = subjectId.trim();
    this.subjectType = subjectType.trim();
    this.metricName = metricName.trim();
    this.metricValue = metricValue;
    this.evaluationContext = Object.freeze({ ...evaluationContext });
    this.recordedBy = recordedBy || null;
    this.correlationId = correlationId || null;
    this.recordedAt = recordedAt;
    this.metadata = Object.freeze({ ...metadata });
    Object.freeze(this);
  }

  toJSON() {
    return {
      recordId: this.recordId,
      subjectEngine: this.subjectEngine,
      subjectId: this.subjectId,
      subjectType: this.subjectType,
      metricName: this.metricName,
      metricValue: this.metricValue,
      evaluationContext: { ...this.evaluationContext },
      recordedBy: this.recordedBy,
      correlationId: this.correlationId,
      recordedAt: this.recordedAt,
      metadata: { ...this.metadata }
    };
  }
}
