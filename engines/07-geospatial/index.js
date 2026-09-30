/**
 * Engine 07: Geospatial Engine — EcoNet IO 24-Engine Canon
 * Mission: Coordinates, spatial indexing, geometries, geofences, topology, and spatial relationship queries.
 */

import { GeospatialApplicationService } from './application/services/GeospatialApplicationService.js';

export const ENGINE_ID = '07';
export const ENGINE_NAME = 'Geospatial Engine';

export class GeospatialEngine {
  constructor(options = {}) {
    this.engineId = ENGINE_ID;
    this.engineName = ENGINE_NAME;
    this._service = options.service || new GeospatialApplicationService(options);
  }

  async executeCommand(command) {
    return this._service.execute(command);
  }

  async findNearby(latitude, longitude, radiusKm = 10) {
    return this._service.findNearby(latitude, longitude, radiusKm);
  }

  async detectClusters(options = {}) {
    return this._service.detectClusters(options);
  }

  async initialize() {
    return { ready: true, engineId: ENGINE_ID, name: ENGINE_NAME };
  }

  async healthCheck() {
    return {
      healthy: true,
      engineId: ENGINE_ID,
      details: { status: 'READY', persistence: 'IN_MEMORY_GEOSPATIAL_INDEX' }
    };
  }

  async shutdown() {}
}

export const geospatialEngine = new GeospatialEngine();
export default geospatialEngine;

export { GeospatialApplicationService } from './application/services/GeospatialApplicationService.js';
export { InMemoryGeospatialIndex } from './infrastructure/repositories/InMemoryGeospatialIndex.js';
export { GeoPoint } from './domain/entities/GeoPoint.js';
export { SpatialClusterDetector } from './domain/services/SpatialClusterDetector.js';
