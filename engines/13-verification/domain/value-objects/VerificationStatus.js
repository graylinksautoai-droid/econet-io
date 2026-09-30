/**
 * Engine 13: Verification Engine — VerificationStatus Value Object
 * Canonical verification lifecycle states and transition assertions.
 */

export const VerificationStatus = Object.freeze({
  PENDING: 'PENDING',
  VERIFYING: 'VERIFYING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  DISPUTED: 'DISPUTED'
});

const VALID_TRANSITIONS = Object.freeze({
  [VerificationStatus.PENDING]: new Set([
    VerificationStatus.VERIFYING,
    VerificationStatus.REJECTED
  ]),
  [VerificationStatus.VERIFYING]: new Set([
    VerificationStatus.VERIFIED,
    VerificationStatus.REJECTED,
    VerificationStatus.DISPUTED
  ]),
  [VerificationStatus.DISPUTED]: new Set([
    VerificationStatus.VERIFYING,
    VerificationStatus.VERIFIED,
    VerificationStatus.REJECTED
  ]),
  [VerificationStatus.VERIFIED]: new Set([
    VerificationStatus.DISPUTED
  ]),
  [VerificationStatus.REJECTED]: new Set([
    VerificationStatus.DISPUTED
  ])
});

export function canTransitionVerification(currentStatus, nextStatus) {
  if (!Object.values(VerificationStatus).includes(currentStatus)) return false;
  if (!Object.values(VerificationStatus).includes(nextStatus)) return false;
  const allowed = VALID_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.has(nextStatus));
}

export function assertVerificationTransition(currentStatus, nextStatus) {
  if (!canTransitionVerification(currentStatus, nextStatus)) {
    throw new Error(
      `Invalid verification lifecycle transition: "${currentStatus}" -> "${nextStatus}".`
    );
  }
}
