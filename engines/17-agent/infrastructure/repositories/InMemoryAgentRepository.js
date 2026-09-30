/**
 * Engine 17: Agent Engine — InMemoryAgentRepository
 * Isolated in-memory persistence adapter for Agent definitions, AgentTask
 * records, and AgentExecution provenance records.
 */

export class InMemoryAgentRepository {
  #agents = new Map();
  #tasks = new Map();       // taskId -> AgentTask
  #executions = new Map();  // executionId -> AgentExecution

  // ---- Agents ----

  async saveAgent(agent) {
    if (!agent || !agent.agentId) {
      throw new Error('Cannot save invalid Agent.');
    }
    this.#agents.set(agent.agentId, agent);
    return agent;
  }

  async findAgentById(agentId) {
    return this.#agents.get(agentId) || null;
  }

  async findAgentsByKind(kind) {
    const results = [];
    for (const agent of this.#agents.values()) {
      if (agent.kind === kind) {
        results.push(agent);
      }
    }
    return results;
  }

  async listAgents({ kind = null, status = null } = {}) {
    let results = Array.from(this.#agents.values());
    if (kind) results = results.filter(a => a.kind === kind);
    if (status) results = results.filter(a => a.status === status);
    return results;
  }

  // ---- Tasks ----

  async saveTask(task) {
    if (!task || !task.taskId) {
      throw new Error('Cannot save invalid AgentTask.');
    }
    this.#tasks.set(task.taskId, task);
    return task;
  }

  async findTaskById(taskId) {
    return this.#tasks.get(taskId) || null;
  }

  async findTasksByAgent(agentId) {
    const results = [];
    for (const task of this.#tasks.values()) {
      if (task.agentId === agentId) {
        results.push(task);
      }
    }
    return results;
  }

  async findTasksByParent(parentTaskId) {
    const results = [];
    for (const task of this.#tasks.values()) {
      if (task.parentTaskId === parentTaskId) {
        results.push(task);
      }
    }
    return results;
  }

  // ---- Executions ----

  async saveExecution(execution) {
    if (!execution || !execution.executionId) {
      throw new Error('Cannot save invalid AgentExecution.');
    }
    this.#executions.set(execution.executionId, execution);
    return execution;
  }

  async findExecutionById(executionId) {
    return this.#executions.get(executionId) || null;
  }

  async findExecutionsByTask(taskId) {
    const results = [];
    for (const execution of this.#executions.values()) {
      if (execution.taskId === taskId) {
        results.push(execution);
      }
    }
    return results;
  }

  async findExecutionsByAgent(agentId) {
    const results = [];
    for (const execution of this.#executions.values()) {
      if (execution.agentId === agentId) {
        results.push(execution);
      }
    }
    return results;
  }

  async countAgents() {
    return this.#agents.size;
  }

  async clear() {
    this.#agents.clear();
    this.#tasks.clear();
    this.#executions.clear();
  }
}