/**
 * Engine 18: Digital Twin Engine — SynchronizationStatus Value Object
 * The synchronization health of a twin relative to its source(s).
 * A twin may be CURRENT (fresh), DELAYED, STALE, OUT_OF_SYNC, DISCONNECTED,
 * UNKNOWN. Staleness is derived from the freshness policy, never silently
 * treated as synchronization.
 */

export const SynchronizationStatus = Object.freeze({
  CURRENT: 'CURRENT',
  PARTIALLY_SYNCHRONIZED: 'PARTIALLY_SYNCHRONIZED',
  PENDING: 'PENDING',
  DELAYED: 'DELAYED',
  STALE: 'STALE',
  OUT_OF_SYNC: 'OUT_OF_SYNC',
  DISCONNECTED: 'DISCONNECTED',
  UNKNOWN: 'UNKNOWN'
});

export function isValidSyncStatus(status) {
  return Object.values(SynchronizationStatus).includes(status);
}

export function normalizeSyncStatus(status) {
  const normalized = String(status ?? '').trim().toUpperCase();
  if (!isValidSyncStatus(normalized)) {
    throw new Error(`Invalid synchronization status: "${status}".`);
  }
  return normalized;
}