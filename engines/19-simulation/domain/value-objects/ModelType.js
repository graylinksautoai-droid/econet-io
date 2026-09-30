/**
 * Engine 19: Simulation Engine — ModelType Value Object
 * The approved simulation model-type vocabulary.
 *
 * CANONICAL BASIS: Engine 19's registry description names exactly two
 * computational concerns — "Disaster scenario modeling" and "atmospheric
 * dispersion simulation". These two model types therefore reflect canonical
 * named capabilities. No further model types are invented.
 *
 * Model types select a CONTROLLED, built-in deterministic evaluator. Callers
 * never supply executable code.
 */

export const ModelType = Object.freeze({
  DISASTER_SCENARIO: 'DISASTER_SCENARIO',
  ATMOSPHERIC_DISPERSION: 'ATMOSPHERIC_DISPERSION'
});

export function isValidModelType(modelType) {
  return Object.values(ModelType).includes(modelType);
}

export function normalizeModelType(modelType) {
  const normalized = String(modelType ?? '').trim().toUpperCase();
  if (!isValidModelType(normalized)) {
    throw new Error(
      `Invalid simulation model type: "${modelType}". Supported types: DISASTER_SCENARIO, ATMOSPHERIC_DISPERSION.`
    );
  }
  return normalized;
}