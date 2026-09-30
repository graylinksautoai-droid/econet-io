/**
 * Engine 07: Geospatial Engine — GeospatialApplicationService
 * Coordinates spatial point indexing, proximity queries, and cluster detection.
 */

import { Command } from '../../../../contracts/commands/Command.js';
import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import { globalEventBus } from '../../../../infrastructure/messaging/EventBus.js';
import { globalIdempotencyManager } from '../../../../infrastructure/idempotency/IdempotencyManager.js';
import { GeoPoint } from '../../domain/entities/GeoPoint.js';
import { SpatialClusterDetector } from '../../domain/services/SpatialClusterDetector.js';
import { InMemoryGeospatialIndex } from '../../infrastructure/repositories/InMemoryGeospatialIndex.js';

const ENGINE_SLUG = '07-geospatial';
const PRODUCER = 'engine.07.geospatial';

const MUTATING_COMMANDS = new Set([
  'IndexSpatialPoint',
  'DefineGeofence'
]);

export class GeospatialApplicationService {
  constructor({
    repository = new InMemoryGeospatialIndex(),
    clusterDetector = new SpatialClusterDetector(),
    eventBus = globalEventBus,
    idempotencyManager = globalIdempotencyManager,
    governance = null,
    clock = () => new Date()
  } = {}) {
    this.repository = repository;
    this.clusterDetector = clusterDetector;
    this.eventBus = eventBus;
    this.idempotencyManager = idempotencyManager;
    this.governance = governance;
    this.clock = clock;
  }

  async execute(command) {
    const cmd = command instanceof Command ? command : new Command(command);
    if (cmd.targetEngine !== ENGINE_SLUG || !MUTATING_COMMANDS.has(cmd.commandType)) {
      throw new Error(`Unsupported Geospatial command: "${cmd.commandType}".`);
    }
    if (!cmd.idempotencyKey) {
      throw new Error(`Geospatial command "${cmd.commandType}" requires an idempotencyKey.`);
    }

    return this.idempotencyManager.executeIdempotent(
      `${ENGINE_SLUG}:${cmd.commandType}:${cmd.idempotencyKey}`,
      async () => {
        await this._assertGovernance(cmd);
        return this._dispatch(cmd);
      }
    );
  }

  async findNearby(latitude, longitude, radiusKm = 10) {
    return this.repository.findInRadius(latitude, longitude, radiusKm);
  }

  async detectClusters({ radiusKm = 10, minPoints = 3 } = {}) {
    const points = await this.repository.listAll();
    return this.clusterDetector.detectClusters(points, { radiusKm, minPoints });
  }

  async getGeofence(geofenceId) {
    return this.repository.getGeofence(geofenceId);
  }

  async _dispatch(cmd) {
    switch (cmd.commandType) {
      case 'IndexSpatialPoint':
        return this._handleIndexPoint(cmd);
      case 'DefineGeofence':
        return this._handleDefineGeofence(cmd);
      default:
        throw new Error(`Unhandled command: ${cmd.commandType}`);
    }
  }

  async _handleIndexPoint(cmd) {
    const {
      pointId,
      latitude,
      longitude,
      entityId,
      entityType = 'observation',
      category = null,
      metadata = {},
      triggerClusterCheck = true,
      clusterRadiusKm = 10,
      clusterMinPoints = 3
    } = cmd.payload;

    const point = new GeoPoint({
      pointId,
      latitude,
      longitude,
      entityId,
      entityType,
      category,
      timestamp: this.clock().toISOString(),
      metadata
    });

    await this.repository.insertPoint(point);

    let detectedClusters = [];
    if (triggerClusterCheck) {
      const allPoints = await this.repository.listAll();
      const clusters = this.clusterDetector.detectClusters(allPoints, {
        radiusKm: clusterRadiusKm,
        minPoints: clusterMinPoints
      });

      // Find if this new point triggered or belongs to any cluster
      detectedClusters = clusters.filter(c => c.entityIds.includes(point.entityId));

      for (const cluster of detectedClusters) {
        await this._emit('econet.spatial.cluster_detected', {
          clusterId: cluster.clusterId,
          centroid: cluster.centroid,
          radiusKm: cluster.radiusKm,
          pointCount: cluster.pointCount,
          entityIds: cluster.entityIds,
          dominantCategory: cluster.dominantCategory,
          triggeredByEntityId: point.entityId
        }, {
          actor: cmd.actor,
          subject: { entityId: cluster.clusterId, entityType: 'spatial_cluster' },
          correlationId: cmd.correlationId
        });
      }
    }

    return {
      point: point.toJSON(),
      clustersDetected: detectedClusters
    };
  }

  async _handleDefineGeofence(cmd) {
    const { geofenceId, name, center, radiusKm, tags = [] } = cmd.payload;
    const geofence = {
      geofenceId,
      name,
      center,
      radiusKm,
      tags,
      createdAt: this.clock().toISOString()
    };
    await this.repository.saveGeofence(geofence);
    return { geofence };
  }

  async _assertGovernance(cmd) {
    if (!this.governance) return;
    const decision = await this.governance.evaluatePolicy({
      engine: ENGINE_SLUG,
      commandType: cmd.commandType,
      actor: cmd.actor,
      payload: cmd.payload
    });
    if (!decision.allowed) {
      throw new Error(`Governance policy denial: ${decision.reason || 'Command denied by policy.'}`);
    }
  }

  async _emit(eventType, payload, { actor = null, subject = null, correlationId = null } = {}) {
    const event = new DomainEvent({
      eventType,
      producer: PRODUCER,
      actor,
      subject,
      correlationId,
      payload
    });
    await this.eventBus.publish(event);
    return event;
  }
}
