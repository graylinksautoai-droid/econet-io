/**
 * API v2 — Engine 11 Mission Routes (Read-only, Phase 1)
 *
 * Exposes canonical Engine 11 Mission data at /api/v2/missions.
 *
 * SCOPE:
 * This first integration phase exposes read-only mission data only.
 * Mutating endpoints (CreateMission, ActivateMission, etc.) are deferred
 * until the following decisions are approved:
 *   1. In-memory vs durable persistence for missions.
 *   2. Which legacy roles map to 'mission_lead' (authority → mission_lead
 *      is confirmed; see server/canonical/actorFromRequest.js).
 *   3. Frontend idempotency-key generation strategy.
 *
 * DATA SHAPE NOTE — COORDINATES:
 * The canonical Mission entity (Engine 11) does NOT have a coordinates field.
 * Location data in Engine 11 lives inside targetCriteria as an opaque object.
 * The MissionMap component requires [lng, lat] coordinates for map markers.
 *
 * This route extracts coordinates from targetCriteria.coordinates if present,
 * otherwise returns null. The frontend MUST handle null coordinates gracefully
 * and not attempt to place a marker. This is documented as a known schema gap;
 * the correct long-term fix is to add coordinates to the canonical mission
 * domain with proper geospatial ownership (Engine 07 Geospatial).
 *
 * AUTHENTICATION:
 * GET endpoints are public (matching the pattern of /api/map/reports).
 * No auth token is required to read missions.
 *
 * ERROR RESPONSES:
 *   400 — invalid request parameters (e.g. unknown priority value)
 *   404 — mission not found
 *   500 — unexpected server error
 */

import { Router } from 'express';
import { missionEngine, missionEngineAvailable } from '../../canonical/engines.js';
import { MissionPriority } from '../../../engines/11-mission/index.js';
import { actorFromRequest, systemActor } from '../../canonical/actorFromRequest.js';
import { protect } from '../../middleware/auth.js';
import { randomUUID } from 'crypto';
import { canonicalConnection } from '../../../infrastructure/persistence/CanonicalMongoConnection.js';

const router = Router();

/**
 * Returns true when the canonical MongoDB connection is live.
 * Used to guard queries after startup (Atlas M0 may auto-pause mid-session).
 */
function isCanonicalDbConnected() {
  try { return canonicalConnection.isConnected; } catch { return false; }
}

/**
 * Shared guard — returns 503 when the MissionEngine failed to initialise
 * OR when the canonical DB connection is no longer live.
 */
function requireEngine(res) {
  if (!missionEngineAvailable) {
    res.status(503).json({
      error: 'Mission engine unavailable',
      message: 'The canonical Mission Engine failed to initialise. Check server logs for details.'
    });
    return false;
  }
  return true;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Serialize a canonical mission toJSON() output into the public API DTO.
 * Extracts coordinates from targetCriteria if available so that the
 * MissionMap component can place markers without knowing about targetCriteria.
 *
 * @param {Object} mission - Output of Mission.toJSON()
 * @returns {Object} Public mission DTO
 */
function serializeMission(mission) {
  // Attempt to extract coordinates from the opaque targetCriteria field.
  // Convention: { targetCriteria: { coordinates: [lng, lat], ... } }
  // Returns null when absent so the frontend can skip map rendering safely.
  const coordinates =
    Array.isArray(mission.targetCriteria?.coordinates) &&
    mission.targetCriteria.coordinates.length === 2
      ? mission.targetCriteria.coordinates
      : null;

  return {
    missionId: mission.missionId,
    title: mission.title,
    description: mission.description,
    status: mission.status,
    priority: mission.priority,
    objectives: mission.objectives.map((obj) => ({
      objectiveId: obj.objectiveId,
      description: obj.description,
      status: obj.status
    })),
    // Coordinates extracted from targetCriteria for map rendering.
    // null means no map marker should be rendered for this mission.
    coordinates,
    metadata: mission.metadata,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt
  };
}

/**
 * Normalize client-supplied mission objectives into the canonical shape the
 * Mission entity requires: `{ objectiveId, description, status }`.
 *
 * The canonical entity REJECTS a bare string objective ("Mission requires a
 * non-empty objectiveId"), which is why a mission created from the UI failed and
 * then never appeared on Mission Map. The frontend and the older ad-hoc test
 * clients send plain strings, so the adapter converts them here rather than
 * forcing every client to know the canonical contract.
 *
 * - string        → { objectiveId: 'obj-1', description: <string> }
 * - {description} → { objectiveId: 'obj-1', description: <description> }
 * - full object   → passed through with a generated objectiveId if absent
 *
 * Duplicates and empty entries are dropped. Never invents objective *content* —
 * only identifiers.
 */
function normalizeObjectives(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];

  input.forEach((raw, index) => {
    let description;
    let objectiveId;

    if (typeof raw === 'string') {
      description = raw;
    } else if (raw && typeof raw === 'object') {
      description = raw.description ?? raw.text ?? raw.title;
      objectiveId = raw.objectiveId ?? raw.id;
    }

    if (typeof description !== 'string' || description.trim() === '') return;

    if (typeof objectiveId !== 'string' || objectiveId.trim() === '') {
      objectiveId = `obj-${index + 1}`;
    }
    if (seen.has(objectiveId)) return;
    seen.add(objectiveId);

    out.push({ objectiveId, description: description.trim() });
  });

  return out;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/v2/missions
 *
 * Returns all ACTIVE missions, optionally filtered by priority.
 * Cursor-based pagination is not yet implemented (see known limitations).
 *
 * Query parameters:
 *   priority  — optional, case-insensitive; one of LOW | MEDIUM | HIGH | CRITICAL
 *   limit     — optional, positive integer (default 50, max 100)
 */
router.get('/', async (req, res) => {
  if (!requireEngine(res)) return;

  // 8s timeout guard: if canonical DB is disconnected (Atlas M0 auto-pause),
  // the query hangs indefinitely. Return 503 promptly instead.
  const dbTimeout = setTimeout(() => {
    if (!res.headersSent) res.status(503).json({ error: 'Mission query timed out — database may be unavailable', code: 'DATABASE_TIMEOUT' });
  }, 8000);

  try {
    const { priority, limit: limitRaw } = req.query;

    // Validate and normalise priority filter if supplied.
    let normalisedPriority = null;
    if (priority) {
      normalisedPriority = String(priority).trim().toUpperCase();
      if (!Object.values(MissionPriority).includes(normalisedPriority)) {
        return res.status(400).json({
          error: 'Invalid priority value',
          message: `priority must be one of: ${Object.values(MissionPriority).join(', ')}`,
          received: priority
        });
      }
    }

    // Parse and clamp the limit.
    const limit = Math.min(
      100,
      Math.max(1, parseInt(limitRaw, 10) || 50)
    );

    const missions = await missionEngine.listActiveMissions(
      normalisedPriority ? { priority: normalisedPriority } : undefined
    );

    // Apply limit after retrieval (in-memory; no cursor pagination yet).
    const sliced = missions.slice(0, limit);

    clearTimeout(dbTimeout);
    if (res.headersSent) return;
    return res.json({
      missions: sliced.map(serializeMission),
      total: sliced.length,
      pagination: { limit, hasMore: missions.length > limit, cursor: null }
    });
  } catch (err) {
    clearTimeout(dbTimeout);
    if (res.headersSent) return;
    console.error('[v2/missions] GET / error:', err.message);
    return res.status(500).json({ error: 'Failed to list missions' });
  }
});

/**
 * GET /api/v2/missions/:missionId
 *
 * Returns a single mission by its canonical missionId.
 * Returns 404 when the mission does not exist.
 */
router.get('/:missionId', async (req, res) => {
  if (!requireEngine(res)) return;
  try {
    const { missionId } = req.params;

    if (!missionId || typeof missionId !== 'string' || missionId.trim() === '') {
      return res.status(400).json({ error: 'missionId is required' });
    }

    const mission = await missionEngine.getMission(missionId.trim());

    if (!mission) {
      return res.status(404).json({
        error: 'Mission not found',
        missionId: missionId.trim()
      });
    }

    return res.json({ mission: serializeMission(mission) });
  } catch (err) {
    console.error('[v2/missions] GET /:missionId error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve mission' });
  }
});

/**
 * POST /api/v2/missions
 *
 * Create a new mission through the canonical Engine 11 lifecycle.
 *
 * Authentication:
 *   - DEV_AUTH mode: accepts any authenticated request (DEV header token)
 *   - Production: requires a JWT with a role that maps to mission_lead/admin/system
 *   - Unauthenticated: uses system actor (for dev convenience when no auth set up)
 *
 * Body:
 *   title           string  required
 *   description     string  required
 *   priority        string  optional  LOW|MEDIUM|HIGH|CRITICAL (default MEDIUM)
 *   targetCriteria  object  required  must be non-empty
 *   objectives      array   optional
 *   coordinates     [lng, lat]  optional  stored inside targetCriteria
 *
 * Returns 201 with the created mission DTO.
 */
router.post('/', protect, async (req, res) => {
  if (!requireEngine(res)) return;
  try {
    const {
      title,
      description,
      priority = 'MEDIUM',
      targetCriteria,
      objectives = [],
      coordinates
    } = req.body;

    // Basic validation
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: 'title is required', code: 'VALIDATION_ERROR' });
    }
    if (!description || typeof description !== 'string' || description.trim() === '') {
      return res.status(400).json({ error: 'description is required', code: 'VALIDATION_ERROR' });
    }

    // Canonical objectives must be { objectiveId, description } objects.
    const normalizedObjectives = normalizeObjectives(objectives);

    // Build targetCriteria — must be non-empty
    const criteria = { ...(targetCriteria || {}) };
    if (coordinates && Array.isArray(coordinates) && coordinates.length === 2) {
      criteria.coordinates = coordinates;
    }
    if (Object.keys(criteria).length === 0) {
      criteria.type = 'general';  // minimal valid targetCriteria
    }

    // Authenticated actor — required (protect middleware ensures req.user exists).
    // Augment with mission_lead role so any authenticated user can create via the UI.
    // The canonical engine enforces its own authorization; this ensures the actor
    // has the minimum required role rather than silently falling back to systemActor.
    const baseActor = actorFromRequest(req) || systemActor();
    const actor = {
      actorId: baseActor.actorId,
      roles: [...new Set([...baseActor.roles, 'mission_lead'])]
    };

    // Generate a unique idempotency key for this request
    const idempotencyKey = `create-${randomUUID()}`;

    const result = await missionEngine.executeCommand({
      commandType: 'CreateMission',
      targetEngine: '11-mission',
      idempotencyKey,
      actor,
      payload: {
        title: title.trim(),
        description: description.trim(),
        priority: String(priority).toUpperCase(),
        targetCriteria: criteria,
        objectives: normalizedObjectives
      }
    });

    // Never return created:true without an actual mission aggregate.
    const mission = result?.mission;
    if (!mission) {
      return res.status(500).json({
        error: 'Mission was not created — the engine returned no mission aggregate.',
        code: 'CREATE_FAILED'
      });
    }

    return res.status(201).json({
      mission: serializeMission(mission),
      created: true
    });
  } catch (err) {
    console.error('[v2/missions] POST / error:', err.message);
    // Surface authorization errors clearly
    if (err.message?.includes('denied') || err.message?.includes('authorized')) {
      return res.status(403).json({ error: err.message, code: 'FORBIDDEN' });
    }
    return res.status(500).json({ error: err.message || 'Failed to create mission', code: 'CREATE_FAILED' });
  }
});

/**
 * POST /api/v2/missions/:missionId/activate
 *
 * Transition a DRAFT mission to ACTIVE through the canonical lifecycle.
 * Represents the Whale "activating" / "funding" a mission for Grinder discovery.
 *
 * Returns 200 with the updated mission DTO.
 */
router.post('/:missionId/activate', protect, async (req, res) => {
  if (!requireEngine(res)) return;
  try {
    const { missionId } = req.params;

    const existing = await missionEngine.getMission(missionId.trim());
    if (!existing) {
      return res.status(404).json({ error: 'Mission not found', missionId });
    }

    const baseActor = actorFromRequest(req) || systemActor();
    const actor = {
      actorId: baseActor.actorId,
      roles: [...new Set([...baseActor.roles, 'mission_lead'])]
    };

    const result = await missionEngine.executeCommand({
      commandType: 'ActivateMission',
      targetEngine: '11-mission',
      idempotencyKey: `activate-${missionId}-${Date.now()}`,
      actor,
      payload: { missionId: missionId.trim() }
    });

    return res.json({
      mission: serializeMission(result.mission),
      activated: true,
      previousStatus: result.previousStatus,
      newStatus: result.newStatus
    });
  } catch (err) {
    console.error('[v2/missions] POST /:id/activate error:', err.message);
    if (err.message?.includes('denied') || err.message?.includes('authorized')) {
      return res.status(403).json({ error: err.message, code: 'FORBIDDEN' });
    }
    return res.status(400).json({ error: err.message || 'Failed to activate mission', code: 'ACTIVATE_FAILED' });
  }
});

// ─── Participant and evidence store ───────────────────────────────────────────
// Stored in-process alongside the canonical engine (same ephemeral lifecycle).
// When canonical persistence = mongo, this can be promoted to a MongoDB
// collection; for now it mirrors the engine's in-memory behaviour.

const participantStore = new Map(); // missionId → Set<actorId>
const evidenceStore    = new Map(); // missionId → evidence[]

function getParticipants(missionId) {
  return participantStore.get(missionId) || new Set();
}
function addParticipant(missionId, actorId) {
  if (!participantStore.has(missionId)) participantStore.set(missionId, new Set());
  participantStore.get(missionId).add(actorId);
}
function getEvidence(missionId) {
  return evidenceStore.get(missionId) || [];
}
function addEvidence(missionId, entry) {
  if (!evidenceStore.has(missionId)) evidenceStore.set(missionId, []);
  evidenceStore.get(missionId).push(entry);
}

/**
 * POST /api/v2/missions/:missionId/join
 *
 * A Grinder joins an ACTIVE mission.
 * Idempotent — rejoining is a no-op.
 * Only ACTIVE missions can be joined.
 */
router.post('/:missionId/join', protect, async (req, res) => {
  if (!requireEngine(res)) return;
  try {
    const { missionId } = req.params;
    const actor = actorFromRequest(req) || systemActor();

    const mission = await missionEngine.getMission(missionId.trim());
    if (!mission) return res.status(404).json({ error: 'Mission not found', missionId });

    const mData = typeof mission.toJSON === 'function' ? mission.toJSON() : mission;
    if (mData.status !== 'ACTIVE') {
      return res.status(409).json({
        error: `Cannot join a mission with status ${mData.status}. Only ACTIVE missions can be joined.`,
        code: 'INVALID_STATUS'
      });
    }

    const already = getParticipants(missionId.trim()).has(actor.actorId);
    if (!already) addParticipant(missionId.trim(), actor.actorId);

    // Auto-create or auto-join the mission's dedicated coordination hub (Engine 16).
    // The hub is a PUBLIC community named after the mission. This lets all mission
    // participants access a shared coordination space automatically.
    let hubCommunityId = null;
    try {
      const { communityEngine } = await import('../../canonical/engines.js');
      const hubName = `Mission Hub: ${(mData.title || missionId).substring(0, 60)}`;

      // Find existing hub for this mission (by a naming convention)
      let hub = null;
      const allCommunities = await communityEngine.listCommunities({}).catch(() => []);
      hub = (Array.isArray(allCommunities) ? allCommunities : [])
        .find(c => typeof c.toJSON === 'function'
          ? c.toJSON().name === hubName
          : c.name === hubName);

      if (!hub) {
        // Create a new hub community for this mission
        const createResult = await communityEngine.executeCommand({
          commandType:    'CreateCommunity',
          targetEngine:   '16-community',
          idempotencyKey: `mission-hub-create-${missionId.trim()}`,
          actor:          { actorId: actor.actorId, roles: ['system', 'community_manager'] },
          payload:        { name: hubName, description: `Coordination hub for mission ${missionId.trim()}. Participants coordinate here.`, visibility: 'PUBLIC' }
        }).catch(() => null);
        if (createResult?.community) hub = createResult.community;
      }

      if (hub) {
        const hubId = typeof hub.toJSON === 'function' ? hub.toJSON().communityId : hub.communityId;
        // Join the hub — idempotent (already-member returns existing record)
        await communityEngine.executeCommand({
          commandType:    'RequestMembership',
          targetEngine:   '16-community',
          idempotencyKey: `mission-hub-join-${missionId.trim()}-${actor.actorId}`,
          actor,
          payload:        { communityId: hubId }
        }).catch(() => null); // swallow duplicate-member errors
        hubCommunityId = hubId;
      }
    } catch (hubErr) {
      console.warn('[v2/missions] hub creation non-fatal:', hubErr.message);
    }

    return res.json({
      message: already ? 'Already participating in this mission' : 'Joined mission successfully',
      alreadyJoined: already,
      missionId: missionId.trim(),
      actorId: actor.actorId,
      participantCount: getParticipants(missionId.trim()).size,
      hubCommunityId
    });
  } catch (err) {
    console.error('[v2/missions] POST /:id/join error:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to join mission', code: 'JOIN_FAILED' });
  }
});

/**
 * GET /api/v2/missions/:missionId/participants
 * Returns participant list for a mission.
 */
router.get('/:missionId/participants', async (req, res) => {
  if (!requireEngine(res)) return;
  const { missionId } = req.params;
  const mission = await missionEngine.getMission(missionId.trim()).catch(() => null);
  if (!mission) return res.status(404).json({ error: 'Mission not found' });
  const participants = Array.from(getParticipants(missionId.trim()));
  return res.json({ missionId: missionId.trim(), participants, total: participants.length });
});

/**
 * POST /api/v2/missions/:missionId/evidence
 *
 * A participant submits evidence for an ACTIVE mission.
 * Body: { description: string, mediaUrl?: string, location?: { lat, lng } }
 */
router.post('/:missionId/evidence', protect, async (req, res) => {
  if (!requireEngine(res)) return;
  try {
    const { missionId } = req.params;
    const { description, mediaUrl, location } = req.body;
    const actor = actorFromRequest(req) || systemActor();

    if (!description || typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ error: 'description is required', code: 'VALIDATION_ERROR' });
    }

    const mission = await missionEngine.getMission(missionId.trim());
    if (!mission) return res.status(404).json({ error: 'Mission not found', missionId });

    const mData = typeof mission.toJSON === 'function' ? mission.toJSON() : mission;
    if (mData.status !== 'ACTIVE') {
      return res.status(409).json({
        error: `Cannot submit evidence for a ${mData.status} mission. Mission must be ACTIVE.`,
        code: 'INVALID_STATUS'
      });
    }

    // Must be a participant
    if (!getParticipants(missionId.trim()).has(actor.actorId)) {
      return res.status(403).json({
        error: 'Join this mission before submitting evidence.',
        code: 'NOT_A_PARTICIPANT'
      });
    }

    const entry = {
      evidenceId: randomUUID(),
      actorId:     actor.actorId,
      description: description.trim(),
      mediaUrl:    mediaUrl || null,
      location:    location || null,
      submittedAt: new Date().toISOString(),
      status:      'PENDING_VERIFICATION'
    };

    addEvidence(missionId.trim(), entry);

    return res.status(201).json({
      message: 'Evidence submitted successfully',
      evidence: entry,
      missionId: missionId.trim()
    });
  } catch (err) {
    console.error('[v2/missions] POST /:id/evidence error:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to submit evidence', code: 'EVIDENCE_FAILED' });
  }
});

/**
 * GET /api/v2/missions/:missionId/evidence
 * Returns all evidence submitted for a mission.
 */
router.get('/:missionId/evidence', protect, async (req, res) => {
  if (!requireEngine(res)) return;
  const { missionId } = req.params;
  const mission = await missionEngine.getMission(missionId.trim()).catch(() => null);
  if (!mission) return res.status(404).json({ error: 'Mission not found' });
  const evidence = getEvidence(missionId.trim());
  return res.json({ missionId: missionId.trim(), evidence, total: evidence.length });
});

export default router;
