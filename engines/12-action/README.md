# Engine 12 — Action Engine

## Canonical ownership

Action owns authorized external action execution, dispatch lifecycle, HMAC payload signing, rate limiting, retry/backoff behavior, dispatch status tracking, and action delivery records/log queries. It does not own risk assessment, prediction, mission creation, verification, governance policy, or audit persistence.

## Canonical mission (from Canon)

From `architecture/engine-registry/CanonicalEngineRegistry.js`, Engine 12 is `Action Engine`, slug `12-action`, layer `OPERATIONAL_AND_INTEGRATION`, with the canonical description: "External authority dispatch, notification routing, webhook delivery, and actuator triggers."

## Public engine boundary

The engine exposes `ActionEngine` with the canonical lifecycle and a service/repository surface:

- **Lifecycle:** `initialize()`, `healthCheck()`, `shutdown()`
- **Command execution:** `executeCommand(command)` routes to `ActionApplicationService`
- **Queries:** `getWebhookLogs(target)`, `getDispatch(dispatchId)`

## Commands (owned by this engine)

Engine 12 owns the following mutating command types on target engine `12-action`:

- `DispatchAction` — generic dispatch to an external target; caller specifies `actionType` in the payload
- `DispatchNotification` — notification dispatch requiring `title`, `message`, and at least one `recipient`
- `TriggerWebhook` — webhook dispatch with HMAC signature
- `BroadcastEmergencyAlert` — alert broadcast without HMAC signature in success event
- `CancelAction` — cancel an existing dispatch record

Each mutating command requires an `idempotencyKey` and is guarded by Engine 22 Governance before any mutation or domain event emission.

## Queries (owned by this engine)

- `getWebhookLogs(target?)` — returns historical dispatch attempts, optionally filtered by target
- `getDispatch(dispatchId)` — returns a single dispatch record by ID

## Domain model (owned by this engine)

- `ActionDispatch` aggregate, with action type, target, payload, status, attempt history, max retries, idempotency key, and metadata
- `ActionType`: `WEBHOOK`, `NOTIFICATION`, `ALERT`, `ACTUATOR_SIGNAL`
- `DispatchStatus`: `PENDING`, `DISPATCHED`, `FAILED`, `RATE_LIMITED`
- `HmacSigner` domain service for SHA-256 HMAC payload signing and verification
- `RateLimiter` domain service for windowed per-target request limiting

## Dispatch pipeline behavior

Every dispatch command follows a fixed order: authorization → validation (notification-specific for NOTIFICATION type only) → rate limit check → dispatch record creation → transport send with retry/backoff → domain event emission → audit boundary.

Notification validation (title, message, recipients) is applied exclusively when `actionType === ActionType.NOTIFICATION`. Generic webhook/alert/actuator payloads are not notification envelopes and are not subject to notification validation.

## Persistence boundary

`InMemoryActionRepository` is an isolated Engine 12 adapter. It owns dispatch records and does not read or write another engine's state.

## Integration boundaries

- **Engine 22 Governance:** every mutating command evaluates `evaluatePolicy({ engine, commandType, actor, payload })` before mutation. A denial produces no state change and no domain event.
- **Engine 23 Audit:** Engine 12 emits shared `DomainEvent` records only; Engine 23 may subscribe through the Event Bus.
- **Cross-engine communication:** Engine 12 does not import another engine's internal files. Inter-engine communication is limited to public entrypoints, Command/Query contracts, and the Event Bus.

## Events published by this engine

- `econet.action.dispatched` — successful dispatch (includes HMAC signature when applicable)
- `econet.action.delivery_failed` — dispatch failed after all retries
- `econet.action.rate_limited` — dispatch rejected by rate limiter
- `econet.action.webhook_delivered` — successful webhook delivery (TriggerWebhook only)

## Assumptions

- The default trusted dispatch roles are `system`, `admin`, `dispatcher`, `mission_lead`, `automation`. No canonical Engine 12 role list exists in the repository; this is an implementation-defined allowlist overridable via constructor options.
- HMAC secrets are never logged; `sanitizeForLogs` redacts secret-bearing keys from persisted payloads and metadata.
- The transport adapter is injected and must implement `send(target, payload, headers)`. A default no-op transport is used for testing.
