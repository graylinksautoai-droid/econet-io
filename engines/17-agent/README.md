# Engine 17 — Agent Engine

## Canonical mission (from Canon)

From `architecture/engine-registry/CanonicalEngineRegistry.js`, Engine 17 is `Agent Engine`, slug `17-agent`, layer `INTERACTION`, with the canonical description:

> "Autonomous agent role specifications, execution constraints, tool contracts, and agent behaviors."

## Canonical ownership

Agent owns the autonomous-agent domain: agent lifecycle, agent task management, agent execution state, bounded capability execution, agent coordination/delegation, agent result/provenance handling, and agent safety boundaries.

Agent does **not** own or duplicate: Identity (01), Dialogue (04), Intelligence/reasoning (05), Mission definitions (11), real-world action execution (12), Verification (13), Reputation (14), Reward (15), Community (16), Digital Twin (18), Simulation (19), External integrations (20), Automation/scheduling (21), Governance (22), Audit (23), or Learning (24).

## Public engine boundary

The engine exposes `AgentEngine` with:

- **Lifecycle:** `initialize()`, `healthCheck()`, `shutdown()`
- **Command execution:** `executeCommand(command)`
- **Queries:** `getAgent`, `listAgents`, `getTask`, `getTasksByAgent`, `getExecution`, `getExecutionsByTask`, `getExecutionByTaskAndAgent`
- **Service/repository access:** `service` and `repository` getters

## Commands (owned by this engine)

All mutating commands require an authenticated actor and an `idempotencyKey`.

- `RegisterAgent` — register a formal agent definition (name, kind, capabilities). The actor must hold an authorized agent role (`system`, `admin`, `agent_manager`, `automation`).
- `ChangeAgentStatus` — transition DRAFT/ACTIVE/SUSPENDED/RETIRED.
- `RunAgentTask` — run a bounded task on an agent with a declared capability. Enforces: agent must be ACTIVE, capability must be declared, input validated by the executor, explicit timeout.
- `CancelAgentTask` — cancel a PENDING/RUNNING task.
- `DelegateAgentTask` — delegate a bounded subtask to a child agent, preserving parent→child task and execution provenance.

## Queries (owned by this engine)

- `getAgent(agentId)`, `listAgents({ kind?, status? })`
- `getTask(taskId)`, `getTasksByAgent(agentId)`
- `getExecution(executionId)`, `getExecutionsByTask(taskId)`, `getExecutionByTaskAndAgent(taskId, agentId)`

## Domain model (owned by this engine)

- `AgentKind`: `SCOUT`, `ANALYST`, `GUARDIAN`, `GUIDE`, `COORDINATOR`, `GENERIC`.
- `AgentStatus`: `DRAFT`, `ACTIVE`, `SUSPENDED`, `RETIRED` (strict transitions).
- `ExecutionStatus`: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`, `TIMED_OUT` (strict transitions).
- `Agent` entity: formal agent definition with capabilities.
- `AgentTask` entity: bounded unit of work (input, requestedBy, parentTaskId, timeoutMs).
- `AgentExecution` entity: provenance record (taskId, agentId, kind, requestedBy, parentExecutionId, timestamps, result/error, targetEngine).

## Agent kinds and existing LILO prototype

The pre-existing LILO prototype (`server/services/liloAgents/`) contains Scout, Analyst, Guardian, and Guide agent concepts. Under canonical Engine 17, these are represented as **capability kinds** (`SCOUT`, `ANALYST`, `GUARDIAN`, `GUIDE`, `COORDINATOR`). The prototype's embedded domain behavior (disaster keyword detection, credibility scoring, anti-abuse heuristics, chat responses) belongs to other engines (Risk, Verification, Reputation, Dialogue) and is **not** embedded in Engine 17. Actual domain behavior is reached only through an **injected capability executor** that may consult other engines' public contracts.

The legacy broken `server/ai/LiloAgent.js` autonomous cron artifact is **not** revived as the canonical Agent Engine. Client-side `src/core/LiloCore.js` and `src/lilo/` remain outside backend Agent Engine ownership.

## Capability execution & safety

- Model/tool output is **untrusted until validated by the injected executor**.
- Confidence is not authorization; a task never escalates privileges.
- The default executor is a deterministic safe-execution allowlist (`summarize`, `echo`, `noop`); any other capability is rejected.
- Every execution has an explicit `timeoutMs`; a hanging execution becomes `TIMED_OUT`.
- `Recommendation ≠ execution`; `execution intent ≠ completed action`; external/tool output is data, not authority.

## Idempotency

- Command-level: shared `IdempotencyManager` keyed on `{engine}:{commandType}:{idempotencyKey}`.
- Duplicate commands create no duplicate agents, tasks, or executions.

## Events published by this engine

- `econet.agent.registered`
- `econet.agent.status_changed`
- `econet.agent.task_created`
- `econet.agent.task_completed`
- `econet.agent.task_failed`
- `econet.agent.task_cancelled`
- `econet.agent.task_delegated`

All events use producer `engine.17.agent` and the canonical `DomainEvent` envelope; Engine 23 consumes them via the Event Bus (no private audit journal).


## Security

- Authenticated actor required for every mutating command.
- Actor must hold one of the authorized agent roles (`system`, `admin`, `agent_manager`, `automation`).
- Caller-supplied claims are never treated as trusted authorization state; only role membership in the configured allowlist grants registration/execution.
- Agents cannot authorize themselves; `requestedBy` is always the initiating actor.
- No automatic privilege escalation.

## Governance

- When a governance adapter is supplied, `evaluatePolicy({ engine, commandType, actor, payload })` is evaluated before every mutating command; a denial produces no state change and no domain event.
- With `governance = null`, governance evaluation is skipped (documented limitation; production policy composition is expected).

## Audit relationship

- Engine 17 publishes canonical events only. It does not import Engine 23 internals and does not maintain its own journal.

## Cross-engine dependencies

- **Established contracts:** shared `Command`, `DomainEvent`, `EventBus`, `IdempotencyManager`, Governance port, canonical registry.
- **None imported privately:** no other engine's internal files are imported.
- **Capability executor port:** the `executor` adapter (`execute({ kind, taskId, agentId, capability, input })`) is the boundary through which agent capabilities may reach other engines via their public contracts. No default executor consults another engine.

## Persistence

`InMemoryAgentRepository` is an isolated Engine 17 adapter owning agents, tasks, and executions. It does not read or write other engines' state.

## Limitations

- No LLM/model provider integration: the default executor is a deterministic safe allowlist. Model-backed capabilities must be supplied via the executor port.
- No agent memory/persistence DB; in-memory adapter only (consistent with other completed engines).
- No autonomous cron/scheduling — that is Engine 21 Automation's domain.
- Scout/Analyst/Guardian/Guide domain behaviors are NOT embedded here; they belong to their owning engines and require approved cross-engine contracts.

## Test commands and results

- `node --test engines/17-agent/tests/AgentEngine.test.js` → 15 pass / 0 fail (at time of writing)
- `node --test tests/architecture/*.test.js` → 13 pass / 0 fail
- `node -e "...BoundaryEnforcer('engines')..."` → 0 violations
- `node tests/run-all.js` → full suite green

## Deviations from canonical

None. The registry mission ("autonomous agent role specifications, execution constraints, tool contracts, and agent behaviors") is honored within the implemented scope. Model-provider and scheduling capabilities are intentionally unimplemented and documented rather than fabricated.
