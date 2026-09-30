/**
 * Engine 24: Learning Engine — LearningApplicationService
 *
 * CANONICAL BASIS: The canonical registry establishes three explicit
 * responsibilities for Engine 24:
 *   1. "Historical outcome feedback loops" → RecordOutcomeFeedback command
 *   2. "Accuracy evaluation"               → RecordAccuracyEvaluation command
 *   3. "Model adaptation tracking"         → RecordAdaptation command
 *
 * OWNERSHIP BOUNDARY:
 * - Owns: OutcomeFeedback records, AccuracyRecord records, AdaptationRecord
 *   records, and their provenance.
 * - Does NOT own: predictions (10), simulation results (19), verification
 *   decisions (13), rewards (15), governance policies (22), or audit
 *   infrastructure (23).
 * - References to other engines' records are opaque identifiers only.
 *
 * IMPORTANT: Engine 24 records THAT things happened, with provenance. It does
 * NOT perform model retraining, does NOT modify another engine's state, does
 * NOT execute algorithms or probabilistic computations.
 *
 * AUTHORIZATION: Canonical E15/18/19/20/21/22 pattern.
 * Missing, null, non-array, or empty actor.roles → denied.
 * Authorization fires before idempotency, governance, and mutation.
 *
 * META-LEARNING NOTE: Like the Governance Engine (22), this service does NOT
 * evaluate governance before its own mutations — a learning engine recording
 * feedback cannot be blocked by learning-derived policies that may not exist.
 * Governance evaluation remains available as an optional adapter if needed.
 */

import { Command } from '../../../../contracts/commands/Command.js';
import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import { globalEventBus } from '../../../../infrastructure/messaging/EventBus.js';
import { globalIdempotencyManager } from '../../../../infrastructure/idempotency/IdempotencyManager.js';
import { OutcomeFeedback } from '../../domain/entities/OutcomeFeedback.js';
import { AccuracyRecord } from '../../domain/entities/AccuracyRecord.js';
import { AdaptationRecord } from '../../domain/entities/AdaptationRecord.js';
import { InMemoryLearningRepository } from '../../infrastructure/repositories/InMemoryLearningRepository.js';

const ENGINE_SLUG = '24-learning';
const PRODUCER = 'engine.24.learning';

const MUTATING_COMMANDS = new Set([
  'RecordOutcomeFeedback',
  'RecordAccuracyEvaluation',
  'RecordAdaptation'
]);

/**
 * Default authorized roles for learning management.
 * 'learning_manager' is the Engine 24-specific administrative role.
 * 'system', 'admin', 'automation' are cross-engine roles consistent with
 * all other completed engines.
 */
const DEFAULT_AUTHORIZED_ROLES = Object.freeze([
  'system',
  'admin',
  'learning_manager',
  'automation'
]);

export class LearningApplicationService {
  constructor({
    repository = new InMemoryLearningRepository(),
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
  }

  // ── Command entry point ────────────────────────────────────────────────────

  async execute(command) {
    const cmd = command instanceof Command ? command : new Command(command);

    if (cmd.targetEngine !== ENGINE_SLUG || !MUTATING_COMMANDS.has(cmd.commandType)) {
      throw new Error(`Unsupported Learning command: "${cmd.commandType}".`);
    }
    if (!cmd.idempotencyKey) {
      throw new Error(`Learning command "${cmd.commandType}" requires an idempotencyKey.`);
    }
    if (!cmd.actor || !cmd.actor.actorId) {
      throw new Error('Learning commands require an authenticated actor.');
    }

    // Authorization before idempotency and mutation — canonical E15/18/19/20/21/22 pattern
    this._assertAuthorized(cmd);

    return this.idempotencyManager.executeIdempotent(
      `${ENGINE_SLUG}:${cmd.commandType}:${cmd.idempotencyKey}`,
      async () => {
        await this._assertGovernance(cmd);
        return this._dispatch(cmd);
      }
    );
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  async getFeedback(feedbackId) {
    const record = await this.repository.findFeedbackById(feedbackId);
    return record ? record.toJSON() : null;
  }

  async listFeedback({ sourceEngine = null, sourceType = null } = {}) {
    const records = await this.repository.listFeedback({ sourceEngine, sourceType });
    return records.map(r => r.toJSON());
  }

  async getAccuracyRecord(recordId) {
    const record = await this.repository.findAccuracyById(recordId);
    return record ? record.toJSON() : null;
  }

  async listAccuracyRecords({ subjectEngine = null, subjectId = null, metricName = null } = {}) {
    const records = await this.repository.listAccuracy({ subjectEngine, subjectId, metricName });
    return records.map(r => r.toJSON());
  }

  async getAdaptation(adaptationId) {
    const record = await this.repository.findAdaptationById(adaptationId);
    return record ? record.toJSON() : null;
  }

  async listAdaptations({ subjectEngine = null, subjectId = null } = {}) {
    const records = await this.repository.listAdaptations({ subjectEngine, subjectId });
    return records.map(r => r.toJSON());
  }

  // ── Command dispatch ───────────────────────────────────────────────────────

  _dispatch(cmd) {
    switch (cmd.commandType) {
      case 'RecordOutcomeFeedback':    return this._handleRecordFeedback(cmd);
      case 'RecordAccuracyEvaluation': return this._handleRecordAccuracy(cmd);
      case 'RecordAdaptation':         return this._handleRecordAdaptation(cmd);
      default:
        throw new Error(`Unhandled Learning command: "${cmd.commandType}".`);
    }
  }

  // ── Command handlers ───────────────────────────────────────────────────────

  async _handleRecordFeedback(cmd) {
    const {
      sourceEngine, sourceId, sourceType,
      predictedOutcome, actualOutcome, deltaDescription = '',
      metadata = {}
    } = cmd.payload;

    const record = new OutcomeFeedback({
      sourceEngine,
      sourceId,
      sourceType,
      predictedOutcome,
      actualOutcome,
      deltaDescription,
      recordedBy: cmd.actor.actorId,
      correlationId: cmd.correlationId,
      recordedAt: this.clock().toISOString(),
      metadata: typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
    });

    await this.repository.saveFeedback(record);

    await this._emit('econet.learning.outcome_feedback_recorded', {
      feedbackId: record.feedbackId,
      sourceEngine: record.sourceEngine,
      sourceId: record.sourceId,
      sourceType: record.sourceType,
      recordedBy: record.recordedBy
    }, {
      actor: cmd.actor,
      subject: { entityId: record.feedbackId, entityType: 'outcome_feedback' },
      correlationId: cmd.correlationId
    });

    return { feedback: record.toJSON() };
  }

  async _handleRecordAccuracy(cmd) {
    const {
      subjectEngine, subjectId, subjectType,
      metricName, metricValue,
      evaluationContext = {},
      metadata = {}
    } = cmd.payload;

    const record = new AccuracyRecord({
      subjectEngine,
      subjectId,
      subjectType,
      metricName,
      metricValue,
      evaluationContext: typeof evaluationContext === 'object' && !Array.isArray(evaluationContext) ? evaluationContext : {},
      recordedBy: cmd.actor.actorId,
      correlationId: cmd.correlationId,
      recordedAt: this.clock().toISOString(),
      metadata: typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
    });

    await this.repository.saveAccuracy(record);

    await this._emit('econet.learning.accuracy_recorded', {
      recordId: record.recordId,
      subjectEngine: record.subjectEngine,
      subjectId: record.subjectId,
      subjectType: record.subjectType,
      metricName: record.metricName,
      metricValue: record.metricValue,
      recordedBy: record.recordedBy
    }, {
      actor: cmd.actor,
      subject: { entityId: record.recordId, entityType: 'accuracy_record' },
      correlationId: cmd.correlationId
    });

    return { accuracy: record.toJSON() };
  }

  async _handleRecordAdaptation(cmd) {
    const {
      subjectEngine, subjectId, subjectType,
      adaptationType, rationale = '',
      feedbackIds = [], accuracyRecordIds = [],
      metadata = {}
    } = cmd.payload;

    const record = new AdaptationRecord({
      subjectEngine,
      subjectId,
      subjectType,
      adaptationType,
      rationale,
      feedbackIds: Array.isArray(feedbackIds) ? feedbackIds : [],
      accuracyRecordIds: Array.isArray(accuracyRecordIds) ? accuracyRecordIds : [],
      recordedBy: cmd.actor.actorId,
      correlationId: cmd.correlationId,
      recordedAt: this.clock().toISOString(),
      metadata: typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
    });

    await this.repository.saveAdaptation(record);

    await this._emit('econet.learning.adaptation_recorded', {
      adaptationId: record.adaptationId,
      subjectEngine: record.subjectEngine,
      subjectId: record.subjectId,
      subjectType: record.subjectType,
      adaptationType: record.adaptationType,
      feedbackCount: record.feedbackIds.length,
      accuracyCount: record.accuracyRecordIds.length,
      recordedBy: record.recordedBy
    }, {
      actor: cmd.actor,
      subject: { entityId: record.adaptationId, entityType: 'adaptation_record' },
      correlationId: cmd.correlationId
    });

    return { adaptation: record.toJSON() };
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  /**
   * Authorization — canonical E15/18/19/20/21/22 pattern.
   * Missing, null, non-array, or empty roles → denied.
   */
  _assertAuthorized(cmd) {
    const roles = Array.isArray(cmd.actor.roles) ? cmd.actor.roles : [];
    const allowed = roles.some(role => this.authorizedRoles.includes(role));
    if (!allowed) {
      throw new Error(
        `Learning command "${cmd.commandType}" denied: actor "${cmd.actor.actorId}" lacks an authorized learning role.`
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
