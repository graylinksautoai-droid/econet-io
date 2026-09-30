/**
 * Engine 18: Digital Twin Engine — TwinState service operating on state values.
 * Separates incoming data from accepted authoritative state. An incoming update
 * is not authoritative merely because it was received.
 *
 * Provides deterministic validation helpers used by the application layer:
 * timestamp ordering, unit/range checks, and freshness evaluation.
 */

export function parseISODate(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} requires a valid ISO-8601 string.`);
  }
  return new Date(value);
}

/**
 * Older-update policy. Default: reject an update whose observedAt is older than
 * the accepted observedAt (a late-arriving observation must not silently
 * overwrite a newer state). Overridable per property class via options.
 */
export function isOlderThanCurrent(updateObservedAt, currentObservedAt, options = {}) {
  if (!currentObservedAt) return false;
  const { policy = 'REJECT_OLDER_UPDATE' } = options;
  if (policy === 'REJECT_OLDER_UPDATE') {
    return parseISODate(updateObservedAt, 'update.observedAt').getTime() <
      parseISODate(currentObservedAt, 'current.observedAt').getTime();
  }
  return false;
}

/**
 * Evaluate whether a twin's last accepted observedAt is stale given a
 * maxAcceptableAgeMs freshness policy. No single global threshold is assumed.
 */
export function evaluateFreshness(lastObservedAt, nowIso, maxAcceptableAgeMs) {
  if (!lastObservedAt) {
    return { stale: true, synchronizationStatus: 'UNKNOWN' };
  }
  if (typeof maxAcceptableAgeMs !== 'number' || maxAcceptableAgeMs <= 0) {
    throw new Error('Freshness policy requires a positive maxAcceptableAgeMs.');
  }
  const age = parseISODate(nowIso, 'now').getTime() - parseISODate(lastObservedAt, 'lastObservedAt').getTime();
  if (age < 0) {
    return { stale: false, synchronizationStatus: 'CURRENT', ageMs: age };
  }
  if (age > maxAcceptableAgeMs) {
    return { stale: true, synchronizationStatus: 'STALE', ageMs: age };
  }
  return { stale: false, synchronizationStatus: 'CURRENT', ageMs: age };
}