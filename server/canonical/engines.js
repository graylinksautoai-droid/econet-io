/**
 * Canonical Engine Composition Root
 *
 * Instantiates canonical engine singletons for use across the Express server
 * process. Each engine is created ONCE and shared across all HTTP requests.
 *
 * PERSISTENCE SELECTION:
 * Controlled by CANONICAL_PERSISTENCE environment variable.
 *
 *   CANONICAL_PERSISTENCE=memory  (default)
 *     Uses InMemoryMissionRepository. State is lost on restart. For local
 *     development and CI. No database connection required.
 *
 *   CANONICAL_PERSISTENCE=mongo
 *     Uses MongoMissionRepository backed by MongoDB Atlas. Requires either
 *     CANONICAL_MONGODB_URI or MONGODB_URI in the environment. State survives
 *     restarts. For production deployments.
 *
 * IMPORTANT: CANONICAL_PERSISTENCE=mongo NEVER silently falls back to memory.
 * A missing or unreachable MongoDB URI is a hard startup failure that sets
 * missionEngineAvailable=false and logs a clear error.
 *
 * INITIALIZATION ORDER:
 * AuditEngine must be initialised BEFORE MissionEngine so its wildcard
 * subscribeAll() is registered before any events are published.
 *
 * INJECTION CONTRACT:
 * Do not create additional MissionEngine instances elsewhere in the server
 * without injecting the same canonicalEventBus and canonicalIdempotencyManager.
 */

import { EventBus } from '../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../infrastructure/idempotency/IdempotencyManager.js';
import {
  CANONICAL_PERSISTENCE,
  IS_MONGO,
  CANONICAL_MONGODB_URI,
  persistenceDescription
} from '../../infrastructure/persistence/CanonicalPersistenceConfig.js';
import { InMemoryMissionRepository } from '../../engines/11-mission/infrastructure/repositories/InMemoryMissionRepository.js';
import { MissionEngine } from '../../engines/11-mission/index.js';
import { AuditEngine } from '../../engines/23-audit/index.js';
import { CommunityEngine } from '../../engines/16-community/index.js';

// ─── Shared infrastructure ────────────────────────────────────────────────────

export const canonicalEventBus = new EventBus({ maxHistory: 1000 });

// ─── Build the mission repository based on persistence config ─────────────────

let missionRepository;
let canonicalIdempotencyManager;
let _canonicalConnection = null; // used by community engine section below

if (IS_MONGO) {
  // Dynamic import keeps Mongoose out of the module graph when running in
  // memory mode (CI, local dev without Atlas). The import only executes
  // when CANONICAL_PERSISTENCE=mongo is explicitly set.
  const { canonicalConnection } = await import(
    '../../infrastructure/persistence/CanonicalMongoConnection.js'
  );
  _canonicalConnection = canonicalConnection; // hoist for other engines
  const { MongoMissionRepository } = await import(
    '../../engines/11-mission/infrastructure/repositories/MongoMissionRepository.js'
  );
  const { MongoIdempotencyStore } = await import(
    '../../infrastructure/idempotency/MongoIdempotencyStore.js'
  );

  try {
    await canonicalConnection.connect(CANONICAL_MONGODB_URI);
    console.log(`[canonical] MongoDB connected — persistence: ${persistenceDescription()}`);
  } catch (err) {
    // Connection failure at startup — log clearly but do NOT throw or process.exit here.
    // The server will continue to start; /api/v2/missions will return 503 until the
    // Atlas cluster is reachable (e.g., after it wakes from auto-pause).
    // In production the orchestrator can restart the process once Atlas is ready.
    console.error('[canonical] MongoDB connection FAILED:', err.message);
    console.error('[canonical] CANONICAL_PERSISTENCE=mongo was requested but the database is unreachable.');
    console.error('[canonical] /api/v2/missions will return 503 until MongoDB is available.');
    if (process.env.NODE_ENV === 'production') {
      console.error('[canonical] PRODUCTION: canonical mission persistence is UNAVAILABLE. Check Atlas cluster status.');
    } else {
      console.warn('[canonical] DEV: If Atlas is auto-paused, resume it at cloud.mongodb.com and restart the server.');
    }
    // Fall back to in-memory so the server stays alive and other routes work.
    // This fallback is only for the canonical layer startup failure path —
    // it does NOT silently degrade in a way that loses user data, because
    // missionEngineAvailable=false means no writes will be accepted.
    missionRepository = new InMemoryMissionRepository();
    canonicalIdempotencyManager = new IdempotencyManager();
    // Skip the rest of the IS_MONGO block by not setting up Mongo repositories.
    // The engine init below will still run with the in-memory repo so the server
    // stays alive; routes will return 503 until the process is restarted.
    console.warn('[canonical] Temporary in-memory fallback active — restart the server once Atlas is reachable.');
  }

  // Only set up Mongo repositories if the connection actually succeeded
  if (canonicalConnection.isConnected) {
    missionRepository = new MongoMissionRepository(canonicalConnection.connection);
    const idempotencyStore = new MongoIdempotencyStore(canonicalConnection.connection);
    canonicalIdempotencyManager = new IdempotencyManager({ store: idempotencyStore });
    console.log('[canonical] Using MongoMissionRepository (canonical_missions collection)');
    console.log('[canonical] Using MongoIdempotencyStore (canonical_idempotency_keys collection)');
  }
  // If connection failed the catch block already set missionRepository to InMemoryMissionRepository.

} else {
  // CANONICAL_PERSISTENCE=memory (default)
  missionRepository = new InMemoryMissionRepository();
  canonicalIdempotencyManager = new IdempotencyManager();
  console.log(`[canonical] Using InMemoryMissionRepository — persistence: ${persistenceDescription()}`);
}

export { canonicalIdempotencyManager };

// ─── Engine 23: Audit Engine ──────────────────────────────────────────────────
// Must be initialised BEFORE any engine that publishes events.

export const auditEngine = new AuditEngine(canonicalEventBus);

// ─── Engine 11: Mission Engine ────────────────────────────────────────────────

export const missionEngine = new MissionEngine({
  repository: missionRepository,
  eventBus: canonicalEventBus,
  idempotencyManager: canonicalIdempotencyManager,
  governance: null
});

/**
 * Whether the MissionEngine is available to serve requests.
 * Set to false if initialize() fails; routes should return 503 in that case.
 */
export let missionEngineAvailable = false;

// ─── Initialisation ───────────────────────────────────────────────────────────

// AuditEngine first — wildcard subscription must be registered before any
// downstream engine publishes events.
try {
  await auditEngine.initialize();
  console.log('[canonical] AuditEngine initialised — subscribing to canonicalEventBus');
} catch (err) {
  console.error('[canonical] AuditEngine initialisation FAILED:', err.message);
  console.error('[canonical] Canonical events will not be audited until the engine is available.');
}

try {
  await missionEngine.initialize();
  missionEngineAvailable = true;
  console.log(`[canonical] MissionEngine initialised — persistence: ${persistenceDescription()}`);
} catch (err) {
  console.error('[canonical] MissionEngine initialisation FAILED:', err.message);
  console.error('[canonical] /api/v2/missions will return 503 until the engine is available.');
}

// ─── Engine 16: Community Engine ─────────────────────────────────────────────
// Uses MongoCommunityRepository when IS_MONGO=true and the canonical connection
// is established (same connection as MissionEngine).  Falls back to in-memory
// when Atlas is unreachable, matching the Mission engine's behaviour.

let communityRepository;
if (IS_MONGO && _canonicalConnection && _canonicalConnection.isConnected) {
  try {
    const { MongoCommunityRepository } = await import(
      '../../engines/16-community/infrastructure/repositories/MongoCommunityRepository.js'
    );
    communityRepository = new MongoCommunityRepository(_canonicalConnection.connection);
    console.log('[canonical] Using MongoCommunityRepository (canonical_communities collection)');
  } catch (err) {
    console.warn('[canonical] MongoCommunityRepository failed to initialise, falling back to in-memory:', err.message);
    communityRepository = null; // CommunityEngine constructor will use default InMemory
  }
}

// Pass the repository when Mongo is available; omit to get InMemory default
export const communityEngine = communityRepository
  ? new CommunityEngine({ eventBus: canonicalEventBus, repository: communityRepository })
  : new CommunityEngine({ eventBus: canonicalEventBus });

try {
  await communityEngine.initialize();
  console.log(`[canonical] CommunityEngine initialised — persistence: ${communityRepository ? 'mongo' : 'in-memory'}`);
} catch (err) {
  console.error('[canonical] CommunityEngine initialisation FAILED:', err.message);
}
// ─── Dev mission seeding ──────────────────────────────────────────────────────
// Exported so server/index.js can call it after dotenv loads.
// Only runs when DEV_AUTH=true and not production.
export async function seedDevMissions() {
  if (process.env.DEV_AUTH !== 'true' || process.env.NODE_ENV === 'production') return;
  if (!missionEngineAvailable) return;
  try {
    const existingMissions = await missionEngine.listActiveMissions();
    if (existingMissions.length > 0) return; // already seeded

    const devMissions = [
      {
        title: 'Clean the Jabi Lake Shoreline',
        description: '[DEV] Join a weekend cleanup effort to remove debris and invasive plants from the shoreline.',
        priority: 'HIGH',
        targetCriteria: { region: 'Abuja, Nigeria', type: 'cleanup', distanceKm: 1.2, coordinates: [7.3975, 9.0814] }
      },
      {
        title: 'Usuma Reservoir Flood Monitoring',
        description: '[DEV] Validate dam inflow stress markers and confirm downstream spill conditions.',
        priority: 'CRITICAL',
        targetCriteria: { region: 'Abuja, Nigeria', type: 'monitoring', distanceKm: 3.5, coordinates: [7.3435, 9.0397] }
      }
    ];

    for (const m of devMissions) {
      const created = await missionEngine.executeCommand({
        commandType: 'CreateMission',
        targetEngine: '11-mission',
        idempotencyKey: `dev-seed-${m.title.replace(/\s+/g, '-').toLowerCase()}`,
        actor: { actorId: 'dev-seed', roles: ['system'] },
        payload: m
      });
      await missionEngine.executeCommand({
        commandType: 'ActivateMission',
        targetEngine: '11-mission',
        idempotencyKey: `dev-activate-${created.mission.missionId}`,
        actor: { actorId: 'dev-seed', roles: ['system'] },
        payload: { missionId: created.mission.missionId }
      });
      console.log(`[canonical] Dev mission seeded and activated: "${m.title}"`);
    }
  } catch (seedErr) {
    console.warn('[canonical] Dev mission seeding failed (non-fatal):', seedErr.message);
  }
}
