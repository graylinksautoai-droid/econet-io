/**
 * Engine 20: Integration Engine — ConnectorStatus Value Object
 *
 * External connector lifecycle:
 *
 *   DRAFT    → ACTIVE | RETIRED
 *   ACTIVE   → PAUSED | RETIRED
 *   PAUSED   → ACTIVE | RETIRED
 *   RETIRED  → (terminal)
 *
 * A connector begins as DRAFT when registered. It must be explicitly activated
 * before it can be used. RETIRED is terminal: a retired connector cannot be
 * reactivated. Pausing is reversible; retiring is not.
 */

export const ConnectorStatus = Object.freeze({
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  RETIRED: 'RETIRED'
});

const VALID_TRANSITIONS = Object.freeze({
  [ConnectorStatus.DRAFT]: new Set([ConnectorStatus.ACTIVE, ConnectorStatus.RETIRED]),
  [ConnectorStatus.ACTIVE]: new Set([ConnectorStatus.PAUSED, ConnectorStatus.RETIRED]),
  [ConnectorStatus.PAUSED]: new Set([ConnectorStatus.ACTIVE, ConnectorStatus.RETIRED]),
  [ConnectorStatus.RETIRED]: new Set()
});

export function canTransitionConnectorStatus(currentStatus, nextStatus) {
  if (!Object.values(ConnectorStatus).includes(currentStatus)) return false;
  if (!Object.values(ConnectorStatus).includes(nextStatus)) return false;
  return Boolean(VALID_TRANSITIONS[currentStatus]?.has(nextStatus));
}

export function assertConnectorStatusTransition(currentStatus, nextStatus) {
  if (!canTransitionConnectorStatus(currentStatus, nextStatus)) {
    throw new Error(
      `Invalid connector status transition: "${currentStatus}" -> "${nextStatus}".`
    );
  }
}

export function isTerminalConnectorStatus(status) {
  return status === ConnectorStatus.RETIRED;
}

export function isOperationalConnectorStatus(status) {
  return status === ConnectorStatus.ACTIVE;
}
