/**
 * Engine 09: Risk Engine — RiskApplicationService
 * Orchestrates environmental risk assessment, threshold evaluation, risk score
 * calculation, mitigation tracking, and canonical risk domain event publishing.
 *
 * Integrations:
 * - Engine 22 Governance: policy denial short-circuits any mutating command.
 * - Engine 23 Audit: every published risk event carries `metadata.audit`
 *   ({ criticalMutation, isEscalation }) for the tamper-evident trail.
 */

import { Command } from '../../../../contracts/commands/Command.js';
import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import { globalEventBus } from '../../../../infrastructure/messaging/EventBus.js';
import { globalIdempotencyManager } from '../../../../infrastructure/idempotency/IdempotencyManager.js';
import { RiskAssessment } from '../../domain/entities/RiskAssessment.js';
import {
  assertValidRiskLevel,
  isRiskEscalation,
  isRiskDeescalation,
  isThresholdBreached
} from '../../domain/value-objects/RiskLevel.js';
import {
  HazardType,
  normalizeHazardType,
  GLOBAL_THRESHOLD_KEY,
  DEFAULT_MINIMUM_LEVEL_BY_HAZARD,
  GLOBAL_DEFAULT_MINIMUM_LEVEL
} from '../../domain/value-objects/HazardType.js';
import { createRiskAssessmentEvaluatedEvent } from '../../domain/events/RiskAssessmentEvaluated.js';
import { InMemoryRiskRepository } from '../../infrastructure/repositories/InMemoryRiskRepository.js';

const ENGINE_SLUG = '09-risk';
const PRODUCER = 'engine.09.risk';

const THRESHOLD_BREACHED = 'econet.risk.threshold_breached';
const THRESHOLD_CLEARED = 'econet.risk.threshold_cleared';
const THRESHOLD_UPDATED = 'econet.risk.threshold_updated';

const MUTATING_COMMANDS = new Set([
  'AssessRisk',
  'ReassessRisk',
  'AddRiskMitigation',
  'UpdateRiskThreshold'
]);

export class RiskApplicationService {
  constructor({
    repository = new InMemoryRiskRepository(),
    eventBus = globalEventBus,
    idempotencyManager = globalIdempotencyManager,
    governance = null,
    clock = () => new Date()
  } = {}) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.idempotencyManager = idempotencyManager;
    this.governance = governance;
    this.clock = clock;
  }

  async execute(command) {
    const cmd = command instanceof Command ? command : new Command(command);
    if (cmd.targetEngine !== ENGINE_SLUG || !MUTATING_COMMANDS.has(cmd.commandType)) {
      throw new Error(`Unsupported Risk command: "${cmd.commandType}".`);
    }
    if (!cmd.idempotencyKey) {
      throw new Error(`Risk command "${cmd.commandType}" requires an idempotencyKey.`);
    }

    return this.idempotencyManager.executeIdempotent(
      `${ENGINE_SLUG}:${cmd.commandType}:${cmd.idempotencyKey}`,
      async () => {
        await this._assertGovernance(cmd);
        return this._dispatch(cmd);
      }
    );
  }

  // --- Queries ---

  async getRiskAssessmentById(assessmentId) {
    if (!assessmentId) {
      throw new Error('assessmentId is required.');
    }
    const assessment = await this.repository.findById(assessmentId);
    return assessment ? assessment.toJSON() : null;
  }

  async listActiveRisks({ hazardType = null, minimumLevel = null } = {}) {
    let assessments = await this.repository.findActive();

    if (hazardType) {
      const normalized = normalizeHazardType(hazardType);
      assessments = assessments.filter(a => a.hazardType === normalized);
    }
    if (minimumLevel) {
      assertValidRiskLevel(minimumLevel);
      assessments = assessments.filter(
        a => isThresholdBreached(a.riskLevel, minimumLevel)
      );
    }

    return assessments.map(a => a.toJSON());
  }

  /**
   * Return the effective escalation threshold table (canonical defaults merged
   * with any operator overrides persisted in the engine's isolated store).
   */
  async listThresholds() {
    const overrides = await this.repository.listThresholds();
    const overrideMap = new Map(overrides.map(o => [o.thresholdKey, o.minimumLevel]));

    const entries = Object.values(HazardType).map(hazardType => ({
      thresholdKey: hazardType,
      minimumLevel: overrideMap.has(hazardType)
        ? overrideMap.get(hazardType)
        : DEFAULT_MINIMUM_LEVEL_BY_HAZARD[hazardType],
      source: overrideMap.has(hazardType) ? 'OVERRIDE' : 'CANONICAL_DEFAULT',
      isGlobal: false
    }));

    entries.push({
      thresholdKey: GLOBAL_THRESHOLD_KEY,
      minimumLevel: overrideMap.has(GLOBAL_THRESHOLD_KEY)
        ? overrideMap.get(GLOBAL_THRESHOLD_KEY)
        : GLOBAL_DEFAULT_MINIMUM_LEVEL,
      source: overrideMap.has(GLOBAL_THRESHOLD_KEY) ? 'OVERRIDE' : 'CANONICAL_DEFAULT',
      isGlobal: true
    });

    return entries;
  }

  /**
   * Resolve the effective minimum risk level for a hazard category.
   * Precedence: per-hazard override > global override > canonical default.
   */
  async resolveThreshold(hazardType) {
    const normalized = normalizeHazardType(hazardType);
    const hazardOverride = await this.repository.getThreshold(normalized);
    if (hazardOverride) return hazardOverride;

    const globalOverride = await this.repository.getThreshold(GLOBAL_THRESHOLD_KEY);
    if (globalOverride) return globalOverride;

    return DEFAULT_MINIMUM_LEVEL_BY_HAZARD[normalized] ?? GLOBAL_DEFAULT_MINIMUM_LEVEL;
  }

    async _dispatch(cmd) {
    switch (cmd.commandType) {
      case 'AssessRisk':
        return this._handleAssessRisk(cmd);
      case 'ReassessRisk':
        return this._handleReassessRisk(cmd);
      case 'AddRiskMitigation':
        return this._handleAddRiskMitigation(cmd);
      case 'UpdateRiskThreshold':
        return this._handleUpdateRiskThreshold(cmd);
      default:
        throw new Error(`Unhandled Risk command: ${cmd.commandType}`);
    }
  }

  /**
   * AssessRisk: create a new risk assessment for a subject against a hazard
   * category, evaluating the computed score against the effective threshold.
   */
  async _handleAssessRisk(cmd) {
    const {
      subjectId,
      subjectType = 'region',
      hazardType,
      factors,
      exposureIndex = 0.5,
      minimumLevel = null,
      metadata = {}
    } = cmd.payload;

    const normalizedHazard = normalizeHazardType(hazardType);
    let effectiveMinimum;
    if (minimumLevel) {
      assertValidRiskLevel(minimumLevel);
      effectiveMinimum = minimumLevel;
    } else {
      effectiveMinimum = await this.resolveThreshold(normalizedHazard);
    }

    const assessment = new RiskAssessment({
      subjectId,
      subjectType,
      hazardType: normalizedHazard,
      factors,
      exposureIndex,
      minimumLevel: effectiveMinimum,
      metadata,
      createdAt: this._now(),
      updatedAt: this._now()
    });

    await this.repository.save(assessment);

    const evaluatedEvent = createRiskAssessmentEvaluatedEvent({
      assessment: assessment.toJSON(),
      previousLevel: null,
      reason: 'INITIAL_ASSESSMENT',
      actor: cmd.actor,
      correlationId: cmd.correlationId,
      metadata: { hazardType: normalizedHazard }
    });
    await this._publish(evaluatedEvent);

    if (assessment.thresholdBreached) {
      await this._publishThresholdBreach(assessment, 'INITIAL_ASSESSMENT', cmd, null);
    }

    return {
      assessment: assessment.toJSON(),
      thresholdBreached: assessment.thresholdBreached
    };
  }

    /**
   * ReassessRisk: re-evaluate an existing assessment with refreshed hazard
   * factor readings and emit the resulting level transition.
   */
  async _handleReassessRisk(cmd) {
    const { assessmentId, factors, exposureIndex, metadata = null } = cmd.payload;
    const previous = await this._requireAssessment(assessmentId);
    const previousLevel = previous.riskLevel;
    const wasBreached = previous.thresholdBreached;

    const reassessed = previous.reassess(
      { factors, exposureIndex, metadata },
      this._now()
    );
    await this.repository.save(reassessed);

    const levelChanged = reassessed.riskLevel !== previousLevel;
    await this._publish(createRiskAssessmentEvaluatedEvent({
      assessment: reassessed.toJSON(),
      previousLevel: levelChanged ? previousLevel : null,
      reason: 'RE_EVALUATION',
      actor: cmd.actor,
      correlationId: cmd.correlationId
    }));

    if (reassessed.thresholdBreached && !wasBreached) {
      await this._publishThresholdBreach(reassessed, 'RE_ESCALATION', cmd, previousLevel);
    } else if (!reassessed.thresholdBreached && wasBreached) {
      await this._publishThresholdCleared(reassessed, 'RE_EVALUATION', cmd, previousLevel);
    }

    return {
      assessment: reassessed.toJSON(),
      previousLevel,
      newLevel: reassessed.riskLevel,
      levelChanged,
      isEscalation: levelChanged && isRiskEscalation(previousLevel, reassessed.riskLevel),
      isDeescalation: levelChanged && isRiskDeescalation(previousLevel, reassessed.riskLevel),
      thresholdBreached: reassessed.thresholdBreached
    };
  }

  /**
   * AddRiskMitigation: record a mitigation action against an assessment. Applied
   * effectiveness cumulatively reduces the score and may clear a breach.
   */
  async _handleAddRiskMitigation(cmd) {
    const { assessmentId, action, appliedBy = null, effectiveness = 0 } = cmd.payload;
    const previous = await this._requireAssessment(assessmentId);
    const previousLevel = previous.riskLevel;
    const wasBreached = previous.thresholdBreached;

    const mitigated = previous.addMitigation({ action, appliedBy, effectiveness }, this._now());
    await this.repository.save(mitigated);

    const levelChanged = mitigated.riskLevel !== previousLevel;
    await this._publish(createRiskAssessmentEvaluatedEvent({
      assessment: mitigated.toJSON(),
      previousLevel: levelChanged ? previousLevel : null,
      reason: 'MITIGATION_APPLIED',
      actor: cmd.actor,
      correlationId: cmd.correlationId,
      metadata: { mitigationAction: mitigated.mitigations[mitigated.mitigations.length - 1].action }
    }));

    if (!mitigated.thresholdBreached && wasBreached) {
      await this._publishThresholdCleared(mitigated, 'MITIGATION_APPLIED', cmd, previousLevel);
    }

    return {
      assessment: mitigated.toJSON(),
      previousLevel,
      newLevel: mitigated.riskLevel,
      levelChanged,
      isDeescalation: levelChanged && isRiskDeescalation(previousLevel, mitigated.riskLevel),
      thresholdBreached: mitigated.thresholdBreached
    };
  }

    /**
   * UpdateRiskThreshold: set the effective escalation threshold either globally
   * or for a specific hazard category. Policy-mutating, so always audited as a
   * critical mutation.
   */
  async _handleUpdateRiskThreshold(cmd) {
    const { hazardType = null, minimumLevel, scope = null } = cmd.payload;

    if (typeof minimumLevel !== 'string') {
      throw new Error('UpdateRiskThreshold requires a minimumLevel risk tier.');
    }
    assertValidRiskLevel(minimumLevel);

    const isGlobal = scope === 'GLOBAL' || hazardType === null || hazardType === GLOBAL_THRESHOLD_KEY;
    const thresholdKey = isGlobal ? GLOBAL_THRESHOLD_KEY : normalizeHazardType(hazardType);

    const previousOverride = await this.repository.getThreshold(thresholdKey);
    await this.repository.saveThreshold(thresholdKey, minimumLevel);

    const event = new DomainEvent({
      eventType: THRESHOLD_UPDATED,
      producer: PRODUCER,
      actor: cmd.actor,
      subject: { entityId: thresholdKey, entityType: 'risk_threshold' },
      correlationId: cmd.correlationId,
      payload: {
        thresholdKey,
        isGlobal,
        previousMinimumLevel: previousOverride,
        minimumLevel
      },
      metadata: {
        audit: { criticalMutation: true, isEscalation: false },
        provenance: 'engine.09.risk.UpdateRiskThreshold'
      }
    });
    await this._publish(event);

    return {
      thresholdKey,
      isGlobal,
      previousMinimumLevel: previousOverride,
      minimumLevel
    };
  }

  // --- Internal helpers ---

  _now() {
    return this.clock().toISOString();
  }

  async _requireAssessment(assessmentId) {
    if (!assessmentId) {
      throw new Error('assessmentId is required.');
    }
    const assessment = await this.repository.findById(assessmentId);
    if (!assessment) {
      throw new Error(`RiskAssessment not found: "${assessmentId}".`);
    }
    return assessment;
  }

  async _publishThresholdBreach(assessment, reason, cmd, previousLevel) {
    return this._publish(new DomainEvent({
      eventType: THRESHOLD_BREACHED,
      producer: PRODUCER,
      actor: cmd.actor,
      subject: { entityId: assessment.assessmentId, entityType: 'risk_assessment' },
      correlationId: cmd.correlationId,
      payload: {
        assessmentId: assessment.assessmentId,
        subjectId: assessment.subjectId,
        subjectType: assessment.subjectType,
        hazardType: assessment.hazardType,
        score: assessment.score,
        riskLevel: assessment.riskLevel,
        previousLevel,
        minimumLevel: assessment.minimumLevel,
        reason
      },
      metadata: {
        audit: { criticalMutation: assessment.isCritical, isEscalation: true },
        provenance: `engine.09.risk.threshold_breached.${reason}`
      }
    }));
  }

  async _publishThresholdCleared(assessment, reason, cmd, previousLevel) {
    return this._publish(new DomainEvent({
      eventType: THRESHOLD_CLEARED,
      producer: PRODUCER,
      actor: cmd.actor,
      subject: { entityId: assessment.assessmentId, entityType: 'risk_assessment' },
      correlationId: cmd.correlationId,
      payload: {
        assessmentId: assessment.assessmentId,
        subjectId: assessment.subjectId,
        hazardType: assessment.hazardType,
        score: assessment.score,
        riskLevel: assessment.riskLevel,
        previousLevel,
        minimumLevel: assessment.minimumLevel,
        reason
      },
      metadata: {
        audit: { criticalMutation: false, isEscalation: false },
        provenance: `engine.09.risk.threshold_cleared.${reason}`
      }
    }));
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

  async _publish(event) {
    const evt = event instanceof DomainEvent ? event : new DomainEvent(event);
    await this.eventBus.publish(evt);
    return evt;
  }
}