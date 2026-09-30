/**
 * Engine 24: Learning Engine — EcoNet IO 24-Engine Canon
 *
 * Mission: Historical outcome feedback loops, accuracy evaluation, and model
 * adaptation tracking.
 *
 * This engine records the provenance of learning activity across the EcoNet
 * system: feedback between predicted and actual outcomes, point-in-time
 * accuracy evaluations, and adaptation events. It does NOT perform model
 * training, does NOT modify another engine's state, and does NOT execute
 * probabilistic computations.
 */

import { LearningApplicationService } from './application/services/LearningApplicationService.js';
import { InMemoryLearningRepository } from './infrastructure/repositories/InMemoryLearningRepository.js';

export const ENGINE_ID = '24';
export const ENGINE_NAME = 'Learning Engine';

export class LearningEngine {
  constructor(options = {}) {
    this.engineId = ENGINE_ID;
    this.engineName = ENGINE_NAME;
    this._service = options.service || new LearningApplicationService(options);
    this._repository = this._service.repository;
  }

  get service() { return this._service; }
  get repository() { return this._repository; }

  // ── Command execution ──────────────────────────────────────────────────────

  async executeCommand(command) {
    return this._service.execute(command);
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  async getFeedback(feedbackId) {
    return this._service.getFeedback(feedbackId);
  }

  async listFeedback(filter) {
    return this._service.listFeedback(filter);
  }

  async getAccuracyRecord(recordId) {
    return this._service.getAccuracyRecord(recordId);
  }

  async listAccuracyRecords(filter) {
    return this._service.listAccuracyRecords(filter);
  }

  async getAdaptation(adaptationId) {
    return this._service.getAdaptation(adaptationId);
  }

  async listAdaptations(filter) {
    return this._service.listAdaptations(filter);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async initialize() {
    return { ready: true, engineId: ENGINE_ID, name: ENGINE_NAME };
  }

  async healthCheck() {
    const [feedbackCount, accuracyCount, adaptationCount] = await Promise.all([
      this._repository.countFeedback(),
      this._repository.countAccuracy(),
      this._repository.countAdaptations()
    ]);
    return {
      healthy: true,
      engineId: ENGINE_ID,
      details: {
        status: 'READY',
        persistence: 'IN_MEMORY_LEARNING_ADAPTER',
        totalFeedback: feedbackCount,
        totalAccuracyRecords: accuracyCount,
        totalAdaptations: adaptationCount
      }
    };
  }

  async shutdown() {}
}

export const learningEngine = new LearningEngine();
export default learningEngine;

// Named exports for test fixtures and consumers
export { LearningApplicationService } from './application/services/LearningApplicationService.js';
export { InMemoryLearningRepository } from './infrastructure/repositories/InMemoryLearningRepository.js';
export { OutcomeFeedback } from './domain/entities/OutcomeFeedback.js';
export { AccuracyRecord } from './domain/entities/AccuracyRecord.js';
export { AdaptationRecord } from './domain/entities/AdaptationRecord.js';
