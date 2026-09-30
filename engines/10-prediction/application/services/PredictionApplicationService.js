/**
 * Engine 10: Prediction Engine — PredictionApplicationService.
 * Coordinates standalone direct-input prediction generation and lifecycle
 * mutations without subscribing to another engine's event vocabulary.
 */

import { Command } from '../../../../contracts/commands/Command.js';
import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import { globalEventBus } from '../../../../infrastructure/messaging/EventBus.js';
import { globalIdempotencyManager } from '../../../../infrastructure/idempotency/IdempotencyManager.js';
import {
  EnvironmentalPrediction,
  PredictionStatus
} from '../../domain/entities/EnvironmentalPrediction.js';
import { createPredictionGeneratedEvent } from '../../domain/events/PredictionGenerated.js';
import { InMemoryPredictionRepository } from '../../infrastructure/repositories/InMemoryPredictionRepository.js';

const ENGINE_SLUG = '10-prediction';
const MUTATING_COMMANDS = new Set([
  'GeneratePrediction',
  'InvalidatePrediction',
  'UpdateModelConfidence'
]);

export class PredictionApplicationService {
  constructor({
    repository = new InMemoryPredictionRepository(),
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
      throw new Error(`Unsupported Prediction command: "${cmd.commandType}".`);
    }
    if (!cmd.idempotencyKey) {
      throw new Error(`Prediction command "${cmd.commandType}" requires an idempotencyKey.`);
    }

    return this.idempotencyManager.executeIdempotent(
      `${ENGINE_SLUG}:${cmd.commandType}:${cmd.idempotencyKey}`,
      async () => {
        await this._assertGovernance(cmd);
        return this._dispatch(cmd);
      }
    );
  }

  async getPredictionById(predictionId) {
    if (!predictionId) {
      throw new Error('predictionId is required.');
    }
    const prediction = await this.repository.findById(predictionId);
    return prediction ? prediction.toJSON() : null;
  }

  async listActivePredictions({ subjectId = null, targetMetric = null, horizon = null } = {}) {
    let predictions = await this.repository.findActive();
    if (subjectId) {
      predictions = predictions.filter(prediction => prediction.subjectId === subjectId);
    }
    if (targetMetric) {
      predictions = predictions.filter(prediction => prediction.targetMetric === targetMetric);
    }
    if (horizon) {
      predictions = predictions.filter(prediction => prediction.horizon === horizon);
    }
    return predictions.map(prediction => prediction.toJSON());
  }

  async _dispatch(command) {
    switch (command.commandType) {
      case 'GeneratePrediction':
        return this._handleGeneratePrediction(command);
      case 'InvalidatePrediction':
        return this._handleInvalidatePrediction(command);
      case 'UpdateModelConfidence':
        return this._handleUpdateModelConfidence(command);
      default:
        throw new Error(`Unhandled Prediction command: ${command.commandType}`);
    }
  }

  async _handleGeneratePrediction(command) {
    const now = this._now();
    const prediction = new EnvironmentalPrediction({
      ...command.payload,
      createdAt: now,
      updatedAt: now
    });
    await this.repository.save(prediction);
    await this._publishPrediction(prediction, 'GENERATED', command);
    return { prediction: prediction.toJSON(), predictionChanged: true };
  }

  async _handleInvalidatePrediction(command) {
    const { predictionId, reason } = command.payload;
    const current = await this._requirePrediction(predictionId);
    const invalidated = current.invalidate(reason, this._now());
    if (invalidated === current) {
      return { prediction: current.toJSON(), predictionChanged: false };
    }
    await this.repository.save(invalidated);
    await this._publishPrediction(invalidated, 'INVALIDATED', command, {
      invalidationReason: invalidated.invalidationReason
    });
    return { prediction: invalidated.toJSON(), predictionChanged: true };
  }

  async _handleUpdateModelConfidence(command) {
    const { predictionId, confidenceScore, errorMargin, modelVersion } = command.payload;
    const current = await this._requirePrediction(predictionId);
    const updated = current.updateModelConfidence({ confidenceScore, errorMargin, modelVersion }, this._now());
    await this.repository.save(updated);
    await this._publishPrediction(updated, 'MODEL_CONFIDENCE_UPDATED', command, {
      previousConfidenceScore: current.confidenceScore,
      previousErrorMargin: current.errorMargin,
      previousModelVersion: current.modelVersion
    });
    return { prediction: updated.toJSON(), predictionChanged: true };
  }

  async _requirePrediction(predictionId) {
    if (!predictionId) {
      throw new Error('predictionId is required.');
    }
    const prediction = await this.repository.findById(predictionId);
    if (!prediction) {
      throw new Error(`EnvironmentalPrediction not found: "${predictionId}".`);
    }
    return prediction;
  }

  async _assertGovernance(command) {
    if (!this.governance) return;
    const decision = await this.governance.evaluatePolicy({
      engine: ENGINE_SLUG,
      commandType: command.commandType,
      actor: command.actor,
      payload: command.payload
    });
    if (!decision.allowed) {
      throw new Error(`Governance policy denial: ${decision.reason || 'Command denied by policy.'}`);
    }
  }

  async _publishPrediction(prediction, operation, command, metadata = {}) {
    const event = createPredictionGeneratedEvent({
      prediction: prediction.toJSON(),
      operation,
      actor: command.actor,
      correlationId: command.correlationId,
      metadata
    });
    return this._publish(event);
  }

  async _publish(event) {
    const domainEvent = event instanceof DomainEvent ? event : new DomainEvent(event);
    await this.eventBus.publish(domainEvent);
    return domainEvent;
  }

  _now() {
    return this.clock().toISOString();
  }
}