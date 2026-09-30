# Engine 15 — Reward Engine

## Canonical mission (from Canon)

From `architecture/engine-registry/CanonicalEngineRegistry.js`, Engine 15 is `Reward Engine`, slug `15-reward`, layer `INTEGRITY_AND_INCENTIVE`, with the canonical description:

> "Ecosystem incentives, point accounting, token balances, and double-entry reward distribution."

## Canonical ownership

Reward owns the reward/incentive domain: reward rules, reward eligibility evaluation, reward grants, XP/achievement recording where configured, reward history, idempotent issuance, reversal/correction, and authoritative internal point/token reward accounting via a balanced double-entry ledger.

Reward does **not** own:

- Identity, authentication, or authorization (Engine 01)
- Verification or consensus (Engine 13)
- Trust, credibility, standing, or contribution weighting (Engine 14)
- Social graph, communities, comments, feeds (Engine 16)
- Mission definitions (Engine 11), Action execution (Engine 12)

## Commands (owned by this engine)

All mutating commands require an `idempotencyKey` and are gated by authorization and (when an adapter is supplied) Engine 22 Governance.

- `RegisterRewardRule` — register an active reward rule (name, reward type, optional description/metadata). Rules carry **no** amounts or thresholds.
- `EvaluateRewardEligibility` — determine whether a recipient is eligible for a rule given a source event; returns `false` if the same operation was already granted and not reversed.
- `GrantReward` — grant a reward to a recipient under an active rule for a qualifying source event. Grants are provenance-complete (recipient, type, amount/achievement, rule, source event, reason, eligibility, grantedAt). Duplicate issuance is prevented.
- `ReverseReward` — reverse a previously granted reward. The historical grant is preserved and marked `REVERSED`; compensating ledger entries are posted so the ledger remains balanced.

## Queries (owned by this engine)

- `getGrant(grantId)`
- `getGrantsByRecipient(recipientId)`
- `getGrantsBySourceEvent(sourceEventRef)`
- `getBalance(recipientId, rewardType?)`
- `getLedger({ limit? })`
- `getRule(ruleId)`, `listRules()`
- `isLedgerBalanced()`

## Domain model (owned by this engine)

- `RewardType` value object: `XP`, `POINTS`, `TOKEN`, `ACHIEVEMENT`. Amounts are never invented — amount-bearing grants require an explicit positive value.
- `RewardRule`: immutable rule specification (no economics embedded).
- `RewardGrant`: authoritative, immutable grant record with status `GRANTED` → `REVERSED`.
- `RewardLedgerEntry`: minimal double-entry accounting entry (`DEBIT`/`CREDIT`).


## Events published by this engine

- `econet.reward.rule_registered`
- `econet.reward.eligibility_evaluated`
- `econet.reward.granted`
- `econet.reward.reversed`
- `econet.reward.achievement_unlocked` (only once per recipient)

All events use producer `engine.15.reward` and the canonical `DomainEvent` envelope; Engine 23 consumes them via the Event Bus (no private audit system).

## Security

- Every mutating command requires an authenticated actor.
- The actor must hold one of the authorized roles: `system`, `admin`, `reward_issuer`, `automation` (overridable via constructor options).
- Caller-supplied claims are never treated as trusted authorization state; only role membership in the configured allowlist grants issuance.
- Amounts are explicit values validated as positive finite numbers; the engine never fabricates economic values.

## Governance

- When a governance adapter is supplied, `evaluatePolicy({ engine, commandType, actor, payload })` is evaluated before every mutating command.
- A denial produces no state change and no domain event.
- With `governance = null`, governance evaluation is skipped (documented limitation — production policy composition is expected).

## Audit relationship

- Engine 15 publishes canonical events only. It does not import Engine 23 internals and does not maintain its own journal.

## Cross-engine dependencies

- **Established contracts:** shared `Command`, `DomainEvent`, `EventBus`, `IdempotencyManager`, Governance port, and the canonical registry.
- **None imported privately:** no other engine's internal files are imported.
- **Future integration points (not implemented):** Reputation (14) → Reward, Verification (13) → Reward trigger, Community (16) → Reward. No invented cross-engine contracts.

## Persistence

`InMemoryRewardRepository` is an isolated Engine 15 adapter owning grants, rules, ledger entries, achievement unlock state, and operation-keys. It does not read or write legacy `User`/`Report`/`MerchantLedger` models, and it does not write reward balances into `User.reputation`.

## Limitations

- No canonical XP amounts, XP caps, achievement catalogue, achievement thresholds, token supply, exchange rates, or reward formulas exist in the repo. These are deliberately **not invented**; rules carry no economics, and grant amounts must be explicit caller/config values.
- Durable storage for reward state is not yet specified; the engine uses the repository-standard in-memory adapter.
- Reward/Reputation and Reward/Community trigger integration remain unspecified future contracts.

## Assumptions

- Amount-bearing reward types (`XP`, `POINTS`, `TOKEN`) require explicit positive amounts at grant time.
- Achievements are represented as `ACHIEVEMENT` grants with an `achievementId` and no scalar amount.
- Reversal is explicit and preserves history; grants are never deleted.

## Accounting model

- Every amount-bearing grant posts a balanced `DEBIT` (to `REWARD_RESERVE`) + `CREDIT` (to recipient) pair.
- Every reversal posts equal-and-opposite compensating entries.
- Balances are derived from ledger entries; the ledger is always balanced. No token supply, exchange rates, fiat, wallets, blockchain, or monetary economics are implied.

## Idempotency

Two layers:

1. **Domain-level:** the operation tuple `(sourceEventRef, ruleId, recipientId, rewardType)` is the canonical logical reward operation. A `GRANTED` operation is never double-issued.
2. **Command-level:** the shared `IdempotencyManager` keyed on `{engine}:{commandType}:{idempotencyKey}` replays cached results without repeated side effects.

- Governance policy (Engine 22) or the audit journal (Engine 23)

## Public engine boundary

The engine exposes `RewardEngine` with:

- **Lifecycle:** `initialize()`, `healthCheck()`, `shutdown()`
- **Command execution:** `executeCommand(command)`
- **Queries:** `getGrant`, `getGrantsByRecipient`, `getGrantsBySourceEvent`, `getBalance`, `getLedger`, `getRule`, `listRules`, `isLedgerBalanced`
- **Service/repository access:** `service` and `repository` getters