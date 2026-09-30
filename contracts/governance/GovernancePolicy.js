/**
 * EcoNet IO Governance Policy Contract
 * Standard representation of platform governance policies and compliance rules.
 */

export class GovernancePolicy {
  /**
   * @param {Object} params
   * @param {string} params.policyId - Unique policy ID (e.g. 'POL_SENTINEL_THRESHOLD')
   * @param {string} params.name - Human-readable policy name
   * @param {string} params.target - Command type, event type, or domain scope
   * @param {Function} params.evaluator - Function(context) => { allowed: boolean, reason?: string }
   * @param {string} [params.description]
   * @param {boolean} [params.active=true]
   */
  constructor({
    policyId,
    name,
    target,
    evaluator,
    description = '',
    active = true
  }) {
    if (!policyId || typeof policyId !== 'string') {
      throw new Error('GovernancePolicy requires a valid policyId string.');
    }
    if (!name || typeof name !== 'string') {
      throw new Error('GovernancePolicy requires a valid name string.');
    }
    if (!target || typeof target !== 'string') {
      throw new Error('GovernancePolicy requires a valid target string.');
    }
    if (typeof evaluator !== 'function') {
      throw new Error('GovernancePolicy requires an evaluator function.');
    }

    this.policyId = policyId;
    this.name = name;
    this.target = target;
    this.evaluator = evaluator;
    this.description = description;
    this.active = active;

    Object.freeze(this);
  }

  evaluate(context) {
    if (!this.active) {
      return { allowed: true, policyId: this.policyId, reason: 'Policy inactive' };
    }
    const result = this.evaluator(context);
    return {
      allowed: Boolean(result.allowed),
      policyId: this.policyId,
      reason: result.reason || (result.allowed ? 'Policy passed' : 'Policy violation')
    };
  }
}
