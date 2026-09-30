/**
 * Engine 18: Digital Twin Engine — InMemoryDigitalTwinRepository
 * Isolated in-memory persistence adapter for DigitalTwin, TwinModel, TwinState,
 * and SynchronizationRecord aggregates. Historical state versions are retained.
 */

export class InMemoryDigitalTwinRepository {
  #twins = new Map();
  #models = new Map();       // modelId -> TwinModel
  #modelsByTwin = new Map(); // twinId -> Map<modelVersion, TwinModel>
  #states = new Map();       // stateId -> TwinState
  #statesByTwin = new Map(); // twinId -> Array<TwinState> (ordered by version)
  #currentState = new Map(); // twinId -> TwinState
  #syncRecords = new Map();  // recordId -> SynchronizationRecord

  // ---- Twins ----

  async saveTwin(twin) {
    if (!twin || !twin.twinId) {
      throw new Error('Cannot save invalid DigitalTwin.');
    }
    this.#twins.set(twin.twinId, twin);
    return twin;
  }

  async findTwinById(twinId) {
    return this.#twins.get(twinId) || null;
  }

  async findTwinsByTargetEntity(targetEntityId) {
    const results = [];
    for (const twin of this.#twins.values()) {
      if (twin.targetEntityId === targetEntityId) {
        results.push(twin);
      }
    }
    return results;
  }

  async listTwins({ status = null } = {}) {
    let results = Array.from(this.#twins.values());
    if (status) results = results.filter(t => t.status === status);
    return results;
  }

  async countTwins() {
    return this.#twins.size;
  }

  // ---- Models ----

  async saveModel(model) {
    if (!model || !model.modelId) {
      throw new Error('Cannot save invalid TwinModel.');
    }
    this.#models.set(model.modelId, model);
    if (!this.#modelsByTwin.has(model.twinId)) {
      this.#modelsByTwin.set(model.twinId, new Map());
    }
    this.#modelsByTwin.get(model.twinId).set(model.modelVersion, model);
    return model;
  }

  async findModelById(modelId) {
    return this.#models.get(modelId) || null;
  }

  async findModelByVersion(twinId, modelVersion) {
    const byTwin = this.#modelsByTwin.get(twinId);
    return (byTwin && byTwin.get(modelVersion)) || null;
  }

  async listModelsByTwin(twinId) {
    const byTwin = this.#modelsByTwin.get(twinId);
    return byTwin ? Array.from(byTwin.values()) : [];
  }

  // ---- States ----

  async saveState(state) {
    if (!state || !state.stateId) {
      throw new Error('Cannot save invalid TwinState.');
    }
    this.#states.set(state.stateId, state);
    if (!this.#statesByTwin.has(state.twinId)) {
      this.#statesByTwin.set(state.twinId, []);
    }
    const history = this.#statesByTwin.get(state.twinId);
    const existingIndex = history.findIndex(s => s.stateVersion === state.stateVersion);
    if (existingIndex === -1) {
      history.push(state);
    } else {
      history[existingIndex] = state;
    }
    history.sort((a, b) => a.stateVersion - b.stateVersion);
    const latest = history[history.length - 1];
    this.#currentState.set(state.twinId, latest);
    return state;
  }

  async findStateById(stateId) {
    return this.#states.get(stateId) || null;
  }

  async getCurrentState(twinId) {
    return this.#currentState.get(twinId) || null;
  }

  async getStateHistory(twinId) {
    return this.#statesByTwin.get(twinId) || [];
  }

  // ---- Synchronization records ----

  async saveSyncRecord(record) {
    if (!record || !record.recordId) {
      throw new Error('Cannot save invalid SynchronizationRecord.');
    }
    this.#syncRecords.set(record.recordId, record);
    return record;
  }

  async listSyncRecords(twinId) {
    const results = [];
    for (const record of this.#syncRecords.values()) {
      if (record.twinId === twinId) {
        results.push(record);
      }
    }
    return results;
  }

  async clear() {
    this.#twins.clear();
    this.#models.clear();
    this.#modelsByTwin.clear();
    this.#states.clear();
    this.#statesByTwin.clear();
    this.#currentState.clear();
    this.#syncRecords.clear();
  }
}