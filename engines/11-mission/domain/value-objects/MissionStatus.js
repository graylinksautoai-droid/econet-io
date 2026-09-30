/**
 * Engine 11: Mission Engine — MissionStatus Value Object.
 * Canonical mission lifecycle states and deterministic transitions.
 * Lifecycle is an implementation baseline; no prior repository precedent.
 * COMPLETED and ABORTED are terminal.
 */

export const MissionStatus = Object.freeze({
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  COMPLETED: 'COMPLETED',
  ABORTED: 'ABORTED'
});

export const MISSION_STATUS_TRANSITIONS = Object.freeze({
  [MissionStatus.DRAFT]: new Set([MissionStatus.ACTIVE]),
  [MissionStatus.ACTIVE]: new Set([
    MissionStatus.SUSPENDED,
    MissionStatus.COMPLETED,
    MissionStatus.ABORTED
  ]),
  [MissionStatus.SUSPENDED]: new Set([
    MissionStatus.ACTIVE,
    MissionStatus.ABORTED
  ]),
  [MissionStatus.COMPLETED]: new Set(),
  [MissionStatus.ABORTED]: new Set()
});

export function isValidMissionStatus(status) {
  return Object.values(MissionStatus).includes(status);
}

export function assertValidMissionStatus(status) {
  if (!isValidMissionStatus(status)) {
    throw new Error(`Invalid mission status: "${status}".`);
  }
}

export function canTransitionMissionStatus(currentStatus, nextStatus) {
  if (!isValidMissionStatus(currentStatus) || !isValidMissionStatus(nextStatus)) {
    return false;
  }
  const allowed = MISSION_STATUS_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.has(nextStatus));
}

export function assertMissionStatusTransition(currentStatus, nextStatus) {
  if (!canTransitionMissionStatus(currentStatus, nextStatus)) {
    throw new Error(
      `Invalid mission lifecycle transition: "${currentStatus}" -> "${nextStatus}".`
    );
  }
}

export function isTerminalMissionStatus(status) {
  return status === MissionStatus.COMPLETED || status === MissionStatus.ABORTED;
}
