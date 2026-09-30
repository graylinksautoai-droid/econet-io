/**
 * Engine 17: Agent Engine — TaskExecutionStatus Value Object
 * Execution state machine for agent task executions (controlled start ->
 * execution -> completion/failure/cancellation/timeout).
 *
 *   PENDING    -> RUNNING | CANCELLED
 *   RUNNING    -> COMPLETED | FAILED | CANCELLED | TIMED_OUT
 *   COMPLETED/FAILED/CANCELLED/TIMED_OUT -> (terminal)
 */

export const ExecutionStatus = Object.freeze({
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  TIMED_OUT: 'TIMED_OUT'
});

const VALID_TRANSITIONS = Object.freeze({
  [ExecutionStatus.PENDING]: new Set([ExecutionStatus.RUNNING, ExecutionStatus.CANCELLED]),
  [ExecutionStatus.RUNNING]: new Set([
    ExecutionStatus.COMPLETED,
    ExecutionStatus.FAILED,
    ExecutionStatus.CANCELLED,
    ExecutionStatus.TIMED_OUT
  ]),
  [ExecutionStatus.COMPLETED]: new Set(),
  [ExecutionStatus.FAILED]: new Set(),
  [ExecutionStatus.CANCELLED]: new Set(),
  [ExecutionStatus.TIMED_OUT]: new Set()
});

export function canTransitionExecution(currentStatus, nextStatus) {
  if (!Object.values(ExecutionStatus).includes(currentStatus)) return false;
  if (!Object.values(ExecutionStatus).includes(nextStatus)) return false;
  const allowed = VALID_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.has(nextStatus));
}

export function assertExecutionTransition(currentStatus, nextStatus) {
  if (!canTransitionExecution(currentStatus, nextStatus)) {
    throw new Error(
      `Invalid execution lifecycle transition: "${currentStatus}" -> "${nextStatus}".`
    );
  }
}

export function isTerminalExecution(status) {
  return [ExecutionStatus.COMPLETED, ExecutionStatus.FAILED, ExecutionStatus.CANCELLED, ExecutionStatus.TIMED_OUT].includes(status);
}