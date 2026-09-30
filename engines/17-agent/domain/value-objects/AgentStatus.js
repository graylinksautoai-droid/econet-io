/**
 * Engine 17: Agent Engine — AgentStatus Value Object
 * Agent lifecycle states.
 *
 *   DRAFT     -> ACTIVE | RETIRED
 *   ACTIVE    -> SUSPENDED | RETIRED
 *   SUSPENDED -> ACTIVE | RETIRED
 *   RETIRED   -> (terminal)
 */

export const AgentStatus = Object.freeze({
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  RETIRED: 'RETIRED'
});

const VALID_TRANSITIONS = Object.freeze({
  [AgentStatus.DRAFT]: new Set([AgentStatus.ACTIVE, AgentStatus.RETIRED]),
  [AgentStatus.ACTIVE]: new Set([AgentStatus.SUSPENDED, AgentStatus.RETIRED]),
  [AgentStatus.SUSPENDED]: new Set([AgentStatus.ACTIVE, AgentStatus.RETIRED]),
  [AgentStatus.RETIRED]: new Set()
});

export function canTransitionAgentStatus(currentStatus, nextStatus) {
  if (!Object.values(AgentStatus).includes(currentStatus)) return false;
  if (!Object.values(AgentStatus).includes(nextStatus)) return false;
  const allowed = VALID_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.has(nextStatus));
}

export function assertAgentStatusTransition(currentStatus, nextStatus) {
  if (!canTransitionAgentStatus(currentStatus, nextStatus)) {
    throw new Error(
      `Invalid agent lifecycle transition: "${currentStatus}" -> "${nextStatus}".`
    );
  }
}

/** Whether an agent is allowed to receive/run tasks. */
export function isAgentOperational(status) {
  return status === AgentStatus.ACTIVE;
}