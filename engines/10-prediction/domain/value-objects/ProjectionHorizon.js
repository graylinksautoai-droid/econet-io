/**
 * Engine 10: Prediction Engine — ProjectionHorizon Value Object.
 * Defines canonical temporal projection tiers without imposing an unapproved
 * duration policy on caller-provided projection windows.
 */

export const ProjectionHorizon = Object.freeze({
  SHORT_TERM: 'SHORT_TERM',
  MEDIUM_TERM: 'MEDIUM_TERM',
  LONG_TERM: 'LONG_TERM'
});

export function isValidProjectionHorizon(horizon) {
  return Object.values(ProjectionHorizon).includes(horizon);
}

export function assertValidProjectionHorizon(horizon) {
  if (!isValidProjectionHorizon(horizon)) {
    throw new Error(`Invalid projection horizon: "${horizon}".`);
  }
}

/**
 * Normalize and validate a caller-owned temporal projection window.
 * @param {{ startsAt: string, endsAt: string }} window
 * @returns {{ startsAt: string, endsAt: string }}
 */
export function normalizeProjectionWindow(window) {
  if (!window || typeof window !== 'object' || Array.isArray(window)) {
    throw new Error('Projection window must be an object with startsAt and endsAt.');
  }

  const { startsAt, endsAt } = window;
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  if (typeof startsAt !== 'string' || Number.isNaN(startMs)) {
    throw new Error('Projection window requires a valid ISO-8601 startsAt timestamp.');
  }
  if (typeof endsAt !== 'string' || Number.isNaN(endMs)) {
    throw new Error('Projection window requires a valid ISO-8601 endsAt timestamp.');
  }
  if (endMs <= startMs) {
    throw new Error('Projection window endsAt must be after startsAt.');
  }

  return Object.freeze({ startsAt, endsAt });
}