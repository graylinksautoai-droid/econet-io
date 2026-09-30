/**
 * Engine 22: Governance Engine — EcoNet IO 24-Engine Canon
 *
 * Mission: System policies, operational constraints, compliance checks, and
 * decentralized rule enforcement.
 *
 * DUAL ROLE:
 * 1. Policy management — register, deactivate, and reactivate governance
 *    policies via the canonical Command interface.
 * 2. Governance adapter — concrete implementation of the evaluatePolicy
 *    contract consumed by ALL other EcoNet engines (09–21 and beyond).
 *
 * GOVERNANCE ADAPTER USAGE:
 *   const governance = new GovernanceEngine({ /* options *\/ });
 *   await governance.evaluatePolicy({ engine, commandType, actor, payload });
 *   // → { allowed: boolean, reason?: string }
 *
 * This engine also preserves the legacy GovernanceEngine public API
 * (registerPolicy, evaluateCompliance, createCommandMiddleware, getViolations,
 * getPolicies) for backward compatibility with any consumers that used the
 * pre-existing stub.
 */

import { GovernanceApplicationService } from './application/services/GovernanceApplicationService.js';
import { InMemoryPolicyRepository } from './infrastructure/repositories/InMemoryPolicyRepository.js';
import { GovernancePolicy } from '../../contracts/governance/GovernancePolicy.js';

export const ENGINE_ID = '22';
export const ENGINE_NAME = 'Governance Engine';

export class GovernanceEngine {
  constructor(options = {}) {
    this.engineId = ENGINE_ID;
    this.engineName = ENGINE_NAME;
    this._service = options.service || new GovernanceApplicationService(options);
    this._repository = this._service.repository;
  }

  get service() { return this._service; }
  get repository() { return this._repository; }

  // ─── Governance adapter contract (consumed by all other engines) ──────────

  /**
   * Evaluate all active policies matching the given command context.
   * This is the canonical governance adapter method.
   *
   * @param {{ engine: string, commandType: string, actor: Object, payload: Object }} context
   * @returns {Promise<{ allowed: boolean, reason?: string }>}
   */
  async evaluatePolicy(context) {
    return this._service.evaluatePolicy(context);
  }

  // ─── Command execution ────────────────────────────────────────────────────

  async executeCommand(command) {
    return this._service.execute(command);
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async getPolicy(policyId) {
    return this._service.getPolicy(policyId);
  }

  async listPolicies(filter) {
    return this._service.listPolicies(filter);
  }

  // ─── Legacy / direct API (preserved from original stub) ──────────────────

  /**
   * Register a governance policy directly (without the Command envelope).
   * Preserved for legacy callers and server-side default policy seeding.
   * @param {GovernancePolicy} policy
   */
  registerPolicy(policy) {
    if (!(policy instanceof GovernancePolicy)) {
      throw new Error('GovernanceEngine requires an instance of GovernancePolicy.');
    }
    // Synchronous registration path (no Command, no auth, server-side only)
    this._repository.save(policy);
    return policy;
  }

  /**
   * Evaluate compliance against a named target (legacy API).
   * @param {string} target
   * @param {Object} context
   */
  async evaluateCompliance(target, context) {
    return this._service.evaluateCompliance(target, context);
  }

  /**
   * Create CommandBus middleware that enforces governance on every command.
   */
  createCommandMiddleware() {
    return async (command, next) => {
      const evaluation = await this.evaluateCompliance(command.commandType, {
        actor: command.actor,
        payload: command.payload,
        metadata: { correlationId: command.correlationId }
      });

      if (!evaluation.compliant) {
        const reasons = evaluation.violations.map(v => `${v.policyName}: ${v.reason}`).join('; ');
        throw new Error(`Governance Compliance Violation: ${reasons}`);
      }

      return next(command);
    };
  }

  /**
   * Return all recorded compliance violations (from evaluateCompliance calls).
   * NOTE: evaluatePolicy() calls do not record violations here — they return
   * the result directly to the calling engine. Only evaluateCompliance() calls
   * accumulate a violation history on the service.
   */
  getViolations() {
    // Violations from direct evaluateCompliance calls are tracked internally.
    // This method is preserved for legacy compatibility.
    return this._service._complianceViolations ?? [];
  }

  /**
   * Return all registered policies.
   */
  async getPolicies() {
    return this._repository.list();
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async initialize() {
    return { ready: true, engineId: ENGINE_ID, name: ENGINE_NAME };
  }

  async healthCheck() {
    const totalPolicies = await this._repository.count();
    const activePolicies = await this._repository.countActive();
    return {
      healthy: true,
      engineId: ENGINE_ID,
      details: {
        status: 'READY',
        persistence: 'IN_MEMORY_GOVERNANCE_ADAPTER',
        totalPolicies,
        activePolicies
      }
    };
  }

  async shutdown() {}
}

export const governanceEngine = new GovernanceEngine();
export default governanceEngine;

// Named exports for consumers and test fixtures
export { GovernanceApplicationService } from './application/services/GovernanceApplicationService.js';
export { InMemoryPolicyRepository } from './infrastructure/repositories/InMemoryPolicyRepository.js';
export { GovernancePolicy } from '../../contracts/governance/GovernancePolicy.js';
export {
  PolicyStatus,
  canTransitionPolicyStatus,
  assertPolicyStatusTransition
} from './domain/value-objects/PolicyStatus.js';
