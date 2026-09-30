/**
 * Engine 22: Governance Engine — PolicyStatus Value Object
 *
 * Governance policy lifecycle:
 *
 *   ACTIVE   → INACTIVE (deactivate)
 *   INACTIVE → ACTIVE   (reactivate)
 *
 * A policy in INACTIVE state returns { allowed: true } for all evaluations
 * (it is bypassed, not deleted). This is consistent with the existing
 * GovernancePolicy.evaluate() implementation which short-circuits on
 * `!this.active`.
 *
 * Policies are never hard-deleted — they are deactivated to preserve audit
 * provenance of what policies existed at what time.
 */

export const PolicyStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE'
});

export function canTransitionPolicyStatus(currentStatus, nextStatus) {
  if (currentStatus === PolicyStatus.ACTIVE && nextStatus === PolicyStatus.INACTIVE) return true;
  if (currentStatus === PolicyStatus.INACTIVE && nextStatus === PolicyStatus.ACTIVE) return true;
  return false;
}

export function assertPolicyStatusTransition(currentStatus, nextStatus) {
  if (!canTransitionPolicyStatus(currentStatus, nextStatus)) {
    throw new Error(
      `Invalid policy status transition: "${currentStatus}" -> "${nextStatus}".`
    );
  }
}
