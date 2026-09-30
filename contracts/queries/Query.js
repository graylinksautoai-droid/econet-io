/**
 * EcoNet IO Canonical Query Contract
 * Side-effect-free requests for data from a target engine.
 */

import { randomUUID } from 'crypto';

export class Query {
  /**
   * @param {Object} params
   * @param {string} params.queryType - e.g. 'GetActorById', 'GetObservationById'
   * @param {string} params.targetEngine - e.g. '01-identity', '02-observation'
   * @param {Object} [params.parameters={}] - Query parameter object
   * @param {Object} [params.actor] - Actor executing query
   * @param {string} [params.correlationId]
   * @param {string} [params.queryId]
   * @param {string} [params.issuedAt]
   */
  constructor({
    queryType,
    targetEngine,
    parameters = {},
    actor = null,
    correlationId = null,
    queryId = null,
    issuedAt = null
  }) {
    if (!queryType || typeof queryType !== 'string') {
      throw new Error('Query requires a valid string "queryType".');
    }
    if (!targetEngine || typeof targetEngine !== 'string') {
      throw new Error('Query requires a valid string "targetEngine".');
    }
    if (parameters === null || typeof parameters !== 'object') {
      throw new Error('Query requires an object "parameters".');
    }

    this.queryId = queryId || `qry_${randomUUID().replace(/-/g, '')}`;
    this.queryType = queryType;
    this.targetEngine = targetEngine;
    this.issuedAt = issuedAt || new Date().toISOString();
    this.actor = actor ? Object.freeze({ ...actor }) : null;
    this.correlationId = correlationId || `cor_${randomUUID().replace(/-/g, '')}`;
    this.parameters = Object.freeze({ ...parameters });

    Object.freeze(this);
  }

  toJSON() {
    return {
      queryId: this.queryId,
      queryType: this.queryType,
      targetEngine: this.targetEngine,
      issuedAt: this.issuedAt,
      actor: this.actor,
      correlationId: this.correlationId,
      parameters: this.parameters
    };
  }
}
