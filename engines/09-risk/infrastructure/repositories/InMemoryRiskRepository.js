/**
 * Engine 09: Risk Engine — InMemoryRiskRepository
 * Isolated in-memory persistence adapter for RiskAssessment aggregates and
 * hazard escalation threshold configuration.
 * Strictly adheres to database isolation (no shared storage or foreign model access).
 */

export class InMemoryRiskRepository {
  #assessments = new Map();
  #thresholds = new Map();

  // --- RiskAssessment aggregate persistence ---

  async save(assessment) {
    if (!assessment || !assessment.assessmentId) {
      throw new Error('Cannot save invalid RiskAssessment.');
    }
    this.#assessments.set(assessment.assessmentId, assessment);
    return assessment;
  }

  async findById(assessmentId) {
    return this.#assessments.get(assessmentId) || null;
  }

  async findBySubjectId(subjectId) {
    const results = [];
    for (const assessment of this.#assessments.values()) {
      if (assessment.subjectId === subjectId) {
        results.push(assessment);
      }
    }
    return results;
  }

  async findByHazardType(hazardType) {
    const normalized = String(hazardType).toUpperCase();
    const results = [];
    for (const assessment of this.#assessments.values()) {
      if (assessment.hazardType === normalized) {
        results.push(assessment);
      }
    }
    return results;
  }

  async findByStatus(status) {
    const results = [];
    for (const assessment of this.#assessments.values()) {
      if (assessment.status === status) {
        results.push(assessment);
      }
    }
    return results;
  }

  async findActive() {
    const results = [];
    for (const assessment of this.#assessments.values()) {
      if (assessment.status !== 'CLOSED') {
        results.push(assessment);
      }
    }
    return results;
  }

  async listAll() {
    return Array.from(this.#assessments.values());
  }

  async count() {
    return this.#assessments.size;
  }

  async delete(assessmentId) {
    return this.#assessments.delete(assessmentId);
  }

  async clear() {
    this.#assessments.clear();
  }

  // --- Threshold configuration persistence ---

  async saveThreshold(thresholdKey, minimumLevel) {
    if (typeof thresholdKey !== 'string' || thresholdKey.trim() === '') {
      throw new Error('Cannot save threshold with an invalid key.');
    }
    this.#thresholds.set(thresholdKey, minimumLevel);
    return { thresholdKey, minimumLevel };
  }

  async getThreshold(thresholdKey) {
    return this.#thresholds.get(thresholdKey) || null;
  }

  async listThresholds() {
    return Array.from(this.#thresholds.entries()).map(([thresholdKey, minimumLevel]) => ({
      thresholdKey,
      minimumLevel
    }));
  }

  async clearThresholds() {
    this.#thresholds.clear();
  }
}