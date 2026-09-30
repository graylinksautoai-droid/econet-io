/**
 * Engine 16: Community Engine — CommunityStatus Value Object
 * Canonical community lifecycle states (minimal set justified by the
 * repository's lifecycle conventions: active operational use, suspension for
 * moderation/administrative action, archived for read-only historical state).
 *
 * Transitions:
 *   ACTIVE   -> SUSPENDED | ARCHIVED | CLOSED
 *   SUSPENDED-> ACTIVE | CLOSED
 *   ARCHIVED -> ACTIVE (reopen) 
 *   CLOSED   -> (terminal)
 *
 * Suspended and Archived communities reject membership mutations but allow reads.
 */

export const CommunityStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  ARCHIVED: 'ARCHIVED',
  CLOSED: 'CLOSED'
});

const VALID_TRANSITIONS = Object.freeze({
  [CommunityStatus.ACTIVE]: new Set([
    CommunityStatus.SUSPENDED,
    CommunityStatus.ARCHIVED,
    CommunityStatus.CLOSED
  ]),
  [CommunityStatus.SUSPENDED]: new Set([
    CommunityStatus.ACTIVE,
    CommunityStatus.CLOSED
  ]),
  [CommunityStatus.ARCHIVED]: new Set([
    CommunityStatus.ACTIVE
  ]),
  [CommunityStatus.CLOSED]: new Set()
});

export function canTransitionCommunityStatus(currentStatus, nextStatus) {
  if (!Object.values(CommunityStatus).includes(currentStatus)) return false;
  if (!Object.values(CommunityStatus).includes(nextStatus)) return false;
  const allowed = VALID_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.has(nextStatus));
}

export function assertCommunityStatusTransition(currentStatus, nextStatus) {
  if (!canTransitionCommunityStatus(currentStatus, nextStatus)) {
    throw new Error(
      `Invalid community lifecycle transition: "${currentStatus}" -> "${nextStatus}".`
    );
  }
}

/** Whether membership mutations are permitted in the given community status. */
export function isMembershipMutable(status) {
  return status === CommunityStatus.ACTIVE;
}