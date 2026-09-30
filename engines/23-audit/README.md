# Engine 23 — Audit Engine

## Canonical identity

Engine ID: `23` · Name: `Audit Engine` · Layer: `INTEGRITY_AND_INCENTIVE`

Canonical mission (from `CanonicalEngineRegistry.js`):
> "Immutable event journals, operational audit trails, compliance logs, and verification history."

## Mission

Engine 23 maintains a cryptographically tamper-evident append-only journal of all canonical domain events flowing through the EcoNet EventBus. It subscribes to the shared event infrastructure and automatically records every event as a chained `AuditJournalEntry`, enabling integrity verification and compliance audit queries.

## Responsibilities

- Append-only, tamper-evident SHA-256 hash-chained audit journal
- Automatic recording of all domain events via EventBus subscription
- Cryptographic integrity verification of the full journal chain
- Journal querying with filtering by eventType, producer, correlationId, actorId
- Canonical `AuditJournalEntry` record production (from `contracts/audit/`)

## Non-responsibilities

Engine 23 does **not** own:

| Responsibility | Owner |
|---|---|
| Identity / authentication | Engine 01 |
| Environmental observations | Engine 02 |
| Risk assessment | Engine 09 |
| Predictions | Engine 10 |
| Missions | Engine 11 |
| Actions | Engine 12 |
| Verification decisions | Engine 13 |
| Reputation | Engine 14 |
| Rewards | Engine 15 |
| Communities | Engine 16 |
| Agents | Engine 17 |
| Digital twins | Engine 18 |
| Simulations | Engine 19 |
| External connectors | Engine 20 |
| Automation jobs | Engine 21 |
| Governance policies | Engine 22 |
| Learning / model improvement | Engine 24 |

## Domain model

### AuditJournalEntry (from `contracts/audit/AuditJournalEntry.js`)

The canonical pre-existing contract. Each entry records:

- `entryId` — unique entry ID (`aud_...`)
- `sequenceNumber` — monotonically increasing (0-indexed)
- `previousHash` — SHA-256 hash of the prior entry (`0*64` for genesis)
- `currentHash` — SHA-256 hash of this entry (computed deterministically)
- `occurredAt` — ISO-8601 timestamp
- `eventType` — canonical event type string
- `producer` — originating engine identifier
- `actor` — frozen actor reference or null
- `subject` — frozen subject reference or null
- `payloadSummary` — frozen payload reference (not redacted by this engine)
- `correlationId` — distributed tracing ID or null

`isValid()` recomputes the hash and compares — detects tampering of any field.

### GENESIS_HASH

`'0'.repeat(64)` — the initial previous hash for the first journal entry.

## Commands / mutations

Engine 23 has **no actor-driven commands**. It is an append-only infrastructure component. The sole mutation is `recordEvent(event)`, called internally via the EventBus subscription established by `initialize()`.

## Queries

| Method | Description |
|---|---|
| `queryJournal(filter?)` | Return filtered journal entries as serialized JSON. Filter fields: `eventType`, `producer`, `correlationId`, `actorId`. |
| `verifyIntegrity()` | Verify the complete SHA-256 hash chain from genesis to tip. Returns `{ verified, totalEntries, brokenAtSequence?, error? }`. |
| `totalEntries` (property) | Current count of journal entries. |

## Events

Engine 23 does **not emit** domain events — it records them. It does not publish back to the EventBus.

## Authorization

Engine 23 has no mutating commands and therefore no actor-based authorization surface. `recordEvent` is called internally only — it is not a public command interface. `queryJournal` is a read-only method with no authorization guard (in-memory query only).

## Governance

Not applicable — Engine 23 does not issue commands to other engines and accepts no governance-gated mutations.

## Idempotency

Not applicable — `recordEvent` is called exactly once per event delivery (the EventBus subscription guarantees serial delivery per event). The journal is append-only; there is no replay deduplication concern within the engine.

## EventBus subscription

`initialize()` calls `eventBus.subscribeAll(handler, { priority: 1, engineId: '23' })` with priority `1` (processed very early in the subscriber order). The subscription captures every domain event published on the shared EventBus.

`shutdown()` unsubscribes via `eventBus.unsubscribe(subscriptionId)`. After shutdown, no further events are journaled until the next `initialize()` call.

## Hash chain integrity

Each `AuditJournalEntry.currentHash` is a SHA-256 digest of:

```json
{
  "sequenceNumber": ...,
  "previousHash": "...",
  "occurredAt": "...",
  "eventType": "...",
  "producer": "...",
  "actor": ...,
  "subject": ...,
  "payloadSummary": ...,
  "correlationId": "..."
}
```

`verifyIntegrity()` walks the full journal:
1. Checks each `sequenceNumber` matches its index.
2. Checks each `previousHash` matches the prior entry's `currentHash`.
3. Calls `isValid()` on each entry (recomputes hash and compares).

Any tampering of any field of any entry breaks the chain at that sequence.

## Public facade

`AuditEngine` in `index.js` exposes:

- `engineId = '23'`, `engineName = 'Audit Engine'`
- `initialize(eventBus?)` — subscribe to EventBus
- `healthCheck()` — returns `{ healthy, details: { totalJournalEntries, integrityStatus, verified, totalEntries } }`
- `shutdown()` — unsubscribe from EventBus
- `recordEvent(event)` — internal/direct recording (also called by subscription)
- `verifyIntegrity()` — cryptographic chain verification
- `queryJournal(filter?)` — filtered query
- `totalEntries` — count property
- `clear()` — test teardown only

## Persistence

The journal is stored in an in-memory `Array`. All entries are lost on process restart. This is the canonical implementation pattern consistent with all other completed EcoNet engines.

## Cross-engine usage

Engine 23 is consumed by the Engine 01 acceptance test (`IdentityEngineAcceptance.test.js`), which:
1. Creates a shared `EventBus`
2. Instantiates `AuditEngine(eventBus)` and calls `initialize()`
3. Runs the identity/auth acceptance flow (publishing events to the bus)
4. Calls `auditEngine.verifyIntegrity()` and asserts `verified === true`
5. Asserts `totalEntries === events.length`

This confirms Engine 23 integrates correctly with the existing acceptance harness.

## Security

- No `eval()`, `new Function()`, dynamic imports, or shell execution
- No raw credentials stored or returned
- `payloadSummary` is stored as-is from the event payload — callers must redact sensitive content before publishing events if needed
- Journal entries are frozen (`Object.freeze`) — no in-place mutation possible through the public API
- No outbound network calls
- No arbitrary file access

## Known limitations

- In-memory only — journal lost on process restart
- No durable persistence contract defined in the canonical specification
- `payloadSummary` is the full event payload — no redaction layer is implemented (downstream consumers should not rely on sensitive payload data being scrubbed)
- No pagination for `queryJournal` — all matching entries returned in one call
- `queryJournal` does not support date-range filtering

## Architectural gaps

| Gap | Minimum decision required |
|---|---|
| Durable persistence | Canonical storage contract (append-only log, immutable DB, blockchain) |
| Payload redaction | Approved redaction policy for sensitive event payloads |
| Query pagination | Approved pagination contract |
| External audit export | Approved export format and delivery mechanism |

## Verification

- Focused Engine 23 tests: see `tests/AuditEngine.test.js`
- Architecture tests: `node --test tests/architecture/*.test.js`
- Boundary check: BoundaryEnforcer reports 0 violations
- Engine 01 acceptance test uses Engine 23 directly and passes in the full suite
