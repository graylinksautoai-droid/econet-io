/**
 * Engine 06: Context Engine — EnvironmentalContext Entity
 * Pure domain model encapsulating fused regional/situational environmental state,
 * boundary metrics, and alert-level lifecycle.
 */

import { randomUUID } from 'crypto';
import {
  ContextAlertLevel,
  assertValidAlertLevel,
  compareAlertLevels
} from '../value-objects/ContextAlertLevel.js';

export class EnvironmentalContext {
  constructor({
    contextId = `ctx_${randomUUID().replace(/-/g, '')}`,
    regionId,
    regionName = null,
    boundary,
    alertLevel = ContextAlertLevel.NORMAL,
    metrics = {},
    contributingEntityIds = [],
    metadata = {},
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  } = {}) {
    if (typeof contextId !== 'string' || contextId.trim() === '') {
      throw new Error('EnvironmentalContext requires a non-empty contextId.');
    }
    if (typeof regionId !== 'string' || regionId.trim() === '') {
      throw new Error('EnvironmentalContext requires a non-empty regionId.');
    }
    if (!boundary || typeof boundary !== 'object') {
      throw new Error('EnvironmentalContext requires a boundary object.');
    }
    const centerLat = Number(boundary.centerLatitude ?? boundary.latitude);
    const centerLon = Number(boundary.centerLongitude ?? boundary.longitude);
    const radiusKm = Number(boundary.radiusKm);
    if (Number.isNaN(centerLat) || centerLat < -90 || centerLat > 90) {
      throw new Error(`Invalid boundary centerLatitude: ${boundary.centerLatitude}.`);
    }
    if (Number.isNaN(centerLon) || centerLon < -180 || centerLon > 180) {
      throw new Error(`Invalid boundary centerLongitude: ${boundary.centerLongitude}.`);
    }
    if (Number.isNaN(radiusKm) || radiusKm <= 0) {
      throw new Error(`Invalid boundary radiusKm: ${boundary.radiusKm}. Must be a positive number.`);
    }
    assertValidAlertLevel(alertLevel);
    if (!Array.isArray(contributingEntityIds)) {
      throw new Error('EnvironmentalContext contributingEntityIds must be an array.');
    }
    if (typeof metrics !== 'object' || metrics === null || Array.isArray(metrics)) {
      throw new Error('EnvironmentalContext metrics must be an object.');
    }

    this.contextId = contextId;
    this.regionId = regionId.trim();
    this.regionName = regionName || null;
    this.boundary = Object.freeze({
      centerLatitude: centerLat,
      centerLongitude: centerLon,
      radiusKm
    });
    this.alertLevel = alertLevel;
    this.metrics = Object.freeze({ ...metrics });
    this.contributingEntityIds = Object.freeze([...new Set(contributingEntityIds)]);
    this.metadata = Object.freeze({ ...metadata });
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    Object.freeze(this);
  }

  /**
   * Produce a new EnvironmentalContext instance transitioned to a new alert level.
   * @param {string} nextLevel
   * @param {string} [now]
   * @returns {EnvironmentalContext}
   */
  changeAlertLevel(nextLevel, now = new Date().toISOString()) {
    assertValidAlertLevel(nextLevel);
    if (nextLevel === this.alertLevel) {
      return this;
    }
    return new EnvironmentalContext({
      ...this.toJSON(),
      alertLevel: nextLevel,
      updatedAt: now
    });
  }

  /**
   * Merge new metrics and contributing entities into the context (e.g. from
   * an Observation or Geospatial cluster event), returning a new instance.
   * @param {Object} newMetrics
   * @param {Array<string>} [newEntityIds]
   * @param {string} [now]
   * @returns {EnvironmentalContext}
   */
  fuseMetrics(newMetrics = {}, newEntityIds = [], now = new Date().toISOString()) {
    return new EnvironmentalContext({
      ...this.toJSON(),
      metrics: { ...this.metrics, ...newMetrics },
      contributingEntityIds: [...this.contributingEntityIds, ...newEntityIds],
      updatedAt: now
    });
  }

  isEscalationFrom(previousLevel) {
    return compareAlertLevels(this.alertLevel, previousLevel) > 0;
  }

  toJSON() {
    return {
      contextId: this.contextId,
      regionId: this.regionId,
      regionName: this.regionName,
      boundary: { ...this.boundary },
      alertLevel: this.alertLevel,
      metrics: { ...this.metrics },
      contributingEntityIds: [...this.contributingEntityIds],
      metadata: { ...this.metadata },
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}
