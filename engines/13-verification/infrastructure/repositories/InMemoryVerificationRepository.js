/**
 * Engine 13: Verification Engine — InMemoryVerificationRepository
 * Isolated in-memory persistence adapter for VerificationClaim aggregates.
 */

export class InMemoryVerificationRepository {
  #claims = new Map();
  #byObservationId = new Map();

  async save(claim) {
    if (!claim || !claim.claimId) {
      throw new Error('Cannot save invalid VerificationClaim.');
    }
    this.#claims.set(claim.claimId, claim);
    this.#byObservationId.set(claim.observationId, claim.claimId);
    return claim;
  }

  async findById(claimId) {
    return this.#claims.get(claimId) || null;
  }

  async findByObservationId(observationId) {
    const claimId = this.#byObservationId.get(observationId);
    if (!claimId) return null;
    return this.#claims.get(claimId) || null;
  }

  async listAll() {
    return Array.from(this.#claims.values());
  }

  async count() {
    return this.#claims.size;
  }

  async clear() {
    this.#claims.clear();
    this.#byObservationId.clear();
  }
}
