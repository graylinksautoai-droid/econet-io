/**
 * Engine 02: Observation Engine — Observation Entity
 * Pure domain model encapsulating environmental observation lifecycle, evidence, and coordinates.
 */

import { randomUUID } from 'crypto';
import { ObservationStatus, assertObservationTransition } from '../value-objects/ObservationStatus.js';
import { Coordinates } from '../value-objects/Coordinates.js';

export const ObservationCategory = Object.freeze({
  FLOOD: 'FLOOD',
  DROUGHT: 'DROUGHT',
  FIRE: 'FIRE',
  POLLUTION: 'POLLUTION',
  STORM: 'STORM',
  DEFORESTATION: 'DEFORESTATION',
  WILDLIFE: 'WILDLIFE',
  OTHER: 'OTHER'
});

export const ObservationSeverity = Object.freeze({
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  CRITICAL: 'CRITICAL'
});

export const ObservationUrgency = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  IMMEDIATE: 'IMMEDIATE'
});

export class Observation {
  constructor({
    observationId = `obs_${randomUUID().replace(/-/g, '')}`,
    observerId,
    category,
    severity = ObservationSeverity.MODERATE,
    urgency = ObservationUrgency.MEDIUM,
    location,
    description,
    evidence = [],
    status = ObservationStatus.SUBMITTED,
    metadata = {},
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  } = {}) {
    if (typeof observationId !== 'string' || observationId.trim() === '') {
      throw new Error('Observation requires a non-empty observationId.');
    }
    if (typeof observerId !== 'string' || observerId.trim() === '') {
      throw new Error('Observation requires a valid observerId.');
    }
    const normalizedCategory = String(category).trim().toUpperCase();
    if (!Object.values(ObservationCategory).includes(normalizedCategory)) {
      throw new Error(`Invalid observation category: "${category}".`);
    }
    const normalizedSeverity = String(severity).trim().toUpperCase();
    if (!Object.values(ObservationSeverity).includes(normalizedSeverity)) {
      throw new Error(`Invalid observation severity: "${severity}".`);
    }
    const normalizedUrgency = String(urgency).trim().toUpperCase();
    if (!Object.values(ObservationUrgency).includes(normalizedUrgency)) {
      throw new Error(`Invalid observation urgency: "${urgency}".`);
    }
    if (!location || typeof location !== 'object') {
      throw new Error('Observation requires a location object.');
    }
    const coordinates = new Coordinates({
      latitude: location.latitude ?? location.lat,
      longitude: location.longitude ?? location.lon,
      altitude: location.altitude,
      accuracy: location.accuracy
    });

    if (typeof description !== 'string' || description.trim() === '') {
      throw new Error('Observation requires a non-empty description.');
    }
    if (!Array.isArray(evidence)) {
      throw new Error('Observation evidence must be an array.');
    }
    if (!Object.values(ObservationStatus).includes(status)) {
      throw new Error(`Unknown observation status: "${status}".`);
    }

    this.observationId = observationId;
    this.observerId = observerId.trim();
    this.category = normalizedCategory;
    this.severity = normalizedSeverity;
    this.urgency = normalizedUrgency;
    this.location = Object.freeze({
      ...coordinates.toJSON(),
      address: location.address || null,
      city: location.city || null,
      state: location.state || null,
      country: location.country || 'Nigeria'
    });
    this.description = description.trim();
    this.evidence = Object.freeze(evidence.map(e => Object.freeze({ ...e })));
    this.status = status;
    this.metadata = Object.freeze({ ...metadata });
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    Object.freeze(this);
  }

  transitionTo(nextStatus, now = new Date().toISOString()) {
    assertObservationTransition(this.status, nextStatus);
    return new Observation({
      ...this.toJSON(),
      status: nextStatus,
      updatedAt: now
    });
  }

  addEvidence(evidenceItem, now = new Date().toISOString()) {
    if (!evidenceItem || typeof evidenceItem !== 'object') {
      throw new Error('Evidence item must be an object.');
    }
    const updatedEvidence = [...this.evidence, Object.freeze({ ...evidenceItem })];
    return new Observation({
      ...this.toJSON(),
      evidence: updatedEvidence,
      updatedAt: now
    });
  }

  toJSON() {
    return {
      observationId: this.observationId,
      observerId: this.observerId,
      category: this.category,
      severity: this.severity,
      urgency: this.urgency,
      location: this.location,
      description: this.description,
      evidence: this.evidence.map(e => ({ ...e })),
      status: this.status,
      metadata: { ...this.metadata },
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}
