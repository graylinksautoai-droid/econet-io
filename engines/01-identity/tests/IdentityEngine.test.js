import test from 'node:test';
import assert from 'node:assert/strict';

import { Command } from '../../../contracts/commands/Command.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import { IdentityEngine, InMemoryIdentityRepository, Role } from '../index.js';
import { Identity } from '../domain/entities/Identity.js';
import { IdentityStatus } from '../domain/value-objects/IdentityStatus.js';

const expiry = '2030-01-01T00:00:00.000Z';

const command = (commandType, payload, suffix, actor = null) => new Command({
  commandType,
  targetEngine: '01-identity',
  payload,
  actor,
  idempotencyKey: `test-${suffix}`,
  correlationId: `cor-${suffix}`
});

const createFixture = () => {
  const repository = new InMemoryIdentityRepository();
  const eventBus = new EventBus();
  const engine = new IdentityEngine({
    repository,
    eventBus,
    idempotencyManager: new IdempotencyManager(),
    clock: () => new Date('2029-01-01T00:00:00.000Z')
  });
  return { engine, repository, eventBus };
};

async function createIdentity(engine, email, suffix, displayName = 'Test Actor') {
  return engine.executeCommand(command('CreateIdentity', {
    email,
    displayName,
    password: 'correct-horse-battery-staple'
  }, suffix));
}

test('identity lifecycle rejects invalid transitions and activates a created human identity', async () => {
  const { engine, eventBus } = createFixture();
  const created = await createIdentity(engine, 'person@example.test', 'identity-create');

  assert.equal(created.identity.status, IdentityStatus.ACTIVE);
  await assert.rejects(
    engine.executeCommand(command('ActivateIdentity', { identityId: created.identity.identityId }, 'identity-reactivate')),
    /Invalid identity lifecycle transition/
  );
  assert.deepEqual(eventBus.getHistory().map(event => event.eventType), [
    'identity.created',
    'identity.activated'
  ]);
});

test('identity creation is idempotent, prevents duplicate state, and protects password material', async () => {
  const { engine, eventBus } = createFixture();
  const firstCommand = command('CreateIdentity', {
    email: 'duplicate@example.test',
    password: 'correct-horse-battery-staple'
  }, 'duplicate-key');
  const first = await engine.executeCommand(firstCommand);
  const replay = await engine.executeCommand(firstCommand);

  assert.equal(replay.identity.identityId, first.identity.identityId);
  await assert.rejects(
    createIdentity(engine, 'duplicate@example.test', 'different-key'),
    /already exists/
  );
  assert.ok(eventBus.getHistory().every(event => !JSON.stringify(event.payload).includes('correct-horse')));
});

test('authentication, session authorization, denial, revocation, and audit event flow work end-to-end', async () => {
  const { engine, repository, eventBus } = createFixture();
  const admin = await createIdentity(engine, 'admin@example.test', 'admin-create');
  const member = await createIdentity(engine, 'member@example.test', 'member-create');
  await repository.saveRole(new Role({
    roleId: 'role-admin',
    name: 'Identity administrator',
    permissions: ['identity.roles.assign', 'identity.permissions.manage', 'identity.sessions.revoke', 'identity.sessions.revoke.any']
  }));
  await repository.saveRole(new Role({
    roleId: 'role-reader',
    name: 'Protected resource reader',
    permissions: ['resource.read']
  }));
  await repository.assignRole(admin.identity.identityId, 'role-admin');

  const authentication = await engine.authenticate({
    email: 'admin@example.test',
    password: 'correct-horse-battery-staple',
    correlationId: 'cor-login'
  });
  assert.equal(authentication.identity.identityId, admin.identity.identityId);
  const adminSession = await engine.executeCommand(command('CreateSession', {
    identityId: admin.identity.identityId,
    expiresAt: expiry
  }, 'admin-session'));

  await assert.rejects(
    engine.executeCommand(command('AssignRole', {
      actorSessionToken: 'invalid-session',
      identityId: member.identity.identityId,
      roleId: 'role-reader'
    }, 'assign-denied')),
    /Authorization denied/
  );
  await engine.executeCommand(command('AssignRole', {
    actorSessionToken: adminSession.token,
    identityId: member.identity.identityId,
    roleId: 'role-reader'
  }, 'assign-member-role'));

  const memberSession = await engine.executeCommand(command('CreateSession', {
    identityId: member.identity.identityId,
    expiresAt: expiry
  }, 'member-session'));
  assert.equal((await engine.authorize({ sessionToken: memberSession.token, permission: 'resource.read' })).allowed, true);
  assert.equal((await engine.authorize({ sessionToken: memberSession.token, permission: 'resource.write' })).allowed, false);

  await engine.executeCommand(command('RevokeSession', {
    actorSessionToken: adminSession.token,
    sessionId: memberSession.session.sessionId
  }, 'revoke-member-session'));
  assert.equal((await engine.authorize({ sessionToken: memberSession.token, permission: 'resource.read' })).allowed, false);
  assert.ok(eventBus.getHistory().some(event => event.eventType === 'session.revoked'));
  assert.ok(eventBus.getHistory().every(event => event.metadata.provenance === 'engine.01.identity'));
});

test('failed authentication, inactive identities, and service identities do not gain access', async () => {
  const { engine } = createFixture();
  const human = await createIdentity(engine, 'inactive@example.test', 'inactive-create');
  await assert.rejects(
    engine.authenticate({ email: 'inactive@example.test', password: 'wrong-password' }),
    /Authentication failed/
  );
  await engine.executeCommand(command('SuspendIdentity', { identityId: human.identity.identityId }, 'suspend-human'));
  await assert.rejects(
    engine.executeCommand(command('CreateSession', { identityId: human.identity.identityId, expiresAt: expiry }, 'suspended-session')),
    /inactive identity/
  );

  const service = await engine.executeCommand(command('CreateServiceIdentity', {
    email: 'worker@example.test',
    displayName: 'Worker'
  }, 'service-create'));
  const serviceSession = await engine.executeCommand(command('CreateSession', {
    identityId: service.identity.identityId,
    expiresAt: expiry
  }, 'service-session'));
  assert.equal((await engine.authorize({ sessionToken: serviceSession.token, permission: 'resource.read' })).allowed, false);
});

test('governance port can deny a command without embedding Governance Engine policy in Identity', async () => {
  const repository = new InMemoryIdentityRepository();
  const engine = new IdentityEngine({
    repository,
    eventBus: new EventBus(),
    idempotencyManager: new IdempotencyManager(),
    governance: { async evaluateCompliance() { return { compliant: false }; } }
  });

  await assert.rejects(
    createIdentity(engine, 'blocked@example.test', 'governance-denial'),
    /Governance denied/
  );
  assert.equal(await repository.findIdentityByEmail('blocked@example.test'), null);
});

test('credential persistence failures do not leave a partial identity record', async () => {
  class FailingCredentialRepository extends InMemoryIdentityRepository {
    async saveCredential() { throw new Error('credential store unavailable'); }
  }
  const repository = new FailingCredentialRepository();
  const engine = new IdentityEngine({
    repository,
    eventBus: new EventBus(),
    idempotencyManager: new IdempotencyManager()
  });

  await assert.rejects(createIdentity(engine, 'failure@example.test', 'persistence-failure'), /credential store unavailable/);
  assert.equal(await repository.findIdentityByEmail('failure@example.test'), null);
});

test('Identity domain entity protects the canonical state machine directly', () => {
  const identity = new Identity({ email: 'state@example.test' });
  assert.throws(() => identity.transitionTo(IdentityStatus.SUSPENDED), /Invalid identity lifecycle transition/);
  assert.equal(identity.transitionTo(IdentityStatus.ACTIVE).status, IdentityStatus.ACTIVE);
});
