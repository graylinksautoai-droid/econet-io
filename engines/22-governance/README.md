# Engine 22 — Governance Engine

## Canonical identity

Engine ID: `22` · Name: `Governance Engine` · Layer: `INTEGRITY_AND_INCENTIVE`

Canonical mission (from `CanonicalEngineRegistry.js`):
> "System policies, operational constraints, compliance checks, and decentralized rule enforcement."

## Purpose

Engine 22 serves two complementary roles:

1. **Governance adapter** — concrete implementation of the `evaluatePolicy` contract consumed by all EcoNet engines (09–21 and beyond). Every engine's `_assertGovernance()` method calls `governance.evaluatePolicy({ engine, commandType, actor, payload })` and this engine is the authoritative implementation of that interface.

2. **Policy management** — Command-based registration and lifecycle management of governance policies through the canonical `Command` / `DomainEvent` infrastructure.

## Scope

Engine 22 owns:

- governance policy definitions (policyId, name, target, evaluator, active flag)
- policy lifecycle (ACTIVE ↔ INACTIVE)
- `evaluatePolicy` — the cross-engine governance evaluation contract
- `evaluateCompliance` — target-scoped compliance evaluation (legacy API)
- `createCommandMiddleware` — CommandBus interception middleware (legacy API)
- policy registration events and provenance

## Non-scope

| Responsibility | Owner |
|---|---|
| Identity / authentication | Engine 01 |
| Environmental observations | Engine 02 |
| Risk assessment | Engine 09 |
| Prediction | Engine 10 |
| Mission definitions | Engine 11 |
| Real-world action records | Engine 12 |
| Verification decisions | Engine 13 |
| Reputation | Engine 14 |
| Rewards / XP | Engine 15 |
| Community membership | Engine 16 |
| Autonomous agents | Engine 17 |
| Digital twins | Engine 18 |
| Simulations | Engine 19 |
| External connectors | Engine 20 |
| Automation jobs | Engine 21 |
| Audit infrastructure | Engine 23 |
| Learning / model improvement | Engine 24 |

## Governance adapter usage

All other engines inject `GovernanceEngine` as an optional `governance` adapter:

```js
const governance = new GovernanceEngine({ /* options */ });

// Inside any engine's _assertGovernance():
const decision = await governance.evaluatePolicy({
  engine: '19-simulation',
  commandType: 'RunSimulation',
  actor: cmd.actor,
  payload: cmd.payload
});
if (!decision.allowed) {
  throw new Error(`Governance policy denial: ${decision.reason}`);
}
```

`evaluatePolicy` evaluates all **active** policies whose `target` matches `commandType`, `engine`, or `'*'` (wildcard). Returns `{ allowed: true }` if no policy denies, or `{ allowed: false, reason }` on the first denial.

## Policy evaluator security

`GovernancePolicy.evaluator` is a **server-side JavaScript function** from `contracts/governance/GovernancePolicy.js` (the existing canonical contract). This is intentional:

- Policies are registered server-side via `registerPolicy()` or `RegisterPolicy` command
- Callers **never supply executable code** through the Command interface — the `evaluator` function must come from server-side application code
- No `eval()`, `new Function()`, dynamic module loading, or shell execution
- This follows the same pattern as Engine 21's worker registration

## Commands

All mutating commands require a `Command` with a valid `idempotencyKey`, an authenticated `actor`, and one of the authorized governance roles.

| Command | Description |
|---|---|
| `RegisterPolicy` | Register a new governance policy. Requires `policyId`, `name`, `target`, and a server-side `evaluator` function. Duplicate policyIds are rejected. |
| `DeactivatePolicy` | Set a policy to INACTIVE. Deactivated policies are bypassed by `evaluatePolicy`. Not permanently deleted. |
| `ReactivatePolicy` | Restore an INACTIVE policy to ACTIVE. |

## Queries

| Method | Returns |
|---|---|
| `getPolicy(policyId)` | `GovernancePolicy` or `null` |
| `listPolicies({ activeOnly? })` | Array of `GovernancePolicy` |

## Legacy / direct API

These methods are preserved from the original Engine 22 stub for backward compatibility:

| Method | Description |
|---|---|
| `registerPolicy(policy)` | Register a `GovernancePolicy` directly (server-side, no Command required) |
| `evaluateCompliance(target, context)` | Target-scoped compliance evaluation returning `{ compliant, violations[] }` |
| `createCommandMiddleware()` | Returns a CommandBus middleware function |
| `getPolicies()` | Returns all registered policies |
| `getViolations()` | Returns accumulated violation records from `evaluateCompliance` calls |

## Events

All events use the canonical `DomainEvent` envelope. Producer: `engine.22.governance`.

| Event type | Emitted when |
|---|---|
| `econet.governance.policy_registered` | `RegisterPolicy` succeeds |
| `econet.governance.policy_deactivated` | `DeactivatePolicy` succeeds |
| `econet.governance.policy_reactivated` | `ReactivatePolicy` succeeds |

Every event carries `subject.entityType = 'governance_policy'` and `subject.entityId = policyId`.

## PolicyStatus

`ACTIVE → INACTIVE` (deactivate) · `INACTIVE → ACTIVE` (reactivate)

Policies are never hard-deleted. An INACTIVE policy is bypassed by all evaluation calls.

## Authorization

Authorized roles: `system`, `admin`, `governance_manager`, `automation`.

Authorization follows the canonical Engine 15/18/19/20/21 pattern — fires before idempotency and mutation. Missing, null, non-array, and empty `actor.roles` are denied.

## Meta-governance note

`GovernanceApplicationService` does NOT evaluate governance before its own mutations. A governance engine cannot gate its own policy registration behind policies that may not yet exist. This is an intentional and documented design decision.

## Idempotency

All three mutating commands require a non-empty `idempotencyKey`. The shared `IdempotencyManager` wraps every command dispatch; replaying the same key returns the cached result.

## Persistence

`InMemoryPolicyRepository` is an isolated Engine 22 adapter storing policies in a private `Map`. `clear()` is available for test teardown. No durable production persistence is provided.

## Health check

```js
{
  healthy: true,
  engineId: '22',
  details: {
    status: 'READY',
    persistence: 'IN_MEMORY_GOVERNANCE_ADAPTER',
    totalPolicies: <number>,
    activePolicies: <number>
  }
}
```

## Known limitations

- In-memory persistence only. All policies are lost on process restart.
- Policy evaluators are server-side functions. There is no durable policy serialization — policies cannot be stored to/from a database in the current implementation.
- `getViolations()` only tracks violations from `evaluateCompliance()` calls, not from `evaluatePolicy()` calls.
- No policy versioning — a policy update requires deactivate + register a new one.

## Architectural gaps

| Gap | Minimum decision required |
|---|---|
| Durable policy persistence | A canonical policy serialization format (separate from the JS evaluator function) |
| Policy expression language | If policies are to be stored as data (not code), an approved safe expression contract |
| Policy versioning | Canonical `PolicyVersion` entity and immutability contract |
| Audit integration | Approved Engine 23 event subscription for governance decisions |
