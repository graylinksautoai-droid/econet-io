/**
 * Engine 24: Learning Engine — InMemoryLearningRepository
 *
 * Isolated in-memory persistence adapter for OutcomeFeedback, AccuracyRecord,
 * and AdaptationRecord aggregates.
 *
 * All three record types are append-only in the learning domain: once recorded
 * they are not modified. This mirrors the audit-log nature of learning data.
 *
 * ISOLATION: private Map instances ensure no state leaks between engine
 * instances, consistent with all other completed EcoNet engine repositories.
 *
 * LIMITATION: in-memory only. All state is lost on process restart. Durable
 * learning data persistence is an acknowledged architectural gap.
 */

export class InMemoryLearningRepository {
  #feedback = new Map();
  #accuracy = new Map();
  #adaptations = new Map();

  // ── OutcomeFeedback ────────────────────────────────────────────────────────

  async saveFeedback(record) {
    if (!record || !record.feedbackId) {
      throw new Error('Cannot save invalid OutcomeFeedback.');
    }
    this.#feedback.set(record.feedbackId, record);
    return record;
  }

  async findFeedbackById(feedbackId) {
    return this.#feedback.get(feedbackId) || null;
  }

  async listFeedback({ sourceEngine = null, sourceType = null } = {}) {
    let results = Array.from(this.#feedback.values());
    if (sourceEngine) results = results.filter(r => r.sourceEngine === sourceEngine);
    if (sourceType) results = results.filter(r => r.sourceType === sourceType);
    return results;
  }

  async countFeedback() {
    return this.#feedback.size;
  }

  // ── AccuracyRecord ─────────────────────────────────────────────────────────

  async saveAccuracy(record) {
    if (!record || !record.recordId) {
      throw new Error('Cannot save invalid AccuracyRecord.');
    }
    this.#accuracy.set(record.recordId, record);
    return record;
  }

  async findAccuracyById(recordId) {
    return this.#accuracy.get(recordId) || null;
  }

  async listAccuracy({ subjectEngine = null, subjectId = null, metricName = null } = {}) {
    let results = Array.from(this.#accuracy.values());
    if (subjectEngine) results = results.filter(r => r.subjectEngine === subjectEngine);
    if (subjectId) results = results.filter(r => r.subjectId === subjectId);
    if (metricName) results = results.filter(r => r.metricName === metricName);
    return results;
  }

  async countAccuracy() {
    return this.#accuracy.size;
  }

  // ── AdaptationRecord ───────────────────────────────────────────────────────

  async saveAdaptation(record) {
    if (!record || !record.adaptationId) {
      throw new Error('Cannot save invalid AdaptationRecord.');
    }
    this.#adaptations.set(record.adaptationId, record);
    return record;
  }

  async findAdaptationById(adaptationId) {
    return this.#adaptations.get(adaptationId) || null;
  }

  async listAdaptations({ subjectEngine = null, subjectId = null } = {}) {
    let results = Array.from(this.#adaptations.values());
    if (subjectEngine) results = results.filter(r => r.subjectEngine === subjectEngine);
    if (subjectId) results = results.filter(r => r.subjectId === subjectId);
    return results;
  }

  async countAdaptations() {
    return this.#adaptations.size;
  }

  // ── Test teardown ──────────────────────────────────────────────────────────

  async clear() {
    this.#feedback.clear();
    this.#accuracy.clear();
    this.#adaptations.clear();
  }
}
