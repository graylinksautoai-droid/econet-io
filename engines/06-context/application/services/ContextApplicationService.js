/**
 * Engine 06: Context Engine � ContextApplicationService
 * Orchestrates ingestion of spatial/observational status changes, context state
 * evaluation, situational alert calculation using ContextAlertLevel, and canonical
 * domain event publishing (consumed by Engine 23 Audit).
 */

import { Command } from '../../../../contracts/commands/Command.js';
import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import { globalEventBus } from '../../../../infrastructure/messaging/EventBus.js';
import { globalIdempotencyManager } from '../../../../infrastructure/idempotency/IdempotencyManager.js';
import { EnvironmentalContext } from '../../domain/entities/EnvironmentalContext.js';
import {
  ContextAlertLevel,
  assertValidAlertLevel,
  alertLevelFromRiskScore
} from '../../domain/value-objects/ContextAlertLevel.js';
import { createContextAlertLevelChangedEvent } from '../../domain/events/ContextAlertLevelChanged.js';
import { InMemoryContextRepository } from '../../infrastructure/repositories/InMemoryContextRepository.js';

const ENGINE_SLUG = '06-context';
const PRODUCER = 'engine.06.context';

const MUTATING_COMMANDS = new Set([
  'CreateContext',
  'UpdateContextAlert',
  'FuseMetrics',
  'DeriveAlertFromRiskScore'
]);

export class ContextApplicationService {
  constructor({
    repository = new InMemoryContextRepository(),
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
      throw new Error(`Unsupported Context command: "${cmd.commandType}".`);
    }
    if (!cmd.idempotencyKey) {
      throw new Error(`Context command "${cmd.commandType}" requires an idempotencyKey.`);
    }

    return this.idempotencyManager.executeIdempotent(
      `${ENGINE_SLUG}:${cmd.commandType}:${cmd.idempotencyKey}`,
      async () => {
        await this._assertGovernance(cmd);
        return this._dispatch(cmd);
      }
    );
  }

  async getContextById(contextId) {
    const context = await this.repository.findById(contextId);
    return context ? context.toJSON() : null;
  }

  async getContextsInRegion({ latitude, longitude, radiusKm = 25 } = {}) {
    const contexts = await this.repository.findInRegion({ latitude, longitude, radiusKm });
    return contexts.map(c => c.toJSON());
  }

  async listContexts({ alertLevel } = {}) {
    const contexts = alertLevel
      ? await this.repository.findByAlertLevel(alertLevel)
      : await this.repository.listAll();
    return contexts.map(c => c.toJSON());
  }

  async _dispatch(cmd) {
    switch (cmd.commandType) {
      case 'CreateContext':
        return this._handleCreateContext(cmd);
      case 'UpdateContextAlert':
        return this._handleUpdateContextAlert(cmd);
      case 'FuseMetrics':
        return this._handleFuseMetrics(cmd);
      case 'DeriveAlertFromRiskScore':
        return this._handleDeriveAlertFromRiskScore(cmd);
      default:
        throw new Error(`Unhandled Context command: ${cmd.commandType}`);
    }
  }

  async _handleCreateContext(cmd) {
    const { regionId, regionName, boundary, metrics, alertLevel, metadata } = cmd.payload;
    const now = this.clock().toISOString();
    const context = new EnvironmentalContext({
      regionId,
      regionName,
      boundary,
      metrics,
      alertLevel: alertLevel ?? ContextAlertLevel.NORMAL,
      metadata,
      createdAt: now,
      updatedAt: now
    });

    await this.repository.save(context);

    const isInitialCritical = this._isCriticalOrAbove(context.alertLevel);

    const initialEvent = new DomainEvent({
      eventType: 'econet.context.created',
      producer: PRODUCER,
      payload: {
        contextId: context.contextId,
        regionId: context.regionId,
        alertLevel: context.alertLevel,
        boundary: context.boundary,
        metrics: context.metrics
      },
      actor: cmd.actor,
      subject: { entityId: context.contextId, entityType: 'environmental_context' },
      correlationId: cmd.correlationId,
      metadata: {
        audit: { criticalMutation: isInitialCritical },
        provenance: 'engine.06.context.CreateContext'
      }
    });
    await this._publish(initialEvent);

    if (isInitialCritical) {
      const alertEvent = createContextAlertLevelChangedEvent({
        contextId: context.contextId,
        regionId: context.regionId,
        previousLevel: ContextAlertLevel.NORMAL,
        newLevel: context.alertLevel,
        isEscalation: true,
        actor: cmd.actor,
        correlationId: cmd.correlationId,
        metadata: {
          audit: { criticalMutation: true },
          provenance: 'engine.06.context.CreateContext'
        }
      });
      await this._publish(alertEvent);
    }

    return { context: context.toJSON() };
  }

  async _handleUpdateContextAlert(cmd) {
    const { contextId, newAlertLevel, reason = null } = cmd.payload;
    const previous = await this._requireContext(contextId);
    const now = this.clock().toISOString();

    assertValidAlertLevel(newAlertLevel);
    const previousLevel = previous.alertLevel;
    if (newAlertLevel === previousLevel) {
      return { context: previous.toJSON(), alertChanged: false };
    }

    const updated = previous.changeAlertLevel(newAlertLevel, now);
    await this.repository.save(updated);

    const event = createContextAlertLevelChangedEvent({
      contextId: updated.contextId,
      regionId: updated.regionId,
      previousLevel,
      newLevel: newAlertLevel,
      isEscalation: updated.isEscalationFrom(previousLevel),
      actor: cmd.actor,
      correlationId: cmd.correlationId,
      metadata: {
        reason,
        audit: {
          criticalMutation: this._isCriticalOrAbove(newAlertLevel),
          isEscalation: updated.isEscalationFrom(previousLevel)
        },
        provenance: 'engine.06.context.UpdateContextAlert'
      }
    });
    await this._publish(event);

    return {
      context: updated.toJSON(),
      alertChanged: true,
      previousLevel,
      newLevel: newAlertLevel
    };
  }

  async _handleFuseMetrics(cmd) {
    const { contextId, metrics, entityIds = [], recalculateAlert = true } = cmd.payload;
    const previous = await this._requireContext(contextId);
    const now = this.clock().toISOString();

    const fused = previous.fuseMetrics(metrics, entityIds, now);
    await this.repository.save(fused);

    const fuseEvent = new DomainEvent({
      eventType: 'econet.context.metrics_fused',
      producer: PRODUCER,
      payload: {
        contextId: fused.contextId,
        regionId: fused.regionId,
        previousMetrics: previous.metrics,
        fusedMetrics: fused.metrics,
        contributingEntityIds: fused.contributingEntityIds,
        alertLevel: fused.alertLevel
      },
      actor: cmd.actor,
      subject: { entityId: fused.contextId, entityType: 'environmental_context' },
      correlationId: cmd.correlationId,
      metadata: {
        audit: { criticalMutation: false },
        provenance: 'engine.06.context.FuseMetrics'
      }
    });
    await this._publish(fuseEvent);

    if (recalculateAlert) {
      const riskScore = fused.metrics.riskScore;
      if (typeof riskScore === 'number') {
        const derivedLevel = alertLevelFromRiskScore(riskScore);
        if (derivedLevel !== fused.alertLevel) {
          return this._executeAlertChange(
            fused,
            derivedLevel,
            cmd.actor,
            cmd.correlationId,
            'engine.06.context.DeriveAlertFromRiskScore',
            { derivedFrom: 'FuseMetrics.riskScore', riskScore }
          );
        }
      }
    }

    return { context: fused.toJSON(), alertChanged: false };
  }

  async _handleDeriveAlertFromRiskScore(cmd) {
    const { contextId, riskScore, reason = null } = cmd.payload;
    const previous = await this._requireContext(contextId);
    const derivedLevel = alertLevelFromRiskScore(riskScore);

    if (derivedLevel === previous.alertLevel) {
      return { context: previous.toJSON(), alertChanged: false };
    }

    return this._executeAlertChange(
      previous,
      derivedLevel,
      cmd.actor,
      cmd.correlationId,
      'engine.06.context.DeriveAlertFromRiskScore',
      { riskScore, reason }
    );
  }

  async _executeAlertChange(previous, newLevel, actor, correlationId, provenance, metadata = {}) {
    const now = this.clock().toISOString();
    const updated = previous.changeAlertLevel(newLevel, now);
    await this.repository.save(updated);

    const event = createContextAlertLevelChangedEvent({
      contextId: updated.contextId,
      regionId: updated.regionId,
      previousLevel: previous.alertLevel,
      newLevel,
      isEscalation: updated.isEscalationFrom(previous.alertLevel),
      actor,
      correlationId,
      metadata: {
        audit: {
          criticalMutation: this._isCriticalOrAbove(newLevel),
          isEscalation: updated.isEscalationFrom(previous.alertLevel)
        },
        provenance,
        ...metadata
      }
    });
    await this._publish(event);

    return {
      context: updated.toJSON(),
      alertChanged: true,
      previousLevel: previous.alertLevel,
      newLevel
    };
  }

  async _requireContext(contextId) {
    if (!contextId) {
      throw new Error('contextId is required.');
    }
    const ctx = await this.repository.findById(contextId);
    if (!ctx) {
      throw new Error(`EnvironmentalContext not found: "${contextId}".`);
    }
    return ctx;
  }

  _isCriticalOrAbove(level) {
    return [ContextAlertLevel.WARNING, ContextAlertLevel.EMERGENCY].includes(level);
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
