/**
 * Engine 10: Prediction Engine — InMemoryPredictionRepository.
 * Isolated in-memory persistence adapter for EnvironmentalPrediction aggregates.
 */

export class InMemoryPredictionRepository {
  #store = new Map();

  async save(prediction) {
    if (!prediction || !prediction.predictionId) {
      throw new Error('Cannot save invalid EnvironmentalPrediction.');
    }
    this.#store.set(prediction.predictionId, prediction);
    return prediction;
  }

  async findById(predictionId) {
    return this.#store.get(predictionId) || null;
  }

  async findBySubjectId(subjectId) {
    return Array.from(this.#store.values()).filter(prediction => prediction.subjectId === subjectId);
  }

  async findByStatus(status) {
    return Array.from(this.#store.values()).filter(prediction => prediction.status === status);
  }

  async findActive() {
    return this.findByStatus('ACTIVE');
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