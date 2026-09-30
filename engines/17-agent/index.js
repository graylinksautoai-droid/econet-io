/**
 * Engine 17: Agent Engine — EcoNet IO 24-Engine Canon
 * Mission: Autonomous agent role specifications, execution constraints, tool
 * contracts, and agent behaviors.
 */

import { AgentApplicationService } from './application/services/AgentApplicationService.js';
import { InMemoryAgentRepository } from './infrastructure/repositories/InMemoryAgentRepository.js';

export const ENGINE_ID = '17';
export const ENGINE_NAME = 'Agent Engine';

export class AgentEngine {
  constructor(options = {}) {
    this.engineId = ENGINE_ID;
    this.engineName = ENGINE_NAME;
    this._service = options.service || new AgentApplicationService(options);
    this._repository = this._service.repository;
  }

  get service() {
    return this._service;
  }

  get repository() {
    return this._repository;
  }

  async executeCommand(command) {
    return this._service.execute(command);
  }

  async getAgent(agentId) {
    return this._service.getAgent(agentId);
  }

  async listAgents(filter) {
    return this._service.listAgents(filter);
  }

  async getTask(taskId) {
    return this._service.getTask(taskId);
  }

  async getTasksByAgent(agentId) {
    return this._service.getTasksByAgent(agentId);
  }

  async getExecution(executionId) {
    return this._service.getExecution(executionId);
  }

  async getExecutionsByTask(taskId) {
    return this._service.getExecutionsByTask(taskId);
  }

  async getExecutionByTaskAndAgent(taskId, agentId) {
    return this._service.getExecutionByTaskAndAgent(taskId, agentId);
  }

  async initialize() {
    return { ready: true, engineId: ENGINE_ID, name: ENGINE_NAME };
  }

  async healthCheck() {
    return {
      healthy: true,
      engineId: ENGINE_ID,
      details: {
        status: 'READY',
        persistence: 'IN_MEMORY_AGENT_ADAPTER',
        totalAgents: await this._repository.countAgents()
      }
    };
  }

  async shutdown() {}
}

export const agentEngine = new AgentEngine();
export default agentEngine;

export { AgentApplicationService } from './application/services/AgentApplicationService.js';
export { InMemoryAgentRepository } from './infrastructure/repositories/InMemoryAgentRepository.js';
export { Agent } from './domain/entities/Agent.js';
export { AgentTask } from './domain/entities/AgentTask.js';
export { AgentExecution } from './domain/entities/AgentExecution.js';
export { AgentKind, normalizeAgentKind, isValidAgentKind } from './domain/value-objects/AgentKind.js';
export { AgentStatus, canTransitionAgentStatus, assertAgentStatusTransition, isAgentOperational } from './domain/value-objects/AgentStatus.js';
export { ExecutionStatus, canTransitionExecution, assertExecutionTransition, isTerminalExecution } from './domain/value-objects/ExecutionStatus.js';
