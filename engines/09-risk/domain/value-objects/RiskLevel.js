/**
 * Engine 09: Risk Engine — RiskLevel Value Object
 * Canonical environmental risk tiers and threshold derivation.
 */

export const RiskLevel = Object.freeze({
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  SEVERE: 'SEVERE',
  CATASTROPHIC: 'CATASTROPHIC'
});

export const RISK_LEVEL_RANK = Object.freeze({
  [RiskLevel.LOW]: 0,
  [RiskLevel.MODERATE]: 1,
  [RiskLevel.HIGH]: 2,
  [RiskLevel.SEVERE]: 3,
  [RiskLevel.CATASTROPHIC]: 4
});

/**
 * Inclusive lower-bound score thresholds for each canonical risk tier.
 */
export const RISK_LEVEL_THRESHOLDS = Object.freeze({
  [RiskLevel.LOW]: 0,
  [RiskLevel.MODERATE]: 20,
  [RiskLevel.HIGH]: 40,
  [RiskLevel.SEVERE]: 60,
  [RiskLevel.CATASTROPHIC]: 80
});

export const MIN_RISK_SCORE = 0;
export const MAX_RISK_SCORE = 100;

export function isValidRiskLevel(level) {
  return Object.values(RiskLevel).includes(level);
}

export function assertValidRiskLevel(level) {
  if (!isValidRiskLevel(level)) {
    throw new Error(`Invalid risk level: "${level}".`);
  }
}

export function isValidRiskScore(score) {
  return typeof score === 'number' &&
    Number.isFinite(score) &&
    score >= MIN_RISK_SCORE &&
    score <= MAX_RISK_SCORE;
}

export function assertValidRiskScore(score) {
  if (!isValidRiskScore(score)) {
    throw new Error(
      `Invalid risk score: "${score}". Must be a number between ${MIN_RISK_SCORE} and ${MAX_RISK_SCORE}.`
    );
  }
}

export function clampRiskScore(score) {
  const numeric = Number(score);
  if (Number.isNaN(numeric)) {
    throw new Error(`Invalid risk score for clamping: "${score}".`);
  }
  return Math.min(MAX_RISK_SCORE, Math.max(MIN_RISK_SCORE, Math.round(numeric)));
}

/**
 * Derive the canonical RiskLevel for a normalized risk score (0-100).
 * @param {number} score
 * @returns {string}
 */
export function riskLevelFromScore(score) {
  assertValidRiskScore(score);

  let resolved = RiskLevel.LOW;
  for (const level of Object.values(RiskLevel)) {
    if (score >= RISK_LEVEL_THRESHOLDS[level]) {
      resolved = level;
    }
  }
  return resolved;
}

/**
 * Compare the relative severity of two risk levels.
 * @returns {number} negative if a < b, 0 if equal, positive if a > b
 */
export function compareRiskLevels(a, b) {
  assertValidRiskLevel(a);
  assertValidRiskLevel(b);
  return RISK_LEVEL_RANK[a] - RISK_LEVEL_RANK[b];
}

export function isRiskEscalation(fromLevel, toLevel) {
  return compareRiskLevels(toLevel, fromLevel) > 0;
}

export function isRiskDeescalation(fromLevel, toLevel) {
  return compareRiskLevels(toLevel, fromLevel) < 0;
}

/**
 * Evaluate whether an assessed level meets or exceeds a configured minimum level.
 * @param {string} assessedLevel
 * @param {string} minimumLevel
 * @returns {boolean}
 */
export function isThresholdBreached(assessedLevel, minimumLevel) {
  return compareRiskLevels(assessedLevel, minimumLevel) >= 0;
}