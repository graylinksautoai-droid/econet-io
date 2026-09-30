/**
 * Engine 06: Context Engine — ContextAlertLevel Value Object
 * Defines canonical environmental situational alert levels.
 */

export const ContextAlertLevel = Object.freeze({
  NORMAL: 'NORMAL',
  ADVISORY: 'ADVISORY',
  WATCH: 'WATCH',
  WARNING: 'WARNING',
  EMERGENCY: 'EMERGENCY'
});

export const ALERT_LEVEL_SEVERITY = Object.freeze({
  [ContextAlertLevel.NORMAL]: 0,
  [ContextAlertLevel.ADVISORY]: 1,
  [ContextAlertLevel.WATCH]: 2,
  [ContextAlertLevel.WARNING]: 3,
  [ContextAlertLevel.EMERGENCY]: 4
});

export function isValidAlertLevel(level) {
  return Object.values(ContextAlertLevel).includes(level);
}

export function assertValidAlertLevel(level) {
  if (!isValidAlertLevel(level)) {
    throw new Error(`Invalid context alert level: "${level}".`);
  }
}

/**
 * Compare the relative severity of two alert levels.
 * @returns {number} negative if a < b, 0 if equal, positive if a > b
 */
export function compareAlertLevels(a, b) {
  assertValidAlertLevel(a);
  assertValidAlertLevel(b);
  return ALERT_LEVEL_SEVERITY[a] - ALERT_LEVEL_SEVERITY[b];
}

export function isEscalation(fromLevel, toLevel) {
  return compareAlertLevels(toLevel, fromLevel) > 0;
}

export function isDeescalation(fromLevel, toLevel) {
  return compareAlertLevels(toLevel, fromLevel) < 0;
}

/**
 * Derive a canonical alert level from a normalized risk score (0-100).
 * @param {number} riskScore
 * @returns {string}
 */
export function alertLevelFromRiskScore(riskScore) {
  const score = Number(riskScore);
  if (Number.isNaN(score)) {
    throw new Error(`Invalid risk score for alert level derivation: ${riskScore}`);
  }
  if (score >= 90) return ContextAlertLevel.EMERGENCY;
  if (score >= 70) return ContextAlertLevel.WARNING;
  if (score >= 40) return ContextAlertLevel.WATCH;
  if (score >= 15) return ContextAlertLevel.ADVISORY;
  return ContextAlertLevel.NORMAL;
}
