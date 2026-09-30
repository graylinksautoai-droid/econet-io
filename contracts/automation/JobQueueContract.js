/**
 * EcoNet IO Job Queue Contract
 * Specification for background jobs managed by the Automation Engine.
 */

import { randomUUID } from 'crypto';

export const JobStatus = Object.freeze({
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  DEAD_LETTER: 'DEAD_LETTER'
});

export class BackgroundJob {
  /**
   * @param {Object} params
   * @param {string} params.taskType - e.g. 'reconcile_prediction_outcomes', 'flush_reward_batch'
   * @param {Object} params.payload - Job data payload
   * @param {number} [params.maxRetries=3]
   * @param {number} [params.priority=10]
   * @param {string} [params.correlationId]
   * @param {string} [params.jobId]
   */
  constructor({
    taskType,
    payload,
    maxRetries = 3,
    priority = 10,
    correlationId = null,
    jobId = null
  }) {
    if (!taskType || typeof taskType !== 'string') {
      throw new Error('BackgroundJob requires a valid string taskType.');
    }
    if (!payload || typeof payload !== 'object') {
      throw new Error('BackgroundJob requires an object payload.');
    }

    this.jobId = jobId || `job_${randomUUID().replace(/-/g, '')}`;
    this.taskType = taskType;
    this.payload = Object.freeze({ ...payload });
    this.status = JobStatus.QUEUED;
    this.maxRetries = maxRetries;
    this.retryCount = 0;
    this.priority = priority;
    this.correlationId = correlationId || `cor_${randomUUID().replace(/-/g, '')}`;
    this.createdAt = new Date().toISOString();
    this.startedAt = null;
    this.completedAt = null;
    this.error = null;
  }
}
