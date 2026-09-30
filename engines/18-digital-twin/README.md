# Engine 18 — Digital Twin Engine

## Canonical mission

From `architecture/engine-registry/CanonicalEngineRegistry.js`, Engine 18 is `Digital Twin Engine`, slug `18-digital-twin`, layer `ADVANCED_INTELLIGENCE`, with the canonical description:

> "Digital representations of environmental entities and systems."

## Ownership

Engine 18 owns the digital-twin domain: twin registration, target entity association, model versioning, state representation, synchronization of validated updates, staleness/older-update policy, and provenance history.

It does **not** own or duplicate: observations (Engine 02), geospatial computation (07), temporal reasoning (08), risk scoring (09), forecasting (10), missions (11), physical actions (12), verification (13), reputation (14), rewards (15), community membership (16), agent orchestration (17), simulation (19), external integrations (20), workflow scheduling (21), governance policy (22), or the audit journal (23).

## Public boundary

The engine exposes `DigitalTwinEngine` with:

- **Lifecycle:** `initialize()`, `healthCheck()`, `shutdown()`
- **Command execution:** `executeCommand(command)`
- **Queries:** `getDigitalTwin`, `listDigitalTwins`, `getTwinModel`, `getTwinState`, `getTwinStateHistory`, `getSynchronizationStatus`, `getSynchronizationHistory`, `getTwinsByTargetEntity`
- **Service/repository access:** `service` and `repository` getters

## Commands

All mutating commands require an authenticated actor and an `idempotencyKey`.

- `RegisterDigitalTwin` — creates a `DRAFT` twin for a target entity.
- `ActivateDigitalTwin` — `DRAFT` → `ACTIVE`.
- `PauseDigitalTwin` — `ACTIVE` → `PAUSED` (stops sync).
- `ResumeDigitalTwin` — `PAUSED`/`STALE`/`OUT_OF_SYNC` → `ACTIVE`.
- `RetireDigitalTwin` — any non-terminal → `RETIRED` (terminal).
- `MarkTwinOutOfSync` — `ACTIVE` → `OUT_OF_SYNC` (explicit sync failure).
- `RegisterTwinModel` — registers a `TwinModel` version for a twin (activating against it). Duplicate versions are rejected.
- `SynchronizeTwin` — validates and applies a state update against the registered model.

## Domain model

- `TwinStatus` value object: `DRAFT`, `ACTIVE`, `PAUSED`, `STALE`, `OUT_OF_SYNC`, `RETIRED` with enforced transitions.
- `SynchronizationStatus` value object: `CURRENT`, `PARTIALLY_SYNCHRONIZED`, `PENDING`, `DELAYED`, `STALE`, `OUT_OF_SYNC`, `DISCONNECTED`, `UNKNOWN`.
- `DigitalTwin` entity: identity, target association, lifecycle, model attachment, `createdBy` provenance.
- `TwinModel` entity: model identity, version, property definitions (units/ranges), assumptions, validation envelope; immutable.
- `TwinState` entity: versioned state snapshot (observedAt, acceptedAt, modelVersion, properties, provenance).
- `SynchronizationRecord` entity: audit of each sync attempt (source, previous/resulting state version, accepted/rejected counts, failure reason).
- `TwinStateService`: `isOlderThanCurrent` (older-update rejection), `evaluateFreshness` (staleness by explicit policy).

## Security

- Mutating commands require an authenticated actor.
- The actor must hold one of the authorized roles: `system`, `admin`, `twin_manager`, `automation` (overridable via constructor).
- Authorization is evaluated before any mutation; unauthorized actors produce no state change and no success events.

## Governance

- When a governance adapter is supplied, `evaluatePolicy({ engine, commandType, actor, payload })` is evaluated before every mutating command.
- A denial blocks mutation and produces no state change or event.
- With `governance = null`, governance evaluation is skipped (documented limitation; production composition is expected).

## Idempotency

Command-level idempotency is provided by the shared `IdempotencyManager` keyed on `{engine}:{commandType}:{idempotencyKey}`. Duplicate commands replay the cached result without duplicate mutations or duplicate domain events.

## Events published

- `econet.digital_twin.registered`
- `econet.digital_twin.state_changed`
- `econet.digital_twin.model_registered`
- `econet.digital_twin.synchronized`
- `econet.digital_twin.synchronization_rejected`

All events use producer `engine.18.digital-twin` and the canonical `DomainEvent` envelope. Engine 23 consumes them via the Event Bus (no private audit system).

## Testing

- `node --test engines/18-digital-twin/tests/DigitalTwinEngine.test.js` → 23 pass / 0 fail
- `node --test tests/architecture/*.test.js` → 13 pass / 0 fail
- `node tests/run-all.js` → 199 pass / 0 fail
- Boundary enforcement: 0 violations

## Known limitations

- No durable persistence adapter (in-memory only, consistent with the repository's completed-engine pattern).
- No external integration connectors, IoT ingestion, or sensor pipelines — those are Engine 20's responsibility.
- No simulation or predictive modeling — those are Engines 19 and 10.
- No machine-learning twin models — the specialized Digital Twin Learning AI is a future architectural concern.
- Freshness policies (`maxAcceptableAgeMs`) are constructor-configured per twin; no canonical global freshness schedule exists.
- Geographic visualization and twin-to-actuator control are unspecified and unimplemented.

## Synchronization behavior

`SynchronizeTwin` follows this order:

1. Authenticate and authorize the actor.
2. Evaluate governance policy (when an adapter is supplied).
3. Locate the twin; reject if status does not permit synchronization (`DRAFT`, `PAUSED`, `RETIRED`).
4. Locate the registered model version; reject mismatch or missing model.
5. Validate every supplied property against the model; reject unknown properties, invalid units, and out-of-range values before any state mutation.
6. Apply the temporal policy (`REJECT_OLDER_UPDATE`): an update older than the accepted `observedAt` is rejected without overwriting state.
7. Persist a new versioned `TwinState` snapshot (history retained).
8. Persist a `SynchronizationRecord` (status `SYNCHRONIZED` or `REJECTED`).
9. Emit a canonical `DomainEvent` (`synchronized` or `synchronization_rejected`).

Rejected mutations never produce false success events.

## Persistence

`InMemoryDigitalTwinRepository` is an isolated in-memory adapter for twins, models, states, and sync records. Historical state versions are retained; current state is derived from the latest version. This is not durable production persistence — a durable adapter is a documented future concern pending a canonical storage contract.