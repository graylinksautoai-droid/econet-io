/**
 * Engine 17: Agent Engine — AgentTask Entity
 * A task is a bounded unit of work assigned to an agent. It carries the target
 * capability, an immutable input payload, an optional parent task reference
 * (for delegation provenance), authorization context, and an execution state.
 */

import { randomUUID } from 'crypto';
import { ExecutionStatus, assertExecutionTransition } from '../value-objects/ExecutionStatus.js';
import { AgentKind, normalizeAgentKind } from '../value-objects/AgentKind.js';

export class AgentTask {
  constructor({
    taskId = `tsk_${randomUUID().replace(/-/g, '')}`,
    agentId,
    kind,
    input,
    requestedBy,
    parentTaskId = null,
    status = ExecutionStatus.PENDING,
    result = null,
    error = null,
    timeoutMs = 30000,
    metadata = {},
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  } = {}) {
    if (typeof taskId !== 'string' || taskId.trim() === '') {
      throw new Error('AgentTask requires a non-empty taskId.');
    }
    if (typeof agentId !== 'string' || agentId.trim() === '') {
      throw new Error('AgentTask requires a non-empty agentId.');
    }
    if (typeof requestedBy !== 'string' || requestedBy.trim() === '') {
      throw new Error('AgentTask requires a non-empty requestedBy.');
    }
    if (input === null || input === undefined || typeof input !== 'object') {
      throw new Error('AgentTask requires an object input.');
    }
    if (typeof timeoutMs !== 'number' || timeoutMs <= 0) {
      throw new Error(`Invalid timeoutMs: "${timeoutMs}". Must be a positive number.`);
    }
    if (!Object.values(ExecutionStatus).includes(status)) {
      throw new Error(`Unknown execution status: "${status}".`);
    }

    this.taskId = taskId;
    this.agentId = agentId.trim();
    this.kind = normalizeAgentKind(kind);
    this.input = Object.freeze({ ...input });
    this.requestedBy = requestedBy.trim();
    this.parentTaskId = parentTaskId || null;
    this.status = status;
    this.result = result ? Object.freeze({ ...result }) : null;
    this.error = error || null;
    this.timeoutMs = timeoutMs;
    this.metadata = Object.freeze({ ...metadata });
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    Object.freeze(this);
  }

  transitionTo(nextStatus, now = new Date().toISOString()) {
    assertExecutionTransition(this.status, nextStatus);
    return new AgentTask({ ...this.toJSON(), status: nextStatus, updatedAt: now });
  }

  markRunning(now = new Date().toISOString()) {
    return this.transitionTo(ExecutionStatus.RUNNING, now);
  }

  markCompleted(result, now = new Date().toISOString()) {
    if (result === null || result === undefined || typeof result !== 'object') {
      throw new Error('AgentTask completion requires an object result.');
    }
    const updated = this.transitionTo(ExecutionStatus.COMPLETED, now);
    return new AgentTask({ ...updated.toJSON(), result: Object.freeze({ ...result }) });
  }

  markFailed(error, now = new Date().toISOString()) {
    if (!error || typeof error !== 'string') {
      throw new Error('AgentTask failure requires an error string.');
    }
    const updated = this.transitionTo(ExecutionStatus.FAILED, now);
    return new AgentTask({ ...updated.toJSON(), error });
  }

  markCancelled(now = new Date().toISOString()) {
    return this.transitionTo(ExecutionStatus.CANCELLED, now);
  }

  markTimedOut(now = new Date().toISOString()) {
    return this.transitionTo(ExecutionStatus.TIMED_OUT, now);
  }

  toJSON() {
    return {
      taskId: this.taskId,
      agentId: this.agentId,
      kind: this.kind,
      input: { ...this.input },
      requestedBy: this.requestedBy,
      parentTaskId: this.parentTaskId,
      status: this.status,
      result: this.result ? { ...this.result } : null,
      error: this.error,
      timeoutMs: this.timeoutMs,
      metadata: { ...this.metadata },
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}