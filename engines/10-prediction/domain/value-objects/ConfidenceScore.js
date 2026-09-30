/**
 * Engine 10: Prediction Engine — ConfidenceScore Value Object helpers.
 * Validates normalized model confidence and forecast error margins.
 */

export const MIN_CONFIDENCE_SCORE = 0;
export const MAX_CONFIDENCE_SCORE = 1;

export const NORMALIZED_SCORE_PRECISION = 12;

export function normalizeScorePrecision(value) {
  return Number(value.toFixed(NORMALIZED_SCORE_PRECISION));
}

const assertNormalizedNumber = (value, fieldName) => {
  if (typeof value !== 'number' || !Number.isFinite(value) ||
      value < MIN_CONFIDENCE_SCORE || value > MAX_CONFIDENCE_SCORE) {
    throw new Error(`${fieldName} must be a finite number between 0.0 and 1.0.`);
  }
  return value;
};

export function assertConfidenceScore(value) {
  return assertNormalizedNumber(value, 'Confidence score');
}

export function assertErrorMargin(value) {
  return assertNormalizedNumber(value, 'Error margin');
}

/**
 * Return the clamped confidence interval around a normalized probability.
 * @param {number} probability
 * @param {number} errorMargin
 * @returns {{ lowerBound: number, upperBound: number }}
 */
export function calculateConfidenceInterval(probability, errorMargin) {
  assertNormalizedNumber(probability, 'Impact probability');
  assertErrorMargin(errorMargin);

  return Object.freeze({
    lowerBound: normalizeScorePrecision(Math.max(MIN_CONFIDENCE_SCORE, probability - errorMargin)),
    upperBound: normalizeScorePrecision(Math.min(MAX_CONFIDENCE_SCORE, probability + errorMargin))
  });
}