/**
 * Engine 02: Observation Engine — ObservationStatus Value Object
 * Canonical lifecycle states and transition assertions for raw environmental observations.
 */

export const ObservationStatus = Object.freeze({
  SUBMITTED: 'SUBMITTED',
  VALIDATED: 'VALIDATED',
  FLAGGED: 'FLAGGED',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  ARCHIVED: 'ARCHIVED'
});

const VALID_TRANSITIONS = Object.freeze({
  [ObservationStatus.SUBMITTED]: new Set([
    ObservationStatus.VALIDATED,
    ObservationStatus.VERIFIED,
    ObservationStatus.FLAGGED,
    ObservationStatus.REJECTED
  ]),
  [ObservationStatus.VALIDATED]: new Set([
    ObservationStatus.VERIFIED,
    ObservationStatus.FLAGGED,
    ObservationStatus.REJECTED,
    ObservationStatus.ARCHIVED
  ]),
  [ObservationStatus.FLAGGED]: new Set([
    ObservationStatus.VALIDATED,
    ObservationStatus.REJECTED,
    ObservationStatus.ARCHIVED
  ]),
  [ObservationStatus.VERIFIED]: new Set([
    ObservationStatus.ARCHIVED,
    ObservationStatus.FLAGGED
  ]),
  [ObservationStatus.REJECTED]: new Set([
    ObservationStatus.ARCHIVED
  ]),
  [ObservationStatus.ARCHIVED]: new Set()
});

export function canTransitionObservation(currentStatus, nextStatus) {
  if (!Object.values(ObservationStatus).includes(currentStatus)) return false;
  if (!Object.values(ObservationStatus).includes(nextStatus)) return false;
  const allowed = VALID_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.has(nextStatus));
}

export function assertObservationTransition(currentStatus, nextStatus) {
  if (!canTransitionObservation(currentStatus, nextStatus)) {
    throw new Error(
      `Invalid observation lifecycle transition: "${currentStatus}" -> "${nextStatus}".`
    );
  }
}
