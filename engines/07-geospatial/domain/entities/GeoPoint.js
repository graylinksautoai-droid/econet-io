/**
 * Engine 07: Geospatial Engine — GeoPoint Domain Entity
 * Encapsulates geographic coordinates, metadata, and Haversine distance calculations.
 */

import { randomUUID } from 'crypto';

const EARTH_RADIUS_KM = 6371;

export class GeoPoint {
  constructor({
    pointId = `geo_${randomUUID().replace(/-/g, '')}`,
    latitude,
    longitude,
    entityId,
    entityType = 'observation',
    category = null,
    timestamp = new Date().toISOString(),
    metadata = {}
  } = {}) {
    const lat = Number(latitude);
    const lon = Number(longitude);

    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      throw new Error(`Invalid latitude: ${latitude}. Must be a number between -90 and 90.`);
    }
    if (Number.isNaN(lon) || lon < -180 || lon > 180) {
      throw new Error(`Invalid longitude: ${longitude}. Must be a number between -180 and 180.`);
    }
    if (!entityId || typeof entityId !== 'string') {
      throw new Error('GeoPoint requires a valid entityId string.');
    }

    this.pointId = pointId;
    this.latitude = lat;
    this.longitude = lon;
    this.entityId = entityId.trim();
    this.entityType = entityType;
    this.category = category ? String(category).toUpperCase() : null;
    this.timestamp = timestamp;
    this.metadata = Object.freeze({ ...metadata });
    Object.freeze(this);
  }

  distanceTo(other) {
    if (!other || typeof other.latitude !== 'number' || typeof other.longitude !== 'number') {
      throw new Error('Target for distance calculation must have latitude and longitude.');
    }

    const dLat = ((other.latitude - this.latitude) * Math.PI) / 180;
    const dLon = ((other.longitude - this.longitude) * Math.PI) / 180;
    const lat1 = (this.latitude * Math.PI) / 180;
    const lat2 = (other.latitude * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
  }

  toJSON() {
    return {
      pointId: this.pointId,
      latitude: this.latitude,
      longitude: this.longitude,
      entityId: this.entityId,
      entityType: this.entityType,
      category: this.category,
      timestamp: this.timestamp,
      metadata: { ...this.metadata }
    };
  }
}
