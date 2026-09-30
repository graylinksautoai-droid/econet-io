# Engine 11 — Mission Engine

## Canonical ownership

Mission owns operational mission definition and lifecycle: mission creation, metadata, priority, target criteria, objectives, objective lifecycle, mission activation, suspension, completion, abortion, mission lifecycle events, and mission queries.

Mission does not own risk calculation, prediction calculation, physical action execution, payment settlement, rewards calculation, marketplace operations, social/community hosting, user identity, wallet management, tool inventory, cloud storage, map rendering, geolocation infrastructure, notification delivery, AI generation, governance policy ownership, or audit-log ownership.

## Canonical mission (from Canon)

From `architecture/engine-registry/CanonicalEngineRegistry.js`, Engine 11 is `Mission Engine`, slug `11-mission`, layer `OPERATIONAL_AND_INTEGRATION`, with the canonical description: "Operational response task creation, field responder allocation, mission tracking, and operational lifecycle."

## Public engine boundary

The engine exposes `MissionEngine` with the canonical lifecycle and a service/repository surface:

- **Lifecycle:** `initialize()`, `healthCheck()`, `shutdown()`.
- **Command execution:** `executeCommand(command)` routes to the canonical `MissionApplicationService`.
- **Queries:** `getMission`, `listActiveMissions`.
- **Service/repository access:** `service` and `repository` getters are the sanctioned extension points.

## Commands (owned by this engine)

- `CreateMission`, `ActivateMission`, `SuspendMission`, `ResumeMission`, `CompleteMission`, `AbortMission`, `AddObjective`, `UpdateObjectiveStatus`.

Every mutating command validates input, enforces domain invariants, passes the Engine 22 Governance pre-mutation gate (optional: evaluated when an adapter is supplied, skipped when `governance = null`, the default), persists through Engine 11's repository, publishes the appropriate domain event, provides audit metadata, and is governed by idempotency. A governance denial produces zero state change and zero mutation events.

## Queries (owned by this engine)

- `getMissionById(missionId)` — returns `null` for unknown missions.
- `listActiveMissions({ priority? })` — ACTIVE missions, optionally filtered by mission priority (justified by Engine 11's priority-weighting responsibility).

## Domain model (owned by this engine)

- `Mission` aggregate: `missionId`, `title`, `description`, `priority`, `targetCriteria`, `objectives`, `status`, timestamps, `metadata`.
- `Objective`: `objectiveId`, `description`, `status`. No required/optional classification — the canonical specification is silent, so none is invented.
- `targetCriteria` is stored as an immutable caller-defined object; Engine 11 stores and returns it but does not interpret it.
- `MissionStatus`: DRAFT, ACTIVE, SUSPENDED, COMPLETED, ABORTED.
- `MissionPriority`: LOW, MEDIUM, HIGH, CRITICAL with deterministic weights.
- `ObjectiveStatus`: PENDING, IN_PROGRESS, COMPLETED, FAILED.

## Lifecycle (implementation baseline, not canonical)

Mission transitions:

- DRAFT → ACTIVE
- ACTIVE → SUSPENDED, COMPLETED, ABORTED
- SUSPENDED → ACTIVE, ABORTED
- COMPLETED and ABORTED are terminal.

Objective transitions:

- PENDING → IN_PROGRESS
- IN_PROGRESS → COMPLETED, FAILED
- COMPLETED and FAILED are terminal.

Mission completion baseline: the mission must be ACTIVE and every objective must be in a terminal state (COMPLETED or FAILED). A mission with zero objectives is vacuously completable. This is an implementation baseline with a regression test; the canonical architecture is silent on objective-completion rules.

These lifecycles are baseline state machines with regression tests, not canonical mandates — no canonical lifecycle was found in the repository.

## Events and audit boundary

The engine publishes the following current mission event types through the shared Event Bus:

- `econet.mission.created`
- `econet.mission.status_changed`
- `econet.mission.objective_status_changed`

Each event uses `producer: 'engine.11.mission'` and the shared `DomainEvent` envelope with audit/provenance metadata for Engine 23 consumption. Engine 11 does not import or write Audit Engine internals.

Audit `criticalMutation` is `true` only for transitions into a terminal mission state (COMPLETED/ABORTED) or an objective reaching terminal FAILED status; `isEscalation` is always `false` (no escalation concept exists in the mission domain). These audit classifications are implementation decisions, not canonical mandates.

## Persistence boundary

`InMemoryMissionRepository` is an isolated Engine 11 adapter owning a private `#store` of Mission aggregates. It exposes only Engine 11 mission persistence operations, contains no foreign engine models and no global shared mutable state, and is replaceable by another persistence adapter. Durable storage is pending an approved persistent schema.

No Engine 09, 10, or 12 internal models are referenced anywhere in Engine 11. No provisional upstream event names are hardcoded. No EventBus subscriptions exist inside Engine 11.

## Governance boundary

Engine 22 Governance is consulted via the established `evaluatePolicy({ engine, commandType, actor, payload })` interface before every mutation when a governance adapter is provided (skipped when `governance = null`, the default). Denied operations mutate no state and publish no events. Engine 11 owns no governance policy.

## Authorization

All mutating commands require an authenticated actor with one of the authorized mission roles: `system`, `admin`, `mission_lead`, `automation`.

Authorization is enforced before the idempotency wrapper, governance evaluation, repository mutation, and event publication — the canonical Engine 15/18/19/20/21/22/24 pattern.

Guard sequence in `execute()`:

1. Commands without `actor` or without `actor.actorId` throw `'Mission commands require an authenticated actor.'`
2. `_assertAuthorized` fires before entering the idempotency wrapper. `actor.roles` that is absent, `null`, or not an array is treated as an empty set and denied.
3. Actors whose `roles` array contains no permitted value receive `'Mission command "..." denied: actor "..." lacks an authorized mission role.'`

Missing, `null`, non-array, and empty `roles` are all denied — they never pass silently.

## Assumptions

- Field presence mirrors the directive: each field (title, description, priority, target criteria, objectives, lifecycle status, timestamps, metadata) is required by the operational mission definition contract.
- Governance, audit, event, idempotency, repository, and lifecycle integration patterns follow the repository's established conventions (Engines 09/10/12), which are duplicated deliberately for boundary isolation rather than shared through cross-engine imports.
- All lifecycle tables, critical-audit classifications, and the completion rule are implementation decisions pending any future canonical specification.
