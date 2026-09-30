/**
 * Health and readiness endpoints
 *
 * GET /health/health   — combined status (legacy DB + canonical engine + app)
 * GET /health/ready    — k8s/hosting readiness probe (database must be connected)
 * GET /health/metrics  — raw process metrics
 *
 * These endpoints deliberately never return credentials or internal state beyond
 * connection status booleans and process metrics.
 */

import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

/** True when the legacy Mongoose connection is open. */
function isLegacyDbReady() {
  return mongoose.connection.readyState === 1;
}

/** True when the canonical engine layer has a live MongoDB connection.
 *  Imported lazily to avoid a hard dependency when CANONICAL_PERSISTENCE=memory. */
async function getCanonicalStatus() {
  try {
    const { missionEngineAvailable } = await import('../canonical/engines.js');
    const { CANONICAL_PERSISTENCE } = await import('../../infrastructure/persistence/CanonicalPersistenceConfig.js');
    let canonicalDb = 'not_applicable'; // memory mode
    if (CANONICAL_PERSISTENCE === 'mongo') {
      try {
        const { canonicalConnection } = await import('../../infrastructure/persistence/CanonicalMongoConnection.js');
        canonicalDb = canonicalConnection.isConnected ? 'connected' : 'disconnected';
      } catch { canonicalDb = 'unknown'; }
    }
    return { available: missionEngineAvailable, persistence: CANONICAL_PERSISTENCE, canonicalDb };
  } catch {
    return { available: false, persistence: 'unknown', canonicalDb: 'unknown' };
  }
}

// ── GET /health/health ────────────────────────────────────────────────────────

router.get('/health', async (req, res) => {
  try {
    const legacyDb  = isLegacyDbReady() ? 'connected' : 'disconnected';
    const canonical = await getCanonicalStatus();

    const overallHealthy = legacyDb === 'connected';
    const status = overallHealthy ? 'healthy' : 'degraded';

    res.status(overallHealthy ? 200 : 503).json({
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        legacyDatabase: legacyDb,
        canonicalEngine: {
          available:   canonical.available,
          persistence: canonical.persistence,
          database:    canonical.canonicalDb
        },
        memory: process.memoryUsage(),
        cpu:    process.cpuUsage()
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// ── GET /health/ready ─────────────────────────────────────────────────────────

router.get('/ready', async (req, res) => {
  const dbReady = isLegacyDbReady();
  if (dbReady) {
    return res.json({ status: 'ready', timestamp: new Date().toISOString() });
  }
  return res.status(503).json({
    status: 'not_ready',
    timestamp: new Date().toISOString(),
    reason: 'Legacy database not connected'
  });
});

// ── GET /health/metrics ───────────────────────────────────────────────────────

router.get('/metrics', async (req, res) => {
  const canonical = await getCanonicalStatus();
  res.json({
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    database: {
      legacyState: mongoose.connection.readyState,
      legacyName:  mongoose.connection.name,
      canonical
    },
    node: {
      version:  process.version,
      platform: process.platform
    }
  });
});

export default router;
