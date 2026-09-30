/**
 * Engine 17: Agent Engine — Agent Entity
 * Formal agent definition: identity, kind, capability contract, lifecycle.
 * An agent is a bounded executor; its actual domain behavior is reached via an
 * injected capability handler (which may consult other engines). Model output
 * is untrusted until validated.
 */

import { randomUUID } from 'crypto';
import { AgentStatus, assertAgentStatusTransition } from '../value-objects/AgentStatus.js';
import { normalizeAgentKind } from '../value-objects/AgentKind.js';

export class Agent {
  constructor({
    agentId = `agt_${randomUUID().replace(/-/g, '')}`,
    name,
    kind,
    description = '',
    status = AgentStatus.DRAFT,
    capabilities = [],
    metadata = {},
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  } = {}) {
    if (typeof agentId !== 'string' || agentId.trim() === '') {
      throw new Error('Agent requires a non-empty agentId.');
    }
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('Agent requires a non-empty name.');
    }
    if (typeof description !== 'string') {
      throw new Error('Agent description must be a string.');
    }
    if (!Object.values(AgentStatus).includes(status)) {
      throw new Error(`Unknown agent status: "${status}".`);
    }
    if (!Array.isArray(capabilities)) {
      throw new Error('Agent capabilities must be an array.');
    }

    this.agentId = agentId;
    this.name = name.trim();
    this.kind = normalizeAgentKind(kind);
    this.description = description.trim();
    this.status = status;
    this.capabilities = Object.freeze(capabilities.map(c => String(c).trim()).filter(Boolean));
    this.metadata = Object.freeze({ ...metadata });
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    Object.freeze(this);
  }

  transitionTo(nextStatus, now = new Date().toISOString()) {
    assertAgentStatusTransition(this.status, nextStatus);
    return new Agent({
      ...this.toJSON(),
      status: nextStatus,
      updatedAt: now
    });
  }

  toJSON() {
    return {
      agentId: this.agentId,
      name: this.name,
      kind: this.kind,
      description: this.description,
      status: this.status,
      capabilities: [...this.capabilities],
      metadata: { ...this.metadata },
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}