# Engine 16 — Community Engine

## Canonical mission (from Canon)

From `architecture/engine-registry/CanonicalEngineRegistry.js`, Engine 16 is `Community Engine`, slug `16-community`, layer `INTERACTION`, with the canonical description:

> "Social graph connections, peer interactions, comments, social feeds, and community groups."

## Canonical ownership

Community owns community records and metadata, community lifecycle, community visibility, membership relationships, community-scoped roles, community participation records (where defined), community domain events, and community-related public queries.

Community does **not** own or duplicate: authentication/identity (Engine 01), observations (Engine 02), knowledge/intelligence (03–05), geospatial/temporal (07–08), risk/prediction (09–10), missions (11), action execution (12), verification (13), reputation/trust (14), rewards (15), governance policy (22), audit journal (23), or learning (24).

## Public engine boundary

The engine exposes `CommunityEngine` with:

- **Lifecycle:** `initialize()`, `healthCheck()`, `shutdown()`
- **Command execution:** `executeCommand(command)`
- **Queries:** `getCommunity`, `listCommunities`, `getMembership`, `getMembershipByCommunityAndActor`, `listCommunityMembers`, `listMembershipsForActor`, `countMemberships`

## Commands (owned by this engine)

All mutating commands require an authenticated actor and an `idempotencyKey`.

- `CreateCommunity` — create a community; the actor must hold an authorized creator role (`system`, `admin`, `community_manager`, `automation`). The creator becomes an ACTIVE OWNER membership.
- `UpdateCommunity` — update name/description/visibility; requires an ACTIVE member with a managing role in that community.
- `ChangeCommunityStatus` — transition ACTIVE/SUSPENDED/ARCHIVED/CLOSED; requires a managing role.
- `RequestMembership` — create a PENDING membership (or re-request after REJECTED/LEFT/REMOVED); duplicate PENDING/ACTIVE/SUSPENDED requests are idempotent.
- `ApproveMembership` / `RejectMembership` — requires a managing role; only PENDING memberships may be approved/rejected.

## Domain model (owned by this engine)

- `Community` aggregate: identity, profile (name/description), visibility, lifecycle, owner reference, timestamps.
- `CommunityMembership` aggregate: relationship between a community and an identity reference, with community-scoped role and lifecycle.
- `CommunityVisibility`: `PUBLIC`, `PRIVATE`.
- `CommunityStatus`: `ACTIVE`, `SUSPENDED`, `ARCHIVED`, `CLOSED` (strict transitions).
- `MembershipStatus`: `PENDING`, `ACTIVE`, `REJECTED`, `SUSPENDED`, `LEFT`, `REMOVED` (strict transitions).
- `CommunityRole`: `OWNER`, `ADMIN`, `MODERATOR`, `MEMBER` (community-scoped only).

## Lifecycle behavior

- Suspended/Archived/Closed communities reject membership mutations (`RequestMembership`, approvals, etc.) but permit reads.
- `CLOSED` is terminal.
- Membership records are preserved (never deleted) to maintain history; no privacy-policy erasure semantics are implemented.

## Membership and role behavior

- Membership is a first-class relationship, not a user-ID list; a member cannot have conflicting active memberships in one community.
- Roles are community-scoped. A moderator in one community has no authority in another community or at system level.
- `Membership ≠ verification eligibility ≠ reward eligibility`. Membership grants no verification or reputation/reward authority.
- Removed/suspended members lose member-level participation rights.

## Visibility and privacy

- `PUBLIC` communities are discoverable via `listCommunities`; `PRIVATE` communities are stored with visibility `PRIVATE` and only exposed to authorized callers through membership-aware queries.
- Queries do not expose private membership data beyond the actor's own memberships (self-service) or community-admin member lists.
- No sensitive identity data is placed in domain-event payloads beyond actor/community references.

## Authorization model

- Authenticated actor required for every mutating command.
- Community-scoped authorization: management operations require an ACTIVE membership with `MODERATOR`+ role; role assignment requires `ADMIN`+.
- Caller-supplied claims are never treated as trusted authorization state; only role membership in the configured allowlist (for creation) or community membership (for management) grants authority.
- Cross-community privilege escalation is blocked (membership is community-scoped).

## Idempotency

- Command-level: shared `IdempotencyManager` keyed on `{engine}:{commandType}:{idempotencyKey}`.
- Domain-level: duplicate membership requests (PENDING/ACTIVE/SUSPENDED) return the existing record; conflicting active memberships cannot be created.

- `LeaveCommunity` — self-service departure from an ACTIVE membership.
- `RemoveMember` / `SuspendMember` / `RestoreMembership` — requires a managing role.
- `AssignCommunityRole` — assign ADMIN/MODERATOR to an ACTIVE membership; requires an ADMIN/OWNER. Ownership cannot be reassigned through this command.

## Queries (owned by this engine)

- `getCommunity(communityId)`
- `listCommunities({ visibility?, status? })`
- `getMembership(membershipId)`
- `getMembershipByCommunityAndActor(communityId, actorId)`
- `listCommunityMembers(communityId, { includeInactive? })`
- `listMembershipsForActor(actorId)`
- `countMemberships(communityId)`

- **Service/repository access:** `service` and `repository` getters
## Events published by this engine

- `econet.community.created`
- `econet.community.updated`
- `econet.community.status_changed`
- `econet.community.membership_requested`
- `econet.community.membership_approved`
- `econet.community.membership_rejected`
- `econet.community.member_left`
- `econet.community.member_removed`
- `econet.community.member_suspended`
- `econet.community.membership_restored`
- `econet.community.role_changed`

All events use producer `engine.16.community` and the canonical `DomainEvent` envelope; Engine 23 consumes them via the Event Bus (no private audit system).

## Governance

- When a governance adapter is supplied, `evaluatePolicy({ engine, commandType, actor, payload })` is evaluated before every mutating command; a denial produces no state change and no domain event.
- With `governance = null`, governance evaluation is skipped (documented limitation; production policy composition is expected).

## Audit relationship

- Engine 16 publishes canonical events only; it does not import Engine 23 internals and does not maintain its own journal.

## Cross-engine dependencies

- **Established contracts:** shared `Command`, `DomainEvent`, `EventBus`, `IdempotencyManager`, Governance port, canonical registry.
- **None imported privately:** no other engine's internal files are imported.
- **Identity references** (`actorId`) are treated as opaque identity references consistent with the repository's actor conventions; Engine 16 does not validate or manage identity lifecycle.
- **Future integration points (not implemented):** Community→Mission association, Community→Participation records driven by other engines, invitations, comments/social feeds (no existing contract).

## Persistence

`InMemoryCommunityRepository` is an isolated Engine 16 adapter owning communities, memberships (indexed by community+actor), and membership lists. It does not read or write legacy `User`/`Report`/other models.

## Security considerations

- No fabricated authentication or authorization.
- No fabrication of community-scoped privileges.
- No escalation from community roles to system roles.
- No delegation of verification/rewards/reputation authority to community admins.

## Limitations

- Invitations are not implemented (no canonical invitation contract found).
- Community→Mission/Activity association is not implemented (no public contract exists).

## Explicitly unimplemented / unspecified areas

- Comments, social feeds, and peer-interaction graphs (no contract in repository).
- Organization-type membership (only identity-aware membership with community-scoped roles).
- Invite/accept flows.
- Community participation metrics from cross-engine events.

## Test commands and results

- `node --test engines/16-community/tests/CommunityEngine.test.js` → 16 pass / 0 fail (at time of writing)
- `node --test tests/architecture/*.test.js` → 13 pass / 0 fail
- `node -e "...BoundaryEnforcer('engines')..."` → 0 violations
- `node tests/run-all.js` → full suite green

## Deviations from canonical

None. The registry mission ("social graph connections, peer interactions, comments, social feeds, and community groups") is honored within the implemented community/membership scope; the non-implemented facets (comments, feeds, peer interactions) are documented as unspecified future scope rather than fabricated.

- Participation records driven by other engines are not implemented (no approved cross-engine trigger).
- Durable storage is not yet specified (in-memory adapter used, consistent with other completed engines).
- Privacy-policy erasure of memberships is not implemented.
