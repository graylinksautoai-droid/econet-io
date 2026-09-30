/**
 * Engine 17: Agent Engine — AgentKind Value Object
 * Canonical agent-kind vocabulary.
 *
 * The LILO prototype exposes Scout, Analyst, Guardian, Guide, and Coordinator
 * concepts. Under formal Engine 17 orchestration these are capability kinds;
 * the actual domain behavior (disaster detection, credibility scoring,
 * anti-abuse, dialogue) remains owned by other canonical engines and is
 * reached through INJECTED capability handlers, never embedded here.
 */

export const AgentKind = Object.freeze({
  SCOUT: 'SCOUT',
  ANALYST: 'ANALYST',
  GUARDIAN: 'GUARDIAN',
  GUIDE: 'GUIDE',
  COORDINATOR: 'COORDINATOR',
  GENERIC: 'GENERIC'
});

export function isValidAgentKind(kind) {
  return Object.values(AgentKind).includes(kind);
}

export function normalizeAgentKind(kind) {
  const normalized = String(kind ?? '').trim().toUpperCase();
  if (!isValidAgentKind(normalized)) {
    throw new Error(
      `Invalid agent kind: "${kind}". Must be one of SCOUT, ANALYST, GUARDIAN, GUIDE, COORDINATOR, GENERAL.`
    );
  }
  return normalized;
}