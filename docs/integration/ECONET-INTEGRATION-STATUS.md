# EcoNet IO — Canonical Backend Integration Status

**Last updated:** Audit verification + architecture decision session  
**Canonical engine count:** 24  
**Test suite:** 458/458 passing  
**BoundaryEnforcer violations:** 0

---

## Executive Summary

EcoNet IO has three co-existing systems that this integration phase is connecting:

| System | Description | Status |
|---|---|---|
| Canonical engine layer | 24-engine ESM domain architecture in `engines/` | All engines implemented and tested |
| Legacy backend | Express 5 + MongoDB in `server/` | Active, deployed, no canonical awareness |
| React 19 frontend | Vite + Tailwind in `src/` | Active, connected only to legacy backend for most data |

**Phase 0 outcome:** Four critical security defects were fixed, Engine 11 Mission was exposed via a versioned HTTP adapter, and the Mission Map frontend was connected to real canonical data.

**Post-Phase 0 hardening outcome:** Netlify plaintext password fixed with bcryptjs, engine initialization made fault-tolerant, Netlify URL construction bug corrected, HTTP integration tests added for v2 mission routes, canonical audit event gap resolved.

**Audit verification session outcome:** Canonical audit event delivery was proved by 26 real integration tests (not constructor-wiring assumptions). The engines.js initialization order was corrected. Architecture decisions for all pending write work were documented. Engine 02 Observation readiness was fully inspected with all contract mismatches catalogued.

---

## Test Coverage

**458 tests — 0 failures**

| Test category | Count | What it covers |
|---|---|---|
| Canonical engine tests | 387 | Engine domain logic, value objects, commands, events, auth, idempotency |
| Netlify auth unit tests | 14 | bcryptjs hashing, password verification, migration path, input validation |
| Engine initialization tests | 6 | MissionEngine lifecycle, failure flag, 503 guard |
| URL construction unit tests | 8 | `getV2ApiOrigin()` for each deployment target |
| HTTP integration tests | 17 | v2 mission GET endpoints end-to-end via real HTTP |
| **Canonical audit integration tests** | **26** | **AuditEngine event capture, hash chain, subscription order, duplicate init risk, shutdown, in-memory limitations, healthCheck** |

**Not covered by automated tests:**
- Netlify Blobs persistence layer (requires a real Netlify environment)
- MissionMap component null-coordinate guard (no React test runner configured)
- CommandCenter.jsx fetch lifecycle (no React test runner configured)
- Legacy Express/MongoDB auth flow
- Engine 02 HTTP routes (none exist yet)

---

## Security Fixes Applied

| # | Severity | File | Defect | Fix |
|---|---|---|---|---|
| P1 | CRITICAL | `src/pages/Login.jsx` | Raw password stored in `localStorage` | Email-only remember-me; migration cleanup; immediate removal on uncheck |
| P2 | CRITICAL | `src/pages/SubmitReport.jsx`, `src/pages/EditProfile.jsx` | Cloudinary credentials in frontend bundle | Both upload via `/api/upload/image` server route |
| P3 | CRITICAL | `netlify/functions/api.js` | `password: 'password123'` hardcoded in source | Replaced with `process.env.NETLIFY_DEMO_PASSWORD`; seeded user omitted when absent |
| P3b | HIGH | `src/context/AuthContext.jsx` | Login timeout silently created fake session | Fallback gated on `VITE_ENABLE_DEMO_FALLBACK=true` |
| P4 | HIGH | `server/index.js` | `process.exit(1)` when `GROQ_API_KEY` absent | Warning-only; lazy Groq client with 503 guard in `/analyze-report` |
| P5 | HIGH | `netlify/functions/api.js` | Registration stores plaintext password; login uses `===` | bcryptjs hashing on registration; `bcrypt.compare()` on login; migration path for legacy plaintext |

### Netlify password vulnerability — current status

**FIXED.** Passwords hashed with `bcryptjs@2.4.3` (pure JS, esbuild-compatible). Login handler: (1) detects bcrypt hashes and uses `bcrypt.compare()`; (2) detects legacy plaintext, verifies by equality, rehashes on success; (3) rejects missing credentials with 400 before any lookup.

**Netlify authentication status:** ACTIVE — serves the Netlify beta deployment. Separate from canonical Engine 01 Identity. Migration planned but not scheduled.

---

## Canonical Audit Verification — PROVED

**Previous status:** Claimed as resolved based on constructor wiring. **This was insufficient.**

**Current status:** Proved by 26 real integration tests in `server/tests/canonical-audit-integration.test.js`.

### What the tests prove

| # | Finding | Verified by test |
|---|---|---|
| 1 | AuditEngine captures `econet.mission.created` events when initialized before publication | §1 — subscription and capture |
| 2 | AuditEngine records correct `eventType`, `producer`, `actor`, `subject` | §1 |
| 3 | Multiple events recorded in arrival order with correct sequence numbers | §1 |
| 4 | `ActivateMission` status-change events are also captured | §1 |
| 5 | `verifyIntegrity()` returns `verified: true` on 0, 1, and 3-entry journals | §2 |
| 6 | First entry `previousHash` equals `GENESIS_HASH` | §2 |
| 7 | Each entry's `previousHash` equals the previous entry's `currentHash` | §2 |
| 8 | `currentHash` values are 64-character lowercase hex strings (SHA-256) | §2 |
| 9 | Events published **before** `initialize()` are **not** captured | §3 |
| 10 | Events published **after** `initialize()` are captured regardless of MissionEngine init order | §3 |
| 11 | Calling `initialize()` twice without `shutdown()` creates **duplicate** journal entries (documented risk) | §4 |
| 12 | `shutdown()` then `initialize()` produces exactly one entry per event (safe path) | §4 |
| 13 | Events published after `shutdown()` are **not** recorded | §5 |
| 14 | `shutdown()` on a never-initialized engine does not throw | §5 |
| 15 | MissionEngine operates normally when AuditEngine is never initialized | §6 |
| 16 | MissionEngine operates normally when AuditEngine has been shut down | §6 |
| 17 | New `AuditEngine` instance starts with empty journal (simulates process restart) | §7 |
| 18 | `queryJournal({ eventType })` filters correctly | §7 |
| 19 | `healthCheck()` reports `healthy: true` and correct entry counts | §8 |

### Known risks surfaced by the tests

| Risk | Severity | Status |
|---|---|---|
| Duplicate subscriptions if `initialize()` called twice without `shutdown()` | MEDIUM | **OPEN** — callers must not call `initialize()` twice. The composition root (`engines.js`) calls it exactly once. |
| In-memory journal lost on server restart | HIGH | **OPEN** — see Decision A (persistence). Entire SHA-256 chain is gone after every restart. Not acceptable for compliance. |
| Events published before `initialize()` are silently missed | MEDIUM | **FIXED** — `engines.js` now initializes AuditEngine **before** MissionEngine. The previous order was reversed with a misleading comment. |

### engines.js initialization order — corrected

The previous comment read: *"AuditEngine must be initialised AFTER MissionEngine."* This was backwards.

**Correct order:** AuditEngine must initialize (subscribe) **before** any engine that publishes events. If an engine emits events during its own `initialize()`, those events are only captured if the AuditEngine wildcard subscription is already registered.

`MissionEngine.initialize()` currently returns `{ ready: true }` synchronously and emits no events, so no events were actually lost under the old order. But the semantics were wrong and the comment was misleading. Both have been corrected.

---

## Canonical Engine Runtime

### Initialization (current)

`server/canonical/engines.js`:

1. Constructs `canonicalEventBus` and `canonicalIdempotencyManager` (isolated from legacy pipeline).
2. Constructs `AuditEngine(canonicalEventBus)`.
3. **`await auditEngine.initialize()`** — wildcard subscription registered first.
4. Constructs `MissionEngine` with `canonicalEventBus` and `canonicalIdempotencyManager`.
5. **`await missionEngine.initialize()`** — after audit is subscribed.
6. Sets `missionEngineAvailable = true` only on success.
7. Either failure is caught independently; the server continues in a degraded state.

### Persistence limitation (unchanged)

All canonical repositories are in-memory. State is lost on restart. **This is the single most important unresolved risk for production readiness.**

---

## Deployment Support Matrix

| Deployment | Auth | Reports/Feed | Map | v2 Missions | Canonical Audit |
|---|---|---|---|---|---|
| Express + MongoDB (dev/prod) | ✓ JWT | ✓ MongoDB | ✓ MongoDB GeoJSON | ✓ Engine 11 (read-only) | ✓ Engine 23 (in-memory) |
| Netlify Functions (beta) | ✓ bcryptjs+Blobs | ✓ Blobs | ✓ Blobs GeoJSON | **✗ not supported** | **✗ not supported** |

`CommandCenter.jsx` checks `getV2ApiOrigin()` — returns `null` on Netlify, shows "unavailable" rather than making a broken request.

---

## API v2 Boundary

Base path: `/api/v2` (Express server only)  
Authentication: not required for current read-only endpoints  
Error schema: `{ error: string, message?: string, received?: any }`

### Engine 11 Mission — implemented

| Method | Path | Status | Tests |
|---|---|---|---|
| `GET` | `/api/v2/missions` | **IMPLEMENTED** | 9 HTTP integration tests |
| `GET` | `/api/v2/missions/:missionId` | **IMPLEMENTED** | 4 HTTP integration tests |

### Engine 11 Mission — deferred

| Method | Path | Status | Blocker |
|---|---|---|---|
| `POST` | `/api/v2/missions` | **NOT IMPLEMENTED** | Decision A (persistence) + Decision B (coordinates) |
| `POST` | `/api/v2/missions/:id/activate` | **NOT IMPLEMENTED** | Same |
| All other lifecycle commands | — | **NOT IMPLEMENTED** | Same |

### Engine 02 Observation — not yet started

| Method | Path | Status | Blocker |
|---|---|---|---|
| `GET` | `/api/v2/observations` | **NOT IMPLEMENTED** | Phase R — low risk, no hard blockers |
| `GET` | `/api/v2/observations/:id` | **NOT IMPLEMENTED** | Phase R |
| `POST` | `/api/v2/observations` | **NOT IMPLEMENTED** | Decision A + authorization decision + coordinates strategy |

---

## Engine 02 Observation — Readiness Findings

Engine 02 domain logic is **complete** (5 commands, 3 queries, 5 tests passing). It is **not wired** into the server composition root and has **no HTTP routes**.

### Critical contract mismatches vs legacy

| Gap | Severity | Description |
|---|---|---|
| Coordinates | **CRITICAL** | Entity requires numeric `latitude`/`longitude`; frontend collects free-text only. Geocoding must happen server-side before the command is built. |
| Authorization | **HIGH** | `execute()` has no role check (unlike Engine 11). Any caller can submit. Explicit policy decision required before exposing a write endpoint. |
| Category/severity/urgency enums | **MEDIUM** | Legacy uses mixed-case (`Flood`, `Low`, `Immediate`); canonical requires `UPPER_CASE`. `Observation` and `TemporaryRelief` urgency values have no canonical equivalent. |
| `images[]` vs `evidence[]` | **MEDIUM** | Legacy stores URL strings. Canonical stores `{ id, mediaType, url, hashSha256, mimeType }`. Adapter must transform and compute hashes. |
| Social engagement fields | **MEDIUM** | `likes`, `upvotes`, `downvotes`, `comments`, `shares` not in canonical entity. Frontend report cards cannot consume canonical response without adapter. |
| AI enrichment fields | **MEDIUM** | `liloClassification`, `aiVerification`, `aiScore`, `confidence`, `summary` not in canonical entity. Must go into `metadata` or be dropped. |
| Dual data store risk | **HIGH** | Active MongoDB `reports` collection. Any write to canonical also leaves a gap in legacy reads unless a cutover or dual-write strategy is chosen. |
| Media upload infrastructure | **LOW** | Upload stored locally via multer; no Cloudinary. Canonical entity stores URL only — no file-content SHA-256. |

Full analysis and proposed Phase R / Phase W integration plan: see `docs/integration/ARCHITECTURE-DECISIONS-REQUIRED.md` — Engine 02 Appendix.

---

## Architecture Decisions Required

Full decision briefs with options and consequences: `docs/integration/ARCHITECTURE-DECISIONS-REQUIRED.md`

| ID | Decision | Status | Blocking |
|---|---|---|---|
| A | Persistence strategy (ephemeral / MongoDB adapter / block writes) | **OPEN** | All write endpoints |
| B | Coordinates in Mission entity (targetCriteria convention / entity field / Engine 07) | **OPEN** | `POST /api/v2/missions` payload design |
| C | Identity and actor authority (stale JWT, reporter→automation mapping, Engine 01 migration) | **OPEN** | Authorized writes, Engine 01 migration |
| D | Next vertical slice (Engine 11 mission creation vs Engine 02 observation integration) | **OPEN** | Sprint planning |

**No write endpoint will be implemented until the relevant decisions are approved.**

---

## Role Mapping (Legacy → Canonical)

Defined in `server/canonical/actorFromRequest.js`.

| Legacy `user.role` | Canonical `roles[]` | Engine 11 mutation access | Notes |
|---|---|---|---|
| `admin` | `['admin', 'system']` | Full | — |
| `authority` | `['mission_lead']` | Create and manage missions | — |
| `reporter` | `['automation']` | Automation-level | Semantic mismatch — see Decision C |
| `user` | `[]` | Read-only | — |

---

## Data Ownership Matrix

| Domain | Current authoritative owner | Canonical engine | Migration status |
|---|---|---|---|
| Identity / Auth | MongoDB `User` + `server/routes/auth.js` | Engine 01 Identity | NOT MIGRATED |
| User profiles | MongoDB `User` | Engine 01 Identity | NOT MIGRATED |
| Observations / Reports | MongoDB `Report` | Engine 02 Observation | NOT MIGRATED — see Engine 02 findings |
| **Missions** | **Engine 11 MissionEngine (in-memory)** | Engine 11 Mission | **CONNECTED — read-only** |
| Rewards / XP | `src/services/economy.js` (client-side) | Engine 15 Reward | NOT MIGRATED — shadow implementation |
| Communities | None | Engine 16 Community | NOT EXPOSED |
| Risk assessments | None | Engine 09 Risk | NOT EXPOSED |
| Predictions | None | Engine 10 Prediction | NOT EXPOSED |
| Governance policies | None | Engine 22 Governance | NOT EXPOSED |
| Audit records | **Engine 23 Audit (in-memory, canonicalEventBus)** | Engine 23 Audit | **CONNECTED — in-memory, proved by tests** |
| Lilo AI (conversation, classification, agents) | Legacy pipeline: Groq `/analyze-report` + `LiloAgentSystem` + `liloClassification` on `Report` | Engines 04/05/17 serve Lilo's capabilities (not a replacement for Lilo) | ACTIVE — Lilo runs on legacy pipeline; canonical engine integration not yet started |

---

## Persistence Limitations

All canonical engines use `InMemoryXxxRepository`. **State is lost on server restart.**

| Engine | Data lost on restart | Acceptable for? |
|---|---|---|
| Engine 11 Mission | All missions, objectives, status | Read-only demo; ephemeral dev writes only |
| Engine 23 Audit | Entire SHA-256 hash chain | **Not acceptable for compliance** |
| Engine 02 Observation | All observations (when connected) | Not acceptable for production |
| Engine 15 Reward | All grants, ledger | Not acceptable for production |
| Engine 16 Community | All communities, memberships | Not acceptable for production |
| Engine 22 Governance | All policies | Not acceptable — silently allows everything after restart |

Write endpoints for canonical engines must not be presented as production-ready while repositories remain in-memory, unless the system explicitly declares ephemeral/development-only mode.

---

## Known Architectural Gaps

| Gap | Impact | Decision required |
|---|---|---|
| All canonical engines are in-memory | Ephemeral data | Decision A — approved persistent adapter per engine |
| Coordinates not in canonical Mission entity | MissionMap falls back to null markers | Decision B |
| Dual identity systems | JWT claims vs Engine 01 | Decision C — migration plan or hybrid format |
| Engine 02 authorization undefined | Any caller can submit observations | Decision before Engine 02 write endpoint |
| Engine 02 coordinates contract mismatch | Frontend sends free-text; entity needs numeric coords | Geocoding adapter or frontend GPS collection |
| Engine 02 category/urgency enum gaps | `Observation` and `TemporaryRelief` urgency values unhandled | Mapping table in adapter layer |
| Engine 02 dual data store risk | MongoDB reports + canonical observations diverge | Cutover or dual-write strategy |
| Engine 15 Reward duplicated client-side | Inconsistency when Engine 15 exposed | Deprecate `economy.js` after Engine 15 write endpoints go live |
| **Lilo AI integration** | Lilo runs on legacy pipeline; Engine 04/05/17 are stubs | Canonical engines must serve Lilo, not replace it (see `LILO-IDENTITY-AND-ARCHITECTURE.md`) |
| Canonical audit journal is in-memory | SHA-256 chain lost on restart | Decision A for Engine 23 durable storage |
| AuditEngine duplicate-init risk | Double journal entries if `initialize()` called twice | Guarded by composition root calling it exactly once |

---

## Identity and Security Remaining Risks

| Risk | Status |
|---|---|
| Netlify plaintext password storage | **FIXED** — bcryptjs hashing |
| `engines.js` top-level await fragility | **FIXED** — try/catch with 503 guard |
| Netlify URL double `/api` bug | **FIXED** — `getV2ApiOrigin()` returns null on Netlify |
| Fake demo-user auth fallback | **FIXED** — gated on `VITE_ENABLE_DEMO_FALLBACK=true` |
| AuditEngine initialized after MissionEngine (reversed order) | **FIXED** — audit now initializes first |
| Legacy JWT role ≠ live DB role (stale claim) | **OPEN** — JWT role used; re-login required for role change |
| `reporter` → `automation` semantic mismatch | **OPEN** — see Decision C |
| Netlify function registration input validation incomplete | **OPEN** — name/email/password minimally validated; no rate limiting |
| Engine 02 no authorization check | **OPEN** — policy decision required before write endpoint |
| No rate limiting on any auth endpoint | **OPEN** — applies to both Express and Netlify auth |

---

## Environment Variables

### Backend (`server/.env`)

| Variable | Required | Effect when absent |
|---|---|---|
| `GROQ_API_KEY` | No | `/analyze-report` returns 503; all other routes work |
| `MONGODB_URI` | Yes | Server exits on startup |
| `JWT_SECRET` | Yes | Auth middleware fails |
| `OPENWEATHER_API_KEY` | No | Geocoding returns null (affects Engine 02 coordinates adapter when built) |
| `NEWS_API_KEY` | No | News search returns `[]` |

### Frontend (`.env` / `.env.local`)

| Variable | Required | Effect when absent |
|---|---|---|
| `VITE_API_URL` | No | Defaults to `localhost:5000/api` (dev) or Netlify function (prod) |
| `VITE_ENABLE_DEMO_FALLBACK` | No | Login timeout shows error (correct production behaviour) |
| `VITE_ENABLE_MOCK_MISSIONS` | No | CommandCenter shows error/unavailable state (correct production behaviour) |

### Netlify dashboard

| Variable | Required | Effect when absent |
|---|---|---|
| `NETLIFY_DEMO_PASSWORD` | No | Seeded demo user omitted; `demo@econet.io` login fails (expected) |

---

## Files Changed — Audit Verification Session

| File | Change |
|---|---|
| `server/tests/canonical-audit-integration.test.js` | **NEW** — 26 integration tests proving audit event delivery, hash chain, subscription order, duplicate-init risk, shutdown, in-memory limitations |
| `server/canonical/engines.js` | **FIXED** — AuditEngine `initialize()` moved before MissionEngine; corrected misleading comment about init order |
| `docs/integration/ARCHITECTURE-DECISIONS-REQUIRED.md` | **NEW** — Decisions A/B/C/D with options, consequences, implementation scope, testing needs; Engine 02 full inspection appendix with contract-mismatch table and proposed integration plan |

## Files Changed — Post-Phase 0 Hardening (prior session)

| File | Change |
|---|---|
| `package.json` | Added `bcryptjs@2.4.3` |
| `netlify/functions/api.js` | bcryptjs hashing; hash-compare + migration path; input validation |
| `server/canonical/engines.js` | try/catch around init; `missionEngineAvailable` flag; AuditEngine on canonicalEventBus |
| `server/routes/v2/missions.js` | `requireEngine` guard on both routes |
| `src/services/runtimeConfig.js` | Added `getV2ApiOrigin()` returning null for Netlify |
| `src/pages/CommandCenter.jsx` | Uses `getV2ApiOrigin()`; null-check before fetch |
| `netlify/tests/auth.test.js` | 14 auth security tests (NEW) |
| `server/tests/canonical-engine-init.test.js` | 6 engine lifecycle tests (NEW) |
| `src/services/runtimeConfig.test.js` | 8 URL construction tests (NEW) |
| `server/tests/v2-missions.integration.test.js` | 17 HTTP integration tests for v2 mission GET endpoints (NEW) |

---

## Next Steps (pending human approval)

1. **Resolve Decision A** — choose persistence strategy before any write endpoint.
2. **Resolve Decision B** — choose coordinates approach before Mission creation payload is designed.
3. **Optionally start Engine 02 Phase R** (read-only GET routes) — no hard blockers, low risk.
4. **Resolve Decision D** — confirm which write slice goes first (Engine 11 creation or Engine 02 observation).
5. **Only after A + B (or A + Engine 02 auth decision):** implement the approved write endpoint.

No write endpoints will be added without explicit approval of the relevant decisions.

---

## Verification Commands

```bash
# Full suite (458/458 as of this session)
node tests/run-all.js

# Audit integration tests only (26 tests)
node --test server/tests/canonical-audit-integration.test.js

# Netlify auth security tests only (14 tests)
node --test netlify/tests/auth.test.js

# Engine initialization tests only (6 tests)
node --test server/tests/canonical-engine-init.test.js

# URL construction tests only (8 tests)
node --test src/services/runtimeConfig.test.js

# HTTP integration tests only (17 tests)
node --test server/tests/v2-missions.integration.test.js

# Architecture and boundary checks
node --test tests/architecture/boundary.test.js tests/architecture/engine-layout.test.js

# Vite production build (exit 0, no errors)
npm run build
```


---

## Implementation Gate Review

**Session date:** Architecture gate review session  
**Test suite:** 458/458 passing — 0 failures  
**Scope:** Analysis and documentation only. No implementation. No schema changes.

Full technical detail for each finding below is in:
`docs/integration/ARCHITECTURE-DECISIONS-REQUIRED.md` — Implementation Gate Review section.

---

### Document accuracy

All prior document claims were verified against source code. Confirmed:

- No legacy Mongoose `Mission` model exists — `canonical_missions` collection will be a clean addition.
- Engine 02 `execute()` has no `_assertAuthorized` — unique among mutating engines. Confirmed deficiency.
- `InMemoryMissionRepository` interface: 9 methods (`save`, `findById`, `findByStatus`, `findActive`, `findByPriority`, `listAll`, `count`, `delete`, `clear`).
- `Mission.toJSON()` produces 10 fields — no hidden fields, no MongoDB types.
- All 458 test assertions remain accurate.

---

### Persistence design findings (Task 2)

**Collection:** `canonical_missions` — dedicated, never shared with legacy models.

**Document shape:** `_id` = `missionId` string; `objectives` embedded array; `targetCriteria` / `metadata` as Mongoose `Mixed`; `createdAt`/`updatedAt` as ISO-8601 strings (not `Date`) to ensure lossless round-trip.

**Adapter pattern:** `save()` uses `findOneAndUpdate` with `upsert: true`. `findById()` calls `.lean()` then `new Mission(doc)` to rehydrate a live entity.

**Critical risks surfaced:**

| Risk | Severity | Resolution path |
|---|---|---|
| EventBus publish happens after `repository.save()` — save succeeds but publish fails → unaudited mission | MEDIUM | Accept at-most-once semantics (document) OR implement outbox pattern before durable audit |
| `IdempotencyManager` is in-memory — after restart, same idempotency key re-executes | HIGH | `MongoIdempotencyRepository` or unique index on client-supplied key field — must be decided in Phase 1 |
| No optimistic concurrency (`version` field absent) — concurrent commands on same mission can produce undefined final state | MEDIUM | Add `version` field to `Mission` entity + adapter; requires entity change approval |

**No legacy data migration required.** Zero missions exist in MongoDB today.

**Required indexes:** `{ status: 1 }`, `{ priority: 1 }`, `{ status: 1, priority: 1 }`, `{ createdAt: -1 }`.

---

### Coordinate ownership findings (Task 3)

| Question | Answer |
|---|---|
| Does Engine 07 own geospatial data? | Yes — `GeoPoint` spatial index, `findNearby`, cluster detection. It is a **spatial utility engine**, not a mission data owner. |
| Does Engine 11 own coordinates? | No — `targetCriteria` is opaque. No `Coordinates` type used anywhere in Engine 11. |
| Is `targetCriteria.coordinates` canonical? | **No.** It is an undocumented integration convention. `normalizeCriteria()` only checks the object is non-empty — any shape is accepted. Zero tests assert on it. |
| What canonical coordinate type exists? | Engine 02 `Coordinates` value object (lat/lon/altitude/accuracy with range validation) and Engine 07 `GeoPoint` entity. |
| Cleanest canonical contract for missions | Optional `coordinates: { latitude, longitude, altitude?, accuracy? } | null` field on `Mission` entity, validated by a new `MissionCoordinates` value object in Engine 11. Engine 07 B3 integration is premature and unnecessary for Phase 2. |
| What breaks if coordinates are moved from `targetCriteria`? | Only server-side seed/fixture callers that currently put `targetCriteria.coordinates`. Making it optional means zero existing tests break. `MissionMap` would read `mission.coordinates` instead of `mission.targetCriteria.coordinates`. |

**Recommendation:** Approve Decision B2. Making coordinates optional means no existing test changes. It is a clean, isolated entity addition.

---

### Authorization matrix (Task 4)

**All eight mutating commands** (`CreateMission`, `ActivateMission`, `SuspendMission`, `ResumeMission`, `CompleteMission`, `AbortMission`, `AddObjective`, `UpdateObjectiveStatus`) require one of: `system`, `admin`, `mission_lead`, `automation`.

**Both read operations** (`getMission`, `listActiveMissions`) have **no role check** — anonymous access is explicitly allowed.

**Ownership model:** Engine 11 has no per-actor ownership. Any authorized actor can mutate any mission.

**Open gap:** `reporter` → `['automation']` mapping gives human reporters mission-creation access. This is semantically wrong and should be changed to `[]` before `POST /api/v2/missions` is exposed. Tracked as Decision C2.

**HTTP enforcement:** `POST /api/v2/missions` must call `protect` middleware + `actorFromRequest()`. 401 if no user. 403-equivalent if roles insufficient (engine throws; route returns 403).

---

### Engine 02 mismatch reclassification (Task 5)

| Gap | Classification | Blocks Phase W? | Cleared by |
|---|---|---|---|
| Coordinates (entity requires numeric lat/lon) | **BLOCKING** | Yes | Geocoding adapter in HTTP layer — no architectural decision needed |
| Authorization (no role check in `execute()`) | **REQUIRES DECISION** | Yes | Human approval of auth policy |
| Dual data store (active MongoDB reports collection) | **REQUIRES DECISION** | Yes | Human approval of cutover/dual-write strategy |
| Category/severity/urgency enum mismatches | NON-BLOCKING | No | Normalisation function in adapter |
| `images[]` vs `evidence[]` shape | NON-BLOCKING | No | Transformation in adapter |
| Social/AI enrichment fields absent | NON-BLOCKING | No (write); frontend work for read | Metadata passthrough |
| Media hash is URL-hash not file-content hash | NON-BLOCKING | No | Future hardening pass |

**Phase R (read-only Engine 02 routes) has zero blockers.** Can start now.  
**Phase W (Engine 02 write endpoint) has 3 blockers.** Two require human decisions.

---

### Proposed vertical-slice sequence (Task 6)

| Phase | Goal | Hard blockers | Can start? |
|---|---|---|---|
| **Phase 0** | Approve Decisions A–D | None | **In progress** |
| **Phase 1** | `MongoMissionRepository` + `MongoAuditRepository` | Decision A approved | After Decision A |
| **Phase 2** | `POST /api/v2/missions` | Phase 1 + Decisions B, C2 | After Phase 1 |
| **Phase 3** | `GET /api/v2/observations` (read-only) | None | **Now** |
| **Phase 4** | `POST /api/v2/observations` | Phase 1 + Gaps 1, 2, 3 cleared | After Phase 1 + decisions |

Phase 3 is the only phase with no blockers. It can be implemented in the
current session if approved.

---

### Decisions still requiring human approval

| # | Decision | Blocks |
|---|---|---|
| A | Persistence strategy (ephemeral / MongoDB adapter / block) | Phase 1, 2, 4 |
| B | Coordinates in Mission entity (B1 status quo / B2 entity field / B3 Engine 07) | Phase 2 payload design |
| C1 | Stale JWT role claim policy | Phase 2 auth |
| C2 | `reporter` → `automation` mapping (should be `[]` before write endpoint) | Phase 2 auth |
| C3 | Engine 01 identity migration | Long-term |
| D | Phase 2 (Mission writes) vs Phase 3 (Observation reads) first | Sprint planning |
| E02-auth | Engine 02 authorization policy for `SubmitObservation` | Phase 4 |
| E02-store | Dual-store cutover strategy for Engine 02 | Phase 4 |
| Concurrency | Optimistic locking (`version` field) on `Mission` entity | Phase 1 |
| Idempotency | Durable `IdempotencyManager` before exposing write endpoints | Phase 1 or 2 |

---

### Readiness verdict

| Dimension | Ready? |
|---|---|
| Engine 11 domain logic + authorization | **Yes** |
| Engine 11 HTTP read routes + tests | **Yes** |
| Engine 11 HTTP write routes | **No — Decision A + B required** |
| Engine 02 domain logic | **Yes** |
| Engine 02 read routes | **Yes — no blockers** |
| Engine 02 write routes | **No — Decisions A, E02-auth, E02-store required** |
| Canonical audit delivery | **Proved — 26 integration tests** |
| Canonical persistence (any engine) | **No — in-memory only** |
| Test suite | **458/458 — green** |

---

### Files changed — gate review session

| File | Change |
|---|---|
| `docs/integration/ARCHITECTURE-DECISIONS-REQUIRED.md` | Appended: Implementation Gate Review — 8 sections covering document verification, MongoDB adapter spec, coordinate ownership, authorization matrix, Engine 02 reclassification, phase sequence, pending decisions, readiness verdict |
| `docs/integration/ECONET-INTEGRATION-STATUS.md` | Appended: Implementation Gate Review summary section |

No source code was modified. No tests were added. No routes were created.


---

## Decision A — Persistence Strategy: Current Status

**Status:** OPEN — 7 sub-decisions require human approval  
**Full technical record:** `docs/integration/ARCHITECTURE-DECISIONS-REQUIRED.md` — Decision A section

---

### What is known

**Current persistence model:** All canonical state is in-process memory — lost on every restart.

**Critical failure modes confirmed by source inspection:**

| Failure mode | Consequence | Current mitigation |
|---|---|---|
| Process restart | All entity state, audit chain, and idempotency keys are lost | None — by design for in-memory |
| `repository.save()` succeeds then process crashes before `_publish()` | Entity persisted (with A2), event never published, audit entry never created | None — no outbox, no recovery |
| AuditEngine handler throws inside `EventBus.publish()` | Error swallowed into `_deadLetters`; entity persisted, audit entry silently absent; `_publish()` never throws | Dead letters observable via `eventBus.getDeadLetters()` but in-memory and lost on restart |
| Client retries same idempotency key after restart | Command re-executes (key forgotten) | None — IdempotencyManager is in-memory, 24h TTL only |
| Two concurrent commands on same mission | Last write wins; transition table limits invalid states but doesn't prevent stale-read overwrites | Transition assertion throws on invalid transitions; valid concurrent races are unguarded |

**Event delivery model confirmed:** `at-most-once within a process lifetime` — no stronger guarantee exists anywhere in the codebase. No outbox, no saga, no CDC.

**Idempotency durability confirmed:** Zero. The `IdempotencyManager` `Map` is not serializable, not persistent, not shared across instances. A MongoDB-backed store would require only the `IdempotencyManager` to change — no engine or application service changes needed.

**Concurrency model confirmed:** Load–modify–save with no optimistic locking. The `Mission` transition table is strict enough to prevent most invalid concurrent states. The real risk is two valid-transition commands racing for the same mission — last write wins. Adding a `version` field to the `Mission` entity is the minimal fix.

**Legacy boundary confirmed:** No legacy Mongoose Mission model exists. `canonical_missions` is a clean new collection with zero migration work. The `reports` collection is entirely separate. Canonical engines must never write to `reports`, and legacy routes must never write to `canonical_*` collections.

---

### What remains undecided

| Sub-decision | Question |
|---|---|
| A-1 | Which persistence strategy? (A1 ephemeral / A2 MongoDB / A3 alternative) |
| A-2 | Durable idempotency? (in-memory current / MongoDB `canonical_idempotency_keys`) |
| A-3 | Concurrency model? (last-write-wins / `version` field + conditional update) |
| A-4 | Audit consistency level? (at-most-once current / durable dead letters / transactional outbox) |
| A-5 | Legacy data coexistence? (dedicated canonical collections recommended) |
| A-6 | Audit journal restart recovery? (empty on restart / load from MongoDB on `initialize()`) |
| A-7 | Netlify canonical persistence? (not supported current / Netlify Blobs / no Netlify writes) |

---

### What implementation work is blocked

All of the following are blocked on Decision A:

- `POST /api/v2/missions` (Phase 2)
- `POST /api/v2/observations` (Phase 4)
- `MongoMissionRepository` implementation
- `MongoObservationRepository` implementation
- `MongoAuditRepository` implementation
- Durable `IdempotencyManager`
- Production-safe write endpoints of any kind

---

### What work remains unblocked

- **Phase 3 — Engine 02 read-only routes (`GET /api/v2/observations`, `GET /api/v2/observations/:id`)** is fully unblocked. Read-only endpoints backed by the in-memory store start empty on each restart. This is correct and expected behavior for a read-only canonical cache. No data loss risk. No Decision A dependency.
- All existing 458 tests continue to pass. No source changes required.
- Architecture documentation updates are unblocked at any time.

---

### Phase 3 read-only adapter assessment

Confirmed unblocked. See full analysis below.

**Source of truth:** `InMemoryObservationRepository` (starts empty on restart). In Phase 3, no data is written through the canonical path, so the store is always empty after restart. This is identical to the current state for missions — the GET endpoints return `[]` until data is seeded or written.

**Adapter boundary:**
- `server/routes/v2/observations.js` — new file, mirrors `server/routes/v2/missions.js` structure.
- `server/canonical/engines.js` — add `ObservationEngine` instantiation alongside `MissionEngine`.
- `server/index.js` — mount the new router at `/api/v2`.

**DTO shape** (from `Observation.toJSON()`):

```json
{
  "observationId": "obs_<uuid32>",
  "observerId": "actor-id",
  "category": "FLOOD",
  "severity": "CRITICAL",
  "urgency": "IMMEDIATE",
  "location": {
    "latitude": 9.0765,
    "longitude": 7.3986,
    "altitude": null,
    "accuracy": null,
    "address": "...",
    "city": "Abuja",
    "state": "FCT",
    "country": "Nigeria"
  },
  "description": "...",
  "evidence": [{ "id": "...", "mediaType": "IMAGE", "url": "...", "hashSha256": "...", "mimeType": "..." }],
  "status": "SUBMITTED",
  "metadata": {},
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

**Pagination/filter requirements:** `ObservationApplicationService.listObservations()` supports `{ category, status, observerId }` filters. No pagination is implemented in the service layer. For Phase 3, query parameters should mirror the service's filter fields. Pagination can be added as a server-side slice before returning if needed.

**Authorization:** Read endpoints require no role — anonymous access is consistent with the Engine 11 pattern and appropriate for a public environmental observation system.

**Legacy-to-canonical mapping:** Not needed for Phase 3. The canonical read endpoint serves canonical data only. Legacy reports remain on their own `GET /api/reports/feed` route. No aggregation across stores.

**Known limitations:**
- The canonical observation store starts empty on every restart — the endpoint returns `[]` until Phase 4 write integration is live.
- The DTO does not include social engagement fields (`likes`, `upvotes`, `comments`) — these exist only in the legacy `reports` collection. Clients that depend on them cannot switch to the canonical endpoint yet.
- AI enrichment fields (`liloClassification`, `aiScore`, etc.) are not in the canonical entity. They would be in `metadata` if passed through the write adapter in Phase 4.
- No sorting or pagination — add as a refinement if needed before Phase 4.

**Conclusion:** Phase 3 can be implemented without any Decision A resolution. It is the lowest-risk next step and provides the read infrastructure that Phase 4 writes will build on.

---

### Exact human decisions required

Seven sub-decisions under Decision A, in priority order:

1. **A-1:** Which persistence strategy? (A2 MongoDB is the only path to production write endpoints)
2. **A-3:** Add `version` field for optimistic locking? (required before any concurrent-access write endpoint)
3. **A-2:** Durable idempotency? (required before write endpoints are safe across restarts)
4. **A-4:** Audit consistency level? (determines whether a transactional outbox is needed)
5. **A-5:** Legacy coexistence strategy? (dedicated collections recommended; no action needed until Phase 4)
6. **A-6:** Audit journal restart recovery? (determines `MongoAuditRepository.initialize()` behavior)
7. **A-7:** Netlify canonical persistence? (not required before Phase 2 or 3)

Decisions 1–3 must be resolved before Phase 1 can begin. Decision 4 affects Phase 1 scope significantly. Decisions 5–7 can be deferred to Phase 4 planning.


---

## Production Deployment and Persistence Topology — Current Status

**Session date:** Production topology review  
**Test suite:** 458/458 — 0 failures  
**Scope:** Analysis only. No source code modified.

Full technical analysis: `docs/integration/ARCHITECTURE-DECISIONS-REQUIRED.md` — Production Deployment and Persistence Topology section.

---

### Current production topology (actual, as-found)

```
Developer's Computer
  ├── Vite dev server (localhost:5173)          ← frontend development
  ├── Express server via PM2 (localhost:5000)   ← "production" backend
  │   ├── Legacy MongoDB routes (auth/reports/map)
  │   ├── Canonical v2 mission routes (GET only)
  │   ├── Canonical engine singletons (in-memory)
  │   └── Socket.io WebSocket
  └── Local filesystem (server/uploads/)        ← file upload storage

Netlify CDN (independent of developer machine)
  ├── React SPA (dist/ — static files)
  └── netlify/functions/api.js (serverless)
       └── Netlify Blobs (parallel auth/data store)

MongoDB Atlas (independent of developer machine)
  └── Legacy data: users, reports, comments, map
```

**Critical finding:** The Express backend and all canonical engines run on the developer's computer. If the developer's machine is off, the Express backend is offline. Canonical v2 routes return errors. The Netlify path (frontend + Netlify function) continues to work independently.

---

### Missing infrastructure

| Gap | Impact |
|---|---|
| No hosted backend | Express server has no home other than developer's machine |
| No canonical persistence | All canonical entity state lost on every restart |
| No CI/CD pipeline | Deployment requires manual developer action |
| No git-triggered deployment | Code changes require manual script execution |
| File uploads on local disk | `server/uploads/` is not durable or accessible remotely |
| Placeholder CORS `FRONTEND_URL` | `https://your-domain.com` — CORS is misconfigured in production |
| No custom domain | No live production URL for the Express backend |
| Credentials in `.env.production` | Live Atlas URI, JWT secret, and API keys committed to repository |

---

### Persistence requirements

For the canonical engine layer to operate in production:

| Requirement | Satisfied today? | Resolution |
|---|---|---|
| State persists across restarts | No — in-memory only | Implement MongoDB adapters (Decision A-1 = A2) |
| Idempotency persists across restarts | No — in-memory `Map` | Implement durable `IdempotencyManager` (Decision A-2) |
| Audit chain persists across restarts | No — in-memory `Array` | Implement `MongoAuditRepository` (Decision A-6) |
| Concurrent command safety | No — no version field | Add `version` to `Mission` entity (Decision A-3) |
| Atlas already provisioned | Yes | Reuse existing Atlas cluster with `canonical_*` collections |
| No migration of existing data | Yes | No legacy Mongoose Mission model exists |

---

### Backend hosting requirements

The Express server needs a hosting environment that provides:

- Persistent Node.js process (auto-restart on crash)
- Environment variable injection (no `.env.production` file in repo)
- Outbound HTTPS (Atlas, GROQ, OpenWeather)
- Exposed HTTP port (for frontend API calls)
- Node.js ≥ 20.19.0
- Persistent filesystem volume OR cloud storage for file uploads

The `ecosystem.config.cjs` PM2 config and the `Dockerfile` are already suitable for deployment. **No code changes required** — only a hosting target must be chosen and configured.

---

### Local development workflow (current and target)

**Current (manual, all local):**
```
edit code → npm run dev (Vite) + node server/index.js → browser at localhost:5173
          → node tests/run-all.js (manual)
          → npm run build → run deploy script → "production" at localhost:5000
```

**Target (automated, independent):**
```
edit code in Kiro
  → local: npm run dev + node server/index.js  (HMR preview, in-memory canonical)
  → local: node tests/run-all.js               (must pass before push)
  → git push
  → CI/CD pipeline (automatic):
      → npm test (458/458)
      → npm run build
      → deploy dist/ to CDN (frontend)
      → deploy server/ to backend host
  → live EcoNet: frontend on CDN + backend on hosted server + Atlas
```

Local development uses in-memory canonical repos — no database setup required. MongoDB adapter activated in production via `CANONICAL_PERSISTENCE=mongo` environment flag.

---

### Production deployment workflow (target)

1. Developer pushes to `main` branch.
2. CI/CD pipeline triggers automatically (GitHub Actions or platform CI).
3. Pipeline runs `node tests/run-all.js` — deployment blocked if any test fails.
4. Pipeline runs `npm run build` — produces `dist/`.
5. `dist/` deployed to CDN (Netlify, Vercel, or Cloudflare Pages).
6. `server/` deployed to backend host (Railway, Render, Fly.io, or VPS).
7. Backend host restarts Node.js process with production environment variables.
8. Canonical engines initialize with `MongoMissionRepository` (once Decision A approved).
9. Live EcoNet available at real domain. No developer action required.

---

### Decisions requiring human approval

| ID | Decision | Blocks |
|---|---|---|
| P-1 | **Backend hosting platform** — where should the Express server run? (Railway / Render / Fly.io / VPS) | Everything else |
| P-2 | **Canonical persistence** — confirmed A2 (extend existing Atlas) is lowest-friction path | Decision A-1 |
| P-3 | **Frontend deployment target** — continue Netlify or migrate? | Frontend pipeline |
| P-4 | **File upload storage** — local filesystem not suitable for hosted backend; cloud storage required (S3 / Cloudinary / R2) | Phase 4 media handling |
| P-5 | **Staging environment** — required before production? | Deployment pipeline design |
| P-6 | **Credential rotation** — Atlas URI, JWT secret, GROQ key in `.env.production` must be rotated and removed from repo | Security prerequisite for any public deployment |
| P-7 | **Netlify function future** — maintain as parallel path or deprecate after backend is hosted? | Long-term maintenance |
| P-8 | **Custom domain** — `FRONTEND_URL=https://your-domain.com` placeholder must be replaced before CORS works | Immediate CORS fix needed |

---

### Is the architecture ready to select a production database?

**Yes — with one qualification.**

The canonical persistence layer analysis (Decision A) confirms that **MongoDB Atlas (Approach P1 — extending the existing Atlas cluster with `canonical_*` collections) is technically viable** and is the path of least resistance given:

- Atlas is already provisioned and in use.
- The Mongoose driver is already in `server/package.json`.
- No legacy Mongoose Mission model exists — no migration required.
- The `MongoMissionRepository` adapter interface and document shape are fully specified.
- `canonical_*` collection naming ensures clean separation from legacy data.

**The qualification:** Before selecting Atlas as the canonical persistence target, the Atlas credentials currently committed to `.env.production` must be rotated (Decision P-6). Selecting a database with compromised credentials is not a safe starting point.

**Minimum path to a production-ready canonical write endpoint:**

1. Approve Decision A-1 (select A2 — MongoDB Atlas).
2. Rotate Atlas credentials (P-6).
3. Choose a backend hosting platform (P-1).
4. Implement `MongoMissionRepository` (Phase 1).
5. Implement durable `IdempotencyManager` (Decision A-2).
6. Add `version` field to `Mission` entity (Decision A-3).
7. Deploy Express server to the chosen host (P-1).
8. Set `CANONICAL_PERSISTENCE=mongo` on the hosted environment.
9. Open `POST /api/v2/missions` (Phase 2).


---

## Phase 1 — Canonical Persistence Foundation: Implementation Record

**Session date:** Phase 1 implementation  
**Test suite:** 519/519 — 0 failures  
**New tests added:** 61 (21 MongoDB repository + 11 durable idempotency + 12 concurrency + 17 configuration)

---

### Files created

| File | Purpose |
|---|---|
| `infrastructure/persistence/CanonicalPersistenceConfig.js` | Reads and validates `CANONICAL_PERSISTENCE` env var at import time; exports mode flags and URI |
| `infrastructure/persistence/CanonicalMongoConnection.js` | Dedicated Mongoose connection singleton for canonical layer; isolated from legacy `server/index.js` connection |
| `engines/11-mission/infrastructure/repositories/MongoMissionRepository.js` | Durable MongoDB adapter; `canonical_missions` collection; optimistic concurrency via `version` field |
| `infrastructure/idempotency/MongoIdempotencyStore.js` | MongoDB-backed idempotency store; `canonical_idempotency_keys` collection; TTL index; atomic acquisition |
| `server/tests/persistence/mongo-mission-repository.test.js` | 21 tests: create, read, list, update, delete, rehydration, malformed document, cross-instance persistence, concurrency guard |
| `server/tests/persistence/mongo-idempotency-store.test.js` | 11 tests: first request, replay, concurrent acquisition, restart simulation, multi-instance safety, in-memory regression |
| `server/tests/persistence/mission-concurrency.test.js` | 12 tests: version field, #revision increment, in-memory last-write-wins, engine command round-trip version |
| `server/tests/persistence/canonical-persistence-config.test.js` | 17 tests: memory mode, mongo mode, failure cases, credential safety |

### Files modified

| File | Change |
|---|---|
| `engines/11-mission/domain/entities/Mission.js` | Added `version: number` field (default 0); `#revision()` increments version; `toJSON()` includes version; constructor validates version is non-negative integer |
| `engines/11-mission/application/services/MissionApplicationService.js` | `_handleCreateMission` explicitly sets `version: 1` on the first persisted entity |
| `infrastructure/idempotency/IdempotencyManager.js` | Added `store` injection option; `executeIdempotent` routes through durable store when present; `acquire/complete/fail` guard against accidental synchronous use when durable store is configured; full backward compatibility preserved |
| `server/canonical/engines.js` | Imports `CanonicalPersistenceConfig`; dynamically imports MongoDB adapters only when `CANONICAL_PERSISTENCE=mongo`; wires `MongoIdempotencyStore` into `IdempotencyManager`; startup logs persistence mode; never silently falls back to memory |

---

### Phase 1A: MongoDB Mission Repository

- **Collection:** `canonical_missions`
- **`_id`:** missionId string (no ObjectId)
- **Timestamps:** stored as ISO-8601 strings (not Date) — lossless round-trip with the entity
- **Objectives:** embedded array — no separate collection, no multi-document transactions required
- **Concurrency:** `findOneAndUpdate` with `version` guard for mutations; `insertOne` (via `create`) with duplicate-key catch for first saves
- **Interface parity:** identical 9-method interface to `InMemoryMissionRepository`
- **Rehydration:** `.lean()` + `new Mission(doc)` — domain constructor validates all fields on load
- **Indexes:** `{ status: 1 }`, `{ priority: 1 }`, `{ status: 1, priority: 1 }`, `{ createdAt: -1 }`

### Phase 1B: Durable Idempotency

- **Collection:** `canonical_idempotency_keys`
- **`_id`:** idempotency key string (e.g. `"11-mission:CreateMission:client-key-abc"`)
- **TTL:** MongoDB TTL index on `expiresAtDate` field — automatic expiry, no background worker needed
- **Atomic acquisition:** `findOneAndUpdate` with `$setOnInsert` — safe across multiple server instances
- **Backward compatibility:** `IdempotencyManager` without a `store` option behaves identically to before; existing in-memory `acquire()`/`complete()`/`fail()` synchronous API preserved
- **Multi-instance safety:** proven by test — two managers sharing the same MongoDB store execute the action exactly once

### Phase 1C: Optimistic Concurrency

- **`version: number`** added to `Mission` entity (non-breaking — defaults to 0)
- **`#revision()` increments version** on every mutation (`transitionTo`, `addObjective`, `updateObjectiveStatus`)
- **`_handleCreateMission` starts at `version: 1`** — the first persisted state
- **`MissionConcurrentModificationError`** thrown when stored version ≠ expected; carries `missionId` and `statusHint: 409`
- **In-memory repository unaffected** — no version guard (last-write-wins, as documented)
- **HTTP handler guidance:** catch `MissionConcurrentModificationError` and return 409 when write endpoints are opened

### Phase 1D: Event/Audit Durability

**NOT IMPLEMENTED** — gap documented explicitly.

- Missions are durable. The audit journal is **not** durable.
- A process restart resets the audit chain even with MongoDB persistence active.
- A `save()` success followed by a process crash leaves a mission with no audit record and no recovery path.
- Implementation blocked on Decision A-4 (audit consistency level) — human approval required.
- See `ARCHITECTURE-DECISIONS-REQUIRED.md` Phase 1D section for full analysis.

### Phase 1E: Configuration

- `CANONICAL_PERSISTENCE=memory` (default) — in-memory, no database required
- `CANONICAL_PERSISTENCE=mongo` — MongoDB adapters; requires `CANONICAL_MONGODB_URI` or `MONGODB_URI`
- **Hard startup failure** if mongo mode is selected without a URI — no silent fallback
- **Hard startup failure** if an unknown value is set
- Credentials redacted from startup log messages

---

### Persistence selection

| Environment | `CANONICAL_PERSISTENCE` | Repository | Idempotency |
|---|---|---|---|
| Local development | `memory` (default) | `InMemoryMissionRepository` | In-memory `Map` |
| CI | `memory` (default) | `InMemoryMissionRepository` | In-memory `Map` |
| Production | `mongo` | `MongoMissionRepository` | `MongoIdempotencyStore` |

---

### Remaining decisions before mission write endpoints can be opened

| # | Decision | Status |
|---|---|---|
| A-1 | Persistence strategy — A2 (MongoDB) is now implemented; human must approve activation | **OPEN** — implementation ready, not deployed |
| A-4 | Audit consistency level (at-most-once / dead letters / outbox) | **OPEN** — Phase 1D not implemented |
| B | Coordinates in Mission entity | **OPEN** — no coordinates field added |
| C2 | `reporter → automation` role mapping | **OPEN** — unchanged |
| P-1 | Backend hosting platform | **OPEN** — Express still runs on developer's machine |
| P-6 | Credential rotation (Atlas URI in `.env.production`) | **OPEN** — security prerequisite |

No `POST /api/v2/missions` route was created. The persistence foundation is ready but write endpoints remain gated on the above decisions.
