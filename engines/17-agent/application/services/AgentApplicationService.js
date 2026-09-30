/**
 * Engine 17: Agent Engine — AgentApplicationService
 * Coordinates the autonomous-agent domain: agent lifecycle, task management,
 * bounded capability execution, execution state, coordination/delegation,
 * provenance, and agent safety boundaries.
 *
 * Safety invariants:
 * - Model/tool output is untrusted until validated by the injected executor.
 * - Confidence is not authorization; a task NEVER escalates privileges.
 * - No cross-engine private imports; operations on other engines are reached
 *   only through their public boundaries (via the injected executor adapter).
 * - No uncontrolled infinite loops: every execution has explicit terminal
 *   states including timeout and cancellation.
 */

import { Command } from '../../../../contracts/commands/Command.js';
import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import { globalEventBus } from '../../../../infrastructure/messaging/EventBus.js';
import { globalIdempotencyManager } from '../../../../infrastructure/idempotency/IdempotencyManager.js';
import { Agent } from '../../domain/entities/Agent.js';
import { AgentTask } from '../../domain/entities/AgentTask.js';
import { AgentExecution } from '../../domain/entities/AgentExecution.js';
import { AgentStatus, isAgentOperational } from '../../domain/value-objects/AgentStatus.js';
import { ExecutionStatus } from '../../domain/value-objects/ExecutionStatus.js';
import { normalizeAgentKind } from '../../domain/value-objects/AgentKind.js';
import { InMemoryAgentRepository } from '../../infrastructure/repositories/InMemoryAgentRepository.js';

const ENGINE_SLUG = '17-agent';
const PRODUCER = 'engine.17.agent';

const MUTATING_COMMANDS = new Set([
  'RegisterAgent',
  'ChangeAgentStatus',
  'RunAgentTask',
  'CancelAgentTask',
  'DelegateAgentTask'
]);

const DEFAULT_AUTHORIZED_ROLES = Object.freeze([
  'system',
  'admin',
  'agent_manager',
  'automation'
]);

export class AgentApplicationService {
  constructor({
    repository = new InMemoryAgentRepository(),
    eventBus = globalEventBus,
    idempotencyManager = globalIdempotencyManager,
    governance = null,
    clock = () => new Date(),
    authorizedRoles = DEFAULT_AUTHORIZED_ROLES,
    executor = null
  } = {}) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.idempotencyManager = idempotencyManager;
    this.governance = governance;
    this.clock = clock;
    this.authorizedRoles = [...authorizedRoles];
    this.executor = executor || this._createDefaultExecutor();
  }

  _createDefaultExecutor() {
    // Deterministic, safe default executor. It runs ONLY the stateless capability
    // handlers explicitly allowed here; everything else is rejected. This is NOT
    // an LLM; it is a bounded, validated execution port.
    const safeHandlers = new Map([
      ['summarize', (input) => {
        const text = input?.text;
        if (typeof text !== 'string' || text.trim() === '') {
          throw new Error('summarize requires text.');
        }
        return { summary: text.trim().slice(0, 200), truncated: text.length > 200 };
      }],
      ['echo', (input) => ({ echoed: input?.value ?? null })],
      ['noop', () => ({ ok: true })]
    ]);
    return {
      async execute({ kind, taskId, agentId, capability, input }) {
        const handler = safeHandlers.get(capability);
        if (!handler) {
          throw new Error(
            `Capability "${capability}" is not in the Engine 17 safe execution allowlist.`
          );
        }
        return handler(input);
      }
    };
  }

  async execute(command) {
    const cmd = command instanceof Command ? command : new Command(command);
    if (cmd.targetEngine !== ENGINE_SLUG || !MUTATING_COMMANDS.has(cmd.commandType)) {
      throw new Error(`Unsupported Agent command: "${cmd.commandType}".`);
    }
    if (!cmd.idempotencyKey) {
      throw new Error(`Agent command "${cmd.commandType}" requires an idempotencyKey.`);
    }
    if (!cmd.actor || !cmd.actor.actorId) {
      throw new Error('Agent commands require an authenticated actor.');
    }
    return this.idempotencyManager.executeIdempotent(
      `${ENGINE_SLUG}:${cmd.commandType}:${cmd.idempotencyKey}`,
      async () => {
        await this._assertGovernance(cmd);
        return this._dispatch(cmd);
      }
    );
  }

  // ---- Queries ----

  async getAgent(agentId) {
    const agent = await this.repository.findAgentById(agentId);
    return agent ? agent.toJSON() : null;
  }

  async listAgents(filter) {
    const agents = await this.repository.listAgents(filter);
    return agents.map(a => a.toJSON());
  }

  async getTask(taskId) {
    const task = await this.repository.findTaskById(taskId);
    return task ? task.toJSON() : null;
  }

  async getTasksByAgent(agentId) {
    const tasks = await this.repository.findTasksByAgent(agentId);
    return tasks.map(t => t.toJSON());
  }

  async getExecution(executionId) {
    const execution = await this.repository.findExecutionById(executionId);
    return execution ? execution.toJSON() : null;
  }

  async getExecutionsByTask(taskId) {
    const executions = await this.repository.findExecutionsByTask(taskId);
    return executions.map(e => e.toJSON());
  }

  async getExecutionByTaskAndAgent(taskId, agentId) {
    const executions = await this.repository.findExecutionsByTask(taskId);
    return (executions.find(e => e.agentId === agentId) || null)?.toJSON() || null;
  }

    async _dispatch(cmd) {
    switch (cmd.commandType) {
      case 'RegisterAgent':
        return this._handleRegisterAgent(cmd);
      case 'ChangeAgentStatus':
        return this._handleChangeAgentStatus(cmd);
      case 'RunAgentTask':
        return this._handleRunTask(cmd);
      case 'CancelAgentTask':
        return this._handleCancelTask(cmd);
      case 'DelegateAgentTask':
        return this._handleDelegateTask(cmd);
      default:
        throw new Error(`Unhandled Agent command: ${cmd.commandType}`);
    }
  }

  async _handleRegisterAgent(cmd) {
    if (!this._hasAnyRole(cmd.actor, this.authorizedRoles)) {
      throw new Error(`Agent registration denied: actor "${cmd.actor.actorId}" lacks an authorized agent role.`);
    }
    const { name, kind, description = '', capabilities = [], metadata = {} } = cmd.payload;
    const agent = new Agent({
      name,
      kind,
      description,
      capabilities,
      metadata,
      createdAt: this.clock().toISOString(),
      updatedAt: this.clock().toISOString()
    });
    await this.repository.saveAgent(agent);

    await this._emit('econet.agent.registered', {
      agentId: agent.agentId,
      name: agent.name,
      kind: agent.kind,
      capabilities: agent.capabilities
    }, {
      actor: cmd.actor,
      subject: { entityId: agent.agentId, entityType: 'agent' },
      correlationId: cmd.correlationId
    });

    return { agent: agent.toJSON() };
  }

  async _handleChangeAgentStatus(cmd) {
    const { agentId, status } = cmd.payload;
    const agent = await this._requireAgent(agentId);

    const updated = agent.transitionTo(status, this.clock().toISOString());
    await this.repository.saveAgent(updated);

    await this._emit('econet.agent.status_changed', {
      agentId: updated.agentId,
      previousStatus: agent.status,
      newStatus: updated.status
    }, {
      actor: cmd.actor,
      subject: { entityId: updated.agentId, entityType: 'agent' },
      correlationId: cmd.correlationId
    });

    return { agent: updated.toJSON() };
  }

    async _handleRunTask(cmd) {
    const {
      agentId,
      capability,
      input = {},
      kind = null,
      parentTaskId = null,
      timeoutMs = 30000
    } = cmd.payload;

    const agent = await this._requireAgent(agentId);
    if (!isAgentOperational(agent.status)) {
      throw new Error(`Agent "${agentId}" is not operational (status: ${agent.status}).`);
    }
    if (!agent.capabilities.includes(capability)) {
      throw new Error(
        `Agent "${agentId}" does not declare capability "${capability}".`
      );
    }
    const resolvedKind = normalizeAgentKind(kind ?? agent.kind);

    const task = new AgentTask({
      agentId,
      kind: resolvedKind,
      input,
      requestedBy: cmd.actor.actorId,
      parentTaskId,
      timeoutMs,
      metadata: { capability },
      createdAt: this.clock().toISOString(),
      updatedAt: this.clock().toISOString()
    });

    const execution = new AgentExecution({
      taskId: task.taskId,
      agentId,
      kind: resolvedKind,
      requestedBy: cmd.actor.actorId,
      parentExecutionId: null,
      startedAt: this.clock().toISOString(),
      targetEngine: ENGINE_SLUG,
      timeoutMs
    });

    // Persist PENDING task + execution record for provenance.
    await this.repository.saveTask(task);
    await this.repository.saveExecution(execution);

    await this._emit('econet.agent.task_created', {
      taskId: task.taskId,
      agentId,
      kind: resolvedKind,
      capability,
      requestedBy: cmd.actor.actorId,
      parentTaskId
    }, {
      actor: cmd.actor,
      subject: { entityId: task.taskId, entityType: 'agent_task' },
      correlationId: cmd.correlationId
    });

    // Track execution via a fresh projection.
    let running = task.markRunning(this.clock().toISOString());
    await this.repository.saveTask(running);

    // Run the bounded capability with an explicit timeout.
    let completedTask;
    let completedExecution;
    try {
      const result = await this._executeWithTimeout({
        executor: this.executor,
        kind: resolvedKind,
        taskId: task.taskId,
        agentId,
        capability,
        input,
        timeoutMs
      });

      completedTask = running.markCompleted(result, this.clock().toISOString());
      completedExecution = new AgentExecution({
        taskId: task.taskId,
        agentId,
        kind: resolvedKind,
        requestedBy: cmd.actor.actorId,
        parentExecutionId: execution.parentExecutionId,
        startedAt: execution.startedAt,
        completedAt: this.clock().toISOString(),
        result,
        targetEngine: ENGINE_SLUG,
        timeoutMs
      });
      await this.repository.saveTask(completedTask);
      await this.repository.saveExecution(completedExecution);

      await this._emit('econet.agent.task_completed', {
        taskId: task.taskId,
        agentId,
        kind: resolvedKind,
        capability,
        result
      }, {
        actor: cmd.actor,
        subject: { entityId: task.taskId, entityType: 'agent_task' },
        correlationId: cmd.correlationId
      });

      return { task: completedTask.toJSON(), execution: completedExecution.toJSON(), status: ExecutionStatus.COMPLETED };
    } catch (err) {
      const rawMessage = err?.message ?? err;
      const errorMessage = String(rawMessage || '');
      const isTimeout = /timed out|timeout/i.test(errorMessage);
      const finalStatus = isTimeout ? ExecutionStatus.TIMED_OUT : ExecutionStatus.FAILED;
      completedTask = isTimeout
        ? running.markTimedOut(this.clock().toISOString())
        : running.markFailed(errorMessage, this.clock().toISOString());
      completedExecution = new AgentExecution({
        taskId: task.taskId,
        agentId,
        kind: resolvedKind,
        requestedBy: cmd.actor.actorId,
        parentExecutionId: execution.parentExecutionId,
        startedAt: execution.startedAt,
        completedAt: this.clock().toISOString(),
        error: errorMessage,
        targetEngine: ENGINE_SLUG,
        timeoutMs
      });
      await this.repository.saveTask(completedTask);
      await this.repository.saveExecution(completedExecution);

      await this._emit('econet.agent.task_failed', {
        taskId: task.taskId,
        agentId,
        kind: resolvedKind,
        capability,
        error: errorMessage,
        isTimeout
      }, {
        actor: cmd.actor,
        subject: { entityId: task.taskId, entityType: 'agent_task' },
        correlationId: cmd.correlationId
      });

      return { task: completedTask.toJSON(), execution: completedExecution.toJSON(), status: finalStatus };
    }
  }

    async _handleCancelTask(cmd) {
    const { taskId, reason = 'cancelled by operator' } = cmd.payload;
    const task = await this._requireTask(taskId);

    // Only a non-terminal task can be cancelled.
    if (![ExecutionStatus.PENDING, ExecutionStatus.RUNNING].includes(task.status)) {
      throw new Error(`Cannot cancel task in status "${task.status}".`);
    }

    const cancelled = task.markCancelled(this.clock().toISOString());
    await this.repository.saveTask(cancelled);

    const execution = new AgentExecution({
      taskId: task.taskId,
      agentId: task.agentId,
      kind: task.kind,
      requestedBy: task.requestedBy,
      parentExecutionId: null,
      startedAt: this.clock().toISOString(),
      completedAt: this.clock().toISOString(),
      error: reason,
      targetEngine: ENGINE_SLUG,
      timeoutMs: task.timeoutMs
    });
    await this.repository.saveExecution(execution);

    await this._emit('econet.agent.task_cancelled', {
      taskId: task.taskId,
      agentId: task.agentId,
      kind: task.kind,
      reason
    }, {
      actor: cmd.actor,
      subject: { entityId: task.taskId, entityType: 'agent_task' },
      correlationId: cmd.correlationId
    });

    return { task: cancelled.toJSON(), status: ExecutionStatus.CANCELLED };
  }

    async _handleDelegateTask(cmd) {
    const {
      parentTaskId,
      childAgentId,
      capability,
      input = {},
      kind = null,
      timeoutMs = 30000
    } = cmd.payload;

    const parentTask = await this._requireTask(parentTaskId);
    if (![ExecutionStatus.RUNNING, ExecutionStatus.COMPLETED].includes(parentTask.status)) {
      throw new Error(`Cannot delegate from parent task in status "${parentTask.status}".`);
    }

    const childAgent = await this._requireAgent(childAgentId);
    if (!isAgentOperational(childAgent.status)) {
      throw new Error(`Child agent "${childAgentId}" is not operational (status: ${childAgent.status}).`);
    }
    if (!childAgent.capabilities.includes(capability)) {
      throw new Error(
        `Child agent "${childAgentId}" does not declare capability "${capability}".`
      );
    }

    const resolvedKind = normalizeAgentKind(kind ?? childAgent.kind);

    const childTask = new AgentTask({
      agentId: childAgentId,
      kind: resolvedKind,
      input,
      requestedBy: cmd.actor.actorId,
      parentTaskId: parentTask.taskId,
      timeoutMs,
      metadata: { capability },
      createdAt: this.clock().toISOString(),
      updatedAt: this.clock().toISOString()
    });
    await this.repository.saveTask(childTask);

    let running = childTask.markRunning(this.clock().toISOString());
    const parentExecutions = await this.repository.findExecutionsByTask(parentTask.taskId);
    const parentExecutionId = parentExecutions.length > 0
      ? parentExecutions[parentExecutions.length - 1].executionId
      : null;
    const childExecution = new AgentExecution({
      taskId: childTask.taskId,
      agentId: childAgentId,
      kind: resolvedKind,
      requestedBy: cmd.actor.actorId,
      parentExecutionId,
      startedAt: this.clock().toISOString(),
      targetEngine: ENGINE_SLUG,
      timeoutMs
    });
    await this.repository.saveExecution(childExecution);
    await this.repository.saveTask(running);

    await this._emit('econet.agent.task_delegated', {
      parentTaskId: parentTask.taskId,
      childTaskId: childTask.taskId,
      childAgentId,
      childKind: resolvedKind,
      capability,
      parentExecutionId
    }, {
      actor: cmd.actor,
      subject: { entityId: childTask.taskId, entityType: 'agent_task' },
      correlationId: cmd.correlationId
    });

        let completedTask;
    let completedExecution;
    try {
      const result = await this._executeWithTimeout({
        executor: this.executor,
        kind: resolvedKind,
        taskId: childTask.taskId,
        agentId: childAgentId,
        capability,
        input,
        timeoutMs
      });

      completedTask = running.markCompleted(result, this.clock().toISOString());
      completedExecution = new AgentExecution({
        taskId: childTask.taskId,
        agentId: childAgentId,
        kind: resolvedKind,
        requestedBy: cmd.actor.actorId,
        parentExecutionId,
        startedAt: childExecution.startedAt,
        completedAt: this.clock().toISOString(),
        result,
        targetEngine: ENGINE_SLUG,
        timeoutMs
      });
      await this.repository.saveTask(completedTask);
      await this.repository.saveExecution(completedExecution);

      await this._emit('econet.agent.task_completed', {
        taskId: childTask.taskId,
        parentTaskId: parentTask.taskId,
        agentId: childAgentId,
        kind: resolvedKind,
        capability,
        result
      }, {
        actor: cmd.actor,
        subject: { entityId: childTask.taskId, entityType: 'agent_task' },
        correlationId: cmd.correlationId
      });

      return { task: completedTask.toJSON(), execution: completedExecution.toJSON(), status: ExecutionStatus.COMPLETED };
    } catch (err) {
      const rawMessage = err?.message ?? err;
      const errorMessage = String(rawMessage || '');
      const isTimeout = /timed out|timeout/i.test(errorMessage);
      const finalStatus = isTimeout ? ExecutionStatus.TIMED_OUT : ExecutionStatus.FAILED;
      completedTask = isTimeout
        ? running.markTimedOut(this.clock().toISOString())
        : running.markFailed(errorMessage, this.clock().toISOString());
      completedExecution = new AgentExecution({
        taskId: childTask.taskId,
        agentId: childAgentId,
        kind: resolvedKind,
        requestedBy: cmd.actor.actorId,
        parentExecutionId,
        startedAt: childExecution.startedAt,
        completedAt: this.clock().toISOString(),
        error: errorMessage,
        targetEngine: ENGINE_SLUG,
        timeoutMs
      });
      await this.repository.saveTask(completedTask);
      await this.repository.saveExecution(completedExecution);

      await this._emit('econet.agent.task_failed', {
        taskId: childTask.taskId,
        parentTaskId: parentTask.taskId,
        agentId: childAgentId,
        kind: resolvedKind,
        capability,
        error: errorMessage,
        isTimeout
      }, {
        actor: cmd.actor,
        subject: { entityId: childTask.taskId, entityType: 'agent_task' },
        correlationId: cmd.correlationId
      });

      return { task: completedTask.toJSON(), execution: completedExecution.toJSON(), status: finalStatus };
    }
  }

    // ---- Internal helpers ----

  async _executeWithTimeout({ executor, kind, taskId, agentId, capability, input, timeoutMs }) {
    let timer;
    const timeoutError = new Error(`Agent task timed out after ${timeoutMs}ms.`);
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(timeoutError), timeoutMs);
    });
    try {
      const result = await Promise.race([
        executor.execute({ kind, taskId, agentId, capability, input }),
        timeoutPromise
      ]);
      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  _hasAnyRole(actor, roles) {
    if (!actor || !Array.isArray(actor.roles)) return false;
    return actor.roles.some(role => roles.includes(role));
  }

  async _requireAgent(agentId) {
    if (!agentId || typeof agentId !== 'string' || agentId.trim() === '') {
      throw new Error('agentId is required.');
    }
    const agent = await this.repository.findAgentById(agentId);
    if (!agent) {
      throw new Error(`Agent not found: "${agentId}".`);
    }
    return agent;
  }

  async _requireTask(taskId) {
    if (!taskId || typeof taskId !== 'string' || taskId.trim() === '') {
      throw new Error('taskId is required.');
    }
    const task = await this.repository.findTaskById(taskId);
    if (!task) {
      throw new Error(`AgentTask not found: "${taskId}".`);
    }
    return task;
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