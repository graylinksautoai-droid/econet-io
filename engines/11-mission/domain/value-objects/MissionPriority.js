/**
 * Engine 11: Mission Engine — MissionPriority Value Object.
 * Canonical mission priority tiers and weighting.
 * (Implementation baseline; no prior repository precedent.)
 */

export const MissionPriority = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
});

export const MISSION_PRIORITY_RANK = Object.freeze({
  [MissionPriority.LOW]: 0,
  [MissionPriority.MEDIUM]: 1,
  [MissionPriority.HIGH]: 2,
  [MissionPriority.CRITICAL]: 3
});

export function isValidMissionPriority(priority) {
  return Object.values(MissionPriority).includes(priority);
}

export function assertValidMissionPriority(priority) {
  if (!isValidMissionPriority(priority)) {
    throw new Error(`Invalid mission priority: "${priority}".`);
  }
}

/**
 * Normalize a priority tier, accepting case-insensitive input.
 * @param {string} priority
 * @returns {string}
 */
export function normalizeMissionPriority(priority) {
  const normalized = String(priority ?? '').trim().toUpperCase();
  assertValidMissionPriority(normalized);
  return normalized;
}

/**
 * Resolve the numeric priority weight used for ordering/filtering.
 * @param {string} priority
 * @returns {number}
 */
export function missionPriorityWeight(priority) {
  return MISSION_PRIORITY_RANK[normalizeMissionPriority(priority)];
}
