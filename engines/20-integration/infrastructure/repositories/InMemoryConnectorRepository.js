/**
 * Engine 20: Integration Engine — InMemoryConnectorRepository
 *
 * Isolated in-memory persistence adapter for ExternalConnector aggregates.
 * Connector history is retained: retiring a connector does not delete it.
 *
 * ISOLATION: private Map instances ensure no state leaks between engine
 * instances, consistent with all other completed EcoNet engine repositories.
 *
 * LIMITATION: in-memory only. All state is lost on process restart. Durable
 * storage and its migration are an acknowledged architectural gap; no
 * persistent schema was supplied in the canonical specification.
 */

export class InMemoryConnectorRepository {
  #connectors = new Map();

  // ---- Connectors ----

  async save(connector) {
    if (!connector || !connector.connectorId) {
      throw new Error('Cannot save invalid ExternalConnector.');
    }
    this.#connectors.set(connector.connectorId, connector);
    return connector;
  }

  async findById(connectorId) {
    return this.#connectors.get(connectorId) || null;
  }

  async findByName(name) {
    for (const connector of this.#connectors.values()) {
      if (connector.name === name) return connector;
    }
    return null;
  }

  async list({ connectorType = null, status = null } = {}) {
    let results = Array.from(this.#connectors.values());
    if (connectorType) results = results.filter(c => c.connectorType === connectorType);
    if (status) results = results.filter(c => c.status === status);
    return results;
  }

  async count() {
    return this.#connectors.size;
  }

  async clear() {
    this.#connectors.clear();
  }
}
