# Engine 01 — Identity

## Canonical ownership

Identity owns identity lifecycle, password credentials, sessions, roles,
permissions, service identities, authentication, authorization, and the identity
security events emitted through the shared `DomainEvent` contract. It does not
own reputation, rewards, communities, observations, missions, AI decisions, or
Governance policy.

## Public engine boundary

The engine exposes application methods through `IdentityEngine`: `executeCommand`,
`authenticate`, and `authorize`. No HTTP endpoint is added: the legacy HTTP auth
routes remain separate until an approved migration contract exists.

## Persistence boundary

`InMemoryIdentityRepository` is an isolated Engine 01 adapter used for the
canonical acceptance flow and tests. It owns identities, credentials, sessions,
roles, and role assignments, and does not access the legacy mixed-purpose Mongo
`User` model. Durable Engine 01 storage and its migration are an architectural
gap because no approved persistent schema was supplied.

## Events and audit boundary

The engine emits the canonical identity and authentication event types using the
shared Event Bus. Engine 23 may consume them through that public event boundary;
Engine 01 does not import or write Audit Engine internals.

## Assumptions

- `email` and a password credential are retained as the human identity sign-in
  fields because the existing compatibility surface uses them.
- A newly created identity is activated in the same command so the mandated
  create → authenticate acceptance path is possible. Both lifecycle events emit.
- Session expiry is explicit input to `CreateSession`; no retention period is
  silently invented.
- Roles are supplied through repository configuration. The engine does not create
  a hidden bootstrap administrator or default privileged role.
