/**
 * Engine 18: Digital Twin Engine — TwinState Entity
 * An accepted, versioned snapshot of a twin's represented state. Every state
 * references its twin, its observedAt/ acceptedAt timestamps, the model version
 * that produced it, its property values, and source provenance. Historical
 * states are never silently overwritten; updates create new state versions.
 */

import { randomUUID } from 'crypto';

export class TwinState {
  constructor({
    stateId = `stt_${randomUUID().replace(/-/g, '')}`,
    twinId,
    stateVersion = 1,
    observedAt,
    acceptedAt,
    modelVersion,
    properties = {},
    synchronizationStatus = 'CURRENT',
    sourceReferences = [],
    createdBy = null
  } = {}) {
    if (typeof stateId !== 'string' || stateId.trim() === '') {
      throw new Error('TwinState requires a non-empty stateId.');
    }
    if (typeof twinId !== 'string' || twinId.trim() === '') {
      throw new Error('TwinState requires a non-empty twinId.');
    }
    if (typeof stateVersion !== 'number' || stateVersion < 1) {
      throw new Error(`Invalid stateVersion: "${stateVersion}". Must be >= 1.`);
    }
    if (typeof observedAt !== 'string' || Number.isNaN(Date.parse(observedAt))) {
      throw new Error('TwinState requires a valid observedAt ISO-8601 string.');
    }
    if (typeof acceptedAt !== 'string' || Number.isNaN(Date.parse(acceptedAt))) {
      throw new Error('TwinState requires a valid acceptedAt ISO-8601 string.');
    }
    if (typeof modelVersion !== 'string' || modelVersion.trim() === '') {
      throw new Error('TwinState requires a non-empty modelVersion.');
    }
    if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) {
      throw new Error('TwinState properties must be an object.');
    }
    if (!Array.isArray(sourceReferences)) {
      throw new Error('TwinState sourceReferences must be an array.');
    }

    this.stateId = stateId;
    this.twinId = twinId.trim();
    this.stateVersion = stateVersion;
    this.observedAt = observedAt;
    this.acceptedAt = acceptedAt;
    this.modelVersion = modelVersion.trim();
    this.properties = Object.freeze({ ...properties });
    this.synchronizationStatus = synchronizationStatus;
    this.sourceReferences = Object.freeze(sourceReferences.map(s => Object.freeze({ ...s })));
    this.createdBy = createdBy || null;
    Object.freeze(this);
  }

  toJSON() {
    return {
      stateId: this.stateId,
      twinId: this.twinId,
      stateVersion: this.stateVersion,
      observedAt: this.observedAt,
      acceptedAt: this.acceptedAt,
      modelVersion: this.modelVersion,
      properties: { ...this.properties },
      synchronizationStatus: this.synchronizationStatus,
      sourceReferences: this.sourceReferences.map(s => ({ ...s })),
      createdBy: this.createdBy
    };
  }
}