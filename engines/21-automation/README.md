# Engine 21 — Automation Engine

## Canonical identity

Engine ID: `21` · Name: `Automation Engine` · Layer: `OPERATIONAL_AND_INTEGRATION`

Canonical mission (from `CanonicalEngineRegistry.js`):
> "Backend execution queues, background job processing, event triggers, and worker pipelines."

## Scope

Engine 21 owns:

- background job definitions and lifecycle (`QUEUED → PROCESSING → COMPLETED / DEAD_LETTER`)
- job priority queue (in-memory, priority-ordered)
- worker pipeline registration (server-side only — callers never supply code)
- job execution state and provenance
- dead-letter handling
- retry orchestration
- automation event publication

## Non-scope

Engine 21 does **not** own:

| Responsibility | Owner |
|---|---|
| Identity / sessions | Engine 01 |
| Environmental observations | Engine 02 |
| Mission definitions | Engine 11 |
| Real-world action records | Engine 12 |
| Verification decisions | Engine 13 |
| Rewards / XP | Engine 15 |
| Community membership | Engine 16 |
| Autonomous agent domain | Engine 17 |
| Digital twin state | Engine 18 |
| Simulation models / results | Engine 19 |
| External connector definitions | Engine 20 |
| Governance policies | Engine 22 |
| Audit infrastructure | Engine 23 |
| Learning / model improvement | Engine 24 |

Engine 21 coordinates; it never becomes the authoritative owner of another engine's domain state.

## Public engine boundary

`AutomationEngine` (facade in `index.js`) exposes:

- **Lifecycle:** `initialize()`, `healthCheck()`, `shutdown()`
- **Command execution:** `executeCommand(command)` — `EnqueueJob`, `CancelJob`, `RetryJob`
- **Worker pipeline:** `registerWorker(taskType, worker)`, `processNext()`, `processAll()`
- **Queries:** `getJob(jobId)`, `listJobs({ status?, taskType? })`, `getQueueStats()`

No internal domain files are imported by other engines.

## Task types

Six canonical types derived from the registry description:

| Type | Basis |
|---|---|
| `BACKGROUND_JOB` | Background job processing (base type) |
| `EVENT_TRIGGER` | Event triggers (react to a domain event) |
| `PIPELINE_STEP` | Worker pipelines (step in a sequential pipeline) |
| `SCHEDULED_JOB` | Execution queues (time-scheduled recurring job) |
| `NOTIFICATION_JOB` | Operational notification dispatch |
| `INTEGRATION_JOB` | Invoke an approved external connector |

No additional types are invented. New types require an approved canonical specification change.

## Commands

All mutating commands require a `Command` with a valid `idempotencyKey`, an authenticated `actor`, and one of the authorized automation roles.

| Command | Description |
|---|---|
| `EnqueueJob` | Enqueue a new background job. Validates task type (canonical vocabulary), payload (object), priority (clamped 1–100), and maxRetries (clamped 0–10). |
| `CancelJob` | Cancel a `QUEUED` job before it is processed. Removes it from the in-memory queue and persists a `FAILED` state. |
| `RetryJob` | Create a new `QUEUED` job from a `FAILED` or `DEAD_LETTER` job, preserving task type and payload. Assigns a new `jobId`. |

## Queries

| Method | Returns |
|---|---|
| `getJob(jobId)` | Job snapshot or `null` |
| `listJobs({ status?, taskType? })` | Filtered array of job snapshots |
| `getQueueStats()` | `{ queueDepth, persisted: { queued, processing, completed, failed, deadLetter }, registeredWorkers }` |

## Job lifecycle

```
QUEUED → PROCESSING → COMPLETED     (success)
                    → DEAD_LETTER   (retryCount >= maxRetries)
                    → re-QUEUED     (transient failure, retryCount < maxRetries)
QUEUED → FAILED                     (cancelled via CancelJob)
```

Terminal states: `COMPLETED`, `DEAD_LETTER`. `FAILED` is used for cancelled jobs.

## Worker execution model

Workers are registered **server-side only** via `registerWorker(taskType, handler)`.

Callers supply a canonical `taskType` string — they **never supply executable code**. The engine maps the task type to a registered handler function. There is no `eval()`, `new Function()`, `import()`, dynamic module loading, or arbitrary shell execution.

If no worker is registered for a task type, the job is moved to `DEAD_LETTER` and a `job_dead_lettered` event is emitted. It is never silently dropped.

## Authorization

All three mutating commands require the actor to hold one of: `system`, `admin`, `automation_manager`, `automation`.

Authorization is enforced **before** idempotency, governance, repository mutation, and event publication — the canonical Engine 15/18/19/20 pattern.

Guard sequence:

1. Commands without `actor` or `actor.actorId` → `'Automation commands require an authenticated actor.'`
2. `_assertAuthorized` fires before the idempotency wrapper. `actor.roles` that is absent, `null`, or not an array is treated as an empty set and denied.
3. Actors with no matching role → `'Automation command "..." denied: actor "..." lacks an authorized automation role.'`

`processNext()` and `processAll()` are internal engine operations (called by the owning process / worker pipeline) and do not require actor context.

## Governance

An optional `governance` adapter may be injected. When present, `evaluatePolicy({ engine, commandType, actor, payload })` is called after authorization but before any state mutation or event publication. A denial raises `'Governance policy denial: ...'` with no state change.

## Idempotency

All three mutating commands require a non-empty `idempotencyKey`. The shared `IdempotencyManager` wraps every command dispatch; replaying the same key returns the cached result with no duplicate state or events.

## Events

All events use the canonical `DomainEvent` envelope published to the injected `EventBus`. Producer: `engine.21.automation`.

| Event type | Emitted when |
|---|---|
| `econet.automation.job_enqueued` | `EnqueueJob` or `RetryJob` succeeds |
| `econet.automation.job_completed` | `processNext` succeeds |
| `econet.automation.job_failed` | `processNext` fails with retries remaining |
| `econet.automation.job_cancelled` | `CancelJob` succeeds |
| `econet.automation.job_dead_lettered` | Job exceeds `maxRetries` or has no registered worker |

No success event is ever emitted for a failed or dead-lettered job.

## Integration Engine boundary (Engine 20)

`INTEGRATION_JOB` tasks carry an opaque `connectorRef` in their payload, referencing a connector registered in Engine 20. The registered worker for `INTEGRATION_JOB` is responsible for resolving the reference through Engine 20's public contract. Engine 21 **never** stores raw credentials and **never** directly accesses Engine 20's private repository.

## Persistence

`InMemoryJobRepository` is an isolated Engine 21 adapter storing job snapshots in a private `Map`. Completed and dead-letter jobs are retained. `clear()` is available for test teardown. This adapter provides no durable production persistence.

## Health check

```js
{
  healthy: true,
  engineId: '21',
  details: {
    status: 'READY',
    persistence: 'IN_MEMORY_AUTOMATION_ADAPTER',
    queueDepth: <number>,
    deadLetters: <number>,
    registeredWorkers: [...]
  }
}
```

## JobQueueContract compatibility

`BackgroundJob` and `JobStatus` are defined in `contracts/automation/JobQueueContract.js` (a pre-existing canonical contract). Engine 21 uses them as-is. `BackgroundJob` is mutable by that contract; the application service snapshots job state into the repository after each transition.

## Test coverage

`tests/AutomationEngine.test.js` covers:

- TaskType vocabulary (6 types, normalization, rejection of invalid types)
- BackgroundJob construction and defaults
- JobStatus vocabulary
- InMemoryJobRepository (save, find, list, count, countByStatus, clear)
- Worker registration (valid, non-function, invalid task type)
- EnqueueJob: success, event, invalid type, invalid payload, priority/retry clamping
- CancelJob: QUEUED job cancelled, non-QUEUED rejected, unknown ID rejected
- RetryJob: DEAD_LETTER job retried (new jobId), non-failed job rejected
- processNext: success, empty queue, no worker (dead-letter), retry with eventual dead-letter
- processAll: full queue drain
- Priority ordering: lower priority value processed first
- Queries: getJob, listJobs (filtered), getQueueStats
- Authorization: missing actor, missing roles, non-array roles, empty roles, unauthorized role (all 3 commands), all 4 authorized roles
- Authorization ordering: denial before idempotency, governance, and mutation
- Governance: policy denial blocks mutation and event
- Idempotency: duplicate command returns cached result, no duplicate job or event
- Missing idempotencyKey rejection, unsupported command rejection
- Security: arbitrary task type string rejected (no eval/shell/dynamic import possible)
- Event correctness: correct producer, subject entityType, no false success events
- Repository isolation: no cross-instance state leak
- Lifecycle contract: engineId, engineName, initialize, healthCheck, shutdown

## Known limitations

- **Persistence is in-memory only.** All state is lost on process restart. Durable job persistence and production queue infrastructure (Redis, BullMQ, etc.) are acknowledged architectural gaps; no canonical persistent schema was supplied.
- **No distributed scheduling.** `processNext()` / `processAll()` are synchronous in-process execution methods, not distributed workers. Production scheduling infrastructure (cron, distributed locks, schedule definitions) requires an approved external contract.
- **No schedule entity.** A canonical `Schedule` definition (cron expression, timezone, next-run calculation) was not established in the existing architecture. `SCHEDULED_JOB` task types are supported by the queue but schedule management is an architectural gap.
- **No event-subscription trigger.** `EVENT_TRIGGER` task type is registered in the vocabulary; subscribing to `EventBus` events and automatically enqueueing jobs requires an approved trigger-subscription contract not yet defined.
- **No concurrent worker safety.** The in-memory queue provides no distributed lock. Two concurrent callers of `processNext()` may race. Production concurrency requires an approved locking mechanism.
- **`BackgroundJob` is mutable by contract.** The `contracts/automation/JobQueueContract.js` contract defines `BackgroundJob` as a mutable object. Engine 21 snapshots state into the repository after each transition to compensate, but the contract itself is not immutable.

## Architectural gaps

| Gap | Minimum decision required |
|---|---|
| Durable job persistence | Approved persistent schema and adapter contract |
| Distributed scheduling / cron expressions | Canonical `Schedule` entity and scheduler port |
| EventBus trigger subscriptions | Approved `AutomationTrigger` subscription contract |
| Concurrent worker safety / distributed locks | Approved locking mechanism |
| Integration connector execution contract | Approved `INTEGRATION_JOB` worker implementation using Engine 20 public API |
