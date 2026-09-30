/**
 * Engine 10: Prediction Engine — EcoNet IO 24-Engine Canon.
 * Mission: Environmental trend forecasting, hazard probability modeling, and
 * early-warning trajectory projection from direct caller-supplied inputs.
 */

import { PredictionApplicationService } from './application/services/PredictionApplicationService.js';
import { InMemoryPredictionRepository } from './infrastructure/repositories/InMemoryPredictionRepository.js';

export const ENGINE_ID = '10';
export const ENGINE_NAME = 'Prediction Engine';

export class PredictionEngine {
  constructor(options = {}) {
    this.engineId = ENGINE_ID;
    this.engineName = ENGINE_NAME;
    this._service = options.service || new PredictionApplicationService(options);
    this._repository = this._service.repository;
  }

  get service() {
    return this._service;
  }

  get repository() {
    return this._repository;
  }

  async executeCommand(command) {
    return this._service.execute(command);
  }

  async getPrediction(predictionId) {
    return this._service.getPredictionById(predictionId);
  }

  async listActivePredictions(filter) {
    return this._service.listActivePredictions(filter);
  }

  async initialize() {
    return { ready: true, engineId: ENGINE_ID, name: ENGINE_NAME };
  }

  async healthCheck() {
    return {
      healthy: true,
      engineId: ENGINE_ID,
      details: {
        status: 'READY',
        persistence: 'IN_MEMORY_PREDICTION_ADAPTER',
        totalPredictions: await this._repository.count()
      }
    };
  }

  async shutdown() {}
}

export const predictionEngine = new PredictionEngine();
export default predictionEngine;

export { PredictionApplicationService } from './application/services/PredictionApplicationService.js';
export { InMemoryPredictionRepository } from './infrastructure/repositories/InMemoryPredictionRepository.js';
export {
  EnvironmentalPrediction,
  PredictionStatus,
  calculateImpactProbability
} from './domain/entities/EnvironmentalPrediction.js';
export {
  MIN_CONFIDENCE_SCORE,
  MAX_CONFIDENCE_SCORE,
  NORMALIZED_SCORE_PRECISION,
  assertConfidenceScore,
  assertErrorMargin,
  normalizeScorePrecision,
  calculateConfidenceInterval
} from './domain/value-objects/ConfidenceScore.js';
export {
  ProjectionHorizon,
  assertValidProjectionHorizon,
  normalizeProjectionWindow
} from './domain/value-objects/ProjectionHorizon.js';
export {
  PREDICTION_GENERATED,
  createPredictionGeneratedEvent
} from './domain/events/PredictionGenerated.js';
