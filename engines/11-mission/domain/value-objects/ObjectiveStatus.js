/**
 * Engine 11: Mission Engine — ObjectiveStatus Value Object.
 * Canonical objective lifecycle states and deterministic transitions.
 * Baseline states are implementation decisions, not canonical mandates.
 */

export const ObjectiveStatus = Object.freeze({
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
});

export const OBJECTIVE_STATUS_TRANSITIONS = Object.freeze({
  [ObjectiveStatus.PENDING]: new Set([ObjectiveStatus.IN_PROGRESS]),
  [ObjectiveStatus.IN_PROGRESS]: new Set([
    ObjectiveStatus.COMPLETED,
    ObjectiveStatus.FAILED
  ]),
  [ObjectiveStatus.COMPLETED]: new Set(),
  [ObjectiveStatus.FAILED]: new Set()
});

export function isValidObjectiveStatus(status) {
  return Object.values(ObjectiveStatus).includes(status);
}

export function assertValidObjectiveStatus(status) {
  if (!isValidObjectiveStatus(status)) {
    throw new Error(`Invalid objective status: "${status}".`);
  }
}

export function canTransitionObjectiveStatus(currentStatus, nextStatus) {
  if (!isValidObjectiveStatus(currentStatus) || !isValidObjectiveStatus(nextStatus)) {
    return false;
  }
  const allowed = OBJECTIVE_STATUS_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.has(nextStatus));
}

export function assertObjectiveStatusTransition(currentStatus, nextStatus) {
  if (!canTransitionObjectiveStatus(currentStatus, nextStatus)) {
    throw new Error(
      `Invalid objective status transition: "${currentStatus}" -> "${nextStatus}".`
    );
  }
}
