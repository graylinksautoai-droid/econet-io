/**
 * Engine 22: Governance Engine — GovernanceApplicationService
 *
 * Manages governance policy registration, lifecycle, and evaluation for the
 * EcoNet IO platform.
 *
 * CANONICAL ROLE:
 * Engine 22 is the concrete implementation of the governance adapter contract
 * used by all EcoNet engines (09–21 and beyond). Every engine's
 * _assertGovernance() calls:
 *
 *   governance.evaluatePolicy({ engine, commandType, actor, payload })
 *
 * This service is the authoritative implementation of that contract.
 *
 * OWNERSHIP BOUNDARY:
 * - Owns: governance policy definitions, policy lifecycle, policy evaluation,
 *   compliance checks, and operational constraint enforcement.
 * - Does NOT own: identity (01), observations (02), rewards (15), communities
 *   (16), agents (17), twins (18), simulations (19), connectors (20),
 *   automation jobs (21), audit infrastructure (23), or learning (24).
 *
 * POLICY EVALUATOR SECURITY:
 * Policy evaluators are server-side JavaScript functions registered through
 * GovernancePolicy (the canonical contract from contracts/governance/).
 * Callers NEVER supply executable code — they supply policy ID references.
 * The existing GovernancePolicy contract uses function evaluators by design;
 * this is preserved as-is per the canonical contract.
 *
 * AUTHORIZATION:
 * All mutating commands use the canonical E15/18/19/20/21 pattern:
 * Authorization → Idempotency → Governance → Mutation → Event publication.
 * Missing, null, non-array, or empty actor.roles are denied.
 *
 * META-GOVERNANCE NOTE:
 * GovernanceApplicationService itself does NOT evaluate governance before
 * its own mutations — a governance engine cannot gate its own policy
 * registration behind policies that may not yet exist. This is an
 * intentional and documented design decision.
 */

import { Command } from '../../../../contracts/commands/Command.js';
import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import { GovernancePolicy } from '../../../../contracts/governance/GovernancePolicy.js';
import { globalEventBus } from '../../../../infrastructure/messaging/EventBus.js';
import { globalIdempotencyManager } from '../../../../infrastructure/idempotency/IdempotencyManager.js';
import { PolicyStatus } from '../../domain/value-objects/PolicyStatus.js';
import { InMemoryPolicyRepository } from '../../infrastructure/repositories/InMemoryPolicyRepository.js';

const ENGINE_SLUG = '22-governance';
const PRODUCER = 'engine.22.governance';

const MUTATING_COMMANDS = new Set([
  'RegisterPolicy',
  'DeactivatePolicy',
  'ReactivatePolicy'
]);

/**
 * Default authorized roles for governance management.
 * 'governance_manager' is the Engine 22-specific role.
 * 'system' and 'admin' are cross-engine superuser roles.
 * 'automation' is the cross-engine automation caller role.
 */
const DEFAULT_AUTHORIZED_ROLES = Object.freeze([
  'system',
  'admin',
  'governance_manager',
  'automation'
]);

export class GovernanceApplicationService {
  constructor({
    repository = new InMemoryPolicyRepository(),
    eventBus = globalEventBus,
    idempotencyManager = globalIdempotencyManager,
    clock = () => new Date(),
    authorizedRoles = DEFAULT_AUTHORIZED_ROLES,
    defaultPolicies = []
  } = {}) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.idempotencyManager = idempotencyManager;
    this.clock = clock;
    this.authorizedRoles = Array.isArray(authorizedRoles)
      ? [...authorizedRoles]
      : [...DEFAULT_AUTHORIZED_ROLES];

    // Seed default policies (server-side, not from callers)
    for (const policy of defaultPolicies) {
      if (policy instanceof GovernancePolicy) {
        this.repository.save(policy); // intentionally synchronous seed, no event
      }
    }
  }

  // ─── Governance adapter contract ─────────────────────────────────────────
  // This is the evaluatePolicy interface consumed by ALL other engines.

  /**
   * Evaluate all active policies matching the given command context.
   * Returns { allowed: true } if no active matching policy denies the operation.
   * Returns { allowed: false, reason } on the first denial.
   *
   * @param {{ engine: string, commandType: string, actor: Object, payload: Object }} context
   * @returns {Promise<{ allowed: boolean, reason?: string }>}
   */
  async evaluatePolicy({ engine, commandType, actor, payload }) {
    const context = { engine, commandType, actor, payload };

    // Collect matching active policies from the repository
    const allPolicies = await this.repository.list({ activeOnly: true });
    const matching = allPolicies.filter(
      p => p.target === commandType || p.target === engine || p.target === '*'
    );

    for (const policy of matching) {
      const result = policy.evaluate(context);
      if (!result.allowed) {
        return { allowed: false, reason: result.reason };
      }
    }

    return { allowed: true };
  }

  /**
   * Evaluate compliance against a named target (legacy / direct API).
   * Used by evaluateCompliance() on the GovernanceEngine facade.
   */
  async evaluateCompliance(target, context) {
    const violations = [];
    const allPolicies = await this.repository.list({ activeOnly: true });
    const matching = allPolicies.filter(p => p.target === target || p.target === '*');

    for (const policy of matching) {
      const result = policy.evaluate(context);
      if (!result.allowed) {
        violations.push({
          policyId: policy.policyId,
          policyName: policy.name,
          target,
          reason: result.reason,
          actorId: context.actor?.actorId || 'anonymous',
          timestamp: this.clock().toISOString()
        });
      }
    }

    return { compliant: violations.length === 0, violations };
  }

  // ─── Command entry point ──────────────────────────────────────────────────

  async execute(command) {
    const cmd = command instanceof Command ? command : new Command(command);

    if (cmd.targetEngine !== ENGINE_SLUG || !MUTATING_COMMANDS.has(cmd.commandType)) {
      throw new Error(`Unsupported Governance command: "${cmd.commandType}".`);
    }
    if (!cmd.idempotencyKey) {
      throw new Error(`Governance command "${cmd.commandType}" requires an idempotencyKey.`);
    }
    if (!cmd.actor || !cmd.actor.actorId) {
      throw new Error('Governance commands require an authenticated actor.');
    }

    // Authorization before idempotency and mutation — canonical E15/18/19/20/21 pattern
    this._assertAuthorized(cmd);

    return this.idempotencyManager.executeIdempotent(
      `${ENGINE_SLUG}:${cmd.commandType}:${cmd.idempotencyKey}`,
      async () => this._dispatch(cmd)
      // NOTE: No _assertGovernance here — see META-GOVERNANCE NOTE above
    );
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async getPolicy(policyId) {
    return this.repository.findById(policyId);
  }

  async listPolicies({ activeOnly = false } = {}) {
    return this.repository.list({ activeOnly });
  }

  // ─── Command dispatch ─────────────────────────────────────────────────────

  _dispatch(cmd) {
    switch (cmd.commandType) {
      case 'RegisterPolicy':    return this._handleRegister(cmd);
      case 'DeactivatePolicy':  return this._handleDeactivate(cmd);
      case 'ReactivatePolicy':  return this._handleReactivate(cmd);
      default:
        throw new Error(`Unhandled Governance command: "${cmd.commandType}".`);
    }
  }

  // ─── Command handlers ─────────────────────────────────────────────────────

  async _handleRegister(cmd) {
    const { policyId, name, target, description = '', evaluator } = cmd.payload;

    if (!policyId || typeof policyId !== 'string' || policyId.trim() === '') {
      throw new Error('RegisterPolicy requires a non-empty policyId.');
    }
    if (!name || typeof name !== 'string' || name.trim() === '') {
      throw new Error('RegisterPolicy requires a non-empty name.');
    }
    if (!target || typeof target !== 'string' || target.trim() === '') {
      throw new Error('RegisterPolicy requires a non-empty target.');
    }
    if (typeof evaluator !== 'function') {
      throw new Error('RegisterPolicy requires a server-side evaluator function.');
    }

    // Duplicate policyId rejection
    const existing = await this.repository.findById(policyId.trim());
    if (existing) {
      throw new Error(`Governance policy "${policyId.trim()}" is already registered.`);
    }

    const policy = new GovernancePolicy({
      policyId: policyId.trim(),
      name: name.trim(),
      target: target.trim(),
      evaluator,
      description: typeof description === 'string' ? description.trim() : '',
      active: true
    });

    await this.repository.save(policy);

    await this._emit('econet.governance.policy_registered', {
      policyId: policy.policyId,
      name: policy.name,
      target: policy.target,
      description: policy.description,
      registeredBy: cmd.actor.actorId
    }, {
      actor: cmd.actor,
      subject: { entityId: policy.policyId, entityType: 'governance_policy' },
      correlationId: cmd.correlationId
    });

    return { policy: this._policySnapshot(policy) };
  }

  async _handleDeactivate(cmd) {
    const { policyId } = cmd.payload;
    const policy = await this._requirePolicy(policyId);

    if (!policy.active) {
      throw new Error(`Policy "${policyId}" is already INACTIVE. ${this._invalidTransitionMsg(PolicyStatus.INACTIVE, PolicyStatus.INACTIVE)}`);
    }

    // GovernancePolicy is frozen — create a new instance with active: false
    const deactivated = new GovernancePolicy({
      ...this._policyToConstructorArgs(policy),
      active: false
    });
    await this.repository.save(deactivated);

    await this._emit('econet.governance.policy_deactivated', {
      policyId: deactivated.policyId,
      name: deactivated.name,
      target: deactivated.target,
      deactivatedBy: cmd.actor.actorId
    }, {
      actor: cmd.actor,
      subject: { entityId: deactivated.policyId, entityType: 'governance_policy' },
      correlationId: cmd.correlationId
    });

    return { policy: this._policySnapshot(deactivated) };
  }

  async _handleReactivate(cmd) {
    const { policyId } = cmd.payload;
    const policy = await this._requirePolicy(policyId);

    if (policy.active) {
      throw new Error(`Policy "${policyId}" is already ACTIVE. ${this._invalidTransitionMsg(PolicyStatus.ACTIVE, PolicyStatus.ACTIVE)}`);
    }

    const reactivated = new GovernancePolicy({
      ...this._policyToConstructorArgs(policy),
      active: true
    });
    await this.repository.save(reactivated);

    await this._emit('econet.governance.policy_reactivated', {
      policyId: reactivated.policyId,
      name: reactivated.name,
      target: reactivated.target,
      reactivatedBy: cmd.actor.actorId
    }, {
      actor: cmd.actor,
      subject: { entityId: reactivated.policyId, entityType: 'governance_policy' },
      correlationId: cmd.correlationId
    });

    return { policy: this._policySnapshot(reactivated) };
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  /**
   * Authorization — canonical E15/18/19/20/21 pattern.
   * Missing, null, non-array, or empty roles → denied.
   */
  _assertAuthorized(cmd) {
    const roles = Array.isArray(cmd.actor.roles) ? cmd.actor.roles : [];
    const allowed = roles.some(role => this.authorizedRoles.includes(role));
    if (!allowed) {
      throw new Error(
        `Governance command "${cmd.commandType}" denied: actor "${cmd.actor.actorId}" lacks an authorized governance role.`
      );
    }
  }

  async _requirePolicy(policyId) {
    if (!policyId || typeof policyId !== 'string' || policyId.trim() === '') {
      throw new Error('policyId is required.');
    }
    const policy = await this.repository.findById(policyId.trim());
    if (!policy) {
      throw new Error(`GovernancePolicy not found: "${policyId}".`);
    }
    return policy;
  }

  _policyToConstructorArgs(policy) {
    return {
      policyId: policy.policyId,
      name: policy.name,
      target: policy.target,
      evaluator: policy.evaluator,
      description: policy.description,
      active: policy.active
    };
  }

  _policySnapshot(policy) {
    return {
      policyId: policy.policyId,
      name: policy.name,
      target: policy.target,
      description: policy.description,
      active: policy.active
    };
  }

  _invalidTransitionMsg(from, to) {
    return `Invalid policy status transition: "${from}" -> "${to}".`;
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
