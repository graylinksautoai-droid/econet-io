/**
 * Engine 09: Risk Engine — EcoNet IO 24-Engine Canon
 * Mission: Calculate multi-hazard environmental risk scores, evaluate severity
 * indices, model exposure levels, and publish risk domain events feeding
 * Workflow B (Risk -> Prediction -> Mission/Action).
 */

import { RiskApplicationService } from './application/services/RiskApplicationService.js';
import { InMemoryRiskRepository } from './infrastructure/repositories/InMemoryRiskRepository.js';

export const ENGINE_ID = '09';
export const ENGINE_NAME = 'Risk Engine';

export class RiskEngine {
  constructor(options = {}) {
    this.engineId = ENGINE_ID;
    this.engineName = ENGINE_NAME;
    this._service = options.service || new RiskApplicationService(options);
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

  async getRiskAssessment(assessmentId) {
    return this._service.getRiskAssessmentById(assessmentId);
  }

  async listActiveRisks(filter) {
    return this._service.listActiveRisks(filter);
  }

  async listThresholds() {
    return this._service.listThresholds();
  }

  async resolveThreshold(hazardType) {
    return this._service.resolveThreshold(hazardType);
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
        persistence: 'IN_MEMORY_RISK_ADAPTER',
        totalAssessments: await this._repository.count()
      }
    };
  }

  async shutdown() {}
}

export const riskEngine = new RiskEngine();
export default riskEngine;

export { RiskApplicationService } from './application/services/RiskApplicationService.js';
export { InMemoryRiskRepository } from './infrastructure/repositories/InMemoryRiskRepository.js';
export {
  RiskAssessment,
  RiskAssessmentStatus,
  calculateRiskScore,
  canTransitionRiskStatus,
  assertRiskStatusTransition
} from './domain/entities/RiskAssessment.js';
export {
  RiskLevel,
  RISK_LEVEL_RANK,
  RISK_LEVEL_THRESHOLDS,
  riskLevelFromScore,
  compareRiskLevels,
  isRiskEscalation,
  isRiskDeescalation,
  isThresholdBreached,
  clampRiskScore
} from './domain/value-objects/RiskLevel.js';
export {
  HazardType,
  HAZARD_WEIGHTS,
  hazardWeight,
  normalizeHazardType,
  GLOBAL_THRESHOLD_KEY,
  DEFAULT_MINIMUM_LEVEL_BY_HAZARD,
  GLOBAL_DEFAULT_MINIMUM_LEVEL
} from './domain/value-objects/HazardType.js';
export {
  createRiskAssessmentEvaluatedEvent,
  RISK_ASSESSMENT_EVALUATED
} from './domain/events/RiskAssessmentEvaluated.js';
