/**
 * Engine 10: Prediction Engine — PredictionGenerated Domain Event Factory.
 * Emits the canonical standalone prediction event for generated or updated
 * prediction aggregate state.
 */

import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';

export const PREDICTION_GENERATED = 'econet.prediction.generated';
const PRODUCER = 'engine.10.prediction';

export function createPredictionGeneratedEvent({
  prediction,
  operation = 'GENERATED',
  actor = null,
  correlationId = null,
  metadata = {}
}) {
  if (!prediction || typeof prediction !== 'object') {
    throw new Error('PredictionGenerated event requires a prediction snapshot.');
  }

  return new DomainEvent({
    eventType: PREDICTION_GENERATED,
    producer: PRODUCER,
    actor,
    subject: { entityId: prediction.predictionId, entityType: 'environmental_prediction' },
    correlationId,
    payload: {
      predictionId: prediction.predictionId,
      subjectId: prediction.subjectId,
      subjectType: prediction.subjectType,
      targetMetric: prediction.targetMetric,
      horizon: prediction.horizon,
      projectionWindow: prediction.projectionWindow,
      baselineValue: prediction.baselineValue,
      trajectoryDelta: prediction.trajectoryDelta,
      projectedValue: prediction.projectedValue,
      impactProbability: prediction.impactProbability,
      confidenceScore: prediction.confidenceScore,
      errorMargin: prediction.errorMargin,
      confidenceInterval: prediction.confidenceInterval,
      modelVersion: prediction.modelVersion,
      status: prediction.status,
      invalidationReason: prediction.invalidationReason,
      operation
    },
    metadata: {
      audit: {
        criticalMutation: prediction.status === 'INVALIDATED',
        isEscalation: false
      },
      provenance: `engine.10.prediction.${operation}`,
      ...metadata
    }
  });
}