# Engine 10 — Prediction Engine

## Canonical ownership

Prediction owns predictive environmental intelligence, forecasting, prediction models, prediction results, forecast confidence, prediction lifecycle/state, and prediction evaluation inputs where explicitly defined by the canonical contract.

Prediction does not own raw observation ingestion, geospatial ownership, temporal infrastructure ownership, risk assessment ownership, mission creation, external API integrations, verification/reputation/reward logic, automation infrastructure, audit-journal storage, or governance policy ownership.

## Canonical mission (from Canon)

From `architecture/engine-registry/CanonicalEngineRegistry.js`, Engine 10 is `Prediction Engine`, slug `10-prediction`, layer `ANALYTICAL_AND_PREDICTIVE`, with the canonical description: "Environmental trend forecasting, hazard probability modeling, and early warning trajectories."

## Public engine boundary

The engine exposes `PredictionEngine` with the canonical lifecycle and a service/repository surface:

- **Lifecycle:** `initialize()`, `healthCheck()`, `shutdown()` (matches the `engine-layout` contract in `tests/architecture/engine-layout.test.js`).
- **Command execution:** `executeCommand(command)` routes to the canonical `PredictionApplicationService`.
- **Queries:** `getPrediction`, `listActivePredictions`.
- **Service/repository access:** `service` and `repository` getters are the sanctioned extension points for tests and composition; the engine does not expose internal domain/event files through the lifecycle path beyond the allowed re-exports in `index.js`.

## Commands (owned by this engine)

Engine 10 owns the following mutating command types on target engine `10-prediction`:

- `GeneratePrediction` — create a new standalone environmental trajectory prediction from caller-supplied baseline, delta, and impact factors.
- `InvalidatePrediction` — mark an active prediction as invalidated with a required invalidation reason.
- `UpdateModelConfidence` — update confidence score, error margin, or model version on an active prediction.

Each mutating command requires an `idempotencyKey`. For a command that is executed rather than replayed from the idempotency cache, governance evaluation is optional: when a governance adapter is supplied, it is evaluated before prediction mutation or domain event emission. When absent (`governance = null`, the default), governance evaluation is skipped. Cached retries do not repeat governance evaluation or command side effects.

## Queries (owned by this engine)

- `getPredictionById(predictionId)` — returns `null` for unknown predictions.
- `listActivePredictions({ subjectId?, targetMetric?, horizon? })` — active predictions optionally filtered by subject, target metric, or projection horizon.

## Domain model (owned by this engine)

- `EnvironmentalPrediction` aggregate: `predictionId`, `subjectId`, `subjectType`, `targetMetric`, `horizon`, `projectionWindow` (`startsAt`, `endsAt`), `baselineValue`, `trajectoryDelta`, `impactFactors`, `confidenceScore`, `errorMargin`, `modelVersion`, `status`, `invalidationReason`, `metadata`, `createdAt`, `updatedAt`, `projectedValue`, `impactProbability`, `confidenceInterval`.
- `PredictionStatus`: `ACTIVE`, `INVALIDATED`.
- `ProjectionHorizon`: `SHORT_TERM`, `MEDIUM_TERM`, `LONG_TERM`.
- Standalone probability calculations and confidence intervals defined in `ConfidenceScore`.

## Projection & probability computation (deterministic, owned here)

The engine derives forecast metrics deterministically from caller-supplied inputs:

```
projectedValue = baselineValue + trajectoryDelta
impactProbability = weighted_average(impactFactors.probability, impactFactors.weight)
confidenceInterval = [max(0, impactProbability - errorMargin), min(1, impactProbability + errorMargin)]
```

All floating-point score aggregations are normalized to 12 decimal places. The engine does not infer factor data from unapproved external streams.

## Events and audit boundary

The engine publishes the canonical prediction domain event through the shared Event Bus:

- `econet.prediction.generated`

Operations carried in event payload:
- `GENERATED` — upon initial prediction aggregate creation.
- `MODEL_CONFIDENCE_UPDATED` — upon updating model confidence or error margin.
- `INVALIDATED` — upon explicit invalidation.

Each event uses `producer: 'engine.10.prediction'` and the shared `DomainEvent` envelope. It includes audit and provenance metadata for Engine 23 consumption:
- `metadata.audit.criticalMutation`: `true` only when status transitions to `INVALIDATED`; `false` otherwise.
- `metadata.audit.isEscalation`: `false` (no escalation concept exists in the prediction domain).
- `metadata.provenance`: `engine.10.prediction.${operation}`.

Engine 10 does not import or write Audit Engine internals.

## Persistence boundary

`InMemoryPredictionRepository` is an isolated Engine 10 adapter used for canonical flows and tests. It owns environmental prediction aggregates and does not read or write another engine's state. Durable Engine 10 storage is an architectural gap pending an approved persistent schema.

## Governance boundary

Engine 22 Governance is consulted via `evaluatePolicy({ engine, commandType, actor, payload })` before mutating state when a governance adapter is provided. If denied, no state changes and no domain events are emitted. When no governance adapter is supplied (`governance = null`), governance evaluation is skipped.

## Integration boundaries

- **Zero provisional upstream event coupling:** Engine 10 does not subscribe to or depend on provisional Engine 09 risk events or unapproved event vocabularies.
- **Cross-engine communication:** Engine 10 does not import another engine's internal files. Inter-engine communication is limited to public entrypoints, Command/Query contracts, and the Event Bus.

## Assumptions

- Caller-provided projection windows must satisfy ISO-8601 validity and `endsAt > startsAt`.
- Impact factors require non-empty names, probabilities in `[0, 1]`, and positive finite weights.
- Invalidated predictions are terminal for confidence updates; re-invalidating an already invalidated prediction is idempotent.
