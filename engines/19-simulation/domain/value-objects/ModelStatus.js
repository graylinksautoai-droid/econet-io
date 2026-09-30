/**
 * Engine 19: Simulation Engine — ModelStatus Value Object
 * Registered simulation model lifecycle.
 *
 *   ACTIVE  -> RETIRED
 *   RETIRED -> (terminal)
 *
 * A model version's meaning is never silently mutated after publication: a
 * change requires a new version.
 */

export const ModelStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  RETIRED: 'RETIRED'
});

export function canTransitionModelStatus(currentStatus, nextStatus) {
  if (currentStatus === ModelStatus.ACTIVE && nextStatus === ModelStatus.RETIRED) return true;
  return false;
}

export function assertModelStatusTransition(currentStatus, nextStatus) {
  if (!canTransitionModelStatus(currentStatus, nextStatus)) {
    throw new Error(
      `Invalid simulation model transition: "${currentStatus}" -> "${nextStatus}".`
    );
  }
}

export function isModelUsable(status) {
  return status === ModelStatus.ACTIVE;
}