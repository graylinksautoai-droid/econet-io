/**
 * Engine 02: Observation Engine — ObservationApplicationService
 * Orchestrates observation ingestion, evidence hashing, lifecycle mutations,
 * idempotency enforcement, and domain event emission.
 */

import crypto from 'crypto';
import { Command } from '../../../../contracts/commands/Command.js';
import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import { globalEventBus } from '../../../../infrastructure/messaging/EventBus.js';
import { globalIdempotencyManager } from '../../../../infrastructure/idempotency/IdempotencyManager.js';
import { Observation } from '../../domain/entities/Observation.js';
import { ObservationStatus } from '../../domain/value-objects/ObservationStatus.js';
import { InMemoryObservationRepository } from '../../infrastructure/repositories/InMemoryObservationRepository.js';

const ENGINE_SLUG = '02-observation';
const PRODUCER = 'engine.02.observation';

const MUTATING_COMMANDS = new Set([
  'SubmitObservation',
  'ValidateObservationEvidence',
  'FlagObservation',
  'UpdateObservationStatus',
  'ArchiveObservation'
]);

export class ObservationApplicationService {
  constructor({
    repository = new InMemoryObservationRepository(),
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
      throw new Error(`Unsupported Observation command: "${cmd.commandType}".`);
    }
    if (!cmd.idempotencyKey) {
      throw new Error(`Observation command "${cmd.commandType}" requires an idempotencyKey.`);
    }

    return this.idempotencyManager.executeIdempotent(
      `${ENGINE_SLUG}:${cmd.commandType}:${cmd.idempotencyKey}`,
      async () => {
        await this._assertGovernance(cmd);
        return this._dispatch(cmd);
      }
    );
  }

  async getObservationById(observationId) {
    const observation = await this.repository.findById(observationId);
    return observation ? observation.toJSON() : null;
  }

  async listObservations({ category, status, observerId } = {}) {
    let observations = await this.repository.listAll();
    if (category) {
      const norm = String(category).toUpperCase();
      observations = observations.filter(o => o.category === norm);
    }
    if (status) {
      observations = observations.filter(o => o.status === status);
    }
    if (observerId) {
      observations = observations.filter(o => o.observerId === observerId);
    }
    return observations.map(o => o.toJSON());
  }

  async _dispatch(cmd) {
    switch (cmd.commandType) {
      case 'SubmitObservation':
        return this._handleSubmitObservation(cmd);
      case 'ValidateObservationEvidence':
        return this._handleValidateEvidence(cmd);
      case 'FlagObservation':
        return this._handleFlagObservation(cmd);
      case 'UpdateObservationStatus':
        return this._handleUpdateStatus(cmd);
      case 'ArchiveObservation':
        return this._handleArchiveObservation(cmd);
      default:
        throw new Error(`Unhandled command: ${cmd.commandType}`);
    }
  }

  async _handleSubmitObservation(cmd) {
    const {
      observationId,
      observerId = cmd.actor?.actorId,
      category,
      severity,
      urgency,
      location,
      description,
      evidence = [],
      metadata = {}
    } = cmd.payload;

    if (!observerId) {
      throw new Error('SubmitObservation requires an observerId or actor.actorId.');
    }

    // Process and hash evidence items with SHA-256 if not provided
    const hashedEvidence = evidence.map((item, idx) => {
      const itemUrl = item.url || '';
      const hashSha256 = item.hashSha256 || crypto.createHash('sha256').update(itemUrl + JSON.stringify(item)).digest('hex');
      return {
        id: item.id || `evi_${idx}_${hashSha256.slice(0, 8)}`,
        mediaType: item.mediaType || 'IMAGE',
        url: itemUrl,
        hashSha256,
        mimeType: item.mimeType || 'image/jpeg'
      };
    });

    const observation = new Observation({
      observationId,
      observerId,
      category,
      severity,
      urgency,
      location,
      description,
      evidence: hashedEvidence,
      status: ObservationStatus.SUBMITTED,
      metadata,
      createdAt: this.clock().toISOString()
    });

    await this.repository.save(observation);

    await this._emit('econet.observation.submitted', {
      observationId: observation.observationId,
      observerId: observation.observerId,
      category: observation.category,
      severity: observation.severity,
      location: observation.location,
      evidenceCount: observation.evidence.length
    }, {
      actor: cmd.actor || { actorId: observerId, roles: ['observer'] },
      subject: { entityId: observation.observationId, entityType: 'observation' },
      correlationId: cmd.correlationId
    });

    return { observation: observation.toJSON() };
  }

  async _handleValidateEvidence(cmd) {
    const { observationId, validationDetails = {} } = cmd.payload;
    const observation = await this._requireObservation(observationId);

    const validated = observation.transitionTo(ObservationStatus.VALIDATED, this.clock().toISOString());
    await this.repository.save(validated);

    await this._emit('econet.observation.validated', {
      observationId: validated.observationId,
      evidenceCount: validated.evidence.length,
      validationDetails
    }, {
      actor: cmd.actor,
      subject: { entityId: validated.observationId, entityType: 'observation' },
      correlationId: cmd.correlationId
    });

    return { observation: validated.toJSON() };
  }

  async _handleFlagObservation(cmd) {
    const { observationId, reason } = cmd.payload;
    if (!reason || typeof reason !== 'string') {
      throw new Error('FlagObservation requires a non-empty reason string.');
    }
    const observation = await this._requireObservation(observationId);
    const flagged = observation.transitionTo(ObservationStatus.FLAGGED, this.clock().toISOString());
    await this.repository.save(flagged);

    await this._emit('econet.observation.flagged', {
      observationId: flagged.observationId,
      reason
    }, {
      actor: cmd.actor,
      subject: { entityId: flagged.observationId, entityType: 'observation' },
      correlationId: cmd.correlationId
    });

    return { observation: flagged.toJSON() };
  }

  async _handleUpdateStatus(cmd) {
    const { observationId, status, reason = null } = cmd.payload;
    const observation = await this._requireObservation(observationId);
    const updated = observation.transitionTo(status, this.clock().toISOString());
    await this.repository.save(updated);

    await this._emit('econet.observation.status_changed', {
      observationId: updated.observationId,
      previousStatus: observation.status,
      newStatus: updated.status,
      reason
    }, {
      actor: cmd.actor,
      subject: { entityId: updated.observationId, entityType: 'observation' },
      correlationId: cmd.correlationId
    });

    return { observation: updated.toJSON() };
  }

  async _handleArchiveObservation(cmd) {
    const { observationId } = cmd.payload;
    const observation = await this._requireObservation(observationId);
    const archived = observation.transitionTo(ObservationStatus.ARCHIVED, this.clock().toISOString());
    await this.repository.save(archived);

    await this._emit('econet.observation.archived', {
      observationId: archived.observationId
    }, {
      actor: cmd.actor,
      subject: { entityId: archived.observationId, entityType: 'observation' },
      correlationId: cmd.correlationId
    });

    return { observation: archived.toJSON() };
  }

  async _requireObservation(observationId) {
    if (!observationId) {
      throw new Error('observationId is required.');
    }
    const obs = await this.repository.findById(observationId);
    if (!obs) {
      throw new Error(`Observation not found: "${observationId}".`);
    }
    return obs;
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
