/**
 * Engine 07: Geospatial Engine — InMemoryGeospatialIndex
 * Isolated in-memory spatial index repository.
 */

import { GeoPoint } from '../../domain/entities/GeoPoint.js';

export class InMemoryGeospatialIndex {
  #points = new Map();
  #geofences = new Map();

  async insertPoint(point) {
    if (!(point instanceof GeoPoint)) {
      throw new Error('Can only insert GeoPoint instances.');
    }
    this.#points.set(point.pointId, point);
    return point;
  }

  async getPoint(pointId) {
    return this.#points.get(pointId) || null;
  }

  async findByEntityId(entityId) {
    const results = [];
    for (const p of this.#points.values()) {
      if (p.entityId === entityId) {
        results.push(p);
      }
    }
    return results;
  }

  async findInRadius(latitude, longitude, radiusKm) {
    const center = new GeoPoint({
      latitude,
      longitude,
      entityId: 'center_query_temp'
    });

    const matches = [];
    for (const p of this.#points.values()) {
      const distance = center.distanceTo(p);
      if (distance <= radiusKm) {
        matches.push({
          point: p.toJSON(),
          distanceKm: Number(distance.toFixed(4))
        });
      }
    }

    return matches.sort((a, b) => a.distanceKm - b.distanceKm);
  }

  async listAll() {
    return Array.from(this.#points.values());
  }

  async saveGeofence(geofence) {
    if (!geofence || !geofence.geofenceId) {
      throw new Error('Geofence requires a valid geofenceId.');
    }
    this.#geofences.set(geofence.geofenceId, Object.freeze({ ...geofence }));
    return geofence;
  }

  async getGeofence(geofenceId) {
    return this.#geofences.get(geofenceId) || null;
  }

  async clear() {
    this.#points.clear();
    this.#geofences.clear();
  }
}
