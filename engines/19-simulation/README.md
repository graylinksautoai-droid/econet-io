# Engine 19 — Simulation Engine

## Canonical ownership

Engine 19 owns simulation scenario definition, simulation model registration,
simulation execution, simulation run lifecycle, simulation results, and the
provenance metadata required to reproduce any run. It emits canonical simulation
events through the shared `DomainEvent` / `EventBus` contract.

Engine 19 does **not** own: real-world observations, digital twin state
(Engine 18), prediction/forecasting (Engine 10), agent execution (Engine 17),
mission or action dispatch (Engines 11–12), verification decisions (Engine 13),
reputation or reward accounting (Engines 14–15), community management
(Engine 16), external connectors (Engine 20), governance policy definition
(Engine 22), audit journals (Engine 23), or learning feedback loops (Engine 24).

## Public engine boundary

The engine exposes all operations through `SimulationEngine` (the facade in
`index.js`): `executeCommand(command)`, and the read-only query methods
`getModel`, `listModels`, `getScenario`, `listScenarios`, `getRun`,
`listRunsByScenario`, `getResultByRunId`. No internal domain files are imported
by other engines.

Cross-engine input references (e.g. a Digital Twin snapshot reference) are
accepted as opaque provenance payloads only. Engine 19 records them verbatim and
never interprets, mutates, or reads state from the referenced engine.

## Canonical model types

Two model types are supported, matching the canonical registry description for
Engine 19 exactly:

| Model type | Canonical capability |
|---|---|
| `DISASTER_SCENARIO` | Disaster scenario modeling and what-if impact analysis |
| `ATMOSPHERIC_DISPERSION` | Atmospheric dispersion simulation |

No further model types are invented. Model type selection chooses one of two
built-in, pure, deterministic evaluators. Callers supply numeric parameters;
they never supply executable code.

## Commands

All mutating operations require a `Command` with a valid `idempotencyKey`,
an authenticated `actor`, and one of the authorized simulation roles.

| Command | Description |
|---|---|
| `RegisterSimulationModel` | Register a versioned simulation model with a named parameter vocabulary. Validates that all required parameters for the chosen model type are declared and that no unsupported parameters are included. Duplicate name+version is rejected. |
| `RetireSimulationModel` | Retire an active model. Retired models cannot be used in new simulation runs. Retiring an already-retired model is rejected. |
| `CreateScenario` | Define a reproducible what-if configuration bound to a specific model version with validated numeric parameters, optional opaque `targetReference`, and optional assumptions. |
| `RunSimulation` | Execute a scenario deterministically. Creates a `SimulationRun` and a `SimulationResult`. The model must be `ACTIVE`. Identical inputs always produce identical outputs. The run is idempotent at command level. |
| `CancelSimulation` | Cancel a `CREATED` or `RUNNING` run. Completed, failed, or already-cancelled runs cannot be cancelled. Note: the application service creates runs directly at `RUNNING` status; a `CREATED`-status run is a valid lifecycle state supported by `RunStatus` and the cancellation guard, but is not produced by the current `RunSimulation` implementation. |

## Queries

| Method | Returns |
|---|---|
| `getModel(modelId)` | Single model JSON or `null` |
| `listModels({ modelType?, status? })` | Filtered array of model JSON |
| `getScenario(scenarioId)` | Single scenario JSON or `null` |
| `listScenarios()` | All scenario JSON |
| `getRun(runId)` | Single run JSON or `null` |
| `listRunsByScenario(scenarioId)` | All runs for a scenario |
| `getResultByRunId(runId)` | Result JSON for a completed run or `null` |

## Entities and value objects

**SimulationModel** — Registered, versioned model. Immutable once created.
`retire()` returns a new retired instance. Fields: `modelId`, `name`,
`version`, `modelType`, `parameterNames`, `status`, `createdBy`, `createdAt`.

**SimulationScenario** — Reproducible configuration bound to a model version.
Immutable. Fields: `scenarioId`, `name`, `description`, `modelId`,
`modelVersion`, `targetReference` (opaque, optional), `parameters`,
`assumptions`, `createdBy`, `createdAt`, `updatedAt` (defaults to `createdAt`
at construction; exposed by `toJSON()`).

**SimulationRun** — One execution of one scenario. Immutable; transitions
return new instances via `transitionTo()` and `failWith()`. Fields: `runId`,
`scenarioId`, `modelId`, `modelVersion`, `status`, `requestedBy`,
`inputSnapshot` (frozen copy of parameters + targetReference), `startedAt`,
`completedAt`, `failureReason`, `correlationId`, `metadata`, `createdAt`.

**SimulationResult** — Computed output of a completed run. Always carries
`dataOrigin = 'SIMULATED'`. Immutable. Fields: `resultId`, `runId`,
`scenarioId`, `modelId`, `modelVersion`, `dataOrigin`, `outputs`, `units`,
`provenance` (requestedBy, requestedAt, completedAt, modelType, inputSnapshot,
correlationId), `generatedAt`, `requestedBy`.

**ModelType** — `DISASTER_SCENARIO | ATMOSPHERIC_DISPERSION`. `normalizeModelType`
accepts case-insensitive input and throws on unknown types.

**ModelStatus** — `ACTIVE → RETIRED` (terminal). `isModelUsable(status)` returns
`true` only for `ACTIVE`.

**RunStatus** — `CREATED → RUNNING → COMPLETED | FAILED | CANCELLED`. `COMPLETED`,
`FAILED`, and `CANCELLED` are terminal. `canTransitionRunStatus`,
`assertRunStatusTransition`, and `isTerminalRunStatus` enforce transitions.

## Domain service: SimulationModelEvaluator

The only executable simulation logic in Engine 19. Selects a built-in
deterministic evaluator by model type. No eval, no dynamic import, no I/O,
no network, no filesystem access, no randomness.

**DISASTER_SCENARIO kernel:**

```
impactIndex = clamp01( hazardIntensity × vulnerabilityIndex × (2 − responseCapacityIndex) / 2 )
projectedAffectedPopulation = round( exposedPopulation × impactIndex )
```

Required parameters: `hazardIntensity` (0–1), `exposedPopulation` (≥ 0),
`vulnerabilityIndex` (0–1). Optional: `responseCapacityIndex` (0–1, default 0.5).

**ATMOSPHERIC_DISPERSION kernel:**

```
C(x) = emissionRate / ( π × windSpeed × (initialSpreadM + spreadCoefficient × x)² )
```

Required parameters: `emissionRate` (kg/s, ≥ 0), `windSpeed` (m/s, ≥ 0.1),
`downwindDistance` (m, ≥ 0.1). Optional: `initialSpreadM` (m, default 1),
`spreadCoefficient` (dimensionless, default 0.1).

These formulas are Engine 19 implementation details chosen to be closed-form,
dimensionally coherent, and monotonically correct. They are **not** canonical
environmental equations. They must be replaced if an approved model specification
is issued.

## Authorization

All five mutating commands require the actor to hold one of these roles:
`system`, `admin`, `simulation_operator`, `automation`. Authorization is
enforced before idempotency wrapping, governance evaluation, repository
mutation, and event publication.

The full guard sequence in `execute()`:

1. Commands without an `actor` or without `actor.actorId` throw
   `'Simulation commands require an authenticated actor.'`
2. `_assertAuthorized` is called before entering the idempotency wrapper.
   It treats `actor.roles` that is absent, `null`, or not an array as an
   empty role set — which is then denied. This follows the canonical pattern
   used by Engines 15 and 18.
3. Actors whose `roles` array contains no match for the permitted set receive
   `'Simulation command "..." denied: actor "..." lacks an authorized simulation role.'`

Missing, `null`, non-array, and empty `roles` are all denied — they never pass
silently through the authorization layer.

## Governance

An optional `governance` adapter may be injected. If present, `evaluatePolicy`
is called before any state change or event publication on every mutating command.
A denial result (`allowed: false`) raises a `Governance policy denial` error and
leaves all state untouched.

## Idempotency

All mutating commands require a non-empty `idempotencyKey`. The
`IdempotencyManager` wraps every command dispatch: replaying the same key
returns the cached result without re-executing the operation or emitting
duplicate events.

## Events

All events use the canonical `DomainEvent` envelope and are published to the
injected `EventBus`.

| Event type | Emitted when |
|---|---|
| `econet.simulation.model_registered` | `RegisterSimulationModel` succeeds |
| `econet.simulation.model_retired` | `RetireSimulationModel` succeeds |
| `econet.simulation.scenario_created` | `CreateScenario` succeeds |
| `econet.simulation.run_started` | `RunSimulation` begins execution |
| `econet.simulation.run_completed` | `RunSimulation` succeeds |
| `econet.simulation.run_failed` | `RunSimulation` throws during evaluation |
| `econet.simulation.run_cancelled` | `CancelSimulation` succeeds |

Every event carries `producer: 'engine.19.simulation'` and a `subject` with
`entityType` set to the relevant aggregate (`simulation_model`,
`simulation_scenario`, or `simulation_run`).

## Simulation safety

`SimulationResult.dataOrigin` is always `'SIMULATED'`. Results must never be
presented or consumed as verified real-world observations. The engine does not
write back to any other engine's state, does not control external devices, and
does not execute caller-supplied code. Input references to other engines (e.g.
Digital Twin `twinId`, `stateVersion`) are recorded as opaque provenance only.

## Persistence

`InMemorySimulationRepository` is an isolated Engine 19 adapter. It stores
models, scenarios, runs, and results in private `Map` instances. Run history is
preserved: completed runs and results are never deleted. `clear()` is available
for test teardown. This adapter provides no durable production persistence.
Durable storage and its migration are an acknowledged architectural gap; no
persistent schema was supplied in the canonical specification.

## Canonical lifecycle contract

`SimulationEngine` exposes `initialize()`, `healthCheck()`, and `shutdown()` as
required by `EngineLifecycleManager`. `healthCheck()` reports
`persistence: 'IN_MEMORY_SIMULATION_ADAPTER'` and the current model count.
`shutdown()` is a no-op (in-memory state is discarded when the process exits).

## Test coverage

`tests/SimulationEngine.test.js` — 19 tests covering:

- Model type vocabulary and normalizer
- Evaluator determinism, parameter validation, range checks, unknown parameters
- RunStatus lifecycle transition enforcement
- Entity construction, immutability, and validation (Model, Scenario, Run, Result)
- `RegisterSimulationModel`: success, event emission, type rejection, parameter
  mismatch, duplicate rejection, version isolation, retirement
- `CreateScenario`: success, event, unknown model, unknown/missing/non-finite parameters
- `RunSimulation`: DISASTER_SCENARIO determinism, full provenance, run history,
  ATMOSPHERIC_DISPERSION dimensional coherence and monotonicity, retired model
  rejection, idempotency (no duplicate run on replay)
- `CancelSimulation`: completed run cannot be cancelled, result preserved
- Authorization: all five commands reject actors without a simulation role, and
  commands without an actor
- Governance: policy denial blocks `RunSimulation` before state change or event
- Queries: all getters and list methods, null on unknown IDs
- Repository isolation: no cross-instance state leak
- Unsupported command rejection, missing idempotency key rejection
- Engine lifecycle contract: `engineId`, `engineName`, `initialize`, `healthCheck`,
  `shutdown`

## Known limitations

- Persistence is in-memory only. All state is lost on process restart.
- Only two model types are implemented (`DISASTER_SCENARIO`,
  `ATMOSPHERIC_DISPERSION`). Additional model types require an approved canonical
  specification.
- The evaluator formulas are implementation approximations, not scientifically
  validated environmental models.
- No HTTP routes, message queue workers, or external scheduler integration exist.
  These are out of scope for the current canonical implementation.
- No streaming or long-running simulation timestep support; both kernels are
  closed-form O(1) evaluations.
