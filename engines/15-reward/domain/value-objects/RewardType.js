/**
 * Engine 15: Reward Engine — RewardType Value Object
 * Canonical reward category vocabulary.
 * Derived from the canonical registry mission ("point accounting, token balances")
 * and the broader approved Reward purpose (XP, achievements).
 *
 * No amounts, units, exchange rates, or supply semantics are defined here;
 * those are caller/config-supplied values.
 */

export const RewardType = Object.freeze({
  XP: 'XP',
  POINTS: 'POINTS',
  TOKEN: 'TOKEN',
  ACHIEVEMENT: 'ACHIEVEMENT'
});

export function isValidRewardType(rewardType) {
  return Object.values(RewardType).includes(rewardType);
}

export function normalizeRewardType(rewardType) {
  const normalized = String(rewardType ?? '').trim().toUpperCase();
  if (!isValidRewardType(normalized)) {
    throw new Error(`Invalid reward type: "${rewardType}". Must be one of XP, POINTS, TOKEN, ACHIEVEMENT.`);
  }
  return normalized;
}

/**
 * Validate an explicit reward amount.
 * Amounts are never invented by the engine; this validates caller/config-supplied
 * values only. Grants must be positive; non-negative is not a valid grant.
 */
export function assertValidRewardAmount(amount) {
  const numeric = Number(amount);
  if (Number.isNaN(numeric) || !Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(
      `Invalid reward amount: "${amount}". Must be a positive finite number.`
    );
  }
  return numeric;
}