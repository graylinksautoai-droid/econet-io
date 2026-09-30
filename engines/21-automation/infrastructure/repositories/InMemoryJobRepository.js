/**
 * Engine 21: Automation Engine — InMemoryJobRepository
 *
 * Isolated in-memory persistence adapter for BackgroundJob records.
 *
 * IMMUTABILITY CONVENTION: Each save() overwrites the record for that jobId.
 * The application service snapshots state before saving, so callers should
 * treat saved records as the latest-known state at save time.
 *
 * HISTORY: Completed and dead-letter jobs are retained — they are never
 * deleted from this store. clear() is available for test teardown only.
 *
 * ISOLATION: private Map instances ensure no state leaks between engine
 * instances, consistent with all other completed EcoNet engine repositories.
 *
 * LIMITATION: in-memory only. All state is lost on process restart. Durable
 * job persistence and scheduling infrastructure are acknowledged architectural
 * gaps; no canonical persistent schema was supplied.
 */

export class InMemoryJobRepository {
  #jobs = new Map();

  async save(job) {
    if (!job || !job.jobId) {
      throw new Error('Cannot save invalid BackgroundJob: missing jobId.');
    }
    // Store a plain snapshot so callers cannot mutate what we hold
    this.#jobs.set(job.jobId, { ...job, payload: { ...job.payload } });
    return job;
  }

  async findById(jobId) {
    return this.#jobs.get(jobId) || null;
  }

  async list({ status = null, taskType = null } = {}) {
    let results = Array.from(this.#jobs.values());
    if (status) results = results.filter(j => j.status === status);
    if (taskType) results = results.filter(j => j.taskType === taskType);
    return results;
  }

  async countByStatus(status) {
    let count = 0;
    for (const job of this.#jobs.values()) {
      if (job.status === status) count++;
    }
    return count;
  }

  async count() {
    return this.#jobs.size;
  }

  async clear() {
    this.#jobs.clear();
  }
}
