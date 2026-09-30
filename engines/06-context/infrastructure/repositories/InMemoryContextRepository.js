/**
 * Engine 06: Context Engine — InMemoryContextRepository
 * Isolated in-memory persistence adapter for EnvironmentalContext aggregates.
 * Strictly adheres to database isolation (no shared storage or foreign model access).
 */

export class InMemoryContextRepository {
  #store = new Map();

  async save(context) {
    if (!context || !context.contextId) {
      throw new Error('Cannot save invalid EnvironmentalContext.');
    }
    this.#store.set(context.contextId, context);
    return context;
  }

  async findById(contextId) {
    return this.#store.get(contextId) || null;
  }

  async findByRegionId(regionId) {
    for (const context of this.#store.values()) {
      if (context.regionId === regionId) {
        return context;
      }
    }
    return null;
  }

  async findInRegion({ latitude, longitude, radiusKm } = {}) {
    const results = [];
    for (const context of this.#store.values()) {
      const dLat = context.boundary.centerLatitude - latitude;
      const dLon = context.boundary.centerLongitude - longitude;
      const approxDistanceKm = Math.sqrt(dLat * dLat + dLon * dLon) * 111.32;
      if (approxDistanceKm <= (radiusKm ?? context.boundary.radiusKm)) {
        results.push(context);
      }
    }
    return results;
  }

  async findByAlertLevel(alertLevel) {
    const results = [];
    for (const context of this.#store.values()) {
      if (context.alertLevel === alertLevel) {
        results.push(context);
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
