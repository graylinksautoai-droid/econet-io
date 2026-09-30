/**
 * API v2 — Engine 19 Simulation Routes
 *
 * Exposes Engine 19 (SimulationEngine) at /api/v2/simulation.
 *
 * IMPORTANT: All results carry DATA_ORIGIN_SIMULATED.
 * Simulated outcomes are clearly labelled and NEVER written to the
 * production mission, report, or community collections.
 *
 * Built-in environmental models are pre-registered on first use so the
 * caller does not need to understand the registration flow.
 *
 * Routes:
 *   GET  /api/v2/simulation/models          — list available models
 *   GET  /api/v2/simulation/scenarios       — list existing scenarios
 *   POST /api/v2/simulation/run             — run a built-in scenario
 *   GET  /api/v2/simulation/results/:runId  — fetch a run result
 *   GET  /api/v2/simulation/presets         — list available intervention presets
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import {
  SimulationApplicationService
} from '../../../engines/19-simulation/application/services/SimulationApplicationService.js';
import { InMemorySimulationRepository } from '../../../engines/19-simulation/infrastructure/repositories/InMemorySimulationRepository.js';

const router = Router();

// Singleton service — same lifecycle as the process
const simulationService = new SimulationApplicationService({
  repository: new InMemorySimulationRepository()
});

const SYSTEM_ACTOR = { actorId: 'system-simulation', roles: ['system', 'simulation_operator'] };

// ─── Pre-registered models ────────────────────────────────────────────────────
// These represent real-world environmental intervention patterns.
// Each model maps a set of input parameters to a projected outcome over time.

const PRESET_MODELS = [
  {
    name:           'Flood Disaster Impact',
    version:        '1.0',
    modelType:      'DISASTER_SCENARIO',
    parameterNames: ['hazardIntensity', 'exposedPopulation', 'vulnerabilityIndex', 'responseCapacityIndex'],
    description:    'Projects flood disaster impact index and affected population from hazard intensity and community vulnerability.'
  },
  {
    name:           'Industrial Pollution Dispersion',
    version:        '1.0',
    modelType:      'ATMOSPHERIC_DISPERSION',
    parameterNames: ['emissionRate', 'windSpeed', 'downwindDistance', 'initialSpreadM', 'spreadCoefficient'],
    description:    'Models ground-level pollutant concentration downwind from an industrial emission source.'
  }
];

let modelsRegistered = false;

async function ensureModelsRegistered() {
  if (modelsRegistered) return;
  for (const preset of PRESET_MODELS) {
    try {
      await simulationService.execute({
        commandType:    'RegisterSimulationModel',
        targetEngine:   '19-simulation',
        idempotencyKey: `register-${preset.name.replace(/\s+/g, '-')}-${preset.version}`,
        actor:          SYSTEM_ACTOR,
        payload: {
          name:           preset.name,
          version:        preset.version,
          modelType:      preset.modelType,
          parameterNames: preset.parameterNames
        }
      });
    } catch (e) {
      // Already registered on a previous call — idempotent
    }
  }
  modelsRegistered = true;
}

// ─── GET /api/v2/simulation/presets ──────────────────────────────────────────

router.get('/presets', async (req, res) => {
  return res.json({
    presets: PRESET_MODELS.map(m => ({
      name:           m.name,
      version:        m.version,
      modelType:      m.modelType,
      parameterNames: m.parameterNames,
      description:    m.description
    })),
    simulationMode: true,
    note: 'All outputs are SIMULATED estimates. They are not verified environmental outcomes.'
  });
});

// ─── GET /api/v2/simulation/models ───────────────────────────────────────────

router.get('/models', async (req, res) => {
  try {
    await ensureModelsRegistered();
    const models = await simulationService.listModels();
    return res.json({ models, total: models.length, simulationMode: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/v2/simulation/scenarios ────────────────────────────────────────

router.get('/scenarios', async (req, res) => {
  try {
    const scenarios = await simulationService.listScenarios();
    return res.json({ scenarios, total: scenarios.length, simulationMode: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/v2/simulation/run ─────────────────────────────────────────────
// Body: { modelName, parameters: { ... }, scenarioName?, description? }

router.post('/run', async (req, res) => {
  const { modelName, parameters, scenarioName, description } = req.body;

  if (!modelName || typeof modelName !== 'string') {
    return res.status(400).json({ error: 'modelName is required', code: 'VALIDATION_ERROR' });
  }
  if (!parameters || typeof parameters !== 'object') {
    return res.status(400).json({ error: 'parameters object is required', code: 'VALIDATION_ERROR' });
  }

  try {
    await ensureModelsRegistered();

    // Find the model
    const models = await simulationService.listModels();
    const model = models.find(m => m.name === modelName);
    if (!model) {
      return res.status(404).json({
        error: `Model "${modelName}" not found. Use GET /api/v2/simulation/presets to see available models.`
      });
    }

    const idKey = randomUUID();

    // Create scenario
    const scenarioResult = await simulationService.execute({
      commandType:    'CreateScenario',
      targetEngine:   '19-simulation',
      idempotencyKey: `scenario-${idKey}`,
      actor:          SYSTEM_ACTOR,
      payload: {
        modelId:     model.modelId,
        name:        scenarioName || `${modelName} scenario`,
        description: description  || `Simulation run for ${modelName}`,
        parameters
      }
    });

    // Execute the run
    const runResult = await simulationService.execute({
      commandType:    'RunSimulation',
      targetEngine:   '19-simulation',
      idempotencyKey: `run-${idKey}`,
      actor:          SYSTEM_ACTOR,
      payload: { scenarioId: scenarioResult.scenario.scenarioId }
    });

    const result = await simulationService.getResultByRunId(runResult.run.runId);

    return res.status(201).json({
      simulationMode: true,
      warning:        'These are SIMULATED estimates, not verified environmental outcomes.',
      run:            runResult.run,
      result:         result,
      model: {
        name:    model.name,
        version: model.version,
        type:    model.modelType
      }
    });
  } catch (err) {
    console.error('[simulation] run error:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// ─── GET /api/v2/simulation/results/:runId ───────────────────────────────────

router.get('/results/:runId', async (req, res) => {
  try {
    const result = await simulationService.getResultByRunId(req.params.runId);
    if (!result) return res.status(404).json({ error: 'Result not found', runId: req.params.runId });
    return res.json({ result, simulationMode: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
