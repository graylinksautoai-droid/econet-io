/**
 * Engine 18: Digital Twin Engine — TwinStatus Value Object
 * Twin lifecycle states. DRAFT -> ACTIVE; ACTIVE may pause, become stale, or go
 * out of sync; RETIRED is terminal. Staleness is never silently treated as
 * synchronization.
 *
 * Transitions:
 *   DRAFT      -> ACTIVE | RETIRED
 *   ACTIVE     -> PAUSED | STALE | OUT_OF_SYNC | RETIRED
 *   PAUSED     -> ACTIVE | RETIRED
 *   STALE      -> ACTIVE | OUT_OF_SYNC | RETIRED
 *   OUT_OF_SYNC-> ACTIVE | RETIRED
 *   RETIRED    -> (terminal)
 */

export const TwinStatus = Object.freeze({
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  STALE: 'STALE',
  OUT_OF_SYNC: 'OUT_OF_SYNC',
  RETIRED: 'RETIRED'
});

const VALID_TRANSITIONS = Object.freeze({
  [TwinStatus.DRAFT]: new Set([TwinStatus.ACTIVE, TwinStatus.RETIRED]),
  [TwinStatus.ACTIVE]: new Set([TwinStatus.PAUSED, TwinStatus.STALE, TwinStatus.OUT_OF_SYNC, TwinStatus.RETIRED]),
  [TwinStatus.PAUSED]: new Set([TwinStatus.ACTIVE, TwinStatus.RETIRED]),
  [TwinStatus.STALE]: new Set([TwinStatus.ACTIVE, TwinStatus.OUT_OF_SYNC, TwinStatus.RETIRED]),
  [TwinStatus.OUT_OF_SYNC]: new Set([TwinStatus.ACTIVE, TwinStatus.RETIRED]),
  [TwinStatus.RETIRED]: new Set()
});

export function canTransitionTwinStatus(currentStatus, nextStatus) {
  if (!Object.values(TwinStatus).includes(currentStatus)) return false;
  if (!Object.values(TwinStatus).includes(nextStatus)) return false;
  const allowed = VALID_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.has(nextStatus));
}

export function assertTwinStatusTransition(currentStatus, nextStatus) {
  if (!canTransitionTwinStatus(currentStatus, nextStatus)) {
    throw new Error(
      `Invalid twin lifecycle transition: "${currentStatus}" -> "${nextStatus}".`
    );
  }
}

/** Whether synchronization processing is permitted in the given status. */
export function canSynchronizeTwin(status) {
  return status === TwinStatus.ACTIVE || status === TwinStatus.STALE || status === TwinStatus.OUT_OF_SYNC;
}