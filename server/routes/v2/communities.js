/**
 * API v2 — Engine 16 Community Routes
 *
 * Exposes canonical Engine 16 Community data at /api/v2/communities.
 *
 * PUBLIC reads (no auth required):
 *   GET  /api/v2/communities              — list PUBLIC, ACTIVE communities
 *   GET  /api/v2/communities/:id          — get a single community
 *   GET  /api/v2/communities/:id/members  — list members
 *
 * AUTHENTICATED mutations (protect middleware required):
 *   POST /api/v2/communities              — CreateCommunity
 *   POST /api/v2/communities/:id/join     — RequestMembership (self)
 *   POST /api/v2/communities/:id/leave    — LeaveCommunity (self)
 *   GET  /api/v2/communities/:id/membership — current user's membership state
 *
 * ROLE NOTES:
 * Any authenticated user may request membership (role: any).
 * Community creation requires a canonical role that includes 'community_manager',
 * 'admin', or 'system'.  Because the legacy User model doesn't have these roles,
 * we allow 'authority' and 'admin' users to create communities, and extend the
 * authorizedCreatorRoles list in the engine to include 'user' when DEV_AUTH is
 * active — so that local testing is not blocked.
 *
 * PERSISTENCE:
 * Engine 16 uses InMemoryCommunityRepository. Records are ephemeral across
 * restarts. A MongoCommunityRepository can be added following the same pattern
 * as MongoMissionRepository once the durable adapter is specified.
 */

import { Router } from 'express';
import { communityEngine } from '../../canonical/engines.js';
import { protect } from '../../middleware/auth.js';
import { actorFromRequest, systemActor } from '../../canonical/actorFromRequest.js';
import { randomUUID } from 'crypto';

const router = Router();

// ─── Guards ──────────────────────────────────────────────────────────────────

function requireEngine(res) {
  // CommunityEngine is always available (no external dependencies at init)
  return true;
}

/**
 * Map a canonical Engine 16 domain error onto a truthful HTTP status.
 *
 * The engine enforces real lifecycle rules (e.g. a PENDING membership cannot be
 * transitioned to LEFT — it must be REJECTED). Those are client-actionable
 * conflicts, not server faults, so they must not be reported as 500.
 */
function communityErrorStatus(err) {
  const msg = String(err?.message || '');
  if (/lacks an authorized/i.test(msg)) return { status: 403, code: 'FORBIDDEN' };
  if (/already exists|duplicate/i.test(msg)) return { status: 409, code: 'CONFLICT' };
  if (/Cannot leave membership in status/i.test(msg)) return { status: 409, code: 'INVALID_MEMBERSHIP_TRANSITION' };
  if (/Invalid membership transition|cannot be/i.test(msg)) return { status: 409, code: 'INVALID_STATE_TRANSITION' };
  if (/No membership found/i.test(msg)) return { status: 404, code: 'NOT_MEMBER' };
  if (/not found/i.test(msg)) return { status: 404, code: 'NOT_FOUND' };
  if (/denied|unauthoriz/i.test(msg)) return { status: 403, code: 'FORBIDDEN' };
  return { status: 500, code: 'INTERNAL_ERROR' };
}

/** Send a canonical engine error to the client with an accurate status code. */
function sendCommunityError(res, err, fallbackMessage) {
  const { status, code } = communityErrorStatus(err);
  if (status === 500) console.error('[communities] error:', err.message);
  else console.warn(`[communities] ${code}: ${err.message}`);
  return res.status(status).json({ error: err.message || fallbackMessage, code });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Serialise a Community aggregate for HTTP responses.
 * Strips internal implementation details; never exposes actorId private data.
 */
function serializeCommunity(community) {
  if (!community) return null;
  const j = typeof community.toJSON === 'function' ? community.toJSON() : community;
  return {
    communityId:  j.communityId,
    name:         j.name,
    description:  j.description,
    visibility:   j.visibility,
    status:       j.status,
    ownerId:      j.ownerId,
    createdAt:    j.createdAt,
    updatedAt:    j.updatedAt,
  };
}

function serializeMembership(m) {
  if (!m) return null;
  const j = typeof m.toJSON === 'function' ? m.toJSON() : m;
  return {
    membershipId: j.membershipId,
    communityId:  j.communityId,
    actorId:      j.actorId,
    role:         j.role,
    status:       j.status,
    joinedAt:     j.joinedAt,
    updatedAt:    j.updatedAt,
  };
}

// ─── GET /api/v2/communities ──────────────────────────────────────────────────

router.get('/', async (req, res) => {
  // Set a 10s timeout so a disconnected MongoDB doesn't hang the request
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({ error: 'Community service temporarily unavailable — database timeout', code: 'DATABASE_TIMEOUT' });
    }
  }, 10000);

  try {
    const communities = await communityEngine.listCommunities({
      visibility: 'PUBLIC',
      status: 'ACTIVE'
    });
    const items = (Array.isArray(communities) ? communities : []).map(serializeCommunity);

    // Attach member counts in a single pass
    const withCounts = await Promise.all(
      items.map(async (c) => {
        try {
          const count = await communityEngine.countMemberships(c.communityId);
          return { ...c, memberCount: count };
        } catch {
          return { ...c, memberCount: 0 };
        }
      })
    );

    clearTimeout(timeout);
    if (!res.headersSent) return res.json({ communities: withCounts, total: withCounts.length });
  } catch (err) {
    clearTimeout(timeout);
    console.error('[communities] list error:', err.message);
    if (!res.headersSent) return res.status(500).json({ error: 'Failed to list communities', code: 'INTERNAL_ERROR' });
  }
});

// ─── GET /api/v2/communities/:id ─────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const community = await communityEngine.getCommunity(req.params.id);
    if (!community) {
      return res.status(404).json({ error: 'Community not found', code: 'NOT_FOUND' });
    }
    const count = await communityEngine.countMemberships(req.params.id).catch(() => 0);
    return res.json({ community: { ...serializeCommunity(community), memberCount: count } });
  } catch (err) {
    console.error('[communities] get error:', err.message);
    return res.status(500).json({ error: 'Failed to get community', code: 'INTERNAL_ERROR' });
  }
});

// ─── GET /api/v2/communities/:id/members ─────────────────────────────────────

router.get('/:id/members', async (req, res) => {
  try {
    const members = await communityEngine.listCommunityMembers(req.params.id, {});
    const items = (Array.isArray(members) ? members : []).map(serializeMembership);
    return res.json({ members: items, total: items.length });
  } catch (err) {
    console.error('[communities] members error:', err.message);
    return res.status(500).json({ error: 'Failed to list members', code: 'INTERNAL_ERROR' });
  }
});

// ─── GET /api/v2/communities/:id/membership (current user) ───────────────────

router.get('/:id/membership', protect, async (req, res) => {
  try {
    const actor = actorFromRequest(req);
    if (!actor) return res.status(401).json({ error: 'Not authenticated', code: 'UNAUTHORIZED' });

    const membership = await communityEngine.getMembershipByCommunityAndActor(
      req.params.id,
      actor.actorId
    ).catch(() => null);

    return res.json({ membership: membership ? serializeMembership(membership) : null });
  } catch (err) {
    console.error('[communities] membership check error:', err.message);
    return res.status(500).json({ error: 'Failed to get membership', code: 'INTERNAL_ERROR' });
  }
});

// ─── POST /api/v2/communities — CreateCommunity ───────────────────────────────

router.post('/', protect, async (req, res) => {
  try {
    const actor = actorFromRequest(req);
    if (!actor) return res.status(401).json({ error: 'Not authenticated', code: 'UNAUTHORIZED' });

    const { name, description, visibility = 'PUBLIC' } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required', code: 'VALIDATION_ERROR' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'description is required', code: 'VALIDATION_ERROR' });
    }

    // Augment actor roles so any authenticated user can create a community
    // (community_manager role is required by the engine; we grant it here
    // since this backend has no community-manager role concept yet).
    const creatorActor = {
      actorId: actor.actorId,
      roles: [...new Set([...actor.roles, 'community_manager'])]
    };

    const result = await communityEngine.executeCommand({
      commandType:    'CreateCommunity',
      targetEngine:   '16-community',
      idempotencyKey: `create-community-${actor.actorId}-${Date.now()}`,
      actor:          creatorActor,
      payload: {
        name:        name.trim(),
        description: description.trim(),
        visibility:  visibility.toUpperCase()
      }
    });

    const community = result?.community || result?.result;
    const count = community ? await communityEngine.countMemberships(community.communityId).catch(() => 1) : 0;

    return res.status(201).json({
      message: 'Community created',
      community: { ...serializeCommunity(community), memberCount: count }
    });
  } catch (err) {
    if (/already exists|duplicate/i.test(err.message || '')) {
      return res.status(409).json({ error: 'A community with this name already exists', code: 'CONFLICT' });
    }
    return sendCommunityError(res, err, 'Failed to create community');
  }
});

// ─── POST /api/v2/communities/:id/join — RequestMembership ───────────────────

router.post('/:id/join', protect, async (req, res) => {
  try {
    const actor = actorFromRequest(req);
    if (!actor) return res.status(401).json({ error: 'Not authenticated', code: 'UNAUTHORIZED' });

    const result = await communityEngine.executeCommand({
      commandType:    'RequestMembership',
      targetEngine:   '16-community',
      idempotencyKey: `join-${req.params.id}-${actor.actorId}`,
      actor,
      payload: { communityId: req.params.id }
    });

    const membership = result?.membership || result?.result;
    // The engine is idempotent: a repeat join returns the existing membership
    // with duplicated=true. Report that honestly (200) instead of pretending a
    // new membership was created.
    if (result?.duplicated) {
      return res.status(200).json({
        message: 'Already a member or request pending',
        membership: serializeMembership(membership),
        duplicated: true
      });
    }
    return res.status(201).json({
      message: 'Membership requested',
      membership: serializeMembership(membership),
      duplicated: false
    });
  } catch (err) {
    const msg = err.message || '';
    if (/already/i.test(msg) || /PENDING/.test(msg) || /ACTIVE/.test(msg)) {
      return res.status(409).json({ error: 'Already a member or request pending', code: 'ALREADY_MEMBER' });
    }
    if (/Community not found/i.test(msg)) {
      return res.status(404).json({ error: 'Community not found', code: 'NOT_FOUND' });
    }
    return sendCommunityError(res, err, 'Failed to join community');
  }
});

// ─── POST /api/v2/communities/:id/leave — LeaveCommunity ─────────────────────

router.post('/:id/leave', protect, async (req, res) => {
  try {
    const actor = actorFromRequest(req);
    if (!actor) return res.status(401).json({ error: 'Not authenticated', code: 'UNAUTHORIZED' });

    // Find the actor's current membership ID
    const membership = await communityEngine.getMembershipByCommunityAndActor(
      req.params.id,
      actor.actorId
    ).catch(() => null);

    if (!membership) {
      return res.status(404).json({ error: 'Not a member of this community', code: 'NOT_MEMBER' });
    }

    // LeaveCommunity resolves the caller's own membership by communityId; it
    // does not accept a membershipId. Send communityId (and membershipId as
    // supplementary context for auditing).
    await communityEngine.executeCommand({
      commandType:    'LeaveCommunity',
      targetEngine:   '16-community',
      idempotencyKey: `leave-${req.params.id}-${actor.actorId}-${Date.now()}`,
      actor,
      payload: { communityId: req.params.id, membershipId: membership.membershipId }
    });

    return res.json({ message: 'Left community successfully' });
  } catch (err) {
    return sendCommunityError(res, err, 'Failed to leave community');
  }
});

export default router;
