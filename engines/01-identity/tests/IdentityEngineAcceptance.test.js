import test from 'node:test';
import assert from 'node:assert/strict';

import { Command } from '../../../contracts/commands/Command.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import { AuditEngine } from '../../23-audit/index.js';

import {
  IdentityEngine,
  InMemoryIdentityRepository,
  Role,
  IdentityStatus
} from '../index.js';

const expiry = '2030-01-01T00:00:00.000Z';

const command = (commandType, payload, suffix, actor = null) => new Command({
  commandType,
  targetEngine: '01-identity',
  payload,
  actor,
  idempotencyKey: `acc-${suffix}`,
  correlationId: `cor-acc-${suffix}`
});

const createHarnessFixture = async () => {
  const repository = new InMemoryIdentityRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const auditEngine = new AuditEngine(eventBus);

  // Initialize Audit Engine to subscribe to all events on the shared EventBus
  await auditEngine.initialize();

  const engine = new IdentityEngine({
    repository,
    eventBus,
    idempotencyManager,
    clock: () => new Date('2029-01-01T00:00:00.000Z')
  });

  return { engine, repository, eventBus, auditEngine, idempotencyManager };
};

test('Engine 01 End-to-End Acceptance Scenario (11-step complete lifecycle & audit handoff)', async () => {
  const { engine, repository, eventBus, auditEngine } = await createHarnessFixture();
  const observableLog = [];

  // Seed domain roles in Engine 01
  await repository.saveRole(new Role({
    roleId: 'role-ranger',
    name: 'Field Ranger',
    permissions: ['observation.submit', 'resource.read']
  }));
  await repository.saveRole(new Role({
    roleId: 'role-admin',
    name: 'Administrator',
    permissions: [
      'identity.roles.assign',
      'identity.permissions.manage',
      'identity.sessions.revoke',
      'identity.sessions.revoke.any',
      'resource.read',
      'resource.write'
    ]
  }));

  // =========================================================================
  // STEP 1: Create Identity
  // =========================================================================
  const createCmd = command('CreateIdentity', {
    email: 'ranger.amara@econet.ng',
    displayName: 'Amara Okonkwo',
    password: 'SecurePassphrase#2029'
  }, 'step1-create');

  const createRes = await engine.executeCommand(createCmd);
  assert.ok(createRes.identity);
  assert.match(createRes.identity.identityId, /^idn_[0-9a-f]{32}$/);
  assert.equal(createRes.identity.status, IdentityStatus.ACTIVE);
  const identityId = createRes.identity.identityId;
  observableLog.push({ step: '1. IDENTITY CREATED', status: 'PASS', details: `identityId: ${identityId}` });

  // Assign role-ranger to Amara
  await repository.assignRole(identityId, 'role-ranger');

  // =========================================================================
  // STEP 2: Authenticate with Valid Credentials
  // =========================================================================
  const authRes = await engine.authenticate({
    email: 'ranger.amara@econet.ng',
    password: 'SecurePassphrase#2029',
    correlationId: 'cor-login-step2'
  });
  assert.equal(authRes.identity.identityId, identityId);
  // Ensure credentials are never exposed
  assert.equal(authRes.identity.password, undefined);
  assert.equal(authRes.identity.passwordHash, undefined);
  observableLog.push({ step: '2. AUTHENTICATION', status: 'PASS', details: 'Valid credentials verified via scrypt' });

  // =========================================================================
  // STEP 3: Create Authenticated Session
  // =========================================================================
  const sessionCmd = command('CreateSession', {
    identityId,
    expiresAt: expiry
  }, 'step3-session');

  const sessionRes = await engine.executeCommand(sessionCmd);
  assert.ok(sessionRes.session);
  assert.ok(sessionRes.token);
  assert.match(sessionRes.session.sessionId, /^ses_[0-9a-f]{32}$/);
  const sessionToken = sessionRes.token;
  const sessionId = sessionRes.session.sessionId;
  observableLog.push({ step: '3. SESSION CREATED', status: 'PASS', details: `sessionId: ${sessionId}` });

  // =========================================================================
  // STEP 4: Access an Authorized Resource
  // =========================================================================
  const authzRead = await engine.authorize({
    sessionToken,
    permission: 'resource.read',
    correlationId: 'cor-authz-read'
  });
  assert.equal(authzRead.allowed, true);
  assert.equal(authzRead.identity.identityId, identityId);
  assert.ok(authzRead.permissions.includes('resource.read'));
  observableLog.push({ step: '4. AUTHORIZED ACCESS', status: 'PASS', details: 'Permission granted: resource.read' });

  // =========================================================================
  // STEP 5 & 6: Attempt Access to Unauthorized Resource & Verify Denial
  // =========================================================================
  const authzAdmin = await engine.authorize({
    sessionToken,
    permission: 'governance.policy.override',
    correlationId: 'cor-authz-unauthorized'
  });
  assert.equal(authzAdmin.allowed, false);
  assert.equal(authzAdmin.reason, 'MISSING_PERMISSION');
  observableLog.push({ step: '5. UNAUTHORIZED ACCESS', status: 'DENIED', details: 'governance.policy.override missing' });
  observableLog.push({ step: '6. ACCESS DENIAL VERIFIED', status: 'PASS', details: 'Denied with reason: MISSING_PERMISSION' });

  // =========================================================================
  // STEP 7: Revoke the Session
  // =========================================================================
  // Create an admin identity to perform revocation
  const adminRes = await engine.executeCommand(command('CreateIdentity', {
    email: 'admin.super@econet.ng',
    password: 'AdminSuperPassword#2029'
  }, 'step7-admin-create'));
  await repository.assignRole(adminRes.identity.identityId, 'role-admin');
  const adminSessionRes = await engine.executeCommand(command('CreateSession', {
    identityId: adminRes.identity.identityId,
    expiresAt: expiry
  }, 'step7-admin-session'));

  const revokeCmd = command('RevokeSession', {
    actorSessionToken: adminSessionRes.token,
    sessionId
  }, 'step7-revoke');

  const revokeRes = await engine.executeCommand(revokeCmd);
  assert.equal(revokeRes.session.status, 'REVOKED');
  observableLog.push({ step: '7. SESSION REVOCATION', status: 'PASS', details: `sessionId: ${sessionId} revoked` });

  // =========================================================================
  // STEP 8 & 9: Attempt Access Using Revoked Session & Verify Denial
  // =========================================================================
  const authzRevoked = await engine.authorize({
    sessionToken,
    permission: 'resource.read',
    correlationId: 'cor-authz-revoked'
  });
  assert.equal(authzRevoked.allowed, false);
  assert.equal(authzRevoked.reason, 'INVALID_OR_REVOKED_SESSION');
  observableLog.push({ step: '8. REVOKED ACCESS ATTEMPT', status: 'DENIED', details: 'Revoked session rejected' });
  observableLog.push({ step: '9. REVOCATION ENFORCED', status: 'PASS', details: 'Reason: INVALID_OR_REVOKED_SESSION' });

  // =========================================================================
  // STEP 10: Verify Appropriate Security & Lifecycle Events
  // =========================================================================
  const events = eventBus.getHistory();
  const eventTypes = events.map(e => e.eventType);

  assert.ok(eventTypes.includes('identity.created'), 'Must emit identity.created');
  assert.ok(eventTypes.includes('identity.activated'), 'Must emit identity.activated');
  assert.ok(eventTypes.includes('authentication.succeeded'), 'Must emit authentication.succeeded');
  assert.ok(eventTypes.includes('session.created'), 'Must emit session.created');
  assert.ok(eventTypes.includes('authorization.denied'), 'Must emit authorization.denied');
  assert.ok(eventTypes.includes('session.revoked'), 'Must emit session.revoked');

  // All events conform to canonical DomainEvent contract
  for (const ev of events) {
    assert.match(ev.eventId, /^evt_[0-9a-f]{32}$/);
    assert.equal(ev.producer, 'engine.01.identity');
    assert.equal(ev.metadata.provenance, 'engine.01.identity');
  }
  observableLog.push({ step: '10. SECURITY EVENTS', status: 'PASS', details: `${events.length} canonical DomainEvents verified` });

  // =========================================================================
  // STEP 11: Verify Audit Boundary (Engine 23 Tamper-Evident Handoff)
  // =========================================================================
  const auditVerification = auditEngine.verifyIntegrity();
  assert.equal(auditVerification.verified, true, 'AuditEngine hash chain must verify');
  assert.equal(auditVerification.totalEntries, events.length, 'AuditEngine must have journaled all events');

  observableLog.push({ step: '11. AUDIT BOUNDARY HANDOFF', status: 'PASS', details: `Engine 23 SHA-256 chain verified (${auditVerification.totalEntries} entries)` });

  // Output observable acceptance table
  console.log('\n============================================================');
  console.log('ENGINE 01 — IDENTITY ACCEPTANCE VERIFICATION HARNESS');
  console.log('============================================================');
  for (const item of observableLog) {
    const paddedStep = item.step.padEnd(28, ' ');
    const paddedStatus = item.status.padEnd(8, ' ');
    console.log(`${paddedStep} ${paddedStatus} | ${item.details}`);
  }
  console.log('============================================================\n');
});

test('Engine 01 Negative Paths & Security Boundaries', async () => {
  const { engine, repository } = await createHarnessFixture();

  // 1. Duplicate identity creation with different idempotency key
  await engine.executeCommand(command('CreateIdentity', {
    email: 'unique@econet.ng',
    password: 'Password123#'
  }, 'neg-unique-1'));

  await assert.rejects(
    engine.executeCommand(command('CreateIdentity', {
      email: 'unique@econet.ng',
      password: 'DifferentPassword123#'
    }, 'neg-unique-2')),
    /already exists/
  );

  // 2. Duplicate command with same idempotency key returns identical cached result
  const originalCmd = command('CreateIdentity', {
    email: 'idem@econet.ng',
    password: 'Password123#'
  }, 'neg-idem');
  const first = await engine.executeCommand(originalCmd);
  const replay = await engine.executeCommand(originalCmd);
  assert.equal(replay.identity.identityId, first.identity.identityId);

  // 3. Invalid credentials reject authentication
  await assert.rejects(
    engine.authenticate({ email: 'unique@econet.ng', password: 'WrongPassword#' }),
    /Authentication failed/
  );

  // 4. Nonexistent identity rejects authentication
  await assert.rejects(
    engine.authenticate({ email: 'ghost@econet.ng', password: 'Password123#' }),
    /Authentication failed/
  );

  // 5. Inactive/Suspended identity cannot create session
  const suspendedUser = await engine.executeCommand(command('CreateIdentity', {
    email: 'suspendme@econet.ng',
    password: 'Password123#'
  }, 'neg-suspend-user'));
  await engine.executeCommand(command('SuspendIdentity', {
    identityId: suspendedUser.identity.identityId
  }, 'neg-suspend-action'));

  await assert.rejects(
    engine.executeCommand(command('CreateSession', {
      identityId: suspendedUser.identity.identityId,
      expiresAt: expiry
    }, 'neg-suspend-session')),
    /inactive identity/
  );

  // 6. Invalid session token rejects authorization
  const badTokenAuthz = await engine.authorize({
    sessionToken: 'nonexistent-token-xyz',
    permission: 'resource.read'
  });
  assert.equal(badTokenAuthz.allowed, false);
  assert.equal(badTokenAuthz.reason, 'INVALID_OR_REVOKED_SESSION');

  // 7. Attempted privilege escalation: caller cannot pass fake roles/permissions in authorize
  const plainUser = await engine.executeCommand(command('CreateIdentity', {
    email: 'plain@econet.ng',
    password: 'Password123#'
  }, 'neg-plain-user'));
  const plainSession = await engine.executeCommand(command('CreateSession', {
    identityId: plainUser.identity.identityId,
    expiresAt: expiry
  }, 'neg-plain-session'));

  // Passing fabricated permissions in request is ignored: authorization checks server-side repository
  const fakeClaimAuthz = await engine.authorize({
    sessionToken: plainSession.token,
    permission: 'admin.super.delete',
    fakeRoles: ['admin', 'superadmin']
  });
  assert.equal(fakeClaimAuthz.allowed, false);
  assert.equal(fakeClaimAuthz.reason, 'MISSING_PERMISSION');

  // 8. Invalid lifecycle transition rejects
  await assert.rejects(
    engine.executeCommand(command('ActivateIdentity', {
      identityId: plainUser.identity.identityId
    }, 'neg-invalid-transition')),
    /Invalid identity lifecycle transition/
  );

  // 9. Malformed input rejects (e.g. invalid email or short password)
  await assert.rejects(
    engine.executeCommand(command('CreateIdentity', {
      email: 'not-an-email',
      password: 'Password123#'
    }, 'neg-bad-email')),
    /valid email/
  );

  await assert.rejects(
    engine.executeCommand(command('CreateIdentity', {
      email: 'valid@econet.ng',
      password: 'short'
    }, 'neg-short-pass')),
    /at least 8 characters/
  );
});
