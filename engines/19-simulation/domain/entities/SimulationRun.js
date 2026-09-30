/**
 * Engine 19: Simulation Engine — SimulationRun Entity
 * One execution of one scenario with one model version. Retains a frozen
 * input snapshot plus provenance (requestedBy, correlationId, optional input
 * reference supplied by the caller). Status transitions are explicit and
 * enforced; COMPLETED/FAILED/CANCELLED are terminal.
 */

import { randomUUID } from 'crypto';
import { RunStatus, assertRunStatusTransition } from '../value-objects/RunStatus.js';

export class SimulationRun {
  constructor({
    runId = `run_${randomUUID().replace(/-/g, '')}`,
    scenarioId,
    modelId,
    modelVersion,
    status = RunStatus.CREATED,
    requestedBy = null,
    inputSnapshot = {},
    startedAt = null,
    completedAt = null,
    failureReason = null,
    correlationId = null,
    metadata = {},
    createdAt = new Date().toISOString()
  } = {}) {
    if (typeof runId !== 'string' || runId.trim() === '') {
      throw new Error('SimulationRun requires a non-empty runId.');
    }
    if (typeof scenarioId !== 'string' || scenarioId.trim() === '') {
      throw new Error('SimulationRun requires a non-empty scenarioId.');
    }
    if (typeof modelId !== 'string' || modelId.trim() === '') {
      throw new Error('SimulationRun requires a non-empty modelId.');
    }
    if (typeof modelVersion !== 'string' || modelVersion.trim() === '') {
      throw new Error('SimulationRun requires a non-empty modelVersion.');
    }
    if (!Object.values(RunStatus).includes(status)) {
      throw new Error(`Unknown simulation run status: "${status}".`);
    }
    if (inputSnapshot === null || typeof inputSnapshot !== 'object' || Array.isArray(inputSnapshot)) {
      throw new Error('SimulationRun inputSnapshot must be an object.');
    }

    this.runId = runId;
    this.scenarioId = scenarioId.trim();
    this.modelId = modelId.trim();
    this.modelVersion = modelVersion.trim();
    this.status = status;
    this.requestedBy = requestedBy || null;
    this.inputSnapshot = Object.freeze({ ...inputSnapshot });
    this.startedAt = startedAt;
    this.completedAt = completedAt;
    this.failureReason = failureReason || null;
    this.correlationId = correlationId || null;
    this.metadata = Object.freeze({ ...metadata });
    this.createdAt = createdAt;
    Object.freeze(this);
  }

  transitionTo(nextStatus, now = new Date().toISOString()) {
    assertRunStatusTransition(this.status, nextStatus);
    const updates = {
      status: nextStatus,
      startedAt: nextStatus === RunStatus.RUNNING ? (this.startedAt || now) : this.startedAt,
      completedAt: nextStatus === RunStatus.RUNNING ? null : (this.completedAt || now)
    };
    return new SimulationRun({ ...this.toJSON(), ...updates, metadata: { ...this.metadata } });
  }

  failWith(reason, now = new Date().toISOString()) {
    if (!reason || typeof reason !== 'string') {
      throw new Error('SimulationRun failure requires a reason string.');
    }
    const updated = this.transitionTo(RunStatus.FAILED, now);
    return new SimulationRun({
      ...updated.toJSON(),
      failureReason: reason,
      metadata: { ...updated.metadata }
    });
  }

  toJSON() {
    return {
      runId: this.runId,
      scenarioId: this.scenarioId,
      modelId: this.modelId,
      modelVersion: this.modelVersion,
      status: this.status,
      requestedBy: this.requestedBy,
      inputSnapshot: { ...this.inputSnapshot },
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      failureReason: this.failureReason,
      correlationId: this.correlationId,
      metadata: { ...this.metadata },
      createdAt: this.createdAt
    };
  }
}