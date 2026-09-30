/**
 * Engine 02: Observation Engine — InMemoryObservationRepository
 * Isolated in-memory persistence adapter for Observation aggregates.
 * Strictly adheres to database isolation (no shared storage or foreign model access).
 */

export class InMemoryObservationRepository {
  #store = new Map();

  async save(observation) {
    if (!observation || !observation.observationId) {
      throw new Error('Cannot save invalid Observation.');
    }
    this.#store.set(observation.observationId, observation);
    return observation;
  }

  async findById(observationId) {
    return this.#store.get(observationId) || null;
  }

  async findByObserverId(observerId) {
    const results = [];
    for (const obs of this.#store.values()) {
      if (obs.observerId === observerId) {
        results.push(obs);
      }
    }
    return results;
  }

  async findByCategory(category) {
    const normalized = String(category).toUpperCase();
    const results = [];
    for (const obs of this.#store.values()) {
      if (obs.category === normalized) {
        results.push(obs);
      }
    }
    return results;
  }

  async findByStatus(status) {
    const results = [];
    for (const obs of this.#store.values()) {
      if (obs.status === status) {
        results.push(obs);
      }
    }
    return results;
  }

  async listAll() {
    return Array.from(this.#store.values());
  }

  async count() {
    return this.#store.size;
  }

  async clear() {
    this.#store.clear();
  }
}
