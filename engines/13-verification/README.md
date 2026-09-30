# Engine 13 — Verification

**Canonical identity:** `13` / `13-verification` / Verification Engine  
**Canonical mission:** multi-source credibility scoring, consensus voting, peer validation, and ground-truth confirmation.

## Ownership and scope

Engine 13 owns the verification claim for an observation, votes recorded against that claim, consensus scoring, verification state, and confirmation or rejection outcomes. It exposes a public engine entrypoint with command execution, claim/status queries, and standard lifecycle hooks.

It does not own observation ingestion or observation state, identity or authentication, reputation scoring, rewards, community activity, risk or prediction calculations, mission/action execution, governance policy definition, or audit-journal storage. It has no direct imports from another engine.

## Domain model

`VerificationClaim` is an immutable aggregate with a generated claim ID, one observation ID, claimant ID, credibility score, vote history, consensus flag, outcome, metadata, and timestamps. The in-memory repository enforces one stored claim per observation ID.

Votes are `CONFIRM` or `DISPUTE`. A claimant cannot vote on their own claim, and a voter can vote only once on a claim. Vote weights are normalized to a minimum of `0.1`.

The current statuses are:

| Status | Meaning |
| --- | --- |
| `PENDING` | Claim created and awaiting a vote. |
| `VERIFYING` | At least one vote has been recorded without a final consensus. |
| `VERIFIED` | Confirming consensus reached. |
| `REJECTED` | Disputing consensus reached or an allowed rejection finalization occurred. |
| `DISPUTED` | Quorum reached without either side meeting the consensus threshold. |

The aggregate permits `PENDING → VERIFYING` or `REJECTED`; `VERIFYING → VERIFIED`, `REJECTED`, or `DISPUTED`; `DISPUTED → VERIFYING`, `VERIFIED`, or `REJECTED`; and `VERIFIED` or `REJECTED → DISPUTED`.

## Commands

All supported mutation commands must target `13-verification` and include an idempotency key.

| Command | Implemented behavior |
| --- | --- |
| `InitiateVerification` | Creates a pending claim for an observation unless one already exists. Requires `observationId` and a claimant ID (payload or actor). |
| `CastVerificationVote` | Records a confirmation/dispute vote for a claim selected by claim ID or observation ID, recalculates credibility, and evaluates consensus. |
| `FinalizeVerification` | Transitions an existing claim to `VERIFIED` when `outcome` is `CONFIRMED`; any other supplied outcome selects `REJECTED`, subject to the aggregate's transition rules. |

Unsupported command types, wrong targets, and missing idempotency keys are rejected.

## Consensus and credibility

`ConsensusScorer` totals confirmation and dispute weights. Credibility is the confirmation-weight ratio expressed on a `0–100` scale. By default, quorum is reached at three votes or total vote weight of at least three. Once quorum is reached, a `0.66` weighted ratio confirms or rejects the claim; a split vote that meets neither threshold becomes `DISPUTED`.

## Queries

- `getVerificationStatus(observationId)` returns the claim's ID, status, score, consensus/outcome, and votes, or `null` when no claim exists.
- `getClaim(claimId)` returns the immutable claim snapshot, or `null` when it is not found.

## Events

The application service publishes shared `DomainEvent` instances through the Event Bus with producer `engine.13.verification` and preserves the command correlation ID:

- `econet.verification.initiated`
- `econet.verification.vote_recorded`
- `econet.verification.consensus_reached`
- `econet.verification.completed`
- `econet.verification.rejected`

These events describe Engine 13's verification lifecycle. Engine 13 does not directly update another engine's private state.

## Persistence and dependencies

The current persistence implementation is `InMemoryVerificationRepository`. It stores claims in process memory using maps keyed by claim ID and observation ID; it is not durable storage and has no database adapter.

The implementation uses the shared `Command` and `DomainEvent` contracts, the shared in-memory Event Bus, and the shared `IdempotencyManager`. Claim ID generation uses Node.js `crypto.randomUUID`. There are no direct dependencies on another engine implementation.

## Governance, audit, and security boundaries

When a governance adapter is supplied, Engine 13 calls its `evaluatePolicy` method before dispatching every supported mutation; a denied decision prevents the mutation. Engine 13 does not define governance policy.

Engine 13 does not write to, own, or validate the Audit Engine's journal. Publishing a domain event is its available audit boundary; any journal handoff must be provided by an external subscriber or integration.

The current implementation validates command routing and required mutation idempotency keys, validates claim fields and credibility bounds, freezes claim/value snapshots, and prevents self-voting and duplicate voting. It does not authenticate actors, authorize actor roles, derive voting weight from identity/reputation, or validate that an observation ID exists in the Observation Engine.

## Idempotency

Each mutation executes through the shared idempotency manager under an Engine-13 command/type/key namespace. A completed duplicate returns the cached result without repeating state changes or event publication. Failed executions are recorded by the shared manager and replay as failures for the same key.

## Testing status

At reconciliation, the direct Engine 13 suite passes 4/4 tests, Workflow A passes 1/1, architecture tests pass 13/13, the full repository suite passes 128/128, and `BoundaryEnforcer` reports zero violations.

## Known limitations and explicitly unimplemented capabilities

- Persistence is in-memory only; claims are lost when the process ends.
- There is no Engine 13-specific contracts directory or persistence port. The implementation uses existing shared contracts and the current repository adapter; no additional interfaces are defined here.
- There is no direct Observation Engine lookup, event subscription, or automatic observation-status update.
- There is no authentication, role authorization, reputation-derived weighting, reward integration, community workflow, risk/prediction logic, action dispatch, governance-policy ownership, or audit-journal implementation.
- No HTTP API, external service connector, or database schema is implemented by this engine.
