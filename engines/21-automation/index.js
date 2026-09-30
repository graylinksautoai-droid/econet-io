/**
 * Engine 21: Automation Engine — EcoNet IO 24-Engine Canon
 *
 * Mission: Backend execution queues, background job processing, event
 * triggers, and worker pipelines.
 *
 * This engine owns job lifecycle and execution state. It does NOT own
 * domain state from any other engine. Workers are registered server-side
 * only; callers never supply executable code.
 *
 * Boundary Rule: The Automation Engine represents the backend automation
 * infrastructure. External autonomous loops and agentic reasoning belong to
 * the Automation Team layer consuming these queue contracts.
 */

import { AutomationApplicationService } from './application/services/AutomationApplicationService.js';
import { InMemoryJobRepository } from './infrastructure/repositories/InMemoryJobRepository.js';
import { JobStatus } from '../../contracts/automation/JobQueueContract.js';

export const ENGINE_ID = '21';
export const ENGINE_NAME = 'Automation Engine';

export class AutomationEngine {
  constructor(options = {}) {
    this.engineId = ENGINE_ID;
    this.engineName = ENGINE_NAME;
    this._service = options.service || new AutomationApplicationService(options);
    this._repository = this._service.repository;
  }

  get service() { return this._service; }
  get repository() { return this._repository; }

  // ─── Command execution ────────────────────────────────────────────────────

  async executeCommand(command) {
    return this._service.execute(command);
  }

  // ─── Worker pipeline ──────────────────────────────────────────────────────

  /**
   * Register a server-side worker for a task type.
   * Workers are the sole execution boundary — callers never supply code.
   */
  registerWorker(taskType, worker) {
    return this._service.registerWorker(taskType, worker);
  }

  /**
   * Process the next job from the in-memory priority queue.
   */
  async processNext() {
    return this._service.processNext();
  }

  /**
   * Process all currently queued jobs.
   */
  async processAll() {
    return this._service.processAll();
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async getJob(jobId) {
    return this._service.getJob(jobId);
  }

  async listJobs(filter) {
    return this._service.listJobs(filter);
  }

  async getQueueStats() {
    return this._service.getQueueStats();
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async initialize() {
    return { ready: true, engineId: ENGINE_ID, name: ENGINE_NAME };
  }

  async healthCheck() {
    const stats = await this._service.getQueueStats();
    return {
      healthy: true,
      engineId: ENGINE_ID,
      details: {
        status: 'READY',
        persistence: 'IN_MEMORY_AUTOMATION_ADAPTER',
        queueDepth: stats.queueDepth,
        deadLetters: stats.persisted.deadLetter,
        registeredWorkers: stats.registeredWorkers
      }
    };
  }

  async shutdown() {
    // Drain the in-memory queue reference; repository state is retained
    // so completed/failed jobs remain readable after shutdown.
    this._service._queue = [];
  }
}

export const automationEngine = new AutomationEngine();
export default automationEngine;

// Named exports for test fixtures and consumers
export { AutomationApplicationService } from './application/services/AutomationApplicationService.js';
export { InMemoryJobRepository } from './infrastructure/repositories/InMemoryJobRepository.js';
export { BackgroundJob, JobStatus } from '../../contracts/automation/JobQueueContract.js';
export {
  TaskType,
  normalizeTaskType,
  isValidTaskType
} from './domain/value-objects/TaskType.js';
