/**
 * Engine 24: Learning Engine — OutcomeFeedback Entity
 *
 * CANONICAL BASIS: The canonical registry description establishes
 * "Historical outcome feedback loops" as a core Engine 24 responsibility.
 *
 * An OutcomeFeedback record captures the relationship between a prediction,
 * simulation, or automated decision (the "predicted" outcome) and the
 * subsequently observed real-world result (the "actual" outcome). This is the
 * fundamental unit of a feedback loop: the delta between what was expected and
 * what actually happened, preserved for accuracy evaluation and adaptation
 * tracking.
 *
 * OWNERSHIP BOUNDARY:
 * - Engine 24 owns the feedback record itself (the observation that a delta
 *   occurred, the source reference, and the provenance of the recording).
 * - It does NOT own the prediction that was made (Engine 10), the simulation
 *   result (Engine 19), the action that was taken (Engine 12), or the
 *   verification result (Engine 13).
 * - References to those are opaque identifier strings — Engine 24 never
 *   imports another engine's private state.
 *
 * IMMUTABILITY: Instances are frozen after construction.
 */

import { randomUUID } from 'crypto';

export class OutcomeFeedback {
  constructor({
    feedbackId = `fb_${randomUUID().replace(/-/g, '')}`,
    sourceEngine,
    sourceId,
    sourceType,
    predictedOutcome,
    actualOutcome,
    deltaDescription = '',
    recordedBy = null,
    correlationId = null,
    recordedAt = new Date().toISOString(),
    metadata = {}
  } = {}) {
    if (typeof feedbackId !== 'string' || feedbackId.trim() === '') {
      throw new Error('OutcomeFeedback requires a non-empty feedbackId.');
    }
    if (typeof sourceEngine !== 'string' || sourceEngine.trim() === '') {
      throw new Error('OutcomeFeedback requires a non-empty sourceEngine (e.g. "engine.10.prediction").');
    }
    if (typeof sourceId !== 'string' || sourceId.trim() === '') {
      throw new Error('OutcomeFeedback requires a non-empty sourceId (opaque reference to the source record).');
    }
    if (typeof sourceType !== 'string' || sourceType.trim() === '') {
      throw new Error('OutcomeFeedback requires a non-empty sourceType (e.g. "prediction", "simulation_result").');
    }
    if (predictedOutcome === undefined || predictedOutcome === null) {
      throw new Error('OutcomeFeedback requires a predictedOutcome (may not be null or undefined).');
    }
    if (actualOutcome === undefined || actualOutcome === null) {
      throw new Error('OutcomeFeedback requires an actualOutcome (may not be null or undefined).');
    }
    if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new Error('OutcomeFeedback metadata must be a plain object.');
    }

    this.feedbackId = feedbackId;
    this.sourceEngine = sourceEngine.trim();
    this.sourceId = sourceId.trim();
    this.sourceType = sourceType.trim();
    this.predictedOutcome = predictedOutcome;
    this.actualOutcome = actualOutcome;
    this.deltaDescription = typeof deltaDescription === 'string' ? deltaDescription.trim() : '';
    this.recordedBy = recordedBy || null;
    this.correlationId = correlationId || null;
    this.recordedAt = recordedAt;
    this.metadata = Object.freeze({ ...metadata });
    Object.freeze(this);
  }

  toJSON() {
    return {
      feedbackId: this.feedbackId,
      sourceEngine: this.sourceEngine,
      sourceId: this.sourceId,
      sourceType: this.sourceType,
      predictedOutcome: this.predictedOutcome,
      actualOutcome: this.actualOutcome,
      deltaDescription: this.deltaDescription,
      recordedBy: this.recordedBy,
      correlationId: this.correlationId,
      recordedAt: this.recordedAt,
      metadata: { ...this.metadata }
    };
  }
}
