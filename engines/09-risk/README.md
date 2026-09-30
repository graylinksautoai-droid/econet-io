# Engine 09 — Risk Engine

## Canonical ownership

Risk owns multi-hazard environmental risk evaluation, severity indexing, exposure assessment, and vulnerability modeling. It computes and persists `RiskAssessment` aggregates and publishes implementation-defined risk events through the shared `DomainEvent` contract and Event Bus. The shared envelope does not establish approval of the Engine 09 event names; their canonical vocabulary remains decision-pending.

Risk does not own hazard discovery, observation ingestion, geospatial indexing, prediction, mission generation, action dispatch, verification, reputation, rewards, communities, or Governance policy. Governance policy ownership remains with Engine 22 and audit persistence with Engine 23; Engine 09 provides an optional governance port and publishes events for audit consumption rather than implementing either responsibility locally.

## Canonical mission (from Canon)

From `architecture/engine-registry/CanonicalEngineRegistry.js`, Engine 09 is `Risk Engine`, slug `09-risk`, layer `ANALYTICAL_AND_PREDICTIVE`, with the canonical description: "Multi-hazard risk evaluation, severity indexing, exposure assessment, and vulnerability modeling."

## Public engine boundary

The engine exposes `RiskEngine` with the canonical lifecycle and a service/repository surface:

- **Lifecycle:** `initialize()`, `healthCheck()`, `shutdown()` (matches the `engine-layout` contract in `tests/architecture/engine-layout.test.js`).
- **Command execution:** `executeCommand(command)` routes to the canonical `RiskApplicationService`.
- **Queries:** `getRiskAssessment`, `listActiveRisks`, `listThresholds`, `resolveThreshold`.
- **Service/repository access:** `service` and `repository` getters are the sanctioned extension points for tests and composition; the engine does not expose internal domain/event files through the lifecycle path beyond the allowed re-exports below.

## Commands (owned by this engine)

Engine 09 owns the following mutating command types on target engine `09-risk`:

- `AssessRisk` — create a new risk assessment for a subject and hazard, evaluated against the effective escalation threshold.
- `ReassessRisk` — re-evaluate an existing assessment with refreshed hazard factor readings.
- `AddRiskMitigation` — record a mitigation action against an assessment; effectiveness cumulatively reduces the derived score.
- `UpdateRiskThreshold` — set the effective escalation threshold, either per-hazard or globally.

Each mutating command requires an `idempotencyKey`. For a command that is executed rather than replayed from the idempotency cache, governance evaluation is optional: when a governance adapter is supplied, it is evaluated before assessment/threshold mutation or domain event emission. When absent (`governance = null`, the default), governance evaluation is skipped. Cached retries do not repeat governance evaluation or command side effects.

## Queries (owned by this engine)

- `getRiskAssessmentById(assessmentId)` — returns `null` for unknown assessments.
- `listActiveRisks({ hazardType?, minimumLevel? })` — active assessments filtered by hazard or by escalation threshold.
- `listThresholds()` — returns configured hazard-level rows (each hazard category showing its per-hazard override or canonical default) alongside the configured global threshold entry; does not apply the global override to individual hazard rows.
- `resolveThreshold(hazardType)` — resolves and produces the effective minimum risk level for a hazard by applying full precedence: per-hazard override > global override > canonical default.

## Domain model (owned by this engine)

- `RiskAssessment` aggregate, with hazard type, weighted hazard factors, exposure index, escalation threshold, mitigations, lifecycle status, and deterministically derived score/level/breach state.
- `RiskAssessmentStatus`: `ACTIVE`, `MITIGATED`, `CLOSED`.
- Canonical risk levels: `LOW`, `MODERATE`, `HIGH`, `SEVERE`, `CATASTROPHIC`.
- Hazard categories and intrinsic hazard weights defined in `HazardType`.
- Threshold precedence and canonical per-hazard defaults are owned here.

## Persistence boundary

`InMemoryRiskRepository` is an isolated Engine 09 adapter used for canonical flows and tests. It owns risk assessments and threshold overrides, and does not read or write another engine's state. Durable Engine 09 storage is an architectural gap pending an approved persistent schema.

## Risk score computation (implementation-defined, but owned here)

The engine currently derives a normalized 0–100 score deterministically:

```
score = clamp(100 × hazardWeight × factorIntensity × (0.5 + 0.5 × exposureIndex))
```

`factorIntensity` is the weighted average of hazard-factor magnitudes (each in 0–1), `hazardWeight` is an intrinsic hazard-severity weight, and `exposureIndex` is in 0–1. Mitigations then cumulatively reduce the derived score.

This is the current Engine 09 scoring model. No separately approved predictive-model contract currently defines the formula, so downstream consumers must treat the score, weights, and thresholds as an Engine 09-owned contract until an architecture decision states otherwise.

## Events and audit boundary

The engine publishes the following implementation-defined risk event types through the shared Event Bus. These event names are provisional runtime selections and remain explicitly pending/under architectural decision; they must not be treated as approved canonical architecture:

- `econet.risk.assessment_evaluated`
- `econet.risk.threshold_breached`
- `econet.risk.threshold_cleared`
- `econet.risk.threshold_updated`

Each event uses `producer: 'engine.09.risk'` and the shared `DomainEvent` envelope. It includes audit and provenance metadata for Engine 23 consumption through the public event boundary. Engine 09 does not import or write Audit Engine internals.

## Integration boundaries

- **Engine 22 Governance:** governance evaluation is optional and evaluated only when a governance adapter is provided (default is `governance = null`, where evaluation is skipped). When present, mutating commands evaluate `evaluatePolicy({ engine, commandType, actor, payload })` before mutation. A denial produces no state change and no domain event.
- **Engine 23 Audit:** Engine 09 emits shared `DomainEvent` records only; Engine 23 may subscribe through the Event Bus.
- **Cross-engine communication:** Engine 09 does not import another engine's internal files. Inter-engine communication is limited to public entrypoints, Command/Query contracts, and the Event Bus.

## Canonical event vocabulary status

**Decision pending.** `tests/architecture/events.test.js` names `econet.risk.evaluated` as an illustrative `DomainEvent` example for `engine.09.risk`. That test proves envelope and causation mechanics, not an exhaustive Engine 09 event registry.

The current implementation publishes the richer four-event vocabulary listed above. All risk event names remain explicitly marked as pending and under decision, rather than approved canonical architecture. Whether that vocabulary should be formally adopted, whether a single canonical risk signal should replace it, or whether a canonical event registry must be defined first is intentionally unresolved. No event-name change is made here because that requires an approved architectural decision.

## Assumptions

- Per-hazard threshold override takes precedence over global override, which takes precedence over the canonical default.
- Mitigation effectiveness is cumulative and capped at a 100% reduction of the derived score.
- Closed assessments are terminal for mitigation and reassessment.