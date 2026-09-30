/**
 * Engine 18: Digital Twin Engine — DigitalTwin Entity
 * A formal digital representation of a real-world target entity. A twin has a
 * stable identity, an explicit target association, a lifecycle status, and no
 * implicit connection to arbitrary external resources.
 */

import { randomUUID } from 'crypto';
import { TwinStatus, assertTwinStatusTransition } from '../value-objects/TwinStatus.js';

export class DigitalTwin {
  constructor({
    twinId = `twn_${randomUUID().replace(/-/g, '')}`,
    targetEntityId,
    targetEntityType,
    name,
    description = '',
    status = TwinStatus.DRAFT,
    modelVersion = null,
    representationScope = null,
    createdBy,
    createdAt = new Date().toISOString(),
    updatedAt = createdAt,
    retiredAt = null
  } = {}) {
    if (typeof twinId !== 'string' || twinId.trim() === '') {
      throw new Error('DigitalTwin requires a non-empty twinId.');
    }
    if (typeof targetEntityId !== 'string' || targetEntityId.trim() === '') {
      throw new Error('DigitalTwin requires a non-empty targetEntityId.');
    }
    if (typeof targetEntityType !== 'string' || targetEntityType.trim() === '') {
      throw new Error('DigitalTwin requires a non-empty targetEntityType.');
    }
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('DigitalTwin requires a non-empty name.');
    }
    if (typeof description !== 'string') {
      throw new Error('DigitalTwin description must be a string.');
    }
    if (!Object.values(TwinStatus).includes(status)) {
      throw new Error(`Unknown twin status: "${status}".`);
    }
    if (status === TwinStatus.RETIRED && !retiredAt) {
      throw new Error('RETIRED twin requires retiredAt timestamp.');
    }

    this.twinId = twinId;
    this.targetEntityId = targetEntityId.trim();
    this.targetEntityType = targetEntityType.trim();
    this.name = name.trim();
    this.description = description.trim();
    this.status = status;
    this.modelVersion = modelVersion;
    this.representationScope = representationScope || null;
    this.createdBy = createdBy || null;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.retiredAt = retiredAt || null;
    Object.freeze(this);
  }

  transitionTo(nextStatus, now = new Date().toISOString()) {
    assertTwinStatusTransition(this.status, nextStatus);
    return new DigitalTwin({
      ...this.toJSON(),
      status: nextStatus,
      updatedAt: now,
      retiredAt: nextStatus === TwinStatus.RETIRED ? now : this.retiredAt
    });
  }

  attachModel(modelVersion, now = new Date().toISOString()) {
    return new DigitalTwin({ ...this.toJSON(), modelVersion, updatedAt: now });
  }

  toJSON() {
    return {
      twinId: this.twinId,
      targetEntityId: this.targetEntityId,
      targetEntityType: this.targetEntityType,
      name: this.name,
      description: this.description,
      status: this.status,
      modelVersion: this.modelVersion,
      representationScope: this.representationScope,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      retiredAt: this.retiredAt
    };
  }
}