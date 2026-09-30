/**
 * Engine 16: Community Engine — CommunityMembershipStatus Value Object
 * Membership relationship lifecycle. Distinguishes no membership, pending,
 * active, and terminal/excluded states. Historical membership records are
 * preserved (no deletion) unless an approved privacy policy requires erasure.
 */

export const MembershipStatus = Object.freeze({
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
  LEFT: 'LEFT',
  REMOVED: 'REMOVED'
});

const VALID_TRANSITIONS = Object.freeze({
  [MembershipStatus.PENDING]: new Set([
    MembershipStatus.ACTIVE,
    MembershipStatus.REJECTED
  ]),
  [MembershipStatus.ACTIVE]: new Set([
    MembershipStatus.SUSPENDED,
    MembershipStatus.LEFT,
    MembershipStatus.REMOVED
  ]),
  [MembershipStatus.SUSPENDED]: new Set([
    MembershipStatus.ACTIVE,
    MembershipStatus.REMOVED
  ]),
  [MembershipStatus.REJECTED]: new Set([MembershipStatus.PENDING]),
  [MembershipStatus.LEFT]: new Set([MembershipStatus.PENDING]),
  [MembershipStatus.REMOVED]: new Set([MembershipStatus.PENDING])
});

export function canTransitionMembership(currentStatus, nextStatus) {
  if (!Object.values(MembershipStatus).includes(currentStatus)) return false;
  if (!Object.values(MembershipStatus).includes(nextStatus)) return false;
  const allowed = VALID_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.has(nextStatus));
}

export function assertMembershipTransition(currentStatus, nextStatus) {
  if (!canTransitionMembership(currentStatus, nextStatus)) {
    throw new Error(
      `Invalid membership lifecycle transition: "${currentStatus}" -> "${nextStatus}".`
    );
  }
}

/** Whether a membership currently grants member-level participation rights. */
export function isActiveMembership(status) {
  return status === MembershipStatus.ACTIVE;
}