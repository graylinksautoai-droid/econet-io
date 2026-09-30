/**
 * Engine 21: Automation Engine — AutomationApplicationService
 *
 * Orchestrates background job execution queues, event triggers, and worker
 * pipelines for the EcoNet IO automation layer.
 *
 * OWNERSHIP BOUNDARY:
 * - This engine owns: job definitions, job lifecycle, job execution state,
 *   worker registration, dead-letter records, and automation provenance events.
 * - This engine does NOT own: observations (02), knowledge (03), missions (11),
 *   actions (12), verification (13), rewards (15), communities (16), agents (17),
 *   digital twins (18), simulations (19), external connector definitions (20),
 *   governance policies (22), audit infrastructure (23), or learning (24).
 *
 * SECURITY:
 * - Authorization is enforced before idempotency, governance, and mutation,
 *   following the canonical Engine 15/18/19/20 pattern.
 * - Missing, null, non-array, or empty actor.roles are denied.
 * - Workers are registered server-side only; callers supply a task type string,
 *   never executable code. No eval(), new Function(), or dynamic import().
 * - Connector references in INTEGRATION_JOB payloads are opaque strings passed
 *   to the registered worker — this engine never resolves credentials itself.
 *
 * WORKFLOW EXECUTION:
 * - processNext() / processAll() are synchronous execution methods for the
 *   current in-memory queue. They are not distributed workers.
 * - In-memory scheduling is not production-grade. See KNOWN LIMITATIONS.
 *
 * IMMUTABILITY NOTE:
 * - BackgroundJob (from contracts/automation/JobQueueContract.js) is a mutable
 *   class by contract. This service works with the contract as-is but snapshots
 *   job state into the repository after each transition so history is preserved.
 */

import { Command } from '../../../../contracts/commands/Command.js';
import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import { globalEventBus } from '../../../../infrastructure/messaging/EventBus.js';
import { globalIdempotencyManager } from '../../../../infrastructure/idempotency/IdempotencyManager.js';
import { BackgroundJob, JobStatus } from '../../../../contracts/automation/JobQueueContract.js';
import { normalizeTaskType } from '../../domain/value-objects/TaskType.js';
import { InMemoryJobRepository } from '../../infrastructure/repositories/InMemoryJobRepository.js';

const ENGINE_SLUG = '21-automation';
const PRODUCER = 'engine.21.automation';

const MUTATING_COMMANDS = new Set([
  'EnqueueJob',
  'CancelJob',
  'RetryJob'
]);

/**
 * Default authorized roles for automation management.
 * 'automation' is the cross-engine role present in every completed engine.
 * 'automation_manager' is the Engine 21-specific administrative role.
 */
const DEFAULT_AUTHORIZED_ROLES = Object.freeze([
  'system',
  'admin',
  'automation_manager',
  'automation'
]);

const MAX_PRIORITY = 100;
const MIN_PRIORITY = 1;
const MAX_RETRIES_LIMIT = 10;

export class AutomationApplicationService {
  constructor({
    repository = new InMemoryJobRepository(),
    eventBus = globalEventBus,
    idempotencyManager = globalIdempotencyManager,
    governance = null,
    clock = () => new Date(),
    authorizedRoles = DEFAULT_AUTHORIZED_ROLES
  } = {}) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.idempotencyManager = idempotencyManager;
    this.governance = governance;
    this.clock = clock;
    this.authorizedRoles = Array.isArray(authorizedRoles)
      ? [...authorizedRoles]
      : [...DEFAULT_AUTHORIZED_ROLES];

    // Worker registry: taskType → async (job) => result
    // Workers are registered server-side only; callers never supply code.
    this._workers = new Map();

    // In-memory priority queue (lowest number = highest priority)
    this._queue = [];
  }

  // ─── Worker registration ──────────────────────────────────────────────────

  /**
   * Register a server-side worker function for a task type.
   * Workers are the ONLY execution boundary — callers never supply code.
   * @param {string} taskType
   * @param {Function} worker - async (job) => result
   */
  registerWorker(taskType, worker) {
    const normalized = normalizeTaskType(taskType);
    if (typeof worker !== 'function') {
      throw new Error(`Worker for taskType "${normalized}" must be a function.`);
    }
    this._workers.set(normalized, worker);
  }

  // ─── Command entry point ──────────────────────────────────────────────────

  async execute(command) {
    const cmd = command instanceof Command ? command : new Command(command);

    if (cmd.targetEngine !== ENGINE_SLUG || !MUTATING_COMMANDS.has(cmd.commandType)) {
      throw new Error(`Unsupported Automation command: "${cmd.commandType}".`);
    }
    if (!cmd.idempotencyKey) {
      throw new Error(`Automation command "${cmd.commandType}" requires an idempotencyKey.`);
    }
    if (!cmd.actor || !cmd.actor.actorId) {
      throw new Error('Automation commands require an authenticated actor.');
    }

    // Authorization before idempotency and mutation — canonical E15/18/19/20 pattern
    this._assertAuthorized(cmd);

    return this.idempotencyManager.executeIdempotent(
      `${ENGINE_SLUG}:${cmd.commandType}:${cmd.idempotencyKey}`,
      async () => {
        await this._assertGovernance(cmd);
        return this._dispatch(cmd);
      }
    );
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async getJob(jobId) {
    return this.repository.findById(jobId);
  }

  async listJobs({ status = null, taskType = null } = {}) {
    return this.repository.list({ status, taskType });
  }

  async getQueueStats() {
    const [queued, processing, completed, failed, deadLetter] = await Promise.all([
      this.repository.countByStatus(JobStatus.QUEUED),
      this.repository.countByStatus(JobStatus.PROCESSING),
      this.repository.countByStatus(JobStatus.COMPLETED),
      this.repository.countByStatus(JobStatus.FAILED),
      this.repository.countByStatus(JobStatus.DEAD_LETTER)
    ]);
    return {
      queueDepth: this._queue.length,
      inMemoryQueueDepth: this._queue.length,
      persisted: { queued, processing, completed, failed, deadLetter },
      registeredWorkers: Array.from(this._workers.keys())
    };
  }

  // ─── Queue execution ──────────────────────────────────────────────────────

  /**
   * Process the next queued job from the in-memory priority queue.
   * No actor required — this is an internal engine operation called by the
   * owning process (worker pipeline), not by external command.
   * @returns {Promise<{success: boolean, job: Object, result?: any, error?: string}|null>}
   */
  async processNext() {
    if (this._queue.length === 0) return null;

    const job = this._queue.shift();
    const worker = this._workers.get(job.taskType);

    if (!worker) {
      job.status = JobStatus.DEAD_LETTER;
      job.error = `No worker registered for taskType "${job.taskType}".`;
      job.completedAt = this.clock().toISOString();
      await this.repository.save(job);
      await this._emit('econet.automation.job_dead_lettered', {
        jobId: job.jobId,
        taskType: job.taskType,
        reason: job.error
      }, { correlationId: job.correlationId });
      return { success: false, job, deadLetter: true, error: job.error };
    }

    job.status = JobStatus.PROCESSING;
    job.startedAt = this.clock().toISOString();
    await this.repository.save(job);

    try {
      const result = await worker(job);
      job.status = JobStatus.COMPLETED;
      job.completedAt = this.clock().toISOString();
      await this.repository.save(job);
      await this._emit('econet.automation.job_completed', {
        jobId: job.jobId,
        taskType: job.taskType,
        retryCount: job.retryCount
      }, { correlationId: job.correlationId });
      return { success: true, job, result };
    } catch (err) {
      job.retryCount++;
      job.error = err?.message ?? String(err);

      if (job.retryCount >= job.maxRetries) {
        job.status = JobStatus.DEAD_LETTER;
        job.completedAt = this.clock().toISOString();
        await this.repository.save(job);
        await this._emit('econet.automation.job_dead_lettered', {
          jobId: job.jobId,
          taskType: job.taskType,
          retryCount: job.retryCount,
          reason: job.error
        }, { correlationId: job.correlationId });
        return { success: false, job, deadLetter: true, error: job.error };
      } else {
        job.status = JobStatus.QUEUED;
        this._queue.push(job);
        this._sortQueue();
        await this.repository.save(job);
        await this._emit('econet.automation.job_failed', {
          jobId: job.jobId,
          taskType: job.taskType,
          retryCount: job.retryCount,
          error: job.error,
          willRetry: true
        }, { correlationId: job.correlationId });
        return { success: false, job, retrying: true, error: job.error };
      }
    }
  }

  /**
   * Process all currently queued jobs sequentially.
   * @returns {Promise<Array>}
   */
  async processAll() {
    const results = [];
    while (this._queue.length > 0) {
      const res = await this.processNext();
      if (res) results.push(res);
    }
    return results;
  }

  // ─── Command dispatch ─────────────────────────────────────────────────────

  _dispatch(cmd) {
    switch (cmd.commandType) {
      case 'EnqueueJob':  return this._handleEnqueue(cmd);
      case 'CancelJob':   return this._handleCancel(cmd);
      case 'RetryJob':    return this._handleRetry(cmd);
      default:
        throw new Error(`Unhandled Automation command: "${cmd.commandType}".`);
    }
  }

  // ─── Command handlers ─────────────────────────────────────────────────────

  async _handleEnqueue(cmd) {
    const {
      taskType,
      payload,
      priority = 10,
      maxRetries = 3,
      correlationId: payloadCorrelationId
    } = cmd.payload;

    // Validate task type against canonical vocabulary
    const normalizedType = normalizeTaskType(taskType);

    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('EnqueueJob requires an object payload.');
    }

    const boundedPriority = Math.max(MIN_PRIORITY, Math.min(MAX_PRIORITY, Number(priority) || 10));
    const boundedRetries = Math.max(0, Math.min(MAX_RETRIES_LIMIT, maxRetries != null && Number.isFinite(Number(maxRetries)) ? Number(maxRetries) : 3));

    const job = new BackgroundJob({
      taskType: normalizedType,
      payload,
      maxRetries: boundedRetries,
      priority: boundedPriority,
      correlationId: payloadCorrelationId || cmd.correlationId
    });

    // Add to in-memory queue and persist
    this._queue.push(job);
    this._sortQueue();
    await this.repository.save(job);

    await this._emit('econet.automation.job_enqueued', {
      jobId: job.jobId,
      taskType: job.taskType,
      priority: job.priority,
      maxRetries: job.maxRetries,
      enqueuedBy: cmd.actor.actorId
    }, {
      actor: cmd.actor,
      subject: { entityId: job.jobId, entityType: 'background_job' },
      correlationId: job.correlationId
    });

    return { job: this._jobSnapshot(job) };
  }

  async _handleCancel(cmd) {
    const { jobId } = cmd.payload;
    if (!jobId || typeof jobId !== 'string') {
      throw new Error('CancelJob requires a non-empty jobId.');
    }

    const stored = await this.repository.findById(jobId);
    if (!stored) {
      throw new Error(`BackgroundJob not found: "${jobId}".`);
    }
    if (stored.status !== JobStatus.QUEUED) {
      throw new Error(
        `Cannot cancel job "${jobId}" in status "${stored.status}". Only QUEUED jobs can be cancelled.`
      );
    }

    // Remove from in-memory queue
    const idx = this._queue.findIndex(j => j.jobId === jobId);
    if (idx !== -1) this._queue.splice(idx, 1);

    // Persist cancelled state
    const cancelled = { ...stored, status: JobStatus.FAILED, completedAt: this.clock().toISOString(), error: 'Cancelled by actor' };
    await this.repository.save(cancelled);

    await this._emit('econet.automation.job_cancelled', {
      jobId,
      taskType: stored.taskType,
      cancelledBy: cmd.actor.actorId
    }, {
      actor: cmd.actor,
      subject: { entityId: jobId, entityType: 'background_job' },
      correlationId: cmd.correlationId
    });

    return { job: cancelled };
  }

  async _handleRetry(cmd) {
    const { jobId } = cmd.payload;
    if (!jobId || typeof jobId !== 'string') {
      throw new Error('RetryJob requires a non-empty jobId.');
    }

    const stored = await this.repository.findById(jobId);
    if (!stored) {
      throw new Error(`BackgroundJob not found: "${jobId}".`);
    }
    if (![JobStatus.FAILED, JobStatus.DEAD_LETTER].includes(stored.status)) {
      throw new Error(
        `Cannot retry job "${jobId}" in status "${stored.status}". Only FAILED or DEAD_LETTER jobs can be retried.`
      );
    }

    // Reset for retry — create a fresh BackgroundJob so we get a new jobId
    // but preserve the original task type and payload
    const retried = new BackgroundJob({
      taskType: stored.taskType,
      payload: stored.payload,
      maxRetries: stored.maxRetries,
      priority: stored.priority,
      correlationId: cmd.correlationId
    });

    this._queue.push(retried);
    this._sortQueue();
    await this.repository.save(retried);

    await this._emit('econet.automation.job_enqueued', {
      jobId: retried.jobId,
      taskType: retried.taskType,
      priority: retried.priority,
      maxRetries: retried.maxRetries,
      retriedFrom: jobId,
      enqueuedBy: cmd.actor.actorId
    }, {
      actor: cmd.actor,
      subject: { entityId: retried.jobId, entityType: 'background_job' },
      correlationId: retried.correlationId
    });

    return { job: this._jobSnapshot(retried), retriedFrom: jobId };
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  /**
   * Authorization — canonical E15/18/19/20 pattern:
   * Missing, null, non-array, or empty roles are treated as no roles and denied.
   */
  _assertAuthorized(cmd) {
    const roles = Array.isArray(cmd.actor.roles) ? cmd.actor.roles : [];
    const allowed = roles.some(role => this.authorizedRoles.includes(role));
    if (!allowed) {
      throw new Error(
        `Automation command "${cmd.commandType}" denied: actor "${cmd.actor.actorId}" lacks an authorized automation role.`
      );
    }
  }

  async _assertGovernance(cmd) {
    if (!this.governance) return;
    const decision = await this.governance.evaluatePolicy({
      engine: ENGINE_SLUG,
      commandType: cmd.commandType,
      actor: cmd.actor,
      payload: cmd.payload
    });
    if (!decision.allowed) {
      throw new Error(`Governance policy denial: ${decision.reason || 'Command denied by policy.'}`);
    }
  }

  _sortQueue() {
    // Lower priority number = higher urgency (processed first)
    this._queue.sort((a, b) => a.priority - b.priority);
  }

  _jobSnapshot(job) {
    return {
      jobId: job.jobId,
      taskType: job.taskType,
      payload: { ...job.payload },
      status: job.status,
      priority: job.priority,
      maxRetries: job.maxRetries,
      retryCount: job.retryCount,
      correlationId: job.correlationId,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error
    };
  }

  async _emit(eventType, payload, { actor = null, subject = null, correlationId = null } = {}) {
    const event = new DomainEvent({
      eventType,
      producer: PRODUCER,
      actor,
      subject,
      correlationId,
      payload
    });
    await this.eventBus.publish(event);
    return event;
  }
}
