# Engine 24 — Learning Engine

## Canonical identity

Engine ID: `24` · Name: `Learning Engine` · Layer: `ANALYTICAL_AND_PREDICTIVE`

Canonical mission (from `CanonicalEngineRegistry.js`):
> "Historical outcome feedback loops, accuracy evaluation, and model adaptation tracking."

## Owned responsibilities

Engine 24 owns:

- **Historical outcome feedback loops** — records that link a prediction, simulation result, or automated decision to its subsequently observed real-world outcome
- **Accuracy evaluation** — point-in-time accuracy measurements for named models, algorithms, or system components
- **Model adaptation tracking** — provenance records of adaptation events (when a model or configuration was changed in response to feedback or evaluation data)

## Non-responsibilities

| Responsibility | Owner |
|---|---|
| Identity / authentication | Engine 01 |
| Environmental observations | Engine 02 |
| Knowledge ontologies | Engine 03 |
| AI reasoning / inference | Engine 05 |
| Predictions / forecasting | Engine 10 |
| Mission definitions | Engine 11 |
| Real-world actions | Engine 12 |
| Verification decisions | Engine 13 |
| Rewards / incentives | Engine 15 |
| Communities | Engine 16 |
| Autonomous agents | Engine 17 |
| Digital twins | Engine 18 |
| Simulations / scenarios | Engine 19 |
| External connectors | Engine 20 |
| Automation jobs | Engine 21 |
| Governance policies | Engine 22 |
| Audit infrastructure | Engine 23 |

Engine 24 records THAT things happened. It does NOT perform model retraining, does NOT modify another engine's state, does NOT execute ML algorithms or probabilistic computations, and does NOT make autonomous decisions.

## Domain concepts

### OutcomeFeedback

Records the relationship between a predicted/expected outcome and the actual observed outcome. The fundamental unit of a feedback loop.

Fields: `feedbackId`, `sourceEngine`, `sourceId`, `sourceType`, `predictedOutcome`, `actualOutcome`, `deltaDescription`, `recordedBy`, `correlationId`, `recordedAt`, `metadata`.

`sourceEngine` and `sourceId` are opaque references to the originating record in another engine. Engine 24 never imports that engine's private state.

### AccuracyRecord

A point-in-time accuracy measurement for a named model or algorithm.

Fields: `recordId`, `subjectEngine`, `subjectId`, `subjectType`, `metricName`, `metricValue` (finite number), `evaluationContext`, `recordedBy`, `correlationId`, `recordedAt`, `metadata`.

### AdaptationRecord

Provenance of an adaptation event — records that a model or configuration was changed in response to feedback or evaluation, and why.

Fields: `adaptationId`, `subjectEngine`, `subjectId`, `subjectType`, `adaptationType`, `rationale`, `feedbackIds[]`, `accuracyRecordIds[]`, `recordedBy`, `correlationId`, `recordedAt`, `metadata`.

All three entities are immutable (`Object.freeze`) once constructed.

## Commands

All mutating commands require a `Command` with a valid `idempotencyKey`, an authenticated `actor`, and one of the authorized learning roles.

| Command | Description |
|---|---|
| `RecordOutcomeFeedback` | Record an outcome feedback loop entry. Requires `sourceEngine`, `sourceId`, `sourceType`, `predictedOutcome`, `actualOutcome`. |
| `RecordAccuracyEvaluation` | Record an accuracy metric for a model or algorithm. Requires `subjectEngine`, `subjectId`, `subjectType`, `metricName`, `metricValue` (finite number). |
| `RecordAdaptation` | Record that an adaptation occurred. Requires `subjectEngine`, `subjectId`, `subjectType`, `adaptationType`. Optional: `rationale`, `feedbackIds[]`, `accuracyRecordIds[]`. |

## Queries

| Method | Returns |
|---|---|
| `getFeedback(feedbackId)` | Feedback JSON or `null` |
| `listFeedback({ sourceEngine?, sourceType? })` | Filtered array |
| `getAccuracyRecord(recordId)` | Accuracy record JSON or `null` |
| `listAccuracyRecords({ subjectEngine?, subjectId?, metricName? })` | Filtered array |
| `getAdaptation(adaptationId)` | Adaptation record JSON or `null` |
| `listAdaptations({ subjectEngine?, subjectId? })` | Filtered array |

## Events

All events use the canonical `DomainEvent` envelope. Producer: `engine.24.learning`.

| Event type | Emitted when |
|---|---|
| `econet.learning.outcome_feedback_recorded` | `RecordOutcomeFeedback` succeeds |
| `econet.learning.accuracy_recorded` | `RecordAccuracyEvaluation` succeeds |
| `econet.learning.adaptation_recorded` | `RecordAdaptation` succeeds |

## Authorization

Authorized roles: `system`, `admin`, `learning_manager`, `automation`.

Follows the canonical E15/18/19/20/21/22 pattern: authorization fires before idempotency, governance, and mutation. Missing, null, non-array, and empty `actor.roles` are denied.

## Governance

An optional `governance` adapter may be injected. When present, `evaluatePolicy` is called after authorization but before mutation. Denial leaves all state untouched.

## Idempotency

All three commands require a non-empty `idempotencyKey`. The shared `IdempotencyManager` wraps every dispatch; replaying the same key returns the cached result without duplicate records or events.

## Persistence

`InMemoryLearningRepository` is an isolated Engine 24 adapter. All three record types are stored in separate private `Map` instances. `clear()` is available for test teardown. No durable production persistence.

## Security

- No `eval()`, `new Function()`, dynamic imports, or shell execution
- No raw credentials or model weights stored
- References to other engines' records are opaque identifier strings
- No cross-engine private imports
- Records are frozen after construction

## Cross-engine dependencies

- `contracts/commands/Command.js`
- `contracts/events/DomainEvent.js`
- `infrastructure/messaging/EventBus.js`
- `infrastructure/idempotency/IdempotencyManager.js`

No other engine's private files are imported.

## Known limitations

- In-memory persistence only; all records lost on process restart
- No model retraining: Engine 24 records provenance only
- No autonomous feedback processing: records are explicit, actor-driven
- No time-series queries or date-range filtering
- No pagination for list queries

## Architectural gaps

| Gap | Minimum decision required |
|---|---|
| Durable persistence | Approved append-only storage contract |
| Automated feedback pipeline | Approved trigger contract (Engine 21 Automation) |
| Model retraining boundary | Approved contract between Engine 24 and the model-owning engine |
| Learning-specific governance | Approved governance policy contract for learning operations |

## Current implementation status

**COMPLETE** — bounded foundation implementing the three canonical responsibilities. All records, commands, queries, events, authorization, governance, idempotency, and lifecycle are implemented and tested. No undocumented architecture was invented.
