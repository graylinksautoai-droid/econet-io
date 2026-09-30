/**
 * Engine 18: Digital Twin Engine — DigitalTwinApplicationService
 * Coordinates twin registration, lifecycle, model versioning, and synchronized
 * state updates. Synchronization separates incoming data from accepted
 * authoritative state; stale, duplicate, or unprovenanced updates are rejected
 * and never silently mutate the authoritative state.
 *
 * Boundaries respected: no observation ingestion, geospatial computation,
 * temporal reasoning, risk, prediction, simulation, governance, or audit logic
 * is implemented here.
 */

import { Command } from '../../../../contracts/commands/Command.js';
import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import { globalEventBus } from '../../../../infrastructure/messaging/EventBus.js';
import { globalIdempotencyManager } from '../../../../infrastructure/idempotency/IdempotencyManager.js';
import { DigitalTwin } from '../../domain/entities/DigitalTwin.js';
import { TwinModel } from '../../domain/entities/TwinModel.js';
import { TwinState } from '../../domain/entities/TwinState.js';
import { SynchronizationRecord } from '../../domain/entities/SynchronizationRecord.js';
import { TwinStatus, canSynchronizeTwin, assertTwinStatusTransition } from '../../domain/value-objects/TwinStatus.js';
import { isOlderThanCurrent, evaluateFreshness } from '../../domain/services/TwinStateService.js';
import { InMemoryDigitalTwinRepository } from '../../infrastructure/repositories/InMemoryDigitalTwinRepository.js';

const ENGINE_SLUG = '18-digital-twin';
const PRODUCER = 'engine.18.digital-twin';

const MUTATING_COMMANDS = new Set([
  'RegisterDigitalTwin',
  'ActivateDigitalTwin',
  'PauseDigitalTwin',
  'ResumeDigitalTwin',
  'RetireDigitalTwin',
  'MarkTwinOutOfSync',
  'RegisterTwinModel',
  'SynchronizeTwin'
]);

const DEFAULT_AUTHORIZED_ROLES = Object.freeze([
  'system',
  'admin',
  'twin_manager',
  'automation'
]);

export class DigitalTwinApplicationService {
  constructor({
    repository = new InMemoryDigitalTwinRepository(),
    eventBus = globalEventBus,
    idempotencyManager = globalIdempotencyManager,
    governance = null,
    clock = () => new Date(),
    authorizedRoles = DEFAULT_AUTHORIZED_ROLES,
    freshnessPolicies = {}
  } = {}) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.idempotencyManager = idempotencyManager;
    this.governance = governance;
    this.clock = clock;
    this.authorizedRoles = [...authorizedRoles];
    this.freshnessPolicies = { ...freshnessPolicies }; // twinId -> { maxAcceptableAgeMs, olderUpdatePolicy }
  }

  async execute(command) {
    const cmd = command instanceof Command ? command : new Command(command);
    if (cmd.targetEngine !== ENGINE_SLUG || !MUTATING_COMMANDS.has(cmd.commandType)) {
      throw new Error(`Unsupported DigitalTwin command: "${cmd.commandType}".`);
    }
    if (!cmd.idempotencyKey) {
      throw new Error(`DigitalTwin command "${cmd.commandType}" requires an idempotencyKey.`);
    }
    if (!cmd.actor || !cmd.actor.actorId) {
      throw new Error('DigitalTwin commands require an authenticated actor.');
    }
    this._assertAuthorized(cmd);
    return this.idempotencyManager.executeIdempotent(
      `${ENGINE_SLUG}:${cmd.commandType}:${cmd.idempotencyKey}`,
      async () => {
        await this._assertGovernance(cmd);
        return this._dispatch(cmd);
      }
    );
  }

  // ---- Queries ----

  async getDigitalTwin(twinId) {
    const twin = await this.repository.findTwinById(twinId);
    if (!twin) return null;
    const current = await this.repository.getCurrentState(twinId);
    return {
      ...twin.toJSON(),
      currentStateVersion: current ? current.stateVersion : null,
      currentSyncStatus: current ? current.synchronizationStatus : null
    };
  }

  async listDigitalTwins(filter) {
    const twins = await this.repository.listTwins(filter);
    return twins.map(t => t.toJSON());
  }

  async getTwinModel(modelId) {
    const model = await this.repository.findModelById(modelId);
    return model ? model.toJSON() : null;
  }

  async getTwinState(twinId, stateId = null) {
    if (stateId) {
      const state = await this.repository.findStateById(stateId);
      return state ? state.toJSON() : null;
    }
    const current = await this.repository.getCurrentState(twinId);
    return current ? current.toJSON() : null;
  }

  async getTwinStateHistory(twinId) {
    const history = await this.repository.getStateHistory(twinId);
    return history.map(s => s.toJSON());
  }

  async getSynchronizationStatus(twinId) {
    const twin = await this.repository.findTwinById(twinId);
    if (!twin) return null;
    const current = await this.repository.getCurrentState(twinId);
    const syncRecords = await this.repository.listSyncRecords(twinId);
    return {
      twinId,
      twinStatus: twin.status,
      syncStatus: current ? current.synchronizationStatus : 'UNKNOWN',
      lastObservedAt: current ? current.observedAt : null,
      lastAcceptedAt: current ? current.acceptedAt : null,
      lastSyncResult: syncRecords.length > 0 ? syncRecords[syncRecords.length - 1].status : null
    };
  }

  async getSynchronizationHistory(twinId) {
    const records = await this.repository.listSyncRecords(twinId);
    return records.map(r => r.toJSON());
  }

  async getTwinsByTargetEntity(targetEntityId) {
    const twins = await this.repository.findTwinsByTargetEntity(targetEntityId);
    return twins.map(t => t.toJSON());
  }

    async _dispatch(cmd) {
    switch (cmd.commandType) {
      case 'RegisterDigitalTwin':
        return this._handleRegisterTwin(cmd);
      case 'ActivateDigitalTwin':
        return this._handleTransition(cmd, TwinStatus.ACTIVE);
      case 'PauseDigitalTwin':
        return this._handleTransition(cmd, TwinStatus.PAUSED);
      case 'ResumeDigitalTwin':
        return this._handleTransition(cmd, TwinStatus.ACTIVE);
      case 'RetireDigitalTwin':
        return this._handleTransition(cmd, TwinStatus.RETIRED);
      case 'MarkTwinOutOfSync':
        return this._handleTransition(cmd, TwinStatus.OUT_OF_SYNC);
      case 'RegisterTwinModel':
        return this._handleRegisterModel(cmd);
      case 'SynchronizeTwin':
        return this._handleSynchronize(cmd);
      default:
        throw new Error(`Unhandled DigitalTwin command: ${cmd.commandType}`);
    }
  }

  async _handleRegisterTwin(cmd) {
    const { targetEntityId, targetEntityType, name, description = '', representationScope = null } = cmd.payload;
    const twin = new DigitalTwin({
      targetEntityId,
      targetEntityType,
      name,
      description,
      representationScope,
      createdBy: cmd.actor.actorId,
      createdAt: this.clock().toISOString(),
      updatedAt: this.clock().toISOString()
    });
    await this.repository.saveTwin(twin);

    await this._emit('econet.digital_twin.registered', {
      twinId: twin.twinId,
      targetEntityId: twin.targetEntityId,
      targetEntityType: twin.targetEntityType,
      name: twin.name,
      createdBy: twin.createdBy
    }, {
      actor: cmd.actor,
      subject: { entityId: twin.twinId, entityType: 'digital_twin' },
      correlationId: cmd.correlationId
    });

    return { twin: twin.toJSON() };
  }

  async _handleTransition(cmd, nextStatus) {
    const { twinId } = cmd.payload;
    const twin = await this._requireTwin(twinId);
    assertTwinStatusTransition(twin.status, nextStatus);
    const updated = twin.transitionTo(nextStatus, this.clock().toISOString());
    await this.repository.saveTwin(updated);

    await this._emit('econet.digital_twin.state_changed', {
      twinId: updated.twinId,
      previousStatus: twin.status,
      newStatus: updated.status
    }, {
      actor: cmd.actor,
      subject: { entityId: updated.twinId, entityType: 'digital_twin' },
      correlationId: cmd.correlationId
    });

    return { twin: updated.toJSON() };
  }

    async _handleRegisterModel(cmd) {
    const { twinId, modelName, modelVersion, schema = null, propertyDefinitions = {}, assumptions = [], validationEnvelope = null } = cmd.payload;
    const twin = await this._requireTwin(twinId);
    if (twin.status === TwinStatus.RETIRED) {
      throw new Error(`Cannot register a model for RETIRED twin "${twinId}".`);
    }
    const existing = await this.repository.findModelByVersion(twinId, modelVersion);
    if (existing) {
      throw new Error(`Model version "${modelVersion}" already registered for twin "${twinId}".`);
    }

    const model = new TwinModel({
      twinId,
      modelName,
      modelVersion,
      schema,
      propertyDefinitions,
      assumptions,
      validationEnvelope,
      createdAt: this.clock().toISOString()
    });
    await this.repository.saveModel(model);
    const attached = twin.attachModel(modelVersion, this.clock().toISOString());
    await this.repository.saveTwin(attached);

    await this._emit('econet.digital_twin.model_registered', {
      twinId,
      modelId: model.modelId,
      modelName: model.modelName,
      modelVersion: model.modelVersion,
      propertyCount: Object.keys(model.propertyDefinitions).length
    }, {
      actor: cmd.actor,
      subject: { entityId: model.modelId, entityType: 'twin_model' },
      correlationId: cmd.correlationId
    });

    return { model: model.toJSON(), twin: attached.toJSON() };
  }

    async _handleSynchronize(cmd) {
    const { twinId, modelVersion, observedAt, properties = {}, sourceReference = null } = cmd.payload;
    const twin = await this._requireTwin(twinId);
    if (!canSynchronizeTwin(twin.status)) {
      throw new Error(`Synchronization is not permitted while twin is ${twin.status}.`);
    }
    if (!twin.modelVersion || twin.modelVersion !== modelVersion) {
      throw new Error(`Model version "${modelVersion}" does not match twin's active model "${twin.modelVersion}".`);
    }
    const model = await this.repository.findModelByVersion(twinId, modelVersion);
    if (!model) {
      throw new Error(`Registered model version "${modelVersion}" not found for twin "${twinId}".`);
    }
    if (typeof observedAt !== 'string' || Number.isNaN(Date.parse(observedAt))) {
      throw new Error('SynchronizeTwin requires a valid observedAt ISO-8601 string.');
    }
    if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) {
      throw new Error('SynchronizeTwin properties must be an object.');
    }

    const record = new SynchronizationRecord({
      twinId,
      sourceReference,
      startedAt: this.clock().toISOString()
    });

    // Validate every property against the model before any state mutation.
    const acceptedProperties = {};
    const rejectedChanges = [];
    for (const [path, value] of Object.entries(properties)) {
      const def = model.getPropertyDefinition(path);
      if (!def) {
        rejectedChanges.push({ propertyPath: path, reason: `UNKNOWN_PROPERTY: "${path}" is not declared by model "${modelVersion}".` });
        continue;
      }
      if (def.units && value !== null && !this._checkUnits(value, def.units)) {
        rejectedChanges.push({ propertyPath: path, reason: `INVALID_UNIT: expected units ${def.units}.` });
        continue;
      }
      if (def.min !== undefined && value !== null && value < def.min) {
        rejectedChanges.push({ propertyPath: path, reason: `OUT_OF_RANGE: below min ${def.min}.` });
        continue;
      }
      if (def.max !== undefined && value !== null && value > def.max) {
        rejectedChanges.push({ propertyPath: path, reason: `OUT_OF_RANGE: above max ${def.max}.` });
        continue;
      }
      acceptedProperties[path] = value;
    }

    if (rejectedChanges.length > 0) {
      const failed = new SynchronizationRecord({
        ...record.toJSON(),
        completedAt: this.clock().toISOString(),
        status: 'REJECTED',
        rejectedChanges: rejectedChanges.length,
        failureReason: rejectedChanges[0].reason
      });
      await this.repository.saveSyncRecord(failed);
      await this._emit('econet.digital_twin.synchronization_rejected', {
        twinId,
        modelVersion,
        reasons: rejectedChanges,
        observedAt
      }, {
        actor: cmd.actor,
        subject: { entityId: twinId, entityType: 'digital_twin' },
        correlationId: cmd.correlationId
      });
      return {
        twinId,
        synchronized: false,
        rejectedChanges,
        acceptedProperties
      };
    }

    // Temporal policy: reject an older update than the accepted state.
    const current = await this.repository.getCurrentState(twinId);
    if (current && isOlderThanCurrent(observedAt, current.observedAt, this._twinPolicy(twinId))) {
      const failed = new SynchronizationRecord({
        ...record.toJSON(),
        completedAt: this.clock().toISOString(),
        status: 'REJECTED',
        previousStateVersion: current.stateVersion,
        rejectedChanges: 1,
        failureReason: 'OLDER_UPDATE_REJECTED'
      });
      await this.repository.saveSyncRecord(failed);
      await this._emit('econet.digital_twin.synchronization_rejected', {
        twinId,
        modelVersion,
        observedAt,
        reason: 'OLDER_UPDATE_REJECTED'
      }, {
        actor: cmd.actor,
        subject: { entityId: twinId, entityType: 'digital_twin' },
        correlationId: cmd.correlationId
      });
      return { twinId, synchronized: false, rejectedChanges: [{ propertyPath: '*', reason: 'OLDER_UPDATE_REJECTED' }] };
    }

    // Apply the accepted state as the next versioned snapshot.
    const nextVersion = (current ? current.stateVersion : 0) + 1;
    const state = new TwinState({
      twinId,
      stateVersion: nextVersion,
      observedAt,
      acceptedAt: this.clock().toISOString(),
      modelVersion,
      properties: acceptedProperties,
      synchronizationStatus: 'CURRENT',
      sourceReferences: sourceReference ? [sourceReference] : [],
      createdBy: cmd.actor.actorId
    });
    await this.repository.saveState(state);

    const completed = new SynchronizationRecord({
      ...record.toJSON(),
      completedAt: this.clock().toISOString(),
      status: 'SYNCHRONIZED',
      previousStateVersion: current ? current.stateVersion : null,
      resultingStateVersion: nextVersion,
      acceptedChanges: Object.keys(acceptedProperties).length,
      rejectedChanges: rejectedChanges.length
    });
    await this.repository.saveSyncRecord(completed);

    await this._emit('econet.digital_twin.synchronized', {
      twinId,
      stateVersion: nextVersion,
      observedAt,
      acceptedAt: state.acceptedAt,
      modelVersion,
      acceptedChanges: Object.keys(acceptedProperties).length,
      rejectedChanges: rejectedChanges.length
    }, {
      actor: cmd.actor,
      subject: { entityId: twinId, entityType: 'digital_twin' },
      correlationId: cmd.correlationId
    });

    return {
      twinId,
      synchronized: true,
      stateVersion: nextVersion,
      state: state.toJSON(),
      rejectedChanges
    };
  }

    // ---- Internal helpers ----

  _twinPolicy(twinId) {
    return this.freshnessPolicies[twinId] || {};
  }

  _checkUnits(value, units) {
    // Deterministic unit-type guard. Only unit strings matching expected types pass.
    const allowedUnits = ['m', 'cm', 'km', 's', 'min', 'h', 'ms', 'C', 'mm', 'kPa'];
    if (typeof units !== 'string') return false;
    if (!allowedUnits.includes(units)) return false;
    return typeof value === 'number';
  }

  _hasAnyRole(actor, roles) {
    if (!actor || !Array.isArray(actor.roles)) return false;
    return actor.roles.some(role => roles.includes(role));
  }

  _assertAuthorized(cmd) {
    if (!this._hasAnyRole(cmd.actor, this.authorizedRoles)) {
      throw new Error(
        `Twin command "${cmd.commandType}" denied: actor "${cmd.actor.actorId}" lacks an authorized twin role.`
      );
    }
  }

  async _requireTwin(twinId) {
    if (!twinId || typeof twinId !== 'string' || twinId.trim() === '') {
      throw new Error('twinId is required.');
    }
    const twin = await this.repository.findTwinById(twinId);
    if (!twin) {
      throw new Error(`DigitalTwin not found: "${twinId}".`);
    }
    return twin;
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