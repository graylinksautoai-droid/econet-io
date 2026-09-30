/**
 * Engine 22: Governance Engine — InMemoryPolicyRepository
 *
 * Isolated in-memory persistence adapter for GovernancePolicy records.
 *
 * NOTE: GovernancePolicy instances are frozen objects (Object.freeze in the
 * contract). The repository stores them directly; updates replace the entry.
 *
 * ISOLATION: private Map instances ensure no state leaks between engine
 * instances, consistent with all other completed EcoNet engine repositories.
 *
 * LIMITATION: in-memory only. All state is lost on process restart. Durable
 * policy persistence is an acknowledged architectural gap; no canonical
 * persistent schema was supplied.
 */

export class InMemoryPolicyRepository {
  #policies = new Map();

  async save(policy) {
    if (!policy || !policy.policyId) {
      throw new Error('Cannot save invalid GovernancePolicy: missing policyId.');
    }
    this.#policies.set(policy.policyId, policy);
    return policy;
  }

  async findById(policyId) {
    return this.#policies.get(policyId) || null;
  }

  async findByTarget(target) {
    const results = [];
    for (const policy of this.#policies.values()) {
      if (policy.target === target || policy.target === '*') {
        results.push(policy);
      }
    }
    return results;
  }

  async list({ activeOnly = false } = {}) {
    let results = Array.from(this.#policies.values());
    if (activeOnly) results = results.filter(p => p.active === true);
    return results;
  }

  async count() {
    return this.#policies.size;
  }

  async countActive() {
    let count = 0;
    for (const p of this.#policies.values()) {
      if (p.active) count++;
    }
    return count;
  }

  async clear() {
    this.#policies.clear();
  }
}
