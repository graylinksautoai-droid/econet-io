/**
 * Engine 07: Geospatial Engine — SpatialClusterDetector Domain Service
 * Pure algorithmic clustering service identifying geographic clusters of observations.
 */

import { randomUUID } from 'crypto';

export class SpatialClusterDetector {
  /**
   * Detect spatial clusters among a list of GeoPoints.
   * @param {Array<GeoPoint>} points - List of GeoPoints to analyze.
   * @param {Object} options
   * @param {number} options.radiusKm - Maximum distance between cluster neighbors (default 10km).
   * @param {number} options.minPoints - Minimum points to constitute a cluster (default 3).
   * @returns {Array<Object>} List of detected SpatialCluster objects.
   */
  detectClusters(points = [], { radiusKm = 10, minPoints = 3 } = {}) {
    if (!Array.isArray(points) || points.length < minPoints) {
      return [];
    }

    const visited = new Set();
    const clusters = [];

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (visited.has(point.pointId)) continue;

      const neighbors = this._findNeighbors(point, points, radiusKm);
      if (neighbors.length >= minPoints) {
        // Expand cluster
        const clusterPoints = [point];
        visited.add(point.pointId);

        const queue = [...neighbors.filter(n => n.pointId !== point.pointId)];
        for (let j = 0; j < queue.length; j++) {
          const neighbor = queue[j];
          if (!visited.has(neighbor.pointId)) {
            visited.add(neighbor.pointId);
            clusterPoints.push(neighbor);

            const subNeighbors = this._findNeighbors(neighbor, points, radiusKm);
            if (subNeighbors.length >= minPoints) {
              for (const sub of subNeighbors) {
                if (!visited.has(sub.pointId) && !queue.some(q => q.pointId === sub.pointId)) {
                  queue.push(sub);
                }
              }
            }
          }
        }

        clusters.push(this._buildCluster(clusterPoints));
      }
    }

    return clusters;
  }

  _findNeighbors(point, allPoints, radiusKm) {
    return allPoints.filter(other => point.distanceTo(other) <= radiusKm);
  }

  _buildCluster(clusterPoints) {
    const latSum = clusterPoints.reduce((acc, p) => acc + p.latitude, 0);
    const lonSum = clusterPoints.reduce((acc, p) => acc + p.longitude, 0);
    const centroid = {
      latitude: latSum / clusterPoints.length,
      longitude: lonSum / clusterPoints.length
    };

    // Calculate maximum radius from centroid
    let maxDist = 0;
    for (const p of clusterPoints) {
      const d = p.distanceTo(centroid);
      if (d > maxDist) maxDist = d;
    }

    // Determine dominant category if any
    const categoryCounts = {};
    for (const p of clusterPoints) {
      if (p.category) {
        categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
      }
    }
    let dominantCategory = null;
    let maxCount = 0;
    for (const [cat, cnt] of Object.entries(categoryCounts)) {
      if (cnt > maxCount) {
        dominantCategory = cat;
        maxCount = cnt;
      }
    }

    return {
      clusterId: `scl_${randomUUID().replace(/-/g, '')}`,
      centroid,
      radiusKm: Number(maxDist.toFixed(4)),
      pointCount: clusterPoints.length,
      entityIds: clusterPoints.map(p => p.entityId),
      dominantCategory,
      detectedAt: new Date().toISOString()
    };
  }
}
