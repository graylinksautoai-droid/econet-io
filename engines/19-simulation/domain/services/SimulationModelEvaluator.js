/**
 * Engine 19: Simulation Engine — SimulationModelEvaluator Domain Service
 *
 * CONTROLLED EXECUTION BOUNDARY.
 *
 * This service contains the ONLY executable simulation logic in Engine 19.
 * Callers never supply code: a model type selects one of these built-in, pure,
 * deterministic evaluators. No eval, no dynamic import, no I/O, no network, no
 * filesystem access, no randomness.
 *
 * DETERMINISM: identical (modelType, parameters) input always yields identical
 * output. There is no stochastic behaviour, so no random seed is required.
 *
 * NUMERICAL NOTE (IMPLEMENTATION DETAIL — NOT CANONICAL):
 * The canonical registry names the capabilities "disaster scenario modeling",
 * "atmospheric dispersion simulation" and "what-if impact analysis", but no
 * canonical equation set exists in the repository. The formulas below are
 * Engine 19 implementation details chosen to be closed-form (O(1)),
 * dimensionally coherent and monotonic in the expected directions. They are
 * NOT canonical environmental equations and must be replaced if an approved
 * model specification is issued.
 *
 * Both model types are closed-form with no iteration or timesteps, so no
 * iteration/timestep resource limits are required.
 */

import { ModelType, normalizeModelType } from '../value-objects/ModelType.js';

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const round = (value, dp) => Number(value.toFixed(dp));

/**
 * Per-model-type parameter vocabulary. REQUIRED parameters must be declared by
 * model registration; OPTIONAL parameters may be declared and receive the
 * documented default when omitted.
 */
const MODEL_PARAMETER_SCHEMAS = Object.freeze({
  [ModelType.DISASTER_SCENARIO]: Object.freeze({
    required: Object.freeze({
      hazardIntensity: Object.freeze({ type: 'number', units: 'dimensionless', min: 0, max: 1 }),
      exposedPopulation: Object.freeze({ type: 'number', units: 'count', min: 0 }),
      vulnerabilityIndex: Object.freeze({ type: 'number', units: 'dimensionless', min: 0, max: 1 })
    }),
    optional: Object.freeze({
      responseCapacityIndex: Object.freeze({ type: 'number', units: 'dimensionless', min: 0, max: 1, default: 0.5 })
    }),
    outputs: Object.freeze(['impactIndex', 'projectedAffectedPopulation'])
  }),
  [ModelType.ATMOSPHERIC_DISPERSION]: Object.freeze({
    required: Object.freeze({
      emissionRate: Object.freeze({ type: 'number', units: 'kg/s', min: 0 }),
      windSpeed: Object.freeze({ type: 'number', units: 'm/s', min: 0.1 }),
      downwindDistance: Object.freeze({ type: 'number', units: 'm', min: 0.1 })
    }),
    optional: Object.freeze({
      initialSpreadM: Object.freeze({ type: 'number', units: 'm', min: 0.01, default: 1 }),
      spreadCoefficient: Object.freeze({ type: 'number', units: 'dimensionless', min: 0.0001, default: 0.1 })
    }),
    outputs: Object.freeze(['groundLevelConcentration'])
  })
});

const SUPPORTED_UNITS = Object.freeze([
  'dimensionless', 'count', 'kg/s', 'm/s', 'm', 'kg/m^3'
]);

export class SimulationModelEvaluator {
  /** Parameter schema for a model type. */
  describeModelType(modelType) {
    return MODEL_PARAMETER_SCHEMAS[normalizeModelType(modelType)];
  }

  /** Every parameter name known to a model type (required + optional). */
  knownParameterNames(modelType) {
    const schema = this.describeModelType(modelType);
    return [...Object.keys(schema.required), ...Object.keys(schema.optional)];
  }

  /** Required parameter names for a model type. */
  requiredParameterNames(modelType) {
    return Object.keys(this.describeModelType(modelType).required);
  }

  /**
   * Evaluate a model deterministically.
   * @param {{modelType: string, parameters: Object}} params
   * @returns {{outputs: Object, units: Object}}
   */
  evaluate({ modelType, parameters }) {
    const normalized = normalizeModelType(modelType);
    if (parameters === null || typeof parameters !== 'object' || Array.isArray(parameters)) {
      throw new Error('Simulation evaluation requires an object parameter set.');
    }

    const resolved = this._resolveParameters(normalized, parameters);

    if (normalized === ModelType.DISASTER_SCENARIO) {
      return this._evaluateDisasterScenario(resolved);
    }
    return this._evaluateAtmosphericDispersion(resolved);
  }

  _resolveParameters(modelType, parameters) {
    const schema = this.describeModelType(modelType);
    const resolved = {};

    for (const name of Object.keys(schema.required)) {
      if (!(name in parameters)) {
        throw new Error(`Missing required parameter "${name}" for model type ${modelType}.`);
      }
      resolved[name] = this._assertNumeric(name, parameters[name], schema.required[name]);
    }

    for (const name of Object.keys(schema.optional)) {
      const definition = schema.optional[name];
      resolved[name] = (name in parameters)
        ? this._assertNumeric(name, parameters[name], definition)
        : definition.default;
    }

    for (const name of Object.keys(parameters)) {
      if (!(name in resolved)) {
        throw new Error(`Unknown parameter "${name}" for model type ${modelType}.`);
      }
    }

    return resolved;
  }

  _assertNumeric(name, value, definition) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Parameter "${name}" must be a finite number.`);
    }
    if (definition.min !== undefined && value < definition.min) {
      throw new Error(`Parameter "${name}" is below the minimum of ${definition.min}.`);
    }
    if (definition.max !== undefined && value > definition.max) {
      throw new Error(`Parameter "${name}" is above the maximum of ${definition.max}.`);
    }
    return value;
  }

  /**
   * Disaster scenario / what-if impact kernel (implementation detail).
   *   impactIndex = clamp01( hazardIntensity x vulnerabilityIndex x (2 - responseCapacityIndex) / 2 )
   *   projectedAffectedPopulation = round( exposedPopulation x impactIndex )
   */
  _evaluateDisasterScenario(p) {
    const impactIndex = round(
      clamp01((p.hazardIntensity * p.vulnerabilityIndex * (2 - p.responseCapacityIndex)) / 2),
      6
    );
    const projectedAffectedPopulation = Math.round(p.exposedPopulation * impactIndex);
    return {
      outputs: { impactIndex, projectedAffectedPopulation },
      units: { impactIndex: 'dimensionless', projectedAffectedPopulation: 'count' }
    };
  }

  /**
   * Atmospheric dispersion kernel (implementation detail).
   * Steady-state ground-level concentration with an expanding-plume kernel:
   *   C(x) = emissionRate / (pi x windSpeed x (initialSpreadM + spreadCoefficient x x)^2)
   */
  _evaluateAtmosphericDispersion(p) {
    const spread = p.initialSpreadM + (p.spreadCoefficient * p.downwindDistance);
    const concentration = p.emissionRate / (Math.PI * p.windSpeed * spread * spread);
    return {
      outputs: { groundLevelConcentration: round(concentration, 12) },
      units: { groundLevelConcentration: 'kg/m^3' }
    };
  }

  static supportedUnits() {
    return [...SUPPORTED_UNITS];
  }
}