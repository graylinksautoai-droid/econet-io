/**
 * Engine 11: Mission Engine — InMemoryMissionRepository.
 * Isolated in-memory persistence adapter for Mission aggregates.
 * Strictly adheres to database isolation (no shared storage or foreign model access).
 */

export class InMemoryMissionRepository {
  #store = new Map();

  async save(mission) {
    if (!mission || !mission.missionId) {
      throw new Error('Cannot save invalid Mission.');
    }
    this.#store.set(mission.missionId, mission);
    return mission;
  }

  async findById(missionId) {
    return this.#store.get(missionId) || null;
  }

  async findByStatus(status) {
    return Array.from(this.#store.values()).filter(mission => mission.status === status);
  }

  async findActive() {
    return this.findByStatus('ACTIVE');
  }

  async findByPriority(priority) {
    const normalized = String(priority).toUpperCase();
    return Array.from(this.#store.values()).filter(mission => mission.priority === normalized);
  }

  async listAll() {
    return Array.from(this.#store.values());
  }

  async count() {
    return this.#store.size;
  }

  async delete(missionId) {
    return this.#store.delete(missionId);
  }

  async clear() {
    this.#store.clear();
  }
}
