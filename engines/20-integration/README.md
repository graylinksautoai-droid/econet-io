# Engine 20 — Integration Engine

## Canonical ownership

Engine 20 owns external connector management: the registration, configuration,
lifecycle, and provenance of connections between EcoNet and external systems.

Canonical mission (from `CanonicalEngineRegistry.js`, Engine ID `20`):
> "External connector management, 3rd-party satellite/weather API adaptors, and
> protocol gateways."

Engine 20 does **not** own: environmental observations (02), knowledge (03),
context (06), geospatial state (07), temporal data (08), risk assessment (09),
prediction (10), missions (11), actions (12), verification (13), reputation (14),
rewards (15), communities (16), agents (17), digital twins (18), simulations (19),
automation workflows (21), governance policy (22), audit infrastructure (23),
or learning feedback (24).

## Public engine boundary

`IntegrationEngine` (the facade in `index.js`) exposes:

- **Lifecycle:** `initialize()`, `healthCheck()`, `shutdown()`
- **Command execution:** `executeCommand(command)`
- **Queries:** `getConnector`, `listConnectors`, `getConnectorStatus`

No internal domain files are imported by other engines. All cross-engine
communication uses public contracts, the `Command`/`DomainEvent` envelope,
and the `EventBus`.

## Domain boundary rule

An `ExternalConnector` is a managed integration reference — it records the
identity, type, configuration boundary, and lifecycle of a connection. Registering
or activating a connector does **not** automatically make any external data
canonical EcoNet domain truth. Ownership of domain state always remains with the
appropriate engine (02 Observation, 18 Digital Twin, 19 Simulation, etc.) that
consumes integration output through approved contracts.

## Connector types

Six types, derived directly from the canonical registry description:

| Type | Canonical basis |
|---|---|
| `SATELLITE_API` | "3rd-party satellite API adaptors" |
| `WEATHER_API` | "3rd-party weather API adaptors" |
| `SENSOR_GATEWAY` | "external connector management" (IoT/environmental sensors) |
| `INSTITUTIONAL_API` | "external connector management" (government/research APIs) |
| `WEBHOOK_ENDPOINT` | "external connector management" (inbound event endpoints) |
| `PROTOCOL_GATEWAY` | "protocol gateways" (MQTT, CoAP, SFTP, etc.) |

No additional types are invented. New types require an approved canonical
specification change.

## Commands

All mutating operations require a `Command` with a valid `idempotencyKey`,
an authenticated `actor`, and one of the authorized integration roles.

| Command | Description |
|---|---|
| `RegisterConnector` | Register a new external connector in `DRAFT` status. Validates connector type, endpoint URL (SSRF prevention), and header safety. Duplicate names are rejected. |
| `UpdateConnector` | Update configuration (endpoint URL, credential reference, timeout, headers, description) for a non-`RETIRED` connector. |
| `ActivateConnector` | Transition a connector to `ACTIVE`. Valid from `DRAFT` or `PAUSED`. |
| `PauseConnector` | Transition an `ACTIVE` connector to `PAUSED`. |
| `RetireConnector` | Retire a connector permanently (`RETIRED` is terminal). Valid from any non-`RETIRED` status. |

## Queries

| Method | Returns |
|---|---|
| `getConnector(connectorId)` | Full connector JSON or `null` |
| `listConnectors({ connectorType?, status? })` | Filtered array of connector JSON |
| `getConnectorStatus(connectorId)` | `{ connectorId, name, connectorType, status, updatedAt }` or `null` |

## Entities and value objects

**ExternalConnector** — Registered external system connection. Immutable; lifecycle
transitions return new instances. Fields: `connectorId`, `name`, `connectorType`,
`description`, `config` (ConnectorConfig), `status`, `registeredBy`, `registeredAt`,
`updatedAt`, `metadata`.

**ConnectorConfig** — Immutable configuration boundary. Fields: `endpointUrl`
(validated; SSRF-safe), `credentialRef` (opaque reference — never a raw secret),
`timeoutMs` (100–120000ms), `headers` (secret-bearing key names rejected),
`options` (opaque). Raw API keys, passwords, and tokens must never be placed
in `ConnectorConfig`; only an opaque `credentialRef` is stored here.

**ConnectorType** — `SATELLITE_API | WEATHER_API | SENSOR_GATEWAY |
INSTITUTIONAL_API | WEBHOOK_ENDPOINT | PROTOCOL_GATEWAY`. `normalizeConnectorType`
accepts case-insensitive input; throws on unknown types.

**ConnectorStatus** — `DRAFT → ACTIVE | RETIRED`, `ACTIVE → PAUSED | RETIRED`,
`PAUSED → ACTIVE | RETIRED`, `RETIRED` (terminal). `canTransitionConnectorStatus`,
`assertConnectorStatusTransition`, `isTerminalConnectorStatus`, and
`isOperationalConnectorStatus` enforce transitions.

## Authorization

All five mutating commands require an actor holding one of:
`system`, `admin`, `integration_manager`, `automation`.

Authorization is enforced before idempotency wrapping, governance evaluation,
repository mutation, and event publication — the canonical Engine 15/18/19
pattern.

Guard sequence in `execute()`:

1. Commands without `actor` or `actor.actorId` throw
   `'Integration commands require an authenticated actor.'`
2. `_assertAuthorized` is called before the idempotency wrapper. `actor.roles`
   that is absent, `null`, or not an array is treated as an empty set and denied.
3. Actors whose `roles` contains no permitted value receive
   `'Integration command "..." denied: actor "..." lacks an authorized integration role.'`

## Governance

An optional `governance` adapter may be injected. When present,
`evaluatePolicy({ engine, commandType, actor, payload })` is called after
authorization but before any state mutation or event publication. A denial
raises `'Governance policy denial: ...'` and leaves all state untouched.

## Idempotency

All mutating commands require a non-empty `idempotencyKey`. The shared
`IdempotencyManager` wraps every command dispatch; replaying the same key
returns the cached result without re-executing or emitting duplicate events.

## Events

All events use the canonical `DomainEvent` envelope published to the injected
`EventBus`. Producer: `engine.20.integration`.

| Event type | Emitted when |
|---|---|
| `econet.integration.connector_registered` | `RegisterConnector` succeeds |
| `econet.integration.connector_updated` | `UpdateConnector` succeeds |
| `econet.integration.connector_activated` | `ActivateConnector` succeeds |
| `econet.integration.connector_paused` | `PauseConnector` succeeds |
| `econet.integration.connector_retired` | `RetireConnector` succeeds |

Every event carries `subject.entityType = 'external_connector'` and
`subject.entityId = connectorId`. No raw credentials appear in event payloads.

## Security

**SSRF prevention:** `ConnectorConfig` rejects endpoint URLs that resolve to
loopback addresses (`127.x`, `::1`, `localhost`), link-local (`169.254.x`),
private ranges (`10.x`, `172.16–31.x`, `192.168.x`), and forbidden schemes
(`file:`, `ftp:`, `data:`, `javascript:`, `internal:`). Only `https:` and
`http:` are permitted.

**Credential safety:** Raw secrets (API keys, passwords, tokens) must never be
placed in `ConnectorConfig`. Only an opaque `credentialRef` string is stored.
Header keys matching `/secret|credential|password|api[-_]?key|token|auth/i` are
rejected at construction time.

**External data:** This engine does not execute outbound network calls. It
manages connector configuration records only. Actual external communication is
the responsibility of the consuming subsystem (Engine 21 Automation, or an
approved caller) using the registered connector configuration. External data
entering EcoNet through a connector must be validated and owned by the
appropriate domain engine before becoming canonical domain truth.

## Persistence

`InMemoryConnectorRepository` is an isolated Engine 20 adapter storing connectors
in a private `Map`. `clear()` is available for test teardown. This adapter
provides no durable production persistence. Durable storage and its migration
are an acknowledged architectural gap; no persistent schema was supplied in the
canonical specification.

## Canonical lifecycle contract

`IntegrationEngine` exposes `initialize()`, `healthCheck()`, and `shutdown()` as
required by `EngineLifecycleManager`. `healthCheck()` reports
`persistence: 'IN_MEMORY_INTEGRATION_ADAPTER'` and the current connector count.
`shutdown()` is a no-op.

## Test coverage

`tests/IntegrationEngine.test.js` — tests covering:

- ConnectorType vocabulary (6 types, case-insensitive normalization, rejection of invalid types)
- ConnectorStatus lifecycle transitions and terminal/operational helpers
- ConnectorConfig SSRF prevention (loopback, private IPs, forbidden schemes)
- ConnectorConfig secret header key rejection
- ConnectorConfig timeout bounds and invalid URL rejection
- ExternalConnector construction, immutability, lifecycle transitions
- ExternalConnector.applyConfigUpdate — valid update, RETIRED rejection
- RegisterConnector: success, event emission, duplicate name rejection, SSRF rejection
- Connector lifecycle: DRAFT → ACTIVE → PAUSED → ACTIVE → RETIRED, invalid transitions
- UpdateConnector: success, event, RETIRED rejection, invalid new URL
- Queries: getConnector, listConnectors (filtered), getConnectorStatus, null on unknown IDs
- Authorization: missing actor, missing roles, non-array roles, empty roles, unauthorized role (all 5 commands), all 4 authorized roles
- Authorization ordering: denial fires before idempotency, governance, and mutation
- Governance denial: blocks mutation and event before state change
- Idempotency: duplicate command returns cached result, no duplicate connectors or events
- Missing idempotencyKey rejection, unsupported command rejection
- Repository isolation: no cross-engine state leak
- Event correctness: all 5 event types, correct producer and subject
- Lifecycle contract: engineId, engineName, initialize, healthCheck, shutdown

## Known limitations

- Persistence is in-memory only. All state is lost on process restart.
- Engine 20 does not execute outbound network calls. Actual external communication
  requires an approved consuming subsystem.
- Only six connector types are implemented. Additional types require an approved
  canonical specification change.
- No inbound webhook signature verification is implemented at this layer; that
  is a consuming-subsystem responsibility.
- No retry/backoff/circuit-breaker infrastructure — execution orchestration belongs
  to Engine 21 Automation.
- Credential storage is limited to an opaque reference; no canonical secrets-store
  integration exists in the current specification.
- HTTP (non-TLS) endpoints are accepted for non-sensitive integrations but are
  not recommended for production use.

## Unresolved architectural questions

- No canonical credential-storage mechanism is defined. A production deployment
  requires an approved secrets-store contract (e.g. a `CredentialStore` port
  injected into `IntegrationApplicationService`) before `credentialRef` values
  can be resolved to actual credentials.
- The connector `WEBHOOK_ENDPOINT` type requires a canonical inbound event
  validation contract (signature verification, schema validation) before it can
  safely process inbound external payloads.
- Execution orchestration (scheduling, polling, retry) belongs to Engine 21
  Automation. The boundary contract between Engine 20 connectors and Engine 21
  workflows has not been formally defined.
