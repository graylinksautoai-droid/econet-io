/**
 * Engine 19: Simulation Engine — RunStatus Value Object
 * Simulation run lifecycle with explicit, enforced transitions.
 *
 *   CREATED  -> RUNNING | CANCELLED
 *   RUNNING  -> COMPLETED | FAILED | CANCELLED
 *   COMPLETED -> (terminal)
 *   FAILED    -> (terminal)
 *   CANCELLED -> (terminal)
 *
 * COMPLETED is terminal: a completed run's result is never erased to satisfy a
 * cancellation request.
 */

export const RunStatus = Object.freeze({
  CREATED: 'CREATED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
});

const VALID_TRANSITIONS = Object.freeze({
  [RunStatus.CREATED]: new Set([RunStatus.RUNNING, RunStatus.CANCELLED]),
  [RunStatus.RUNNING]: new Set([RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED]),
  [RunStatus.COMPLETED]: new Set(),
  [RunStatus.FAILED]: new Set(),
  [RunStatus.CANCELLED]: new Set()
});

export function canTransitionRunStatus(currentStatus, nextStatus) {
  if (!Object.values(RunStatus).includes(currentStatus)) return false;
  if (!Object.values(RunStatus).includes(nextStatus)) return false;
  const allowed = VALID_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.has(nextStatus));
}

export function assertRunStatusTransition(currentStatus, nextStatus) {
  if (!canTransitionRunStatus(currentStatus, nextStatus)) {
    throw new Error(
      `Invalid simulation run transition: "${currentStatus}" -> "${nextStatus}".`
    );
  }
}

export function isTerminalRunStatus(status) {
  return [RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED].includes(status);
}