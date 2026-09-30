/**
 * Canonical Actor Adapter
 *
 * Constructs the canonical actor object required by Engine 11 (and all other
 * canonical engines) from a verified Express request context.
 *
 * IDENTITY SOURCE:
 * During the transition period, the authoritative identity source is the legacy
 * MongoDB-backed JWT system in server/middleware/auth.js. The canonical Engine 01
 * Identity Engine is NOT yet wired as the identity provider. This adapter
 * bridges the two systems until Engine 01 is connected.
 *
 * ACTOR STRUCTURE (required by all canonical engines):
 *   { actorId: string, roles: string[] }
 *
 * ROLE MAPPING (legacy → canonical):
 * The legacy User model has a `role` field with enum values:
 *   'user' | 'reporter' | 'authority' | 'admin'
 *
 * Mapping to canonical roles used by Engine 11 MissionApplicationService:
 *   'admin'     → ['admin', 'system']     — full access
 *   'authority' → ['mission_lead']        — can create and manage missions
 *   'reporter'  → ['automation']          — automation-level read/write
 *   'user'      → []                      — read-only via queries; cannot
 *                                           execute mutating commands
 *
 * NOTE: The canonical Engine 11 enforces role checks independently. The
 * adapter's job is only to translate — it never grants authority not already
 * established by the backend authentication middleware.
 *
 * UNAUTHENTICATED REQUESTS:
 * Returns null when req.user is absent. Callers must decide whether to
 * return 401 (mutating operations) or allow the request (read-only queries).
 */

/**
 * Map a single legacy role string to an array of canonical role strings.
 * @param {string|undefined} legacyRole
 * @returns {string[]}
 */
function mapLegacyRoleToCanonical(legacyRole) {
  switch (legacyRole) {
    case 'admin':
      return ['admin', 'system'];
    case 'authority':
      return ['mission_lead'];
    case 'reporter':
      return ['automation'];
    case 'user':
    default:
      return [];
  }
}

/**
 * Build a canonical actor from an Express request that has been processed
 * by the `protect` middleware (server/middleware/auth.js).
 *
 * @param {import('express').Request} req
 * @returns {{ actorId: string, roles: string[] } | null}
 */
export function actorFromRequest(req) {
  if (!req.user || !req.user._id) {
    return null;
  }

  const actorId = req.user._id.toString();
  const roles = mapLegacyRoleToCanonical(req.user.role);

  return { actorId, roles };
}

/**
 * Build a system-level actor for internal/automated operations that are not
 * triggered by a human user request (e.g. background seeding, health checks).
 * @returns {{ actorId: string, roles: string[] }}
 */
export function systemActor() {
  return { actorId: 'system', roles: ['system'] };
}
