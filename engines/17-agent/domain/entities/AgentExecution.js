/**
 * Engine 17: Agent Engine — AgentExecution Entity
 * Authority record for a single agent task execution, preserving provenance:
 *   executionId, taskId, agentId, kind, requestedBy, startedAt, completedAt,
 *   parentExecutionId (for delegation chains), result, error, targetEngine.
 *
 * Execution state is a projection of the task lifecycle; parent/child chain
 * preserves multi-agent coordination provenance.
 */

import { randomUUID } from 'crypto';

export class AgentExecution {
  constructor({
    executionId = `exe_${randomUUID().replace(/-/g, '')}`,
    taskId,
    agentId,
    kind,
    requestedBy,
    parentExecutionId = null,
    startedAt = null,
    completedAt = null,
    result = null,
    error = null,
    targetEngine = null,
    timeoutMs = 30000
  } = {}) {
    if (typeof executionId !== 'string' || executionId.trim() === '') {
      throw new Error('AgentExecution requires a non-empty executionId.');
    }
    if (typeof taskId !== 'string' || taskId.trim() === '') {
      throw new Error('AgentExecution requires a non-empty taskId.');
    }
    if (typeof agentId !== 'string' || agentId.trim() === '') {
      throw new Error('AgentExecution requires a non-empty agentId.');
    }
    if (typeof requestedBy !== 'string' || requestedBy.trim() === '') {
      throw new Error('AgentExecution requires a non-empty requestedBy.');
    }

    this.executionId = executionId;
    this.taskId = taskId.trim();
    this.agentId = agentId.trim();
    this.kind = kind;
    this.requestedBy = requestedBy.trim();
    this.parentExecutionId = parentExecutionId || null;
    this.startedAt = startedAt;
    this.completedAt = completedAt;
    this.result = result ? Object.freeze({ ...result }) : null;
    this.error = error || null;
    this.targetEngine = targetEngine || null;
    this.timeoutMs = timeoutMs;
    Object.freeze(this);
  }

  toJSON() {
    return {
      executionId: this.executionId,
      taskId: this.taskId,
      agentId: this.agentId,
      kind: this.kind,
      requestedBy: this.requestedBy,
      parentExecutionId: this.parentExecutionId,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      result: this.result ? { ...this.result } : null,
      error: this.error,
      targetEngine: this.targetEngine,
      timeoutMs: this.timeoutMs
    };
  }
}