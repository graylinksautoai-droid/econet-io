# EcoNet IO — Architecture Decisions Required

**Status:** PENDING HUMAN APPROVAL  
**Last updated:** Post-Phase 0 hardening + audit verification session  
**Blocking:** All canonical write endpoints. Any Engine 02 write integration.

No decision in this document has been implemented. Each section names the
options, states the consequences of each, and identifies what must be resolved
before implementation begins. Nothing here authorises any code change.

---

## How to use this document

Each decision gate has three columns:

| Field | Meaning |
|---|---|
| **Status** | OPEN — not decided; DECIDED — approved option chosen; DEFERRED — explicitly punted |
| **Blocking** | What cannot be built until this is resolved |
| **Owner** | Who must approve |

---

## Decision A: Persistence strategy for canonical engine writes

**Status:** OPEN  
**Blocking:** `POST /api/v2/missions`, any Engine 02 write endpoint, Engine 23 durable audit  
**Owner:** Engineering lead

### Context

Every canonical engine (`engines/11-mission`, `engines/02-observation`,
`engines/23-audit`, and 20 others) uses an `InMemory*Repository`. State is
lost on every server restart. The GET endpoints currently exposed are
read-only and seed no data persistently — the Mission Map populates from an
empty store every time the server starts. This is acceptable for read-only
demos. It is not acceptable the moment a write endpoint is exposed to users.

### Option A1 — Ephemeral in-memory, development/demo only

Explicitly declare that all canonical write endpoints are development-only.
Document this in the API response (`X-Persistence: ephemeral` header or
equivalent). Do not expose write endpoints in the Netlify deployment. Allow
the Express server to accept writes with the understanding that all data
evaporates on restart.

**Consequences:**
- Simplest path. No new infrastructure.
- Users will lose all created missions on any deploy, crash, or restart.
- The Engine 23 audit hash chain is also lost — compliance value is zero.
- Cannot be used as a production feature without lying to users.
- Suitable for: internal demo, proof of concept, CI fixture only.
- No implementation scope beyond existing code.

**Testing needs:** None beyond what exists. Restart-loss is already
documented and covered by audit integration test §7.

**Deployment implications:** Must add a visible disclaimer in the API
response and in the frontend that writes are ephemeral. The frontend must
not present mission creation as persistent to the user.

---

**Option A2 — MongoDB repository adapter per engine**

Implement a `MongoMissionRepository`, `MongoObservationRepository`, and
`MongoAuditRepository` that satisfy the same interface as their in-memory
counterparts. Wire them in `server/canonical/engines.js` via the existing
injection points. Each adapter must pass the same unit tests as the in-memory
version (the interface contract does not change).

**Consequences:**
- Data survives restarts. Audit chain is durable.
- Each adapter is isolated to its engine — no shared collection between
  engines. This is required by the boundary enforcement rules.
- Implementation scope: one adapter file per engine, one index file change,
  one set of integration tests per adapter. Minimum three adapters needed
  before a write endpoint can be called production-ready (Mission, Observation,
  Audit). Estimated 2–4 days per adapter including tests.
- Requires the existing MongoDB connection (`server/db/connection.js`) to be
  available in the engine layer. Currently the canonical engine layer has no
  MongoDB dependency — introducing one couples it to the legacy infrastructure.
  This coupling must be explicit and documented.
- Schema design: MongoDB documents for missions must mirror the canonical
  aggregate shape, including `objectives[]` as an embedded array and
  `targetCriteria` as a subdocument. No foreign-key joins — canonical
  aggregates are self-contained.
- The Engine 23 audit adapter needs special attention: it must append-only,
  never update or delete records, and must reconstruct the in-memory chain on
  startup from stored entries (or re-verify the chain from the database).
- Netlify deployments cannot use this option without a reachable MongoDB
  cluster (Atlas or equivalent) and the connection string in the environment.

**Testing needs:**
- Unit tests for each adapter using a real MongoDB test database (MongoDB
  Memory Server or a local test instance).
- Integration tests that verify round-trip save/find/list behaviour.
- A startup test that confirms the engine initialises correctly when the
  database is available and returns a clear error when it is not.

**Deployment implications:**
- Requires `MONGODB_URI` in the server environment (already present for the
  legacy backend — the same connection can be reused, but the database
  collections must be segregated: `canonical_missions`, `canonical_audit_entries`,
  etc. — not mixed with legacy `reports` or `users` collections).
- No Netlify support unless a remote Atlas cluster is configured and the
  connection string is injected into the Netlify function environment.

---

**Option A3 — Block all writes until durable persistence exists**

Do not expose any write endpoint. Return HTTP 501 Not Implemented on all
`POST`/`PATCH`/`DELETE` routes for canonical engines until an approved
persistence adapter is in place and tested.

**Consequences:**
- No data-loss risk. No user-facing lies about durability.
- The GET endpoints remain available and fully functional.
- Frontend mission creation UI cannot be completed.
- This is the current default — no implementation required beyond the
  existing 503-on-unavailable pattern already in place.

**Testing needs:** Already covered by the HTTP integration test suite.

**Deployment implications:** None. Status quo.

---

### Recommendation (for human review — not decided)

Option A3 is the current default and carries zero risk. Option A2 is the
correct long-term path. Option A1 is only acceptable if the system explicitly
labels itself as a non-persistent demo and the frontend communicates this to
users. The recommended sequence is: decide A2 → implement Mission adapter →
implement Audit adapter → then enable `POST /api/v2/missions`.

---

## Decision B: Coordinates in canonical Mission entity

**Status:** OPEN  
**Blocking:** `POST /api/v2/missions` payload design, MissionMap marker accuracy  
**Owner:** Engineering lead + domain lead

### Context

The `Mission` aggregate (`engines/11-mission/domain/entities/Mission.js`)
stores `targetCriteria` as an opaque, caller-defined object. There is no
`coordinates` or `location` field on the entity. The `MissionMap` component
(`src/pages/MissionMap.jsx`) currently reads `mission.targetCriteria.coordinates`
as a fallback, but the Mission entity makes no guarantee that field exists.
The `normalizeCriteria` validator only checks that `targetCriteria` is a
non-empty object — it does not validate or type-check any keys inside it.

Storing free-form coordinates inside `targetCriteria` is an undocumented,
unapproved convention. It is not part of the canonical specification.

### Option B1 — Temporary coordinates inside targetCriteria (status quo)

Continue using `targetCriteria.coordinates` as an informal convention. The
Mission entity does not validate it. The frontend reads it if present and
renders null markers if absent.

**Consequences:**
- No implementation required. Works today for manually seeded demo data.
- No schema contract — any caller can omit coordinates or use a different
  shape. The MissionMap silently shows no marker.
- The convention is invisible to other engines. Engine 07 Geospatial has no
  awareness of missions. Spatial queries (find missions near a point) are
  impossible.
- This option becomes a hidden contract debt the moment `POST /api/v2/missions`
  is exposed — clients will start relying on `targetCriteria.coordinates`
  without any validation, documentation, or migration path.

**Testing needs:** None beyond what exists. The current behaviour is already
tested in the HTTP integration test suite.

---

**Option B2 — Formal coordinates field on the Mission entity**

Add a `coordinates` field directly to the `Mission` aggregate as an optional
validated value object. The value object must enforce `{ latitude: number,
longitude: number, altitude?: number }` with the same range checks as Engine
02's `Coordinates` value object.

The `targetCriteria` field retains its opaque-object nature for other
mission-scoping criteria. Coordinates move out of it.

**Consequences:**
- Clean domain model. The MissionMap reads `mission.coordinates` directly —
  no fallback guessing.
- Breaking change to the Mission entity constructor. Every existing test that
  creates a Mission with `targetCriteria: { coordinates: ... }` must be
  updated.
- The `normalizeCriteria` validator does not need to change — coordinates
  leave `targetCriteria` entirely.
- The HTTP DTO returned by `GET /api/v2/missions` must include `coordinates`
  as a top-level field. Existing clients reading `targetCriteria.coordinates`
  will break silently (they will get `undefined` from the new field location).
- The MongoDB adapter (if Option A2 is chosen) must include `coordinates` in
  the document schema.
- Implementation scope: Mission entity, Mission value-object file, Mission
  test fixture updates, DTO serialiser, MissionMap component update.

**Testing needs:**
- Unit tests for the Coordinates value object if a new one is created for
  Engine 11 (or reuse the Engine 02 contract — but cross-engine contract
  reuse must be approved).
- Updated Mission entity tests covering optional coordinates.
- Updated HTTP integration tests asserting `coordinates` in the DTO.

**Deployment implications:** Breaking change to the API DTO. Any client
reading `targetCriteria.coordinates` must be updated at the same time.

---

**Option B3 — Engine 07 Geospatial integration**

Treat mission location as a reference to a canonical geospatial feature owned
by Engine 07 Geospatial. The Mission entity stores a `geospatialFeatureId`
(a reference, not the coordinates themselves). The MissionMap queries Engine
07 to resolve coordinates from that ID.

**Consequences:**
- Correct domain ownership: spatial data belongs to Engine 07.
- Substantially higher implementation scope: Engine 07 must be implemented
  and exposed before Mission creation can reference it.
- Adds a cross-engine dependency to the Mission write path: creating a mission
  requires Engine 07 to be available and to have the referenced feature.
- Engine 07 (`engines/07-geospatial/`) is not yet inspected. Its readiness is
  unknown. It may be a stub.
- This option is architecturally correct for a production system but is
  premature given that neither persistence (Decision A) nor Engine 07
  readiness has been assessed.
- Deferred until Engine 07 inspection and Decision A are resolved.

**Testing needs:** Engine 07 integration tests, cross-engine reference
resolution tests, failure-mode tests when Engine 07 is unavailable.

---

### Recommendation (for human review — not decided)

Option B2 is the pragmatic choice if `POST /api/v2/missions` is to be
exposed soon. Option B3 is the architecturally correct long-term choice.
Option B1 remains the unacceptable status quo — it must not survive a
publicly exposed write endpoint. Decision B must be resolved before Mission
entity changes are made.

---

## Decision C: Identity and actor authority

**Status:** OPEN  
**Blocking:** Any write endpoint that requires actor authorisation beyond demo data  
**Owner:** Engineering lead + security lead

### Context

The canonical engine layer uses an `actor` object of shape
`{ actorId, roles: string[] }`. The server constructs this in
`server/canonical/actorFromRequest.js` by mapping the legacy JWT `user.role`
string to a canonical roles array.

The current mapping:

| Legacy `user.role` | Canonical `roles[]` |
|---|---|
| `admin` | `['admin', 'system']` |
| `authority` | `['mission_lead']` |
| `reporter` | `['automation']` |
| `user` | `[]` |

This mapping has several risks that must be resolved before write endpoints
are exposed.

### C1 — Stale role claims

JWTs are signed with a fixed expiry. A user's role in the MongoDB `User`
collection can change after a token is issued. The canonical engine sees
the role at the time the JWT was signed, not the current role.

**Risk:** An `authority` user who is demoted to `reporter` retains
`mission_lead` access until their token expires. A `reporter` user promoted
to `authority` cannot create missions until they re-log.

**Mitigation options:**
- Short JWT expiry (15 minutes) with refresh tokens — high implementation
  scope, breaking change to auth middleware.
- Token introspection: validate role against the database on each request —
  adds a database read per canonical request.
- Accept the risk for the current demo phase and document it explicitly —
  acceptable only while write endpoints are development-only.

### C2 — reporter → automation mapping

The `reporter` role maps to `['automation']` in the canonical layer.
`automation` is described as an "automation-level" role in `MissionApplicationService`.
Giving human reporters automation-level access is semantically wrong — it
conflates human actors with programmatic agents.

**Risk:** If the automation role is ever elevated (e.g. granted `CreateMission`
access), reporters would implicitly gain that access. The name creates a
misleading audit trail (`actor.roles: ['automation']` in an audit entry that
was triggered by a human reporter).

**Resolution options:**
- Map `reporter` to `['observer']` and add `'observer'` to the authorised
  roles list for observation-scoped commands only.
- Map `reporter` to `[]` (read-only) for mission commands — reporters should
  not create missions.
- Introduce a formal role mapping document that defines every role in both
  systems and requires approval before changes.

### C3 — Engine 01 Identity migration

Engine 01 Identity (`engines/01-identity/`) is fully implemented and tested.
It owns identity lifecycle, credential management, sessions, and role
assignment. The legacy `server/routes/auth.js` + MongoDB `User` model is a
parallel system that will need to be replaced.

**Migration implications:**
- Engine 01 uses its own `InMemoryIdentityRepository`. It has no MongoDB
  adapter. All identities are lost on restart (same persistence problem as
  Decision A).
- A migration means moving MongoDB user records into Engine 01's store, or
  building a MongoDB adapter for Engine 01 first.
- JWT issuance currently happens in `server/routes/auth.js`. Engine 01 would
  need to take over token issuance, or a hybrid token format must be designed
  that both systems can validate.
- This is a large, risky migration with significant frontend impact (login,
  registration, profile pages all touch the legacy auth).
- **Do not begin migration without a dedicated design session and an approved
  migration plan.**

### C4 — Netlify authentication

Netlify Functions use a separate bcryptjs-backed auth flow in
`netlify/functions/api.js`. This is a third parallel identity system. It
has no connection to Engine 01 or to the legacy MongoDB auth.

**Mitigation:** Netlify auth is explicitly scoped to the beta Netlify
deployment. It must not be confused with the canonical identity system.
Document its scope and plan its deprecation when the canonical system is
ready to serve Netlify deployments.

### Summary of open authorisation risks

| Risk | Severity | Status |
|---|---|---|
| Stale role in JWT after role change | HIGH | OPEN — acceptable for development writes only |
| `reporter` → `automation` semantic mismatch | MEDIUM | OPEN |
| Engine 01 not connected to JWT issuance | HIGH | OPEN — no migration started |
| Netlify auth is a third parallel identity system | MEDIUM | OPEN — scoped to Netlify beta |
| No rate limiting or brute-force protection on any auth endpoint | HIGH | OPEN |

---

## Decision D: Next vertical slice

**Status:** OPEN  
**Blocking:** Sprint planning  
**Owner:** Engineering lead + product

Two candidates for the next implemented feature slice. Both require decisions
A and C to be partially resolved first.

---

### Candidate D1 — Engine 11 Mission creation (`POST /api/v2/missions`)

**What it is:** Expose the already-implemented `CreateMission` command via
an HTTP write endpoint. The domain logic, validation, idempotency, and event
publication are all done. Only the HTTP route and persistence are missing.

**Persistence requirement:** Decision A must be resolved. Without a durable
repository, every created mission is lost on restart. Option A1 (ephemeral)
is the minimum; Option A2 (MongoDB adapter) is required for production.

**Frontend changes required:**
- A mission creation form (new page or modal).
- The form must send `targetCriteria` with at minimum the fields the domain
  requires (non-empty object). If Decision B2 is chosen, a coordinates input
  is also required.
- `CommandCenter.jsx` already fetches missions — no change needed for display.

**Authorization:** Decision C must clarify which roles can create missions.
Currently `admin`, `system`, `mission_lead`, `automation` are authorised.
The role mapping in `actorFromRequest.js` gives `authority` users the
`mission_lead` role — this seems correct but must be confirmed.

**Canonical dependencies:** None beyond Engine 11 itself. Engine 22
Governance is injectable but defaults to null (no-op). Engine 23 Audit is
already connected and will record every `CreateMission` event.

**Unresolved risks:**
- Coordinates field not defined (Decision B).
- In-memory persistence lost on restart (Decision A).
- Stale JWT role claims (Decision C1).
- Idempotency key must be supplied by the client — the HTTP route needs to
  decide whether to accept a client-supplied key or generate one server-side.
  Both approaches have trade-offs (client-supplied: safer for retry; server-
  generated: simpler client contract but loses idempotency on network retry).

**Estimated scope (after decisions A and B are resolved):**
- 1 new HTTP route file or additions to `server/routes/v2/missions.js`.
- Optional MongoDB adapter (Decision A2).
- Optional Mission entity update for coordinates (Decision B2).
- Frontend form (medium scope).
- 5–10 new HTTP integration tests.

---

### Candidate D2 — Engine 02 Observation integration (read + write)

**What it is:** Wire the existing `SubmitReport` frontend flow through
Engine 02 Observation instead of directly to the legacy MongoDB `Report`
model. Introduce read endpoints (`GET /api/v2/observations`) backed by the
canonical engine.

**Persistence requirement:** Same as D1. Engine 02 uses `InMemoryObservationRepository`.
Observations submitted to the canonical endpoint will be lost on restart.
A MongoDB adapter for Engine 02 is required before this can be production-ready.

**Frontend changes required:**
- `SubmitReport.jsx` currently POSTs to `API_ENDPOINTS.REPORTS.CREATE`
  (legacy MongoDB route). The new endpoint would be `POST /api/v2/observations`.
- The payload shape differs:

  | Field | Legacy (`reports.js`) | Canonical (`SubmitObservation`) |
  |---|---|---|
  | `description` | free text | `description` (same) |
  | `category` | AI-classified string | must be one of `FLOOD\|DROUGHT\|FIRE\|POLLUTION\|STORM\|DEFORESTATION\|WILDLIFE\|OTHER` |
  | `severity` | AI string | must be `LOW\|MODERATE\|CRITICAL` |
  | `urgency` | AI string | must be `LOW\|MEDIUM\|IMMEDIATE` |
  | `location.text` | free text | canonical `Coordinates` value object requires numeric `latitude`/`longitude` |
  | `location.lat/lon` | optional geocoded numbers | **required** by `Observation` entity |
  | `images[]` | URL array | `evidence[]` array of `{ id, mediaType, url, hashSha256, mimeType }` |
  | `signalSource` | present | not present in canonical entity |
  | `isLive`, `proofOfPresence` | present | not present in canonical entity |
  | AI classification | done server-side before save | not part of Engine 02 |

- The location mismatch is the most significant contract gap: the frontend
  collects a free-text location string. The canonical `Observation` entity
  requires a validated `Coordinates` object with numeric latitude/longitude.
  The current geocoding is done in `reports.js` via the OpenWeather API.
  That geocoding step must be preserved and integrated into a server-side
  adapter layer before calling the canonical engine command.

**Authorization:** Engine 02's `ObservationApplicationService.execute()` does
not currently call `_assertAuthorized()` — there is no role check before
accepting a `SubmitObservation` command. Any caller can submit an observation.
This is a contract mismatch vs. the Engine 11 pattern. It must be resolved
before exposing a write endpoint:
  - Either add authorization to Engine 02 (matches Engine 11 pattern).
  - Or accept that observation submission is open to authenticated users
    without role restriction (reasonable for a citizen-science platform but
    must be an explicit decision).

**Media/upload handling:**
- The legacy flow uploads images server-side via `/api/upload/image` (Cloudinary).
  The returned URL is stored in `report.images[]`.
- The canonical `Observation` entity stores `evidence[]` items with
  `hashSha256` computed server-side. The media upload step and SHA-256
  computation must happen in the adapter layer before calling the engine.
- Cloudinary is owned by the legacy server infrastructure, not by Engine 02.
  The canonical engine only stores the URL — it has no upload capability.
  This coupling must be documented.

**MongoDB ownership:**
- The legacy `Report` model owns the `reports` MongoDB collection. Engine 02
  has its own `InMemoryObservationRepository`.
- If Engine 02 writes are enabled without a MongoDB adapter, the canonical
  observation store and the legacy report store diverge immediately. There
  will be two independent records for the same submission: one in MongoDB
  (`reports`) and one in Engine 02's in-memory store.
- A dual-write adapter (write to both) or a cutover (write only to canonical,
  legacy read path deprecated) must be decided before implementation.

**Canonical dependencies:** None beyond Engine 02 itself.

**Unresolved risks:**
- Location coordinates not collected by the frontend (free-text only).
- Evidence shape mismatch vs. legacy `images[]` array.
- No authorization check in Engine 02.
- No MongoDB adapter — observations lost on restart.
- AI classification currently happens before save in the legacy flow and
  populates `category`/`severity`/`urgency`. Engine 02 accepts these as
  input — the AI classification step must happen before the command is built,
  not inside the engine.
- Dual data store risk if both legacy and canonical paths remain active.

**Estimated scope:**
- Server-side adapter/middleware: geocoding integration, evidence hashing,
  AI classification bridging.
- Engine 02 authorization decision and implementation.
- `GET /api/v2/observations` route.
- `POST /api/v2/observations` route.
- Frontend `SubmitReport.jsx` update.
- Optional MongoDB adapter (Decision A2 for Engine 02).
- 10–15 new HTTP integration tests.
- Larger scope than D1 due to the payload contract mismatches.

---

### Comparison summary

| Dimension | D1 — Mission creation | D2 — Observation integration |
|---|---|---|
| Domain logic ready? | Yes — all commands implemented and tested | Yes — all commands implemented and tested |
| Persistence blocker | Yes — Decision A | Yes — Decision A |
| Frontend scope | Medium (new form) | Medium-large (SubmitReport.jsx payload changes) |
| Authorization | Defined, minor C1 stale-claim risk | Undefined — no role check in Engine 02 |
| Coordinates | Undefined — Decision B | Required by entity, not collected by frontend |
| AI classification | Not applicable | Must be bridged from legacy LILO flow |
| Media/upload | Not applicable | Cloudinary coupling must be preserved |
| Dual data store risk | Low (missions have no legacy store) | High (reports MongoDB collection is active) |
| Cross-engine dependencies | None | None |
| Relative implementation risk | Lower | Higher |

**Recommendation (for human review — not decided):** D1 carries lower risk
because missions have no legacy data store to conflict with. D2 carries higher
risk due to payload mismatches, the missing authorization pattern, and the
active MongoDB reports collection that must be carefully handled. If time is
limited, resolve Decisions A and B, then proceed with D1. D2 should follow
once Engine 02 authorization is defined and the location/evidence contract
gaps are resolved.

---

## Open decision registry

| ID | Title | Status | Blocking |
|---|---|---|---|
| A | Persistence strategy | OPEN | All write endpoints |
| B | Coordinates in Mission entity | OPEN | POST /api/v2/missions payload |
| C | Identity and actor authority | OPEN | Authorized writes, Engine 01 migration |
| D | Next vertical slice | OPEN | Sprint planning |

No implementation work should begin on any blocked item until the relevant
decision is recorded as DECIDED in this document by the engineering lead.


---

## Appendix: Engine 02 Observation — Readiness Inspection

**Inspected:** Post-audit-verification session  
**Status:** NOT IMPLEMENTED — no v2 HTTP routes exist. Read-only GET and write POST integration are both absent.  
**Instruction:** Do not implement Engine 02 write endpoints until Decision A (persistence), and the authorization gap documented below, are resolved.

### What exists (canonical layer)

| Component | File | Status |
|---|---|---|
| `ObservationEngine` | `engines/02-observation/index.js` | Complete |
| `ObservationApplicationService` | `engines/02-observation/application/services/ObservationApplicationService.js` | Complete |
| `Observation` entity | `engines/02-observation/domain/entities/Observation.js` | Complete |
| `Coordinates` value object | `engines/02-observation/domain/value-objects/Coordinates.js` | Complete |
| `ObservationStatus` value object | `engines/02-observation/domain/value-objects/ObservationStatus.js` | Complete |
| `InMemoryObservationRepository` | `engines/02-observation/infrastructure/repositories/InMemoryObservationRepository.js` | Complete |
| Engine 02 tests | `engines/02-observation/tests/ObservationEngine.test.js` | 5 tests passing |

All five commands are implemented: `SubmitObservation`, `ValidateObservationEvidence`,
`FlagObservation`, `UpdateObservationStatus`, `ArchiveObservation`.

All three read methods are implemented: `getObservationById`, `listObservations`
(with `category`, `status`, `observerId` filters).

The repository interface is identical in structure to `InMemoryMissionRepository` —
a `save / findById / listAll / count / clear` contract ready for a MongoDB adapter.

### What does not exist

| Missing item | Location | Impact |
|---|---|---|
| `GET /api/v2/observations` route | `server/routes/v2/observations.js` | No canonical observation read endpoint |
| `POST /api/v2/observations` route | Same | No canonical observation write endpoint |
| Engine 02 in composition root | `server/canonical/engines.js` | Engine not instantiated in server process |
| MongoDB adapter | Not written | All observations ephemeral (see Decision A) |
| Authorization check in `execute()` | `ObservationApplicationService.js` | Any caller can submit — see gap #1 below |

### Contract mismatches — legacy vs canonical

The following table maps every field the existing submission flow uses
(`SubmitReport.jsx` → `POST /api/reports` → `Report` Mongoose model) against
the canonical Engine 02 contract (`SubmitObservation` command → `Observation` entity).

#### Submission payload mismatches

| Field | Legacy `Report` model | Canonical `Observation` entity | Gap / action required |
|---|---|---|---|
| `description` | `String`, required, free text | `String`, required, trimmed | ✓ Compatible |
| `category` | Enum: `Flood\|Drought\|Fire\|Pollution\|Storm\|Other` (mixed case) | Enum: `FLOOD\|DROUGHT\|FIRE\|POLLUTION\|STORM\|DEFORESTATION\|WILDLIFE\|OTHER` (UPPER_CASE) | **MISMATCH** — case normalisation required; legacy lacks `DEFORESTATION` and `WILDLIFE`; canonical lacks `Other` (maps to `OTHER`) |
| `severity` | Enum: `Low\|Moderate\|Critical` (mixed case) | Enum: `LOW\|MODERATE\|CRITICAL` (UPPER_CASE) | **MISMATCH** — case normalisation required; values are semantically equivalent |
| `urgency` | Enum: `Low\|Medium\|Immediate\|Observation\|TemporaryRelief` | Enum: `LOW\|MEDIUM\|IMMEDIATE` | **MISMATCH** — `Observation` and `TemporaryRelief` have no canonical equivalent; an adapter must map or reject them |
| `location.text` | Free-text string, optional | Not present in canonical entity | Legacy field not stored by Engine 02; must be preserved in metadata or dropped |
| `location.city` | String | Not a top-level field; stored in `location.city` on the entity | ✓ Compatible — canonical entity stores address fields alongside coordinates |
| `location.state` | String | Stored in `location.state` | ✓ Compatible |
| `location.country` | String, default `'Nigeria'` | Stored in `location.country`, default `'Nigeria'` | ✓ Compatible |
| `location.lat` + `location.lon` | Optional numbers (populated by server-side geocoding) | **Required** `Coordinates` value object with validated `latitude`/`longitude` | **CRITICAL MISMATCH** — frontend collects only a free-text location string; numeric coordinates are not available at submission time without geocoding |
| `images[]` | `String[]` of URLs | `evidence[]` array of `{ id, mediaType, url, hashSha256, mimeType }` | **MISMATCH** — shape difference; an adapter must transform URL strings into evidence objects and compute SHA-256 hashes |
| `signalSource` | Enum: `social\|report\|command` | Not present | Legacy field has no canonical equivalent; must go into `metadata` or be dropped |
| `isLive` | Boolean | Not present | Not in canonical entity; must go into `metadata` or be dropped |
| `proofOfPresence` | Boolean | Not present | Not in canonical entity; must go into `metadata` or be dropped |
| `liveSessionId` | String | Not present | Not in canonical entity; must go into `metadata` or be dropped |
| `confidence` | Number (AI score) | Not present on entity | AI classification output; must be stored in `metadata` if needed |
| `summary` | String (AI summary) | Not present on entity | AI classification output; must be stored in `metadata` if needed |
| `liloClassification` | Complex LILO object | Not present | Legacy AI enrichment; no canonical equivalent in Engine 02 |
| `aiVerification` | Complex object with score, reasoning, flags | Not present | Legacy AI enrichment; no canonical equivalent in Engine 02 |
| `aiScore` | Number | Not present | Legacy AI enrichment; no canonical equivalent in Engine 02 |
| `postStatus` | Enum: `regular\|observe\|critical` | Not present | LILO classification output; not in canonical entity |

#### Response shape mismatches

The legacy `serializeReport()` function in `server/routes/reports.js` returns
a rich response including `likes`, `upvotes`, `downvotes`, `comments`,
`shares`, `liloClassification`, `aiScore`, `verificationStatus`, `user`
(populated with name/avatar/trustScore), and `proofOfPresence`.

The canonical `Observation.toJSON()` returns only the entity's own fields:
`observationId`, `observerId`, `category`, `severity`, `urgency`, `location`,
`description`, `evidence[]`, `status`, `metadata`, `createdAt`, `updatedAt`.

**Gap:** The canonical response has no social engagement fields (likes, votes,
comments), no AI enrichment fields, and no populated user object. Any frontend
component that renders legacy report cards cannot directly consume the
canonical response without an API adapter layer.

### Authorization gap (critical)

`MissionApplicationService.execute()` calls `_assertAuthorized(cmd)` before
any mutation. Engine 11 denies any actor whose `roles` array does not include
an authorized role.

`ObservationApplicationService.execute()` has **no equivalent authorization
check**. Any authenticated or even unauthenticated caller can submit an
observation command. The governance check (`_assertGovernance`) only fires if
a governance engine is injected — it defaults to null (no-op).

This is consistent with a citizen-science model where any user can submit an
observation, but it is an explicit policy choice, not an oversight. It must
be documented as a decision before an HTTP write endpoint is exposed:

- **Option 1:** Accept that observation submission is open to all authenticated
  users (add only an authentication check, no role check). Add `_assertAuthenticated`
  to the execute path.
- **Option 2:** Add role-based authorization matching the Engine 11 pattern.
  Define which roles can submit (`'observer'`, `'reporter'`, `'authority'`,
  `'admin'` — the legacy `reporter` role would map to `'observer'`).
- **Option 3:** Accept the current no-auth pattern for public submissions and
  add rate limiting at the HTTP layer instead.

**This decision must be made and recorded before `POST /api/v2/observations`
is implemented.**

### Media/upload pipeline

The current upload route (`server/routes/upload.js`) stores files on the
local filesystem under `uploads/` using multer. It returns a local path URL
(`/uploads/<filename>`). There is no Cloudinary integration in the server
(the Cloudinary credentials were removed from the frontend in Phase 0).

The canonical `Observation` entity stores evidence as `{ id, mediaType, url,
hashSha256, mimeType }`. The SHA-256 hash is computed in
`ObservationApplicationService._handleSubmitObservation()` from the URL +
item JSON — this is a hash of the URL string, not of the file content. It is
not a cryptographic integrity proof of the media file itself.

For a production evidence system, the SHA-256 should be computed from the
file bytes before upload and passed as `item.hashSha256` in the evidence
array. This is not currently done by the frontend or the upload route.

### Proposed read/write integration plan (not approved — for review)

The following is a proposed sequence only. No implementation step begins
without the prerequisites being approved.

#### Phase R — Read-only (no write dependencies, low risk)

**Prerequisite:** None beyond adding Engine 02 to the composition root.

1. Add `ObservationEngine` instantiation to `server/canonical/engines.js`
   (mirror the MissionEngine pattern; use `InMemoryObservationRepository`).
2. Create `server/routes/v2/observations.js` with:
   - `GET /api/v2/observations` — list observations with optional `category`,
     `status`, `observerId` query parameters.
   - `GET /api/v2/observations/:id` — get a single observation by ID.
3. Mount the router in `server/index.js` at `/api/v2`.
4. Add HTTP integration tests (7–10 tests mirroring the missions pattern).
5. Update `src/services/api.js` `API_ENDPOINTS` with `OBSERVATIONS` group.
6. **No frontend connection until write path is approved.**

This phase has no data-loss risk because no data is written. The in-memory
store starts empty on each restart — read endpoints return `[]` until data
is seeded or a write endpoint is enabled.

#### Phase W — Write integration (requires Decision A + authorization decision)

**Prerequisites:**
- Decision A resolved (at minimum Option A1 with explicit ephemeral disclaimer,
  or Option A2 MongoDB adapter).
- Authorization model for `SubmitObservation` decided (open auth, role-based,
  or rate-limited public).
- Coordinates collection strategy decided: either a geocoding adapter on the
  server converts the free-text `location.text` to numeric coordinates, or the
  frontend collects latitude/longitude directly (GPS API or map picker).

1. Build a server-side adapter that transforms the `SubmitReport` payload into
   a `SubmitObservation` command:
   - Normalise category and severity to UPPER_CASE.
   - Map legacy urgency values (`Observation` → `LOW`, `TemporaryRelief` → `LOW`).
   - Geocode `location.text` to `{ latitude, longitude }` if not provided.
   - Transform `images[]` URLs into `evidence[]` objects with computed hashes.
   - Store `signalSource`, `isLive`, `proofOfPresence`, `liveSessionId` in
     `metadata`.
2. Create `POST /api/v2/observations` route calling the adapter then the engine.
3. Decide whether `SubmitReport.jsx` switches to the new endpoint (cutover) or
   both endpoints remain active in parallel (dual-write risk).
4. If dual-write: both MongoDB `reports` and canonical `observations` store
   the same submission — this must be explicitly acknowledged and a
   deduplication/migration plan written.
5. Add HTTP integration tests covering the full adapter path, including
   geocoding failure, invalid category, missing coordinates, and evidence hashing.

### Engine 02 summary

| Dimension | Status | Note |
|---|---|---|
| Domain logic | Ready | All 5 commands + 3 queries implemented and tested |
| Repository interface | Ready | InMemoryObservationRepository; MongoDB adapter not written |
| HTTP routes | Missing | No v2 routes exist |
| Composition root wiring | Missing | Engine not in `server/canonical/engines.js` |
| Authorization | **Gap** | No role check in `execute()` — policy decision required |
| Coordinates | **Gap** | Required by entity; frontend sends free-text only |
| Category/severity/urgency enums | **Gap** | Case and value differences vs legacy |
| Media/evidence | **Gap** | Shape mismatch; hash is URL-hash not file-hash |
| Social engagement fields | **Gap** | Not in canonical entity; breaking change for current frontend |
| AI enrichment fields | **Gap** | Not in canonical entity; adapter must handle |
| Persistence | **Gap** | In-memory only; see Decision A |
| Dual data store risk | **High** | Active MongoDB `reports` collection must be managed |


---

# Implementation Gate Review

**Session date:** Architecture gate review session  
**Test suite at gate:** 458/458 passing — 0 failures  
**Scope:** Analysis only. No implementation. No schema changes. No new routes.

This section records the concrete technical findings that must be resolved
before any write endpoint is opened. It is the authoritative reference for
what "Decision A/B/C/D resolved" means in practice.

---

## 1. Document accuracy verification

All claims in the documents above were verified against the actual source:

- No legacy Mongoose `Mission` model exists in `server/models/`. The five
  models present are `Comment`, `MerchantLedger`, `PushSubscription`,
  `Report`, and `User`. There is no existing MongoDB schema for missions
  that could be reused or conflict.
- `InMemoryMissionRepository` exposes exactly 9 methods: `save`, `findById`,
  `findByStatus`, `findActive`, `findByPriority`, `listAll`, `count`,
  `delete`, `clear`.
- `Mission.toJSON()` produces exactly 10 fields: `missionId`, `title`,
  `description`, `priority`, `targetCriteria`, `objectives`, `status`,
  `metadata`, `createdAt`, `updatedAt`.
- Engine 02 `ObservationApplicationService.execute()` confirmed to have no
  `_assertAuthorized` call. All other mutating engines (Engine 11, 15, 18,
  19, 20, 21, 22, 24) call `_assertAuthorized` before idempotency. Engine 02
  and Engine 07 are the two exceptions.
- Documents are accurate. No corrections required.

---

## 2. MongoDB adapter specification for Engine 11

### 2.1 Repository interface contract

The `MongoMissionRepository` must satisfy the identical async interface as
`InMemoryMissionRepository`. No caller in the engine layer is permitted to
import MongoDB types directly — the adapter is the only file that may import
`mongoose` or reference MongoDB-specific constructs.

```
async save(mission: Mission): Promise<Mission>
async findById(missionId: string): Promise<Mission | null>
async findByStatus(status: string): Promise<Mission[]>
async findActive(): Promise<Mission[]>
async findByPriority(priority: string): Promise<Mission[]>
async listAll(): Promise<Mission[]>
async count(): Promise<number>
async delete(missionId: string): Promise<boolean>
async clear(): Promise<void>   // test/seed use only — production should refuse this
```

All methods must reconstruct a live `Mission` instance (not a plain object)
from the stored document before returning, so that domain logic (`transitionTo`,
`addObjective`, `canBeCompleted`, etc.) remains available to callers.

Reconstruction means calling `new Mission(storedPojo)`. This works because
`Mission` constructor accepts `toJSON()` output directly — the field names
are identical. Verified against the entity constructor signature.

### 2.2 Required MongoDB document shape

Collection name: **`canonical_missions`**  
(Never `missions` — that could collide with a future legacy model. Prefixing
with `canonical_` is the boundary enforcement convention for this project.)

```js
{
  _id: String,            // === missionId, e.g. "msn_<uuid32>"
  title: String,
  description: String,
  priority: String,       // 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  targetCriteria: Object, // opaque subdocument, no schema enforcement at DB level
  objectives: [           // embedded array — no separate collection
    {
      objectiveId: String,
      description: String,
      status: String      // 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
    }
  ],
  status: String,         // 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'COMPLETED' | 'ABORTED'
  metadata: Object,       // opaque subdocument
  createdAt: String,      // ISO-8601 string — stored as String not Date to match entity
  updatedAt: String       // ISO-8601 string
}
```

**Why `_id: String` instead of `ObjectId`?** The `missionId` is already a
canonical unique identifier (`msn_<uuid32>`). Using it as `_id` avoids a
dual-key situation and makes lookups by `missionId` a primary-key scan.
The adapter's `findById` becomes `findOne({ _id: missionId })`.

**Why `createdAt`/`updatedAt` as strings?** The `Mission` entity stores
timestamps as ISO-8601 strings (output of `new Date().toISOString()`). Storing
as Mongoose `Date` type would require conversion in both directions and could
introduce timezone normalisation surprises. Storing as `String` means the
round-trip is lossless and the domain entity is not affected.

### 2.3 Canonical entity ↔ MongoDB field mapping

| Canonical field | MongoDB field | Notes |
|---|---|---|
| `missionId` | `_id` | Primary key |
| `title` | `title` | Direct |
| `description` | `description` | Direct |
| `priority` | `priority` | Always UPPER_CASE; validated by entity |
| `targetCriteria` | `targetCriteria` | Stored as plain subdocument; Mongoose `Mixed` type |
| `objectives` | `objectives` | Embedded array; ObjectiveStatus validated by entity on rehydration |
| `status` | `status` | MissionStatus enum; validated by entity on rehydration |
| `metadata` | `metadata` | Stored as `Mixed` |
| `createdAt` | `createdAt` | ISO-8601 string |
| `updatedAt` | `updatedAt` | ISO-8601 string |

Adapter `save()` implementation:

```js
async save(mission) {
  const doc = mission.toJSON();
  await MissionDocument.findOneAndUpdate(
    { _id: doc.missionId },
    { $set: { ...doc, _id: doc.missionId } },
    { upsert: true, new: true }
  );
  return mission; // return the original entity, not the Mongoose doc
}
```

Adapter `findById()` implementation pattern:

```js
async findById(missionId) {
  const doc = await MissionDocument.findOne({ _id: missionId }).lean();
  if (!doc) return null;
  const pojo = { ...doc, missionId: doc._id };
  return new Mission(pojo);
}
```

### 2.4 Required indexes

```js
// Primary key lookup (covered by _id index automatically)
// Status filter — most frequent query pattern
{ status: 1 }
// Priority filter
{ priority: 1 }
// Combined active + priority (used by listActiveMissions({ priority }))
{ status: 1, priority: 1 }
// Recency sort for list endpoints
{ createdAt: -1 }
// TTL is not needed — missions do not expire automatically
```

### 2.5 Transaction and concurrency considerations

**Single-document writes:** Every `save()` call writes one self-contained
document. The `objectives` array is embedded — there are no foreign keys and
no multi-collection writes. MongoDB's document-level atomicity covers this
completely. No multi-document transactions are required for the current schema.

**Optimistic concurrency:** The current `Mission` entity has no `version` or
`etag` field. Two concurrent requests with different idempotency keys could
both read the same mission snapshot and each attempt to transition it. The
second write would silently overwrite the first. This is acceptable today
because the idempotency store (in-memory `IdempotencyManager`) prevents
duplicate keys — but two genuinely different commands on the same mission
(e.g. `ActivateMission` and `SuspendMission` racing) could produce an
undefined final state.

**Mitigation:** Add a `version: Number` field to the Mongoose schema and use
`findOneAndUpdate({ _id, version: expectedVersion }, { $set: ..., $inc: { version: 1 } })`.
If `result` is null the document was concurrently modified — return a 409.
This requires a corresponding `version` field on the `Mission` entity.
**This is a design addition that requires approval before the adapter is
written.** It is listed as a prerequisite in the phase sequence below.

### 2.6 EventBus publication vs persistence ordering

In `MissionApplicationService._handleCreateMission()`:

```js
await this.repository.save(mission);   // 1. persist
await this._publish(createMissionCreatedEvent(...));  // 2. publish
```

The event is published **after** a successful save. This means:

- If `save()` throws, the event is never published. The system is consistent
  (no phantom events for non-persisted data). ✓
- If `save()` succeeds but `_publish()` throws (EventBus handler error),
  the mission is persisted but the event is lost. AuditEngine will not record
  it. The EventBus `publish()` implementation catches handler errors and
  routes them to dead letters — it does not re-throw — so this scenario
  currently never throws back to the service. But the audit record is silently
  absent.
- There is no outbox pattern or at-least-once event delivery guarantee.

**Risk:** With a durable MongoDB repository, a failed EventBus delivery
(e.g. AuditEngine handler throws) leaves the canonical mission persisted but
unaudited with no retry mechanism. This is acceptable for the current in-memory
audit store. It becomes a compliance gap when durable audit storage is required.

**Resolution path:** Either accept the at-most-once delivery semantics
(document explicitly) or implement a transactional outbox pattern before
enabling durable audit. This is a Phase 1 design decision.

### 2.7 Restart recovery

With a MongoDB adapter:

1. Server starts. `engines.js` constructs `MissionEngine` with the new
   `MongoMissionRepository`.
2. `missionEngine.initialize()` is called. Currently this returns
   `{ ready: true }` with no loading step.
3. All `findById` / `findActive` / `listAll` calls hit MongoDB directly —
   there is no warm-up or cache. Recovery is automatic and transparent.
4. The `IdempotencyManager` is still in-memory. Its store does not survive
   restart. After restart, a client re-submitting the same idempotency key
   will execute the command again (not return the cached result). This is a
   known limitation of the in-memory `IdempotencyManager`.

**Consequence:** With durable missions but ephemeral idempotency, a client
that retries after a server restart may create a duplicate mission with the
same idempotency key. This must be addressed before exposing write endpoints
to production clients — either by making the `IdempotencyManager` durable
(MongoDB-backed `canonical_idempotency_keys` collection) or by making the
canonical mission entity idempotent at the database level (unique index on
a client-supplied key field).

### 2.8 Test strategy for repository parity

The `MongoMissionRepository` must pass the same logical test suite as
`InMemoryMissionRepository`. Strategy:

1. Extract a shared `repositoryContract(createRepository)` test factory that
   accepts a repository factory function and runs all interface tests against it.
2. Run the factory with `() => new InMemoryMissionRepository()` for the
   existing unit tests.
3. Run the same factory with `() => new MongoMissionRepository(testConnection)`
   for integration tests, using `mongodb-memory-server` to provide an
   isolated MongoDB instance per test run.
4. Tests must cover: save + findById round-trip, entity rehydration
   (verify `transitionTo()` works on the returned object), findActive,
   findByPriority, count, delete, clear, concurrent-key conflict (if version
   field is added).

### 2.9 Legacy Mongoose model reuse assessment

**Finding:** No legacy Mongoose `Mission` model exists. The `server/models/`
directory contains `Report`, `User`, `Comment`, `MerchantLedger`,
`PushSubscription` only.

**Conclusion:** There is no reuse risk and no collision risk. A new
`canonical_missions` collection is a clean addition. No migration of existing
data is required because no mission data exists in MongoDB.

---

## 3. Coordinate ownership — Engine 07 vs Engine 11

### 3.1 What Engine 07 actually owns

Engine 07 Geospatial owns the `GeoPoint` entity: a spatial point with
`{ pointId, latitude, longitude, entityId, entityType, category, timestamp, metadata }`.

Engine 07's role is **spatial indexing and proximity queries** — it answers
"find all entities within N km of this location." It does this by indexing
`GeoPoint` records keyed by `entityId`. The `entityId` is a reference to an
entity in another engine (e.g. an `observationId`, a future `missionId`).

Engine 07 **does not own mission target criteria**. It does not know what a
mission is. It provides a spatial index that other engines can write to
(via `IndexSpatialPoint`) and query (via `findNearby`). It is a spatial
utility engine, not a data owner for missions.

### 3.2 What Engine 11 currently owns

`Mission.targetCriteria` is an opaque, caller-defined object validated only
to be a non-empty plain object. The entity explicitly states in its comment:
*"Engine 11 stores and returns them but does not interpret them."*

There is no `coordinates` field on the `Mission` entity. No `Coordinates`
value object is imported or used. The only place coordinates appear in the
Engine 11 codebase is as an undocumented key inside `targetCriteria` — placed
there by callers, not enforced or validated by the engine.

### 3.3 Is `targetCriteria.coordinates` canonical?

**No.** It is an integration convention established by the server-side DTO
layer and the `MissionMap` component, not a canonical contract. Evidence:

- `normalizeCriteria()` in `Mission.js` only checks that `targetCriteria` is
  a non-empty object. Any shape is accepted.
- No tests in the Engine 11 test suite assert on `targetCriteria.coordinates`.
- The `MissionMap` component reads it as a fallback: if absent, the marker
  is null.
- The `createMissionCreatedEvent` factory copies `targetCriteria` into the
  event payload without interpreting it.

### 3.4 What coordinate type/schema is canonical?

Two validated coordinate types exist in the codebase:

| Type | Engine | Fields | Validation |
|---|---|---|---|
| `Coordinates` value object | Engine 02 | `latitude`, `longitude`, `altitude?`, `accuracy?` | lat ∈ [-90,90], lon ∈ [-180,180] |
| `GeoPoint` entity | Engine 07 | `latitude`, `longitude`, `entityId`, `entityType`, `category`, `timestamp`, `metadata` | Same range checks; requires `entityId` |

`Coordinates` is a simple, validated value object with no identity.
`GeoPoint` is a full entity with its own ID, used for spatial index entries.

For mission target location, `Coordinates` is the correct type — a mission
has a target location, not a spatial index entry. `GeoPoint` is for indexing
after the fact (e.g. once a mission is created, its location can be indexed
into Engine 07 via `IndexSpatialPoint`).

### 3.5 What would break if coordinates were moved?

If coordinates were added as a first-class `Mission` field (Decision B2):

| Impact | Details |
|---|---|
| `Mission` entity constructor | New optional `coordinates` parameter; `normalizeCriteria` unchanged |
| `Mission.toJSON()` | New `coordinates` field in output |
| All existing tests that call `new Mission(...)` | Must supply `coordinates` or accept `null` — only if required; if optional, existing tests pass unchanged |
| `createMissionCreatedEvent` | Should include `coordinates` in payload |
| `GET /api/v2/missions` DTO | Must include `coordinates` as top-level field |
| `MissionMap` | Reads `mission.coordinates` instead of `mission.targetCriteria.coordinates` |
| MongoDB adapter document shape | New `coordinates` subdocument field |
| Any caller currently putting coordinates in `targetCriteria` | Silent breakage if they continue to pass `targetCriteria.coordinates` — the map will no longer read from there |

Making `coordinates` optional (nullable) means **zero existing tests break**.
The field defaults to `null`. Only callers that currently supply coordinates
via `targetCriteria` need updating — and currently that is only the server-side
seed data / test fixtures, not production user data.

### 3.6 Cleanest canonical contract

```js
// Proposed Mission entity addition — requires Decision B2 approval
coordinates: {
  latitude: number,   // validated: [-90, 90]
  longitude: number,  // validated: [-180, 180]
  altitude: number | null,
  accuracy: number | null
} | null             // optional — missions without a fixed location are valid
```

The validation logic should reuse or mirror Engine 02's `Coordinates` value
object. Cross-engine import of the value object is **not recommended** —
Engine 11 should own its own `MissionCoordinates` value object with the same
validation rules, keeping engines independently deployable.

After a `Mission` is created with coordinates, the server composition root can
optionally index its location in Engine 07 by issuing an `IndexSpatialPoint`
command with `entityId = missionId, entityType = 'mission'`. This is a
post-creation side effect, not a dependency.

### 3.7 Engine 07 integration path (Decision B3) — assessment

Engine 07 is fully implemented and tested. The `InMemoryGeospatialIndex` has
`insertPoint`, `findInRadius`, `listAll`, `findByEntityId`. The `GeoPoint`
entity supports Haversine distance.

However, making Engine 11 depend on Engine 07 for mission creation (Option B3)
would mean:
- Creating a mission requires Engine 07 to be available.
- Mission creation becomes a two-engine operation.
- The cross-engine call must happen in the application service or the
  composition root, not inside the domain entity.
- If Engine 07 is unavailable, mission creation fails.

This coupling is premature. **B3 is not recommended as the first step.** The
correct sequence is: add coordinates to Mission entity (B2), then optionally
index created missions into Engine 07 as a post-creation side effect in the
composition root. This keeps Engine 11 independent.

---

## 4. Authorization matrix — Engine 11

Source: `MissionApplicationService.js`, `actorFromRequest.js`.

### 4.1 Authorized roles (canonical)

```js
const DEFAULT_AUTHORIZED_ROLES = ['system', 'admin', 'mission_lead', 'automation'];
```

These are injected at construction time and can be overridden. In the server
composition root (`engines.js`), no override is passed — the defaults apply.

### 4.2 Command authorization matrix

| Command | Required canonical role | Anonymous allowed | Ownership required | System/automation allowed | Enforcement layer |
|---|---|---|---|---|---|
| `CreateMission` | `system` OR `admin` OR `mission_lead` OR `automation` | No | No | Yes | `MissionApplicationService._assertAuthorized()` |
| `ActivateMission` | Same | No | No | Yes | Same |
| `SuspendMission` | Same | No | No | Yes | Same |
| `ResumeMission` | Same | No | No | Yes | Same |
| `CompleteMission` | Same | No | No | Yes | Same |
| `AbortMission` | Same | No | No | Yes | Same |
| `AddObjective` | Same | No | No | Yes | Same |
| `UpdateObjectiveStatus` | Same | No | No | Yes | Same |

### 4.3 Query authorization matrix

| Query | Required canonical role | Anonymous allowed | Notes |
|---|---|---|---|
| `getMission(missionId)` | None | **Yes** | `MissionApplicationService.getMissionById()` has no auth check |
| `listActiveMissions(filter)` | None | **Yes** | Same — no auth check |

Read operations in Engine 11 are fully open. This is consistent with a public
environmental-response system where mission visibility is not restricted.

### 4.4 HTTP layer enforcement gap

The current `GET /api/v2/missions` routes do not call `protect` middleware
(as confirmed in `server/routes/v2/missions.js`). This matches the open-read
intent. When `POST /api/v2/missions` is added, it **must** call `protect`
middleware to populate `req.user`, and then call `actorFromRequest(req)` to
build the canonical actor. If `actorFromRequest` returns `null` (no user),
the route must return 401. If the actor's roles do not include an authorized
role, the engine will return a 403-equivalent error.

### 4.5 Role mapping gap (Decision C context)

The legacy `reporter` role maps to `['automation']`. This grants `reporter`
users the ability to create missions — which is likely not the intended
policy. The `automation` role exists for programmatic agents, not human
reporters. This mapping should be changed to `[]` (read-only) for `reporter`
before `POST /api/v2/missions` is exposed, unless there is a deliberate
decision to allow reporters to create missions.

### 4.6 Ownership model

Engine 11 has **no per-actor ownership model**. A mission belongs to the
system, not to its creator. Any actor with a mutating role can activate,
suspend, or abort any mission regardless of who created it. This is correct
for an emergency-response coordination system. It does mean there is no
"only the creator can modify their own mission" restriction.

If per-actor ownership is desired in the future, a `createdByActorId` field
must be added to the `Mission` entity and the authorization check must be
extended.

---

## 5. Engine 02 contract mismatch reclassification

Each of the seven mismatches is classified as:
- **BLOCKING** — the write endpoint cannot be opened safely until this is resolved.
- **REQUIRES ARCHITECTURAL DECISION** — human approval needed; unblocks other work once decided.
- **NON-BLOCKING** — can be handled in the adapter layer without architectural change; does not prevent Phase W.

---

### Gap 1 — Coordinates (BLOCKING)

**Classification:** BLOCKING for `POST /api/v2/observations`

**Why:** The `Observation` entity constructor calls `new Coordinates({ latitude, longitude })` and throws if latitude or longitude is missing or non-numeric. The frontend `SubmitReport.jsx` sends only `location.text` (a free-text string like "Lagos Island"). There are no numeric coordinates in the submission payload.

**What clears it:** A server-side geocoding adapter must convert `location.text` to `{ latitude, longitude }` before the `SubmitObservation` command is built. The `OPENWEATHER_API_KEY` geocoding path already exists in `server/routes/reports.js` (`geocodeLocation()`). The adapter would reuse this function. If geocoding fails (key absent, rate limit, unknown location), the command must be rejected with a clear 422 response — not silently submitted with null coordinates.

This does not require an architectural decision. It requires implementation of a geocoding step in the HTTP adapter layer.

---

### Gap 2 — Authorization in Engine 02 `execute()` (REQUIRES ARCHITECTURAL DECISION)

**Classification:** REQUIRES ARCHITECTURAL DECISION before `POST /api/v2/observations`

**Why:** Engine 02 has no `_assertAuthorized()` call. This is not an oversight in the adapter layer — it is an engine-level gap. Three policy options exist (open to all authenticated users, role-based, rate-limited public), each with different security implications. The wrong default could expose the endpoint to unauthenticated bulk submission.

**What clears it:** Human approval of the authorization policy. Once decided, implementation is a single `_assertAuthorized()` method in `ObservationApplicationService` — approximately 15 lines, following the Engine 11 pattern exactly. No architectural change to the entity or repository.

This is a **policy decision**, not a technical blocker. It does not block Phase R (read-only routes) — only Phase W (write routes).

---

### Gap 3 — Dual data store risk (REQUIRES ARCHITECTURAL DECISION)

**Classification:** REQUIRES ARCHITECTURAL DECISION before `POST /api/v2/observations`

**Why:** The MongoDB `reports` collection is actively written by `POST /api/reports` and read by the feed, map, and user profile pages. Enabling `POST /api/v2/observations` without a cutover strategy creates two independent stores for the same user action. The frontend `SubmitReport.jsx` currently points to the legacy endpoint. Both stores will diverge silently.

**What clears it:** A human decision on one of: (a) cutover — `SubmitReport.jsx` switches to `POST /api/v2/observations`, legacy `POST /api/reports` is kept for backward compatibility but marked deprecated; (b) dual-write adapter — server writes to both stores until legacy reads are migrated; (c) introduce a read model that merges both. Options (b) and (c) are complex. Option (a) is viable only once canonical observations are durable (Decision A).

This gap does not block Phase R (read-only canonical observations route).

---

### Gap 4 — Category / severity / urgency enum mismatches (NON-BLOCKING)

**Classification:** NON-BLOCKING

**Why:** The mismatches are resolvable entirely in the HTTP adapter layer with a normalisation function. No entity change is required. The mapping is deterministic:

```
category:  'Flood' → 'FLOOD',  'Drought' → 'DROUGHT', etc.
severity:  'Low' → 'LOW', 'Moderate' → 'MODERATE', 'Critical' → 'CRITICAL'
urgency:   'Low' → 'LOW', 'Medium' → 'MEDIUM', 'Immediate' → 'IMMEDIATE'
           'Observation' → 'LOW' (closest canonical equivalent)
           'TemporaryRelief' → 'LOW' (no canonical equivalent — must be documented)
```

The two legacy urgency values with no canonical equivalent (`Observation`,
`TemporaryRelief`) should map to `LOW` with a deprecation notice rather than
being rejected — the AI classification layer rarely produces these values.
No entity or test change is needed; only the adapter normalisation function.

---

### Gap 5 — `images[]` vs `evidence[]` shape (NON-BLOCKING)

**Classification:** NON-BLOCKING

**Why:** The transformation is fully mechanical and belongs entirely in the
HTTP adapter layer. For each URL in `images[]`:

```js
{
  id: `evi_0_${sha256(url).slice(0, 8)}`,
  mediaType: 'IMAGE',
  url,
  hashSha256: sha256(url + JSON.stringify({ url })),  // matches ObservationApplicationService logic
  mimeType: 'image/jpeg'  // default; improve with mime-type detection if needed
}
```

`ObservationApplicationService._handleSubmitObservation()` already computes
the hash from `item.url + JSON.stringify(item)` if `item.hashSha256` is absent.
Passing pre-computed values overrides this. The adapter can pass the URL-based
hash directly. No entity change needed.

**Caveat:** The hash is a hash of the URL string, not the file content. This
is a known limitation documented in the Engine 02 inspection. It is not a
blocker for Phase W — it is a compliance gap for a future hardening pass.

---

### Gap 6 — Social engagement and AI enrichment fields (NON-BLOCKING)

**Classification:** NON-BLOCKING for write path; requires frontend work for read path

**Why (write path):** `signalSource`, `isLive`, `proofOfPresence`,
`liveSessionId`, `confidence`, `summary`, `liloClassification`,
`aiVerification`, `aiScore` can all be placed in `observation.metadata` by
the adapter. The canonical entity stores them opaquely. No entity change.

**Why (read path):** The feed, profile, and map pages currently read these
fields from the legacy `Report` serialiser. If `GET /api/v2/observations`
returns canonical `Observation.toJSON()` output, those fields will be absent
and the frontend report card components will break.

**What clears it:** The frontend cannot switch to the canonical read endpoint
until either (a) the canonical DTO is extended with these fields via an API
adapter layer, or (b) the frontend components are updated to not require them.
Neither requires an architectural decision — both are implementation choices.
This does not block Phase R (the read endpoint can be added without connecting
it to the frontend yet).

---

### Gap 7 — Media SHA-256 is URL-hash, not file-content hash (NON-BLOCKING)

**Classification:** NON-BLOCKING

**Why:** The current implementation already computes a deterministic hash from
the URL string. This is consistent across all observation submissions. It is
not a cryptographic content-integrity proof, but it is not wrong — it uniquely
identifies an evidence item by its storage URL. Upgrading to file-content
hashing requires the upload route to compute the hash before returning the URL,
which is an isolated change to `server/routes/upload.js`.

This does not block Phase W. It is a hardening improvement tracked separately.

---

### Classification summary

| Gap | Classification | Blocks Phase R? | Blocks Phase W? | Clears with |
|---|---|---|---|---|
| 1. Coordinates | **BLOCKING** | No | **Yes** | Geocoding adapter in HTTP layer |
| 2. Authorization | **REQUIRES DECISION** | No | **Yes** | Human approval of auth policy |
| 3. Dual data store | **REQUIRES DECISION** | No | **Yes** | Human approval of cutover strategy |
| 4. Enum mismatches | NON-BLOCKING | No | No | Normalisation function in adapter |
| 5. `images[]` vs `evidence[]` | NON-BLOCKING | No | No | Transformation in adapter |
| 6. Social/AI fields | NON-BLOCKING | No | No (write); frontend work for read | Metadata passthrough |
| 7. Media hash quality | NON-BLOCKING | No | No | Future hardening pass |

---

## 6. Proposed vertical-slice implementation sequence

This is a proposed sequence only. No phase may begin until its prerequisites
are approved. Human approval is required at the gate between Phase 0 and Phase 1.

---

### Phase 0 — Architecture decisions (current state)

**Status:** In progress  
**Prerequisites:** None  
**Goal:** Produce approved answers to Decisions A, B, C, D.

Decisions required before any implementation proceeds:

| Decision | Minimum required resolution | Blocks |
|---|---|---|
| A — Persistence | Choose Option A1 (ephemeral + disclaimer) or approve A2 (MongoDB adapter) | Phase 1 |
| B — Coordinates | Approve B2 (entity field) or accept B1 (status quo, document risk) | Phase 2 mission write payload design |
| C — Identity/auth | Confirm `reporter → automation` mapping acceptable or change it | Phase 2 authorization |
| D — Next slice | Confirm Phase 2 (Mission writes) before Phase 3/4 (Observation) | Sprint sequence |
| Engine 02 auth policy | Open/role-based/rate-limited for `SubmitObservation` | Phase 4 |
| Engine 02 dual-store strategy | Cutover/dual-write/read-model | Phase 4 |

**Files affected:** `docs/` only — no source changes in Phase 0.  
**Tests required:** None.  
**API boundary:** Unchanged.  
**Frontend impact:** None.

---

### Phase 1 — Canonical durable repository infrastructure

**Status:** NOT STARTED — blocked on Decision A  
**Prerequisites:** Decision A resolved as A2 (MongoDB adapter approved)

**Goal:** Implement `MongoMissionRepository` and `MongoAuditRepository` as
drop-in replacements for their in-memory counterparts. Wire them in
`server/canonical/engines.js` behind a configuration flag.

**Files likely affected:**

```
engines/11-mission/infrastructure/repositories/MongoMissionRepository.js  (NEW)
engines/23-audit/infrastructure/repositories/MongoAuditRepository.js      (NEW)
server/canonical/engines.js                                                 (MODIFIED — inject adapter based on env flag)
package.json                                                                (CHECK — mongoose already in server deps)
```

**Test strategy:**
- Extract a `missionRepositoryContract(createRepo)` factory from the existing
  `InMemoryMissionRepository` test coverage.
- Run the same contract tests against `MongoMissionRepository` using
  `mongodb-memory-server`.
- Integration test: verify Mission created via `MongoMissionRepository.save()`
  survives a simulated server restart (reconnect, `findById` returns the entity).
- Test that `new Mission(storedDoc)` succeeds for all fields (rehydration test).

**Estimated new test files:** 2 (`MongoMissionRepository.test.js`,
`MongoAuditRepository.test.js`)  
**Estimated new test count:** 12–18

**API boundary:** Unchanged — repository is an internal implementation detail.  
**Frontend impact:** None.  
**Migration/backward-compatibility:** No existing mission data to migrate.
`canonical_missions` collection is created fresh. Legacy `reports` collection
is untouched.

**Version concurrency decision:** If optimistic locking (`version` field) is
added to `Mission` entity, this is the phase to do it — before any write
endpoints are exposed. Requires entity change + test updates.

**IdempotencyManager durability:** Also addressed in this phase if approved.
A `MongoIdempotencyRepository` or MongoDB-backed `canonical_idempotency_keys`
collection prevents the duplicate-command-on-restart risk.

---

### Phase 2 — Engine 11 mission write integration

**Status:** NOT STARTED — blocked on Phase 1 + Decisions B and C  
**Prerequisites:** Phase 1 complete; Decision B resolved; Decision C (reporter mapping) confirmed

**Goal:** Expose `POST /api/v2/missions` backed by `CreateMission` command.
Optionally expose `POST /api/v2/missions/:id/activate` and other lifecycle
commands.

**Files likely affected:**

```
server/routes/v2/missions.js           (MODIFIED — add POST handler)
server/canonical/actorFromRequest.js   (MODIFIED — if reporter→automation mapping changes)
engines/11-mission/domain/entities/Mission.js            (MODIFIED — if B2 coordinates approved)
engines/11-mission/domain/value-objects/MissionCoordinates.js  (NEW — if B2 approved)
```

**Test strategy:**
- HTTP integration tests for `POST /api/v2/missions`: valid creation, 400 on
  missing fields, 401 on no auth, 403 on insufficient role, 409 on duplicate
  idempotency key, 503 on engine unavailable.
- Mission-lifecycle HTTP tests: activate, suspend, complete, abort.
- If coordinates added (B2): tests asserting coordinates appear in GET response
  and in the MissionMap component fixture.

**Estimated new HTTP integration tests:** 10–15

**API boundary:** New `POST /api/v2/missions` endpoint. Clients that previously
received 404 on this path will now receive 201 or 4xx.

**Frontend impact:**
- A new mission-creation form is required (new page or modal).
- `CommandCenter.jsx` already fetches and displays missions — no change needed
  for the list view.
- If Decision B2 is approved, `MissionMap.jsx` must update to read
  `mission.coordinates` instead of `mission.targetCriteria.coordinates`.

**Migration/backward-compatibility:**
- No legacy Mission data — no migration.
- The GET response shape does not change unless coordinates are added (B2).
  If B2 is approved, any client reading `targetCriteria.coordinates` will
  silently get `undefined` from the new field location.

---

### Phase 3 — Engine 02 observation read integration

**Status:** NOT STARTED — no hard blockers; low risk  
**Prerequisites:** None beyond adding Engine 02 to the composition root.
Does not require Decision A (no data is written; in-memory store returns `[]`).

**Goal:** Expose `GET /api/v2/observations` and `GET /api/v2/observations/:id`
backed by `ObservationEngine`. These endpoints return the (empty) in-memory
observation store until Phase 4 write integration is live.

**Files likely affected:**

```
server/routes/v2/observations.js      (NEW)
server/canonical/engines.js           (MODIFIED — add ObservationEngine instantiation)
server/index.js                       (MODIFIED — mount observations router)
src/services/api.js                   (MODIFIED — add OBSERVATIONS endpoint group)
```

**Test strategy:**
- HTTP integration tests mirroring the missions pattern: empty list, single
  observation by ID, 404 on unknown ID, 503 on engine unavailable.
- Estimated new HTTP integration tests: 6–8.

**API boundary:** New `GET /api/v2/observations` and `GET /api/v2/observations/:id`.
**Frontend impact:** None until the frontend is wired to these endpoints.
The endpoints are available but not consumed.

**Migration/backward-compatibility:** None. Legacy `GET /api/reports/feed`
is untouched. Canonical observations store starts empty.

---

### Phase 4 — Engine 02 observation write integration

**Status:** NOT STARTED — blocked on Phase 1, Gap 1 (coordinates), Gap 2 (auth decision), Gap 3 (dual-store decision)

**Prerequisites:**
- Phase 1 complete (durable `MongoObservationRepository`).
- Gap 1 cleared: geocoding adapter implemented.
- Gap 2 cleared: Engine 02 authorization policy decided and implemented.
- Gap 3 cleared: dual-store cutover strategy approved.
- Phase 3 complete (read endpoints live and tested).

**Goal:** Expose `POST /api/v2/observations` backed by `SubmitObservation`
command. Migrate `SubmitReport.jsx` to the new endpoint (or implement
dual-write according to the approved strategy).

**Files likely affected:**

```
server/routes/v2/observations.js                            (MODIFIED — add POST handler)
server/canonical/observationAdapter.js                      (NEW — geocoding + enum normalisation + evidence transformation)
engines/02-observation/application/services/ObservationApplicationService.js  (MODIFIED — add _assertAuthorized)
src/pages/SubmitReport.jsx                                  (MODIFIED — switch endpoint)
src/services/api.js                                         (MODIFIED — OBSERVATIONS.CREATE endpoint)
```

**Test strategy:**
- HTTP integration tests for full adapter path: valid submission, geocoding
  failure → 422, unknown category → 400, missing coordinates after geocoding
  → 422, duplicate idempotency key → 409, unauthorized → 401/403.
- Adapter unit tests: enum normalisation, evidence shape transformation.
- Frontend: verify `SubmitReport.jsx` still functions end-to-end after
  endpoint change (manual test or Playwright if configured).

**Estimated new HTTP integration tests:** 10–15  
**Estimated new adapter unit tests:** 6–8

**API boundary:** New `POST /api/v2/observations`. Legacy `POST /api/reports`
is deprecated (or removed per cutover strategy).

**Frontend impact:** `SubmitReport.jsx` changes submission target. The response
shape changes — the AI enrichment fields currently displayed in the right panel
will need to come from either the LILO analysis step (already done before the
command is built) or from `metadata` in the canonical response. This is the
largest frontend change in the entire sequence.

**Migration/backward-compatibility:** If cutover: old `POST /api/reports` is
deprecated. Existing reports in MongoDB `reports` collection are not touched.
New observations go into `canonical_observations` collection. The feed reads
must eventually migrate to the canonical read endpoint.

---

## 7. Decisions still requiring human approval

The following decisions have no approved resolution. No Phase 1 or later work
may begin without an approved answer to each relevant item.

| # | Decision | Options documented in | Required before |
|---|---|---|---|
| A | Persistence strategy | Decision A section | Phase 1 |
| B | Coordinates in Mission entity | Decision B section | Phase 2 payload design |
| C1 | Stale JWT role claim policy | Decision C section | Phase 2 auth |
| C2 | `reporter` → `automation` mapping | Decision C section | Phase 2 auth |
| C3 | Engine 01 identity migration | Decision C section | Long-term |
| D | Next vertical slice (Phase 2 vs Phase 3 first) | Decision D section | Sprint planning |
| E02-auth | Engine 02 authorization policy | Gap 2 above | Phase 4 |
| E02-store | Engine 02 dual-store strategy | Gap 3 above | Phase 4 |
| Concurrency | Optimistic locking for Mission writes | Phase 1 above | Phase 1 |
| Idempotency | Durable IdempotencyManager | Phase 1 above | Phase 1 or 2 |

---

## 8. Codebase readiness verdict

| Dimension | Status |
|---|---|
| Engine 11 domain logic | Ready |
| Engine 11 authorization | Ready — roles defined, `_assertAuthorized` implemented |
| Engine 11 persistence | **Not ready** — in-memory only |
| Engine 11 HTTP read routes | Ready — implemented, tested |
| Engine 11 HTTP write routes | **Blocked** — Decision A + B required |
| Engine 07 coordinate infrastructure | Ready — `GeoPoint`, `findNearby`, cluster detection all implemented |
| Engine 07 integration with Engine 11 | **Deferred** — not needed for Phase 2 |
| Engine 02 domain logic | Ready |
| Engine 02 authorization | **Not ready** — no role check; policy decision required |
| Engine 02 HTTP read routes | **Not started** — but no blockers for Phase 3 |
| Engine 02 HTTP write routes | **Blocked** — Gaps 1, 2, 3; Decision A required |
| Engine 23 audit delivery | Proved — 26 integration tests passing |
| Engine 23 audit persistence | **Not ready** — in-memory only; hash chain volatile |
| Canonical test suite | **458/458 passing** |

**Overall verdict:** The codebase is **implementation-ready at the domain layer** for both Engine 11 and Engine 02. It is **not ready for production write endpoints** due to in-memory persistence (Decision A) and the Engine 02 authorization gap (human policy decision). Phase 3 (Engine 02 read-only routes) can begin immediately with no architectural approvals. Phases 1, 2, and 4 all require Decision A to be approved first.


---

# Decision A — Persistence Strategy: Technical Decision Record

**Session date:** Decision A technical analysis session  
**Test suite at time of writing:** 458/458 — 0 failures  
**Status:** OPEN — requires human approval  
**Scope:** Analysis and decision framing only. No implementation.

---

## 1. Current state

Every canonical engine (`engines/11-mission`, `engines/02-observation`,
`engines/23-audit`, and 21 others) uses an `InMemory*Repository` backed by a
`Map` or equivalent in-process data structure. The composition root
(`server/canonical/engines.js`) constructs these repositories at module load
time. They have no connection to any external storage system.

The legacy Express server uses MongoDB via Mongoose for `User`, `Report`,
`Comment`, `MerchantLedger`, `PushSubscription`. There is no Mongoose model
for missions, observations (canonical), or audit records. The canonical layer
and the legacy layer share the same Node.js process but use entirely separate
storage mechanisms.

The `IdempotencyManager` stores execution state in an in-process `Map` with a
24-hour TTL. It has no persistence hook. The `EventBus` stores subscriber
registrations and event history in-process. The `AuditEngine` stores its
SHA-256 journal in a plain `Array`. All three are ephemeral by design.

---

## 2. Requirements

Before any canonical write endpoint is exposed to users, the persistence layer
must satisfy the following requirements. These are derived from the system's
stated purpose (environmental monitoring, mission coordination, compliance
audit) and from the failure modes identified by inspection.

**Functional requirements:**

- R1. Canonical entity state (missions, observations, audit entries) must not
  be silently discarded on server restart.
- R2. A command submitted with idempotency key K must not execute twice after a
  server restart, even if the client retries with the same K.
- R3. An audit entry must exist for every successfully persisted mutation.
  Silent audit gaps are not acceptable for a compliance journal.
- R4. Two concurrent commands against the same entity must not produce an
  undefined final state.
- R5. The repository interface must remain the same regardless of the backing
  store. Engine domain and application logic must not import MongoDB types.

**Non-functional requirements:**

- R6. Local development must remain runnable without production infrastructure.
- R7. The test suite must remain executable in CI without a live database.
- R8. Introducing durable persistence must not break the existing 458 tests.
- R9. The canonical layer must not depend on the legacy MongoDB connection for
  correctness. It may share the same MongoDB cluster but must use separate
  collections and must initialize independently.

---

## 3. Strategy A1 — Ephemeral in-memory canonical repositories

### Description

Continue using `InMemory*Repository` for all canonical engines. Accept that
all canonical entity state is lost on every server restart, deploy, or crash.
Declare write endpoints as ephemeral/development-only in both code and API
response headers.

### Analysis against requirements

| Req | Met? | Notes |
|---|---|---|
| R1 — state survives restart | **No** | All canonical state evaporates on restart. |
| R2 — idempotency survives restart | **No** | `IdempotencyManager` is also in-memory; same key executes again after restart. |
| R3 — audit completeness | Partial | AuditEngine captures all events within a process lifetime. Chain lost on restart. |
| R4 — concurrent safety | **No** | Two Node.js async operations can interleave, reading the same stale entity and both writing. No concurrency guard exists. |
| R5 — interface independence | Yes | Already satisfied. |
| R6 — local dev | **Yes** | No infrastructure required. |
| R7 — CI test | **Yes** | No infrastructure required. |
| R8 — no existing test breakage | **Yes** | Status quo. |
| R9 — canonical/legacy independence | **Yes** | No dependency today. |

**Data durability:** None. A user-created mission disappears on the next
`pm2 restart` or deploy. The audit journal provides zero compliance value
because the chain is unverifiable after restart.

**Restart behavior:** Process comes up with empty repositories. The audit
journal starts fresh. `IdempotencyManager` TTLs are reset. All previously
submitted idempotency keys are forgotten.

**Event/audit consistency:** Within a single process lifetime, audit captures
all events. Across restarts, there is no continuity. An audit query after
restart returns an empty journal regardless of what occurred before.

**Idempotency across restart:** Broken. A client that retried after a crash
would create a duplicate entity.

**Concurrent command behavior:** Undefined. Node.js single-threaded event loop
provides limited protection (two `await repository.save()` calls cannot
literally overlap in V8), but the load→modify→save pattern has a TOCTOU
window. Two commands reading the same mission snapshot before either saves will
both succeed, with the second overwriting the first.

**Transaction boundaries:** Not applicable. There is no transaction concept in
the in-memory store.

**Failure recovery:** None. Any error that prevents a save is a silent data
loss event.

**Migration complexity:** None — it is the current state.

**Testing complexity:** Lowest possible — no infrastructure.

**Local development experience:** Frictionless. No setup.

**Production suitability:** Not suitable for any user-facing write endpoint.
Acceptable for: local development, CI fixtures, ephemeral demo environments
where data loss is declared and expected. The frontend must show a visible
disclaimer if write endpoints are opened under this strategy.

**Legacy MongoDB compatibility:** Full — no interaction at all.

**Legacy/canonical data coexistence:** Safe — the two stores never interact.

**Operational complexity:** None.

---

## 4. Strategy A2 — Durable MongoDB-backed canonical repositories

### Description

Implement a `MongoMissionRepository`, `MongoObservationRepository`, and
`MongoAuditRepository` that satisfy the identical interface as their in-memory
counterparts. Wire them into `server/canonical/engines.js` via the existing
injection points. Use a configuration flag (e.g. `CANONICAL_PERSISTENCE=mongo`)
to select between in-memory and MongoDB at startup, keeping A1 available for
local development and CI without infrastructure.

### Analysis against requirements

| Req | Met? | Notes |
|---|---|---|
| R1 — state survives restart | **Yes** — with caveats on idempotency (R2) and concurrency (R4) | Entity state in MongoDB survives restarts. |
| R2 — idempotency survives restart | **Only if durable IdempotencyManager also implemented** | See §7 below. |
| R3 — audit completeness | **Yes** — with caveats on event delivery (§6) | Audit chain persisted in `canonical_audit_entries`. |
| R4 — concurrent safety | **Only if optimistic locking implemented** | See §8 below. |
| R5 — interface independence | **Yes** — adapter is the only MongoDB-aware file | Engine layer imports only the repository interface. |
| R6 — local dev | Yes — gated by `CANONICAL_PERSISTENCE` flag | In-memory adapter still available; MongoDB adapter skipped. |
| R7 — CI test | Yes — `mongodb-memory-server` package provides an in-process MongoDB instance for tests | No live cluster required in CI. |
| R8 — no existing test breakage | **Yes** — no existing test imports a repository directly | All tests construct engines via fixtures that pass `InMemoryRepository` explicitly. |
| R9 — canonical/legacy independence | **Yes** — separate collections, independent connection if needed | Can share the same Atlas cluster but must use `canonical_*` collection names. |

**Data durability:** Full — entity state, audit chain, and idempotency records
(if durable idempotency is also implemented) survive restart.

**Restart behavior:** Engines initialize by connecting to MongoDB. Existing
entity state is immediately queryable. Audit chain is reconstructed from stored
entries. The `IdempotencyManager` — unless also made durable — still starts
empty (see §7).

**Event/audit consistency:** The audit record is persisted by the `MongoAuditRepository.save()` call inside the AuditEngine's `recordEvent()` handler. However, the handler is called from inside `EventBus.publish()`, which catches all handler errors into dead letters. If the MongoDB write inside the handler fails, the error goes to `_deadLetters` — it is not re-thrown and the caller (`MissionApplicationService._handleCreateMission`) never sees it. The audit entry is silently absent. This is the **event/audit consistency gap** analyzed in §6.

**Idempotency across restart:** Broken unless the `IdempotencyManager` is also
made durable. See §7.

**Concurrent command behavior:** Improved but not safe without optimistic locking. See §8.

**Transaction boundaries:** Single-document writes (missions, observations,
individual audit entries) are atomic at the MongoDB document level. No
multi-document transactions are required if objectives remain embedded. If a
future schema change separates objectives into their own collection, transactions would be needed.

**Failure recovery:** A failed `repository.save()` throws to the application
service, which propagates it to the HTTP handler (500 response). The entity is
not persisted and no event is published. This is the safer failure direction.

**Repository abstraction compatibility:** Full. The adapter implements exactly
the same 9-method interface as `InMemoryMissionRepository`. The engine layer
requires no changes.

**Migration complexity:** Moderate. Three new adapter files plus test infrastructure. No data migration (no existing canonical entity data in MongoDB).

**Testing complexity:** Moderate. Requires `mongodb-memory-server` in the test dependency tree. Repository contract tests must be extracted into a shared factory.

**Local development experience:** Unchanged when `CANONICAL_PERSISTENCE=memory` (default). Requires a running MongoDB connection only when `CANONICAL_PERSISTENCE=mongo`.

**Production suitability:** Suitable for production writes once idempotency and concurrency gaps are also resolved.

**Legacy MongoDB compatibility:** Safe. Uses separate collection names (`canonical_missions`, `canonical_audit_entries`, `canonical_observations`, `canonical_idempotency_keys`). The legacy Mongoose connection at `server/index.js` calls `process.exit(1)` on failure — the canonical adapter must handle its own connection and not depend on the legacy connection's health.

**Legacy/canonical data coexistence:** Safe with explicit collection namespace separation. See §10.

**Operational complexity:** Requires `MONGODB_URI` in the canonical server environment (already present for legacy layer). Requires index creation on first startup or a migration script. Requires monitoring of `canonical_*` collections separately from `reports`/`users`.

---

## 5. Strategy A3 — Alternative durable persistence

Three alternative strategies were evaluated:

### A3a — PostgreSQL / relational database

The canonical `Mission` entity uses an embedded `objectives[]` array. Mapping
this to a normalized relational schema requires a `mission_objectives` table
with a foreign key to `missions`. Every `save()` call becomes a multi-statement
transaction (upsert mission + delete/upsert objectives). This is substantially
more complex than MongoDB's document model for this shape.

The existing legacy stack uses no PostgreSQL. Introducing it would add a second
database technology to the operational dependency list. There is no PostgreSQL
driver in the current dependencies.

**Assessment:** Does not provide meaningful advantages over MongoDB for this
entity shape. Introduces significantly higher implementation and operational
complexity. Not recommended.

### A3b — SQLite (file-based, zero infrastructure)

SQLite is file-based, requires no server, and provides ACID transactions.
It would satisfy R6 (local dev) and R7 (CI) without infrastructure. The
embedded `objectives[]` array faces the same normalization complexity as
PostgreSQL.

**Assessment:** SQLite is a reasonable choice for single-instance deployments.
However, EcoNet's Express server is deployed on a platform where the filesystem
may not be persistent (Netlify, some container environments). SQLite on
ephemeral filesystems provides no durability advantage over in-memory. For
a multi-instance deployment (load-balanced Express), SQLite would require
a shared filesystem mount (NFS or equivalent), which is complex operationally.
Not recommended for the primary persistence layer. Could be a viable development-only
supplement if the team explicitly avoids MongoDB locally.

### A3c — Event sourcing (append-only event store)

Rather than storing current entity state, store the ordered sequence of domain
events (e.g. `MissionCreated`, `MissionStatusChanged`) and reconstruct entity
state by replaying them. This directly aligns with the existing `DomainEvent`
contract and the AuditEngine's append-only journal model.

**Advantages:**
- The audit journal IS the source of truth — no synchronization gap between
  state store and audit store.
- Full history is preserved. Any past state can be reconstructed.
- The EventBus and AuditEngine already implement a form of this for the
  in-memory case.

**Disadvantages:**
- Querying current state (e.g. "list all ACTIVE missions") requires either a
  projection/read model or replaying all events at query time. This adds
  significant implementation complexity.
- The canonical `Mission` entity currently assumes snapshot-based persistence
  (it exposes `toJSON()` / constructor round-trip). Migrating to event-sourced
  reconstruction requires a new aggregate reconstitution layer.
- The existing repository interface (`findActive()`, `findByPriority()`) is
  query-oriented, not event-replay-oriented. Satisfying this interface from an
  event store requires a separate projection store (CQRS read model).
- No event store infrastructure exists in the codebase today.

**Assessment:** Architecturally correct for a compliance-heavy domain. The
audit-as-source-of-truth property eliminates the event/audit consistency gap
(§6). However, implementation scope is significantly larger than A2. Not
recommended as the first persistence implementation. Could be a long-term
target for the audit engine specifically (Engine 23 `MongoAuditRepository`
is inherently append-only and is effectively a light form of event sourcing).

---

## 6. Event publication consistency analysis

### Exact current sequence (traced from source)

```
1. HTTP handler calls missionEngine.executeCommand(command)
2. MissionApplicationService.execute(command)
3.   _assertAuthorized(cmd)                          — throws → 403-equivalent; no state change
4.   idempotencyManager.executeIdempotent(key, fn)
5.     fn():
6.       _assertGovernance(cmd)                       — throws → propagates; no state change
7.       _handleCreateMission(command)
8.         new Mission({...payload})                  — throws → propagates; no state change
9.         await repository.save(mission)             — [POINT A]
10.        await this._publish(event)                 — [POINT B]
11.          await this.eventBus.publish(event)
12.            records event to history
13.            calls each subscriber handler:
14.              auditEngine handler: recordEvent(event)
15.                new AuditJournalEntry(...)
16.                this._journal.push(entry)          — [POINT C]
17.            catches handler errors → _deadLetters  — [POINT D]
18.            returns { deliveredCount, errors }     — never throws
19.        returns { mission, missionChanged: true }
20.    idempotencyManager.complete(key, result)
21. HTTP handler returns 201
```

### Failure point analysis

**Failure at POINT A — `repository.save()` throws:**
- Entity is not persisted. No event published. Idempotency key marked FAILED.
- Client receives 500.
- System is consistent. A retry with the same key returns the FAILED cached
  error from the idempotency store (within 24 hours). After 24 hours, the key
  expires and the command executes again.
- **Risk:** After key expiry, client retry creates a duplicate. Acceptable
  for in-memory (no state anyway). Not acceptable with durable persistence
  unless idempotency is also durable (§7).

**Failure at POINT B — `eventBus.publish()` called but AuditEngine handler throws (POINT D):**
- `EventBus.publish()` catches the error and pushes to `_deadLetters`.
- `_publish()` returns normally (the `await` resolves).
- The application service returns success. The HTTP handler sends 201.
- The entity IS persisted (POINT A succeeded). The audit record IS NOT written.
- **Critical finding:** The mission is durable but unaudited. There is no
  notification, no retry, no observable failure. The only way to detect this
  is to call `eventBus.getDeadLetters()`.
- `_deadLetters` is also in-memory. After restart, dead letters are lost.
- **This is the most significant consistency gap.** With durable repositories
  but in-memory event delivery, audit completeness cannot be guaranteed.

**Failure at POINT B — process crashes after `repository.save()` but before `_publish()`:**
- The entity IS persisted (with A2). The event is never published. The audit
  journal has no record. `IdempotencyManager` key is in PENDING state at time
  of crash.
- On restart, `IdempotencyManager` is empty. The client retries with the same
  key.
- With in-memory idempotency: the command re-executes. `repository.save()` is
  an upsert (for A2, `findOneAndUpdate` with `upsert: true`). The same mission
  is written again (idempotent at the DB level if using `_id` as the key).
  A new `MissionCreated` event is published. The audit journal gets one entry.
  The entity now has two `MissionCreated` events in the EventBus history (one
  from before the crash, one from after), but the audit journal starts fresh
  on restart, so it only records the post-restart event.
- **Result:** The pre-crash mission exists in MongoDB. The audit journal does
  not record its creation. If no retry occurs, the mission is permanently
  unaudited. If a retry occurs, the mission gets a second audit entry with a
  newer `occurredAt` timestamp that does not match the actual creation time.

**Failure at POINT C — `_journal.push()` throws (theoretical):**
- In practice this cannot throw — `Array.push` in JavaScript does not throw
  under normal conditions. Relevant only if the audit journal were replaced
  with a `MongoAuditRepository` that could fail on insert.
- If `MongoAuditRepository.save()` throws inside the AuditEngine handler, the
  error is caught at POINT D and goes to dead letters. The outcome is identical
  to the scenario at POINT B above.

**Repeated command after a crash (in-memory idempotency):**
- See POINT B crash scenario above. The second execution succeeds. If `save()`
  is an upsert keyed on `missionId`, the entity is not duplicated (same data
  written again). But the audit trail records the second event, not the first.
  The original `createdAt` timestamp is lost if the client sends a new command
  without preserving it.

### Current consistency model

The architecture provides **at-most-once event delivery within a process
lifetime.** It provides **no delivery guarantee across process restarts.**
It provides **no audit completeness guarantee** even within a process lifetime
if a handler throws.

The current model is:
- **Save then publish** (not publish then save).
- **No compensation** if publish fails after save.
- **No correlation** between persisted entity and its audit record.
- **Dead letters are observable** (`eventBus.getDeadLetters()`) but not
  acted upon.

### What a stronger guarantee would require

**Exactly-once delivery** across restarts requires one of:

1. **Transactional outbox pattern:** Before returning from the application
   service, write both the entity AND an "outbox event record" to the same
   MongoDB transaction. A background worker reads the outbox, publishes events,
   and marks them delivered. If the process crashes between write and publish,
   the worker retries on restart. This introduces Engine 21 Automation as a
   dependency for the canonical write path.

2. **Change Data Capture (CDC):** Use MongoDB change streams or an equivalent
   to capture writes to `canonical_missions` and drive event publication
   reactively. High operational complexity; requires MongoDB replica set.

3. **Event sourcing (A3c):** Make the audit journal the source of truth.
   Saves and events are the same operation. No synchronization gap possible.

4. **Accept at-most-once with durable dead-letter storage:** Keep the current
   architecture but persist dead letters to a `canonical_dead_letters` MongoDB
   collection. Failed audit writes are recorded, observable, and can be
   replayed manually or by a background worker. Substantially lower
   implementation scope than an outbox.

Option 4 is the lowest-scope path to observable audit completeness. Option 1
is the correct enterprise pattern. Options 2 and 3 are high scope.

**None of these are implemented today. This is an open design decision.**

---

## 7. Idempotency analysis

### Current state (from source)

`IdempotencyManager`:
- Stores `{ status: PENDING|COMPLETED|FAILED, result, error, createdAt, expiresAt }` per key.
- State lives in a `Map` instance field. One `Map` per `IdempotencyManager` instance.
- The composition root creates one `canonicalIdempotencyManager` shared across all engines in the server process.
- **Lifecycle:** State is lost when the process terminates. The 24-hour TTL is
  cleaned lazily on each `acquire()` call. No background cleanup runs.
- **Behavior across restart:** All entries gone. Any in-progress PENDING key
  becomes permanently unresolved. Any COMPLETED key is forgotten. Client retries
  execute again.
- **Behavior across multiple server instances:** Not safe. Two instances share
  no idempotency state. A client load-balanced between two instances can
  execute the same command twice simultaneously. One instance's `acquire()`
  will throw "Concurrent execution in progress" — but only if the request hits
  the same instance. Across instances, both acquire() calls succeed (different
  Maps, no conflict detected).

### Can the current abstraction support durable idempotency?

Yes — the `IdempotencyManager` API (`acquire`, `complete`, `fail`,
`executeIdempotent`) is fully decoupled from the in-memory `Map`. A durable
implementation would replace the `Map` with a MongoDB collection
(`canonical_idempotency_keys`) while keeping the same method signatures. All
callers (`MissionApplicationService.execute()`, `ObservationApplicationService.execute()`,
etc.) use only the `executeIdempotent(key, fn)` wrapper — they never access
the internal store. The swap is purely in `IdempotencyManager`.

### Where does durable idempotency belong?

It belongs in the **infrastructure layer** — specifically inside
`IdempotencyManager` itself. It must not leak into:
- The domain entity (entities are pure, no infrastructure imports).
- The application service (services accept an injected manager via constructor).
- The repository (repositories own entity persistence, not command deduplication).

The HTTP route handler generates (or accepts) the idempotency key and passes
it as part of the command. The manager is the single source of truth for
whether a key has been seen.

### Proposed durable idempotency contract

A `MongoIdempotencyManager` (or a `MongoIdempotencyStore` backing the existing
`IdempotencyManager`) would satisfy the following interface, identical to the
current in-memory implementation:

```js
// Same constructor injection used in engines.js:
// const canonicalIdempotencyManager = new IdempotencyManager({ store: new MongoIdempotencyStore(db) });

interface IdempotencyStore {
  get(key: string): Promise<IdempotencyEntry | null>
  set(key: string, entry: IdempotencyEntry): Promise<void>
  delete(key: string): Promise<void>
}

interface IdempotencyEntry {
  status: 'PENDING' | 'COMPLETED' | 'FAILED'
  result: any | null
  error: string | null
  createdAt: number        // Unix ms
  expiresAt: number        // Unix ms
}
```

MongoDB document shape for `canonical_idempotency_keys`:

```js
{
  _id: String,            // === idempotency key (e.g. "11-mission:CreateMission:client-key-abc")
  status: String,         // 'PENDING' | 'COMPLETED' | 'FAILED'
  result: Mixed,          // serialised result (may be large for some commands)
  error: String | null,
  createdAt: Number,
  expiresAt: Number       // TTL index on this field — MongoDB handles expiry
}
```

**TTL index:** `{ expiresAt: 1 }` with `expireAfterSeconds: 0` — MongoDB will
automatically delete documents when `expiresAt` passes. This replaces the
lazy `_cleanupExpired()` logic.

**Atomic PENDING acquisition:** MongoDB's `findOneAndUpdate` with `upsert: true`
and a filter of `{ _id: key, status: { $exists: false } }` (or equivalent
conditional write) provides atomic acquisition — two concurrent requests cannot
both acquire the same key as PENDING. This is stronger than the current
in-memory implementation, which is only safe within a single V8 thread.

**Concurrency across multiple instances:** A MongoDB-backed idempotency store
is safe across multiple server instances because `findOneAndUpdate` with
`upsert: true` is an atomic server-side operation.

---

## 8. Concurrency analysis

### Current state

The `Mission` entity is immutable (frozen by `Object.freeze`). Mutations
return new `Mission` instances rather than modifying in-place. The
application service pattern is:

```
const current = await repository.findById(missionId);  // read snapshot
const transitioned = current.transitionTo(nextStatus);  // create new instance
await repository.save(transitioned);                    // write
```

This is a classic load–modify–save pattern with a TOCTOU window between
`findById` and `save`.

In the **in-memory adapter**, Node.js's single-threaded event loop means two
concurrent async command executions will not literally interleave the read and
write steps of a single synchronous block. However, the `await repository.save()`
and `await repository.findById()` yield to the event loop. Two concurrent
`ActivateMission` commands for the same mission can both call `findById` and
both see status `DRAFT`, both call `transitionTo(ACTIVE)`, and both succeed at
`save()` — the second save overwrites the first. The `IdempotencyManager`
prevents this if both commands use the same idempotency key. But two distinct
commands (e.g. `ActivateMission` with key A and `SuspendMission` with key B
arriving simultaneously for the same mission) have no mutual exclusion.

In the **MongoDB adapter**, the same TOCTOU window exists. MongoDB is not
queried with a conditional update — it is queried with `findOne` then `findOneAndUpdate`.
Two concurrent requests both read the same snapshot, one writes first, and the
second overwrites with a stale state.

### Impact assessment

For the current write endpoints (not yet implemented), the most dangerous
concurrent scenario is:

- `ActivateMission` and `AbortMission` arriving simultaneously for the same
  mission in DRAFT state.
- Both read DRAFT.
- `ActivateMission` writes ACTIVE.
- `AbortMission` reads stale DRAFT, calls `transitionTo(ABORTED)` — which is
  not a valid transition from DRAFT (`DRAFT → ACTIVE` only). The transition
  assertion **throws**, preventing the invalid state. ✓

However:
- `ActivateMission` and `SuspendMission` arriving simultaneously for a mission
  already in ACTIVE state.
- Both read ACTIVE.
- `ActivateMission` writes ACTIVE (idempotent — `current.status === nextStatus`
  path, returns early without saving). ✓
- `SuspendMission` writes SUSPENDED. ✓

The transition table is strict enough that most concurrent scenarios either
correctly reject an invalid transition or are naturally idempotent. The
dangerous case is two valid-transition commands arriving simultaneously — e.g.
two distinct actors both attempting `ActivateMission` and `SuspendMission`
racing. The last write wins. The final state is one of the two valid targets,
not a corrupted intermediate.

**Assessment:** The current architecture is not strictly concurrent-safe, but
the strict transition table limits the blast radius. The most common race
condition (`ActivateMission` called twice) is naturally idempotent.
The genuinely dangerous case — two different commands that would produce
different valid final states — is uncommon in the mission coordination domain.

### Optimistic concurrency — proposed approach

Adding a `version: number` field to the `Mission` entity is the smallest
change that establishes deterministic concurrency semantics:

```js
// In Mission entity constructor:
this.version = typeof version === 'number' ? version : 0;

// In Mission.#revision():
return new Mission({ ...this.toJSON(), version: this.version + 1, ... });

// In MongoMissionRepository.save():
const result = await MissionDocument.findOneAndUpdate(
  { _id: mission.missionId, version: mission.version - 1 },
  { $set: { ...doc } },
  { new: true }
);
if (!result) {
  throw new ConcurrentModificationError(`Mission "${mission.missionId}" was concurrently modified.`);
}
```

The HTTP handler catches `ConcurrentModificationError` and returns HTTP 409.
The client must retry with a fresh `GET` to obtain the current state.

**Where it belongs:** The `version` field belongs on the **canonical entity**
(it is part of the aggregate's concurrency contract, not an infrastructure
detail). The conditional update logic belongs in the **MongoDB adapter**
(the in-memory adapter does not need it — there is no concurrent multi-instance
scenario for an in-process store).

**Entity change required:** Yes — `version` field in `Mission` constructor,
`toJSON()`, and `#revision()`. This is a breaking change to the entity schema
that requires approval. All existing tests that construct `Mission` instances
will need to accept `version: 0` as an optional field with a default.

---

## 9. MongoDB boundary definition

If Strategy A2 is approved, the following defines the precise boundary.

### Collection names

| Data | Collection | Notes |
|---|---|---|
| Canonical missions | `canonical_missions` | Never `missions` |
| Canonical observations | `canonical_observations` | Never `observations` or `reports` |
| Canonical audit entries | `canonical_audit_entries` | Append-only; never update or delete |
| Canonical idempotency keys | `canonical_idempotency_keys` | TTL index on `expiresAt` |
| Canonical dead letters | `canonical_dead_letters` | Optional; append-only; for failed event deliveries |

### Document identity

The canonical `_id` field is the engine's own identifier string (e.g.
`msn_<uuid32>` for missions, `obs_<uuid32>` for observations,
`aud_<uuid32>` for audit entries). MongoDB `ObjectId` is never used for
canonical entities — the domain-generated ID is the primary key.

### Canonical → MongoDB mapping

The canonical entity's `toJSON()` output maps directly to the MongoDB document,
with the sole transformation of `missionId` → `_id`. No other field renaming.

### MongoDB → canonical mapping

`findById` and list methods call `.lean()` to get a plain JavaScript object,
then reconstruct the entity via `new Mission({ ...doc, missionId: doc._id })`.
The entity constructor validates all fields on reconstruction. If stored data
is corrupted or has unexpected fields, the constructor throws — this is
the correct behaviour (fail loudly, do not silently accept corrupted state).

### What the canonical repository must NOT know

The canonical repository adapter:
- Must not import `express`, `req`, or `res`.
- Must not import `actorFromRequest`.
- Must not access the legacy `User`, `Report`, or other Mongoose models.
- Must not use the legacy `mongoose.connection` directly — it must use its
  own `mongoose.model()` registration on the shared connection or a separate
  canonical connection.
- Must not call `EventBus.publish()` — event publication is the application
  service's responsibility.

### Transactions

Single-document operations on `canonical_missions` and `canonical_observations`
are atomic at the document level — no multi-document transactions required for
the current embedded-array schema. Transactions would be required only if:
- Objectives are moved to a separate `canonical_mission_objectives` collection.
- A write must atomically touch both `canonical_missions` and `canonical_idempotency_keys`.

For the outbox pattern, a transaction across `canonical_missions` +
`canonical_outbox` would be required. This needs MongoDB replica set mode
(transactions are not available on standalone instances). The existing Atlas
deployment already runs as a replica set.

### Audit repository special constraints

`canonical_audit_entries` must be treated as append-only:
- `save()` inserts a new document; it never updates or deletes.
- If an entry with the same `entryId` already exists, the insert must be a no-op
  (idempotent insert via `insertOne` with error code 11000 = duplicate key,
  caught and silently ignored).
- No `clear()` method should exist in the production adapter (only in test fixtures).
- The adapter must reconstruct the in-memory journal on startup to enable
  `verifyIntegrity()` across restarts. This requires loading all entries
  ordered by `sequenceNumber` at initialization.

---

## 10. Legacy data boundary

### Confirmed ownership mapping

| Data domain | Legacy owner | Canonical owner | Overlap / conflict |
|---|---|---|---|
| User profiles, authentication | MongoDB `users` collection, `server/routes/auth.js` | Engine 01 (not deployed) | No overlap today |
| Reports / observations | MongoDB `reports` collection, `server/routes/reports.js` | Engine 02 (not deployed) | **Active overlap if Engine 02 writes are enabled** |
| Missions | No MongoDB collection | Engine 11 (in-memory) | No overlap today; no legacy data to protect |
| Audit records | None | Engine 23 (in-memory) | No overlap today |
| Comments | MongoDB `comments` collection | None | No canonical equivalent |
| Rewards / merchant ledger | MongoDB `merchant_ledger` collection, client-side `economy.js` | Engine 15 (not deployed) | Overlap if Engine 15 writes enabled |

### Strategies for legacy/canonical coexistence

**A. Dedicated canonical collections (recommended for all engines):**

`canonical_missions`, `canonical_observations`, etc. never touch `reports`,
`users`, or other legacy collections. Queries from legacy routes continue to
hit legacy collections. Queries from canonical v2 routes hit canonical
collections. The two stores diverge over time until a cutover is executed.

This is the safe default. It is the strategy already implicit in the MongoDB
adapter spec (§9).

**B. Reuse legacy collections:**

Engine 02 observations stored in the same `reports` collection by adding a
`source: 'canonical'` discriminator field. Legacy routes filter for
`source: { $ne: 'canonical' }`. Canonical routes filter for
`source: 'canonical'`.

**Risk:** The legacy `Report` schema does not include `observationId`,
`evidence[]`, or canonical status fields. The Mongoose model would need schema
extensions. Any future legacy schema change affects the canonical layer.
Boundary enforcement becomes impossible to test mechanically.

**Not recommended.**

**C. Temporary read adapter for legacy data:**

Engine 02 canonical reads include a fallback: if no canonical observation
exists for an ID, attempt to load from the legacy `reports` collection and
transform it. This would allow the canonical `GET /api/v2/observations` to
serve both new canonical observations and legacy reports.

**Risk:** This couples the canonical repository to the legacy schema. Any
change to `Report` schema or serialization breaks the canonical read adapter.
Testing becomes complex (two code paths).

**Only acceptable as a short-term migration bridge, not as a permanent
architecture.**

**D. Dual-write:**

Every `POST /api/reports` (legacy) also writes a canonical `Observation` record.
Useful for migrating existing submission flows without requiring frontend changes.

**Risk:** Two writes in the same HTTP request. If the canonical write fails,
the legacy write has already succeeded. Rollback requires compensating
transactions. Dead-letter observation entries accumulate silently.

**Only acceptable if the canonical failure is treated as non-blocking (fire-and-forget)
and the primary store remains the legacy collection during the dual-write period.**

**E. Controlled cutover:**

Once the canonical write path (Phase 4) is tested and stable, the frontend
`SubmitReport.jsx` switches to `POST /api/v2/observations`. The legacy `POST /api/reports`
is kept alive for backward compatibility (older clients, mobile apps) but
deprecated. Legacy data in `reports` remains readable via legacy routes.

**This is the cleanest long-term strategy and the one recommended for Phase 4.**
It requires no dual-write logic, no read adapters for legacy data, and no
schema changes to the legacy models.

### Explicit ownership boundary statement

- The `reports` collection is owned by the legacy backend. Canonical engines
  must never write to it directly.
- The `canonical_*` collections are owned by the canonical engine layer. Legacy
  routes must never write to them directly.
- During the coexistence period, the two stores hold different data for the
  same domain (observations/reports). This is acceptable and expected. It
  becomes a problem only if the frontend is expected to aggregate them.
- A read aggregation layer (e.g. `GET /api/v2/observations` that merges
  canonical + legacy) is a separate decision not required for Phase 3.

---

## 11. Migration implications

### Mission (Engine 11)

No migration required. There is no existing mission data in MongoDB. The
`canonical_missions` collection is created fresh. On first startup with A2,
the collection is empty — identical to the current in-memory state on startup.

### Observation (Engine 02)

No migration of canonical data required. Existing `reports` data stays in
`reports`. New canonical observations go into `canonical_observations`.
A legacy-to-canonical data migration (copying old `reports` into `canonical_observations`)
is a separate, explicitly deferred task.

### Audit (Engine 23)

The in-memory journal cannot be exported to MongoDB because it is lost on
restart before any migration tooling could run. With A2, the `MongoAuditRepository`
starts with an empty collection. All pre-A2 audit history is permanently lost.
This is acceptable because the in-memory audit journal has never been considered
a compliance-grade record.

### Idempotency

The in-memory idempotency store cannot be migrated to MongoDB at switchover.
All in-flight or recently-completed idempotency keys are lost at the moment of
the upgrade deployment. Clients with in-flight retries may re-execute commands.
The safe deployment strategy is to deploy A2 during a low-traffic window and
accept a brief idempotency gap.

---

## 12. Required supporting infrastructure (if A2 is approved)

In addition to the three adapter files, the following supporting infrastructure
must be built before the first write endpoint is opened:

| Component | Priority | Notes |
|---|---|---|
| `MongoMissionRepository` | Required for Phase 2 | Implement + contract tests |
| `MongoObservationRepository` | Required for Phase 4 | Implement + contract tests |
| `MongoAuditRepository` | Required for compliance-grade audit | Startup journal load + append-only constraint |
| `MongoIdempotencyStore` / durable `IdempotencyManager` | Required for Phase 2 production safety | TTL index; atomic acquire |
| `canonical_dead_letters` collection + handler | Recommended | Makes silent audit failures observable |
| `version` field on `Mission` + concurrency guard | Required for multi-instance safety | Entity change + adapter conditional update |
| `mongodb-memory-server` in dev/test dependencies | Required for CI | Repository contract tests |
| `CANONICAL_PERSISTENCE` env flag | Required | Switches between in-memory (default) and MongoDB adapter |

---

## 13. Open questions

The following questions cannot be resolved by code inspection alone. They require human decisions or external validation.

| # | Question | Impact |
|---|---|---|
| Q1 | Is the current single-instance deployment sufficient, or is load-balancing planned? | Determines whether multi-instance idempotency safety is urgent. |
| Q2 | Is the existing Atlas MongoDB cluster accessible from the canonical server environment? | Determines whether the legacy connection can be shared. |
| Q3 | Is MongoDB Atlas on a replica set (required for transactions)? | Determines whether the outbox pattern is immediately available. |
| Q4 | What is the acceptable audit completeness SLA? Is a missed audit entry tolerable or must it trigger an alert? | Determines whether option 4 (durable dead letters) is sufficient or a full outbox is required. |
| Q5 | What is the expected mission write volume? | Determines whether optimistic locking retries are a practical concern. |
| Q6 | Will the Netlify deployment ever need canonical write support? | Determines whether a Netlify-compatible persistence adapter (e.g. SQLite, Netlify Blobs) is needed alongside MongoDB. |
| Q7 | Is there a requirement to query across legacy reports AND canonical observations in a single API call? | Determines whether a read aggregation layer is needed before Phase 3. |

---

## 14. Exact decisions requiring human approval

The following are the specific choices that require an explicit human decision.
The architecture record documents the tradeoffs. The architect must choose.

| ID | Decision | Options | Default if unanswered |
|---|---|---|---|
| A-1 | **Primary persistence strategy** | A1 ephemeral / A2 MongoDB / A3 alternative | A1 (status quo) — no write endpoints |
| A-2 | **Idempotency durability** | In-memory (current) / MongoDB-backed `canonical_idempotency_keys` | In-memory — production write endpoints unsafe across restarts |
| A-3 | **Concurrency model** | Accept last-write-wins (TOCTOU risk) / Add `version` field + conditional update (requires entity change) | Last-write-wins — transition table limits blast radius |
| A-4 | **Event/audit consistency level** | At-most-once (current) / At-most-once + durable dead letters / Transactional outbox | At-most-once — audit gaps undetectable |
| A-5 | **Legacy data coexistence** | Dedicated canonical collections (recommended) / Shared collections with discriminator / Read adapter / Dual-write / Cutover | Dedicated canonical collections |
| A-6 | **Audit journal restart recovery** | Accept empty journal on restart / Load from `canonical_audit_entries` on `initialize()` | Accept empty journal — compliance gap |
| A-7 | **Netlify canonical persistence** | Not supported (current) / Netlify Blobs adapter / No Netlify write endpoints | Not supported |

**None of these sub-decisions have a default that is safe for a user-facing
production write endpoint.** The combination of in-memory persistence,
in-memory idempotency, and at-most-once event delivery (all current defaults)
makes the system unsuitable for any write endpoint exposed to real users.


---

# Production Deployment and Persistence Topology

**Session date:** Production topology review  
**Test suite:** 458/458 — 0 failures  
**Scope:** Analysis and documentation only. No source code modified.

---

## 1. Current frontend deployment architecture

The frontend is a React 19 SPA built with Vite. The build produces a static
asset bundle in `dist/`. At runtime, it is a collection of HTML, CSS, and
JavaScript files that execute entirely in the browser. It has no server-side
runtime requirements of its own.

**Current deployment targets:**

| Target | Mechanism | Status |
|---|---|---|
| Netlify | `netlify.toml` build command (`npm run build`), publish dir `dist/` | Active — primary beta deployment |
| Docker (frontend container) | `Dockerfile` — nginx:alpine serving `dist/` on port 80 | Available — requires manual `docker-compose up` |
| Local development | `npm run dev` — Vite dev server on port 5173 | Active for development |

**Netlify routing (`netlify.toml`):**
- `/api/*` redirects to `/.netlify/functions/api/:splat` (status 200 — transparent proxy)
- `/*` redirects to `/index.html` (SPA client-side routing)
- Build: `npm run build`, Node 20.19.0
- Functions bundler: `esbuild`

**API URL selection (`src/services/runtimeConfig.js`):**
- On `localhost`/`127.0.0.1`: hardcodes `http://localhost:5000/api`
- When `VITE_API_URL` is set: uses that value
- Otherwise (Netlify deployment): falls back to `/.netlify/functions/api`
- `getV2ApiOrigin()` returns `null` for Netlify — canonical v2 routes are not available there

**Critical observation:** The frontend's production URL (`FRONTEND_URL` in
`.env.production`) is set to `https://your-domain.com` — a placeholder that
has never been replaced with a real domain. This means the CORS configuration
in `server/index.js` is using a placeholder value in production.

---

## 2. Current Express backend architecture

The Express server (`server/`) is a full Node.js application. It:
- Connects to MongoDB Atlas on startup (`process.exit(1)` if connection fails)
- Listens on `PORT` (default 5000)
- Serves `/api/*` routes for auth, reports, map, users, comments, etc.
- Serves `/api/v2/*` canonical mission routes
- Hosts WebSocket via Socket.io on the same port
- Runs the canonical engine layer (`server/canonical/engines.js`) as top-level
  await module initialization
- Serves file uploads from `server/uploads/` via static file serving

**Current deployment mechanism:**
- `ecosystem.config.cjs` — PM2 process manager, single instance, auto-restart
- `deploy-simple.sh` / `deploy-simple.ps1` — runs PM2 on the local machine
- `docker-compose.yml` — wraps both frontend and backend in containers
- Both deploy scripts target `localhost` — they are designed to run on
  **the developer's computer**

**The Express server cannot run on Netlify.** Netlify Functions are stateless
lambdas with a 10-second timeout and no persistent process. The Express server
requires a persistent process for:
- MongoDB connection (established at startup, reused across requests)
- Socket.io (persistent WebSocket connections)
- Canonical engine singletons (in-memory repositories, event bus subscriptions)
- File uploads (local filesystem at `server/uploads/`)
- PM2 process management

---

## 3. What currently runs on Netlify

**Runs on Netlify:**
- The compiled React SPA (static files in `dist/`)
- `netlify/functions/api.js` — a single serverless function handling:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `GET /api/auth/profile`
  - `GET /api/map/reports` (reads from Netlify Blobs)
  - `GET /api/reports/feed` (reads from Netlify Blobs)
  - `POST /api/reports` (writes to Netlify Blobs)
  - Other routes — handled inline in the function
- Netlify Blobs — a key-value blob store used as the persistence layer for
  the Netlify function (stores users, reports, map data)

**Does NOT run on Netlify:**
- The Express server (`server/index.js`)
- MongoDB (Atlas is external, but the Mongoose connection code lives in Express)
- Canonical engine layer (`server/canonical/engines.js`)
- Socket.io WebSocket server
- File upload processing (multer + local filesystem)
- Any `/api/v2/*` canonical routes

---

## 4. What cannot run on Netlify in its current form

| Component | Why it cannot run on Netlify |
|---|---|
| Express server (`server/index.js`) | Requires a persistent long-running process. Netlify Functions are stateless, ephemeral lambdas. |
| MongoDB Mongoose connection | Uses a persistent connection pool. Lambda functions cannot maintain persistent connections cost-effectively. |
| Socket.io | Requires a persistent WebSocket server. Netlify does not support persistent WebSocket connections in serverless functions. |
| Canonical engine singletons | Require in-process state across requests (in-memory repositories, event bus). Lambdas are stateless — each invocation is independent. |
| File upload with multer | Uses the local filesystem. Netlify's lambda execution environment has a read-only filesystem (except `/tmp`). |
| PM2 process management | Netlify manages function lifecycle, not the developer. PM2 is irrelevant in serverless. |

---

## 5. Where canonical engines execute

Currently: **exclusively inside the Express server process** (`server/`),
on whatever machine runs `node server/index.js`.

The canonical engines are instantiated in `server/canonical/engines.js` as
module-level singletons via top-level `await`. They execute in the same
Node.js process as the Express HTTP server. There is no mechanism to run
canonical engines independently of the Express server, on a separate host,
or as a distributed service.

**The canonical engines cannot run on Netlify.** They require a persistent
process and are initialized via top-level `await` at module load time.

---

## 6. What persistent state canonical engines require

| Engine | Data | Current storage | Survives restart? |
|---|---|---|---|
| Engine 11 Mission | Missions, objectives, lifecycle status | In-memory `Map` | No |
| Engine 23 Audit | SHA-256 journal entries | In-memory `Array` | No |
| Engine 02 Observation (not deployed) | Observations, evidence, status | In-memory `Map` | No |
| `IdempotencyManager` | Command deduplication keys | In-memory `Map` | No |
| `EventBus` | Subscriber registrations, event history | In-memory | No |

**All canonical state is ephemeral.** Every server restart begins with empty
repositories. There is no mechanism for canonical state to persist without
the server process remaining alive.

---

## 7. Current production hosting assumptions

The deployment scripts (`deploy-simple.sh`, `deploy-simple.ps1`,
`deploy.sh`, `deploy.ps1`) all assume:

1. **The developer's computer is the production server.** Both scripts
   target `localhost`. PM2 runs on the developer's machine. The frontend
   is served from `localhost:80`.

2. **MongoDB Atlas is an external always-on service.** The `.env.production`
   file contains a live Atlas connection string (`mongodb+srv://...`). This
   is the one component that does not depend on the developer's computer.

3. **File uploads are stored on the developer's computer's disk.** The Docker
   Compose configuration mounts `./server/uploads:/app/uploads`. Even in
   Docker mode, the volume is on the developer's machine.

4. **No CI/CD pipeline exists.** There is no configuration for GitHub Actions,
   CircleCI, Railway, Render, Fly.io, or any automated deployment trigger.
   Deployment requires the developer to manually run a script.

5. **The Docker Compose setup targets local orchestration.** It maps
   `localhost:80` and `localhost:5000` — not a remote server. The MongoDB
   service in `docker-compose.yml` is commented out, relying on the Atlas
   connection string from `.env.production`.

**Conclusion:** The current architecture requires the developer's computer to
be powered on and running for the production Express backend to be available.
Restarting the developer's computer stops production.

---

## 8. Current database assumptions

**Legacy (Express) backend:**
- MongoDB Atlas is used for all legacy persistent data (users, reports,
  comments, map data).
- Connection string in `.env.production`: `MONGODB_URI` pointing at
  `cluster0.2svodd4.mongodb.net` (Atlas cloud — always-on, independent of
  developer machine).
- Atlas is the one component that currently meets the requirement of being
  independently hosted and automatically available.

**Canonical engine layer:**
- No database. All in-memory.

**Netlify function:**
- Netlify Blobs — a proprietary Netlify-hosted key-value store. Available
  only within Netlify's serverless execution environment. Cannot be accessed
  from the Express server.

**Root `package.json` dependencies:**
- `pg` (8.20.0), `pg-hstore` (2.3.4), `sequelize` (6.37.8), `sqlite3` (6.0.1)
  are present as runtime dependencies but are unused in any current server
  code. These appear to be leftover dependencies from a previous or planned
  PostgreSQL/SQLite integration. They are not configured anywhere in the
  active server. **Their presence does not constitute a database choice** —
  they are dead dependencies.

---

## 9. Does the current architecture require the developer's computer to be online for production?

**Yes — for the Express backend and canonical engine layer.**

The Netlify deployment (frontend + Netlify function) runs independently of the
developer's computer. A user can log in, view the feed, and submit reports
via the Netlify path without the developer's machine being on.

However:
- The canonical v2 mission routes (`GET /api/v2/missions`) are **only**
  served by the Express server, which runs on the developer's computer.
- The `CommandCenter.jsx` mission map fetches from the Express server. If
  the developer's machine is off, this returns an error and the mission map
  is empty.
- Any feature that depends on the Express server (auth via JWT, reports with
  AI analysis, user profiles, socket.io events, file uploads) requires the
  developer's computer.
- The `FRONTEND_URL` CORS placeholder means CORS is misconfigured for any
  deployment where the frontend is not `https://your-domain.com`.

---

## 10. Does the current architecture require manual database activation?

**For MongoDB Atlas:** No. Atlas is a managed cloud service. It is always on,
requires no manual activation, and runs independently of the developer.

**For in-memory canonical repositories:** They are "activated" automatically
when the Express server starts. But since the Express server runs on the
developer's machine, they exist only when the developer runs it.

**For Netlify Blobs:** No. Blobs are managed by Netlify and available
automatically in the serverless function context.

**For file uploads:** The `server/uploads/` directory must exist on the
machine running the server. In Docker mode, it is a mounted volume. On bare
metal, it is a local directory. It is not a managed service.

---

## 11. How local development differs from production

| Aspect | Local development | Current "production" |
|---|---|---|
| Frontend | `npm run dev` — Vite HMR on `localhost:5173` | Netlify CDN OR nginx on `localhost:80` |
| Backend | `node server/index.js` or `npm run dev:server` | PM2 on `localhost:5000` (developer's machine) |
| Database | Atlas (same cluster as "production") | Atlas (same cluster) |
| Canonical engines | In-process with Express | In-process with Express |
| Uploads | `server/uploads/` local directory | `server/uploads/` local directory |
| Environment | `.env` | `.env.production` |
| API URL | `http://localhost:5000/api` | `http://localhost:5000/api` (same!) |
| Tests | `node tests/run-all.js` | Not run in "production" |
| Canonical state | Empty on each server start | Empty on each server start |

**The local development environment and the current "production" environment
are nearly identical** — both run on the developer's computer, both use the
same Atlas cluster, both use `localhost:5000` as the API URL. There is no
meaningful production/development separation today.

---

## 12. How frontend, backend, and database should communicate in production

The correct architecture for a production system that operates independently
of the developer's computer:

```
Browser
  → HTTPS
  → CDN / Static Hosting (frontend: HTML/CSS/JS)
       → HTTPS API calls
       → Hosted Backend Server (Node.js / Express)
            → TCP/TLS
            → Managed Database Service (MongoDB Atlas, PlanetScale, Supabase, etc.)
```

Each layer has a distinct hosting responsibility:

- **Frontend:** deployed to a CDN (Netlify, Vercel, Cloudflare Pages, S3+CloudFront).
  Static files, no runtime. Deployed by git push. Zero developer machine dependency.

- **Backend:** deployed to a persistent server runtime (Railway, Render, Fly.io,
  DigitalOcean App Platform, AWS Elastic Beanstalk, a VPS with PM2, etc.).
  Must run 24/7, auto-restart on crash, survive developer machine being off.

- **Database:** a managed cloud service (MongoDB Atlas, PlanetScale, Supabase,
  Neon, etc.). Always on, automatic backups, no manual activation.

The two gaps in the current architecture:
1. **No hosted backend.** The Express server has no deployed home other than
   the developer's machine.
2. **Canonical state has no persistence.** Even with a hosted backend, all
   canonical entity state is lost on restart.

---

## 13. Required production topology (vendor-independent)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Developer Machine                                                   │
│  ─ Kiro IDE                                                          │
│  ─ Source code (git)                                                 │
│  ─ Local dev server (localhost:5000 + localhost:5173)               │
│  ─ Local tests (node tests/run-all.js)                              │
└─────────────────────────────────────────────────────────────────────┘
            │ git push
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Deployment Pipeline                                                 │
│  ─ Triggered by git push (GitHub Actions, Netlify CI, Railway CI)   │
│  ─ Runs test suite (npm test)                                       │
│  ─ Builds frontend (npm run build → dist/)                          │
│  ─ Deploys frontend to static hosting                               │
│  ─ Deploys backend to persistent server hosting                     │
└─────────────────────────────────────────────────────────────────────┘
            │                            │
            ▼                            ▼
┌───────────────────────┐   ┌────────────────────────────────────────┐
│  Frontend Hosting     │   │  Backend Hosting                       │
│  ─ CDN/static host    │   │  ─ Persistent Node.js process          │
│  ─ Netlify / Vercel   │   │  ─ Railway / Render / Fly.io / VPS     │
│  ─ Auto-deployed      │   │  ─ Auto-deployed on push               │
│  ─ Zero downtime      │   │  ─ Auto-restart on crash               │
│  ─ Global CDN         │   │  ─ Environment variables injected      │
└───────────────────────┘   └────────────────────────────────────────┘
            │                            │
            │  HTTPS API calls           │  TCP/TLS
            └────────────────────────────┘
                                         │
                                         ▼
                        ┌────────────────────────────────┐
                        │  Managed Database              │
                        │  ─ MongoDB Atlas (existing)    │
                        │  ─ OR: another managed service │
                        │  ─ Always on, no activation    │
                        │  ─ Automatic backups           │
                        │  ─ Independent of developer    │
                        └────────────────────────────────┘
```

---

## 14. Persistence strategy: viable production approaches

These are evaluated against the requirements: persistent across restarts,
independently hosted, no manual activation, automatic availability,
backups/recovery, concurrency safety, canonical repository compatibility,
reasonable dev workflow, ability to scale.

### Approach P1 — Extend the existing MongoDB Atlas connection

**Description:** The Express server already connects to MongoDB Atlas via
Mongoose for legacy data. The canonical `MongoMissionRepository` and other
canonical adapters connect to the same Atlas cluster but use separate
`canonical_*` collections.

| Requirement | Met? | Notes |
|---|---|---|
| Persistent across restarts | Yes | Atlas is always on |
| Independently hosted | Yes | Atlas is a managed cloud service |
| No manual activation | Yes | Atlas requires no developer action to remain available |
| Automatic availability | Yes | Atlas has 99.995% uptime SLA |
| Backups / recovery | Yes | Atlas has automated backups and point-in-time recovery |
| Concurrency | Yes (with `version` field) | Requires optimistic locking decision |
| Canonical repository compatibility | Yes | Adapter implements same interface; no engine changes |
| Reasonable dev workflow | Yes | In-memory adapter used locally; Atlas adapter in production (env flag) |
| Ability to scale | Yes | Atlas scales vertically and horizontally |

**Additional advantages:**
- Zero new infrastructure. Atlas is already in use and already paid for.
- The existing `MONGODB_URI` in `.env.production` works immediately.
- The Mongoose driver is already in `server/package.json`.
- No new operational skills required.

**Additional risks:**
- The canonical layer uses the same MongoDB cluster as the legacy data. A
  cluster issue affects both systems simultaneously.
- The Atlas free tier has connection limits (500 connections). Running
  canonical + legacy Mongoose connections on the same cluster counts toward
  this limit.
- The Atlas connection string in `.env.production` contains the username and
  password in the URI. This credential is checked in to the repository in
  `.env.production`. **This is a security risk** — these credentials should
  be rotated and removed from the file.

### Approach P2 — Separate managed MongoDB cluster for canonical data

**Description:** Create a second Atlas cluster (or use a different MongoDB-compatible
provider like MongoDB Atlas free tier, Cosmos DB for MongoDB, etc.) exclusively
for canonical data. The legacy system remains on the existing Atlas cluster.

| Requirement | Met? | Notes |
|---|---|---|
| Same as P1 | Same | Same managed service properties |
| Isolation | Better | Canonical cluster failure does not affect legacy data |
| Cost | Higher | Two clusters vs one |
| Operational complexity | Higher | Two connection strings, two monitoring setups |

**Assessment:** The isolation benefit is real but not critical at the current
scale. Premature optimization. Not recommended until the single-cluster
approach (P1) shows resource constraints.

### Approach P3 — Alternative managed database (PostgreSQL, PlanetScale, Supabase, Neon)

**Description:** Use a managed relational database (PostgreSQL) or a
managed platform (Supabase, PlanetScale, Neon) instead of MongoDB for canonical
persistence.

| Requirement | Notes |
|---|---|
| Persistent across restarts | Yes — all managed services |
| Independently hosted | Yes |
| No manual activation | Yes |
| Canonical repository compatibility | Requires more complex adapter (embedded objectives array → joined table) |
| Reasonable dev workflow | Moderate — requires schema migrations |
| Cost | Comparable (free tiers available on Supabase/Neon/PlanetScale) |

**Key finding from source:** `package.json` already contains `pg`, `pg-hstore`,
`sequelize`, and `sqlite3` as dependencies. These are unused but their presence
suggests PostgreSQL/SQLite was previously considered. Their presence does not
constitute a commitment to PostgreSQL — they are dead dependencies.

**Assessment for canonical entities:** The `Mission` entity has an embedded
`objectives[]` array. Mapping this to PostgreSQL requires a separate
`mission_objectives` table with foreign keys. Every `save()` becomes a
multi-statement transaction (upsert mission + delete/upsert objectives).
This is substantially more complex than MongoDB's document model for this
entity shape. Not recommended as the primary canonical persistence store.

### Approach P4 — SQLite (file-based)

**Description:** Use SQLite stored on the server's filesystem as the canonical
persistence layer.

| Requirement | Met? | Notes |
|---|---|---|
| Persistent across restarts | Only if filesystem is persistent | Container restarts lose data if the volume is not mounted |
| Independently hosted | No | SQLite file lives on the server's disk |
| No manual activation | Yes — file is opened automatically | |
| Automatic availability | Only if server is running | |
| Backups | Manual or via separate backup service | |
| Concurrency | Limited — SQLite has write serialization | Single-writer constraint |
| Dev workflow | Simple — no infrastructure | |
| Scale | Limited — not suitable for multi-instance | |

`sqlite3` is already in `package.json` (unused). **Assessment:** Suitable
for single-instance development or staging. Not suitable for production due
to concurrency limitations and filesystem dependency. Could be used as an
alternative to the in-memory adapter in local development without requiring
an Atlas connection.

### Approach P5 — Netlify Blobs (for Netlify-only features)

**Description:** Use Netlify Blobs as the persistence layer for canonical
data, as it is currently used for the Netlify function's user/report data.

**Assessment:** Netlify Blobs is only accessible within Netlify's serverless
execution environment. The canonical engines run in the Express server, which
cannot access Netlify Blobs. This approach would require rewriting the entire
canonical engine layer as Netlify Functions. Not compatible with the existing
architecture. Not recommended.

---

## 15. Backend hosting requirements for independent production

For the Express server to run independently of the developer's computer, it
must be deployed to a host that provides:

| Requirement | Necessary because |
|---|---|
| Persistent Node.js process | Express server, Socket.io, and canonical engine singletons require a long-running process |
| Auto-restart on crash | `ecosystem.config.cjs` already configures this for PM2; the host must honor restarts |
| Environment variable injection | All secrets (`MONGODB_URI`, `JWT_SECRET`, etc.) must be set at the host level, not checked in |
| Persistent filesystem volume (optional) | Required only if file uploads (`server/uploads/`) must survive restarts; can be replaced with cloud storage |
| Outbound HTTPS | Required for MongoDB Atlas connection, GROQ API, OpenWeather API |
| Port exposure | Express listens on `PORT` (5000); the host must expose this to the frontend's API origin |
| Node.js 20.19.0+ | Per `package.json` `engines` field |

**Compatible hosting platforms (examples — not a vendor recommendation):**

| Platform type | Examples | Notes |
|---|---|---|
| Platform-as-a-Service | Railway, Render, Fly.io, Heroku | Deploy from git; auto-restart; env vars in dashboard; free tiers available |
| VPS with PM2 | DigitalOcean Droplet, Linode, Hetzner | Full control; `ecosystem.config.cjs` already configured for PM2 |
| Container hosting | AWS ECS, Google Cloud Run, Azure Container Instances | Uses existing `Dockerfile` and `docker-compose.yml` |
| Serverless (incompatible) | AWS Lambda, Netlify Functions, Vercel Serverless | Cannot host a persistent Express server |

---

## 16. Development workflow

### Current (partially functioning)

```
Kiro modifies code in IDE
  → manual: node tests/run-all.js        (local test)
  → manual: npm run dev                  (Vite dev server, localhost:5173)
  → manual: node server/index.js        (Express dev server, localhost:5000)
  → browser at localhost:5173
  → manual: npm run build               (Vite production build → dist/)
  → manual: run deploy script           (PM2 on developer's machine)
  → "production" at localhost:5000
```

**Problems:** Steps 3–7 require manual developer action. "Production" is the
developer's machine. No automated pipeline. No staging environment.

### Target workflow

```
Kiro modifies code
  → local: node tests/run-all.js              (automated pre-push)
  → local: npm run dev (Vite HMR)             (browser preview at localhost:5173)
  → local: node server/index.js              (Express local, in-memory canonical repos)
  → git commit && git push
  → CI/CD pipeline (automatic):
      → npm test (458/458 must pass)
      → npm run build
      → deploy dist/ to CDN (frontend)
      → deploy server/ to backend host
  → live EcoNet at https://econet.app
      → frontend on CDN (Netlify / Vercel / Cloudflare)
      → backend on persistent host (Railway / Render / Fly.io)
      → canonical engines on backend host
      → MongoDB Atlas (existing, always on)
```

### Environment distinctions

| Environment | Purpose | Frontend | Backend | Database | Canonical repos |
|---|---|---|---|---|---|
| **Local development** | Code and test | `localhost:5173` (Vite) | `localhost:5000` (Express) | Atlas (shared cluster) | In-memory (ephemeral) |
| **Staging/preview** (optional) | Pre-production validation | CDN deploy of PR branch | Hosted backend (separate instance) | Atlas test cluster | In-memory OR Mongo with test data |
| **Production** | Live users | CDN (auto-deployed on merge to main) | Hosted backend (auto-deployed) | Atlas production cluster | MongoDB adapter (durable) |

**Local development deliberately uses in-memory canonical repos.** No
database setup is required to run the development server. The MongoDB adapter
is activated only in production (and optionally staging) via the
`CANONICAL_PERSISTENCE=mongo` environment flag.

---

## 17. The developer-machine dependency: root cause and resolution

**Root cause:** The `deploy-simple.sh` and `deploy-simple.ps1` scripts run
`pm2 start ecosystem.config.js` on the current machine. The `docker-compose.yml`
maps `localhost` ports. There is no configuration that points to a remote host.

**What MongoDB Atlas already proves:** A managed external service can be
"always on" without the developer's machine. Atlas has been running independently
of the developer's computer for the lifetime of the project. The same pattern
must be applied to the Express backend.

**Resolution:** Deploy the Express server to any persistent hosted environment.
The `ecosystem.config.cjs` PM2 configuration is already production-ready —
it only needs to run on a remote host instead of `localhost`. The `Dockerfile`
and `docker-compose.yml` support containerized deployment to any container
host. No code changes are required to make this work — only the deployment
target must change.

**One-time setup required:**
1. Choose a backend hosting provider.
2. Set environment variables on the host (MONGODB_URI, JWT_SECRET, GROQ_API_KEY, etc.).
3. Rotate the Atlas credentials that are currently checked in to `.env.production`.
4. Set up a git-triggered deployment pipeline.
5. Update `VITE_API_URL` on the frontend to point at the hosted backend URL.
6. Update `FRONTEND_URL` in the backend env vars to the real frontend domain (not the placeholder `https://your-domain.com`).

**No architectural changes to the codebase are required.** The code is ready.
The infrastructure is not.

---

## 18. Security note: credentials in `.env.production`

`.env.production` contains live production credentials committed to the
repository: MongoDB Atlas connection string, JWT secret, GROQ API key,
OpenWeather API key, email credentials, and VAPID keys.

**These credentials should be:**
1. Removed from `.env.production` and added to `.gitignore` if not already.
2. Rotated (new values generated) since they have been in the repository.
3. Stored in the hosting platform's secret/environment variable management
   (Railway/Render/Netlify dashboard, AWS Secrets Manager, etc.).

This is outside the scope of the current architecture review but is a
**security prerequisite before any public production deployment**.

---

## 19. Decisions requiring human approval

| ID | Decision | Context |
|---|---|---|
| P-1 | **Backend hosting platform** | Where should the Express server run independently of the developer's machine? (Railway / Render / Fly.io / VPS / other) |
| P-2 | **Canonical persistence on the backend host** | A2 (MongoDB Atlas, existing cluster) is the path of least resistance. Confirmed viable. Requires Decision A-1 approval. |
| P-3 | **Frontend deployment target** | Netlify (current beta) continue as primary? Or migrate all frontend to a different CDN? |
| P-4 | **File upload storage** | Local `server/uploads/` is not suitable for a hosted backend (not persistent across deploys). Cloud storage (S3, Cloudinary, Cloudflare R2) required for production file uploads. |
| P-5 | **Staging environment** | Is a staging environment required before production deployment? |
| P-6 | **Credential rotation** | Atlas credentials, JWT secret, GROQ key, and email credentials in `.env.production` must be rotated before public exposure. |
| P-7 | **Netlify function future** | Continue maintaining the Netlify function as a parallel auth/data path, or deprecate it once the hosted backend is live? |
| P-8 | **Custom domain** | The `FRONTEND_URL` placeholder `https://your-domain.com` must be replaced with a real domain before CORS functions correctly in production. |


---

# Phase 1D — Event and Audit Durability: Implementation Gap Record

**Date:** Phase 1 implementation session  
**Status:** GAP DOCUMENTED — not yet resolved  
**Scope:** Analysis only. No transactional outbox was implemented in Phase 1.

---

## What was inspected

The complete event publication sequence from command execution to audit journal:

1. `MissionApplicationService._handleCreateMission()` calls `repository.save(mission)` then `this._publish(event)`.
2. `_publish()` calls `this.eventBus.publish(event)`.
3. `EventBus.publish()` delivers to all subscribers. Handler errors are caught into `_deadLetters` and **never re-thrown**. `publish()` always resolves.
4. `AuditEngine.recordEvent(event)` is the wildcard subscriber. It calls `this._journal.push(entry)`.

## What Phase 1 changed

Phase 1 added `MongoMissionRepository` with durable persistence. Missions now survive restarts.

Phase 1 did **not** change the EventBus, `_publish()`, or AuditEngine. The event/audit pipeline is **unchanged**.

## The gap that remains

With durable missions but an in-memory audit journal:

| Scenario | Outcome |
|---|---|
| `repository.save()` succeeds → process crashes before `_publish()` | Mission durable. **Event never published. Audit entry never created. No recovery.** |
| `_publish()` called → AuditEngine handler throws | Error goes to `_deadLetters` (in-memory). Mission durable. **Audit entry silently absent.** |
| Normal operation | Mission durable. Audit entry in-memory. **Audit chain lost on next restart.** |

Phase 1 increased the severity of the gap: missions now survive restarts but the audit chain does not. A mission can exist in `canonical_missions` with no corresponding audit record, and there is no mechanism to detect or recover this.

## Why a transactional outbox was not implemented in Phase 1

Three conditions must all be true before an outbox is safe to implement:

1. **MongoDB adapter implemented** — ✓ done in Phase 1A.
2. **MongoDB replica set available** — Atlas replica set is available. But implementation of the outbox requires read/write to a `canonical_outbox` collection inside the same MongoDB transaction as the mission write.
3. **Architecture decision on audit completeness level** — Decision A-4 is still OPEN (at-most-once vs durable dead letters vs full outbox). Implementing an outbox without this decision creates a permanent infrastructure commitment that the architect has not approved.

**Implementing an outbox that "falsely claims durability" was explicitly prohibited** by the task spec. The gap is therefore documented rather than papered over.

## What the remaining gap means in practice

- All Phase 1 canonical mutations (when they are eventually exposed via write endpoints) will be durable.
- The audit journal records events in-memory for the lifetime of the process.
- A server restart resets the audit chain. A restarted server cannot prove what happened before the restart.
- For the current development/staging phase (no write endpoints exposed to users yet), this is acceptable.
- For any compliance-grade production deployment, Decision A-4 must be resolved and the outbox or durable-dead-letter path must be implemented before write endpoints are opened.

## Decision A-4 options (unchanged from prior analysis)

| Option | Scope | Completeness |
|---|---|---|
| At-most-once + durable dead letters | Low | Gaps observable, recoverable manually |
| Transactional outbox (`canonical_outbox` collection + background worker via Engine 21) | Medium | Exactly-once within a transaction |
| Event sourcing (A3c — audit journal IS the source of truth) | High | No synchronization gap possible |

**Human decision required before implementation.**

## Explicit statement

> Phase 1 canonical persistence (missions + idempotency) is durable.  
> Phase 1 audit persistence is **NOT** durable.  
> The architecture does not falsely claim audit completeness.  
> Decision A-4 must be approved before the outbox is implemented.


---

# Lilo Identity Constraint

**This section is binding for all future implementation work.**

Full Lilo architectural documentation: `docs/integration/LILO-IDENTITY-AND-ARCHITECTURE.md`

## Summary

Lilo is EcoNet.io's embedded personal AI, copilot, and autopilot. It is a
product identity, not a technical component name. Any canonical engine that
provides AI, dialogue, classification, or agent capabilities serves Lilo's
infrastructure — it does not replace Lilo.

## Implications for decisions in this document

### Decision D2 — Engine 02 Observation integration

The Engine 02 write path currently bridges from `SubmitReport.jsx` through
Lilo's classification pipeline (`postIntelligence.js` → `liloClassification`).
The `liloClassification` field on the MongoDB `Report` model is the persistent
record of Lilo's signal-routing decision. When Engine 02 write integration is
implemented:

- The `liloClassification` data must be preserved in the canonical
  `Observation` entity's `metadata` field during the transition.
- The Groq `/analyze-report` step (Lilo's AI reasoning) continues to execute
  before the canonical `SubmitObservation` command is built.
- The canonical entity stores Lilo's output; it does not replace Lilo's role.

### Decision D1 — Engine 11 Mission creation

No Lilo classification or AI pipeline is currently wired to mission creation.
This decision does not affect Lilo.

### Decisions L-1 through L-5

Five Lilo-specific decisions require human approval before any canonical engine
is connected to Lilo's user-facing capabilities. See `LILO-IDENTITY-AND-ARCHITECTURE.md`
§10 for the full list.

## Hard rule

> Any proposed change that removes Lilo's identity, user-facing presence,
> architectural ownership, or AI functionality from EcoNet.io must STOP and
> be surfaced for explicit architectural approval.
