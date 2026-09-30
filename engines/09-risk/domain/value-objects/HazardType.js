/**
 * Engine 09: Risk Engine — HazardType Value Object
 * Canonical environmental hazard categories and their intrinsic severity weights.
 */

import { RiskLevel } from './RiskLevel.js';

export const HazardType = Object.freeze({
  FLOOD: 'FLOOD',
  DROUGHT: 'DROUGHT',
  WILDFIRE: 'WILDFIRE',
  LANDSLIDE: 'LANDSLIDE',
  STORM: 'STORM',
  POLLUTION: 'POLLUTION',
  EPIDEMIC: 'EPIDEMIC',
  DEFORESTATION: 'DEFORESTATION',
  OTHER: 'OTHER'
});

/**
 * Intrinsic hazard severity weights (0-1) applied to the risk score calculation.
 * Higher weight = greater destructive potential per unit of observed intensity.
 */
export const HAZARD_WEIGHTS = Object.freeze({
  [HazardType.FLOOD]: 1.0,
  [HazardType.DROUGHT]: 0.85,
  [HazardType.WILDFIRE]: 0.95,
  [HazardType.LANDSLIDE]: 0.9,
  [HazardType.STORM]: 0.8,
  [HazardType.POLLUTION]: 0.7,
  [HazardType.EPIDEMIC]: 0.9,
  [HazardType.DEFORESTATION]: 0.6,
  [HazardType.OTHER]: 0.5
});

export function isValidHazardType(hazardType) {
  return Object.values(HazardType).includes(hazardType);
}

export function assertValidHazardType(hazardType) {
  if (!isValidHazardType(hazardType)) {
    throw new Error(`Invalid hazard type: "${hazardType}".`);
  }
}

export function normalizeHazardType(hazardType) {
  const normalized = String(hazardType ?? '').trim().toUpperCase();
  assertValidHazardType(normalized);
  return normalized;
}

export function hazardWeight(hazardType) {
  return HAZARD_WEIGHTS[normalizeHazardType(hazardType)];
}

/**
 * Canonical default escalation thresholds per hazard category.
 * A risk assessment breaches its threshold when the assessed RiskLevel is at or
 * above the configured minimum level. GLOBAL_THRESHOLD_KEY applies to any hazard
 * without a specific override.
 */
export const GLOBAL_THRESHOLD_KEY = '*';

export const DEFAULT_MINIMUM_LEVEL_BY_HAZARD = Object.freeze({
  [HazardType.FLOOD]: RiskLevel.HIGH,
  [HazardType.DROUGHT]: RiskLevel.HIGH,
  [HazardType.WILDFIRE]: RiskLevel.HIGH,
  [HazardType.LANDSLIDE]: RiskLevel.HIGH,
  [HazardType.STORM]: RiskLevel.MODERATE,
  [HazardType.POLLUTION]: RiskLevel.MODERATE,
  [HazardType.EPIDEMIC]: RiskLevel.SEVERE,
  [HazardType.DEFORESTATION]: RiskLevel.MODERATE,
  [HazardType.OTHER]: RiskLevel.HIGH
});

export const GLOBAL_DEFAULT_MINIMUM_LEVEL = RiskLevel.HIGH;