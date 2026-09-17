/**
 * Engine 12: Action Engine — InMemoryActionRepository
 * Isolated in-memory repository for ActionDispatch logs and history.
 */

export class InMemoryActionRepository {
  #dispatches = new Map();

  async save(dispatch) {
    if (!dispatch || !dispatch.dispatchId) {
      throw new Error('Cannot save invalid ActionDispatch.');
    }
    this.#dispatches.set(dispatch.dispatchId, dispatch);
    return dispatch;
  }

  async findById(dispatchId) {
    return this.#dispatches.get(dispatchId) || null;
  }

  async findByTarget(target) {
    const results = [];
    for (const d of this.#dispatches.values()) {
      if (d.target === target) {
        results.push(d);
      }
    }
    return results;
  }

  async listAll() {
    return Array.from(this.#dispatches.values());
  }

  async count() {
    return this.#dispatches.size;
  }

  async clear() {
    this.#dispatches.clear();
  }
}
