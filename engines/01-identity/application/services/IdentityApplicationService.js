import { Command } from '../../../../contracts/commands/Command.js';
import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import { globalEventBus } from '../../../../infrastructure/messaging/EventBus.js';
import { globalIdempotencyManager } from '../../../../infrastructure/idempotency/IdempotencyManager.js';
import { Credential } from '../../domain/entities/Credential.js';
import { Identity, IdentityType } from '../../domain/entities/Identity.js';
import { Session } from '../../domain/entities/Session.js';
import { Role } from '../../domain/entities/Role.js';
import { IdentityStatus, isActiveIdentityStatus } from '../../domain/value-objects/IdentityStatus.js';
import { InMemoryIdentityRepository } from '../../infrastructure/repositories/InMemoryIdentityRepository.js';

const ENGINE_SLUG = '01-identity';
const PRODUCER = 'engine.01.identity';

const MUTATING_COMMANDS = new Set([
  'CreateIdentity',
  'CreateServiceIdentity',
  'ActivateIdentity',
  'SuspendIdentity',
  'DeactivateIdentity',
  'AnonymizeIdentity',
  'CreateSession',
  'RevokeSession',
  'AssignRole',
  'RevokeRole',
  'GrantPermission',
  'RevokePermission'
]);

export class IdentityApplicationService {
  constructor({
    repository = new InMemoryIdentityRepository(),
    eventBus = globalEventBus,
    idempotencyManager = globalIdempotencyManager,
    governance = null,
    clock = () => new Date()
  } = {}) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.idempotencyManager = idempotencyManager;
    this.governance = governance;
    this.clock = clock;
  }

  async execute(command) {
    const cmd = command instanceof Command ? command : new Command(command);
    if (cmd.targetEngine !== ENGINE_SLUG || !MUTATING_COMMANDS.has(cmd.commandType)) {
      throw new Error(`Unsupported Identity command: "${cmd.commandType}".`);
    }
    if (!cmd.idempotencyKey) {
      throw new Error(`Identity command "${cmd.commandType}" requires an idempotencyKey.`);
    }

    return this.idempotencyManager.executeIdempotent(
      `${ENGINE_SLUG}:${cmd.commandType}:${cmd.idempotencyKey}`,
      async () => {
        await this._assertGovernance(cmd);
        return this._dispatch(cmd);
      }
    );
  }

  async authenticate({ email, password, correlationId = null }) {
    const identity = await this.repository.findIdentityByEmail(email);
    const credential = identity && await this.repository.findCredentialByIdentityId(identity.identityId);
    const authenticated = identity && credential && isActiveIdentityStatus(identity.status) &&
      await credential.verify(password);

    if (!authenticated) {
      await this._emit('authentication.failed', {
        reason: 'INVALID_CREDENTIALS_OR_INACTIVE_IDENTITY'
      }, { correlationId });
      throw new Error('Authentication failed.');
    }

    await this._emit('authentication.succeeded', {
      identityId: identity.identityId,
      identityType: identity.type
    }, {
      actor: { actorId: identity.identityId, actorType: identity.type },
      subject: { entityId: identity.identityId, entityType: 'identity' },
      correlationId
    });
    return { identity: identity.toJSON() };
  }

  async authorize({ sessionToken, permission, correlationId = null }) {
    if (typeof permission !== 'string' || permission.trim() === '') {
      throw new Error('Authorization requires a permission.');
    }
    const session = await this.repository.findSessionByToken(sessionToken);
    if (!session || !session.isUsable(this.clock())) {
      await this._emit('authorization.denied', {
        reason: 'INVALID_OR_REVOKED_SESSION',
        permission
      }, { correlationId });
      return { allowed: false, reason: 'INVALID_OR_REVOKED_SESSION' };
    }
    const identity = await this.repository.findIdentityById(session.identityId);
    if (!identity || !isActiveIdentityStatus(identity.status)) {
      await this._emit('authorization.denied', {
        reason: 'INACTIVE_IDENTITY',
        identityId: session.identityId,
        permission
      }, { correlationId });
      return { allowed: false, reason: 'INACTIVE_IDENTITY' };
    }
    const permissions = await this.repository.getPermissions(identity.identityId);
    const allowed = permissions.includes(permission);
    if (!allowed) {
      await this._emit('authorization.denied', {
        reason: 'MISSING_PERMISSION',
        identityId: identity.identityId,
        permission
      }, {
        actor: { actorId: identity.identityId, actorType: identity.type },
        subject: { entityId: identity.identityId, entityType: 'identity' },
        correlationId
      });
    }
    return {
      allowed,
      reason: allowed ? null : 'MISSING_PERMISSION',
      identity: identity.toJSON(),
      permissions
    };
  }

  async _dispatch(command) {
    switch (command.commandType) {
      case 'CreateIdentity': return this._createIdentity(command);
      case 'CreateServiceIdentity': return this._createServiceIdentity(command);
      case 'ActivateIdentity': return this._changeStatus(command, IdentityStatus.ACTIVE, 'identity.activated');
      case 'SuspendIdentity': return this._changeStatus(command, IdentityStatus.SUSPENDED, 'identity.suspended');
      case 'DeactivateIdentity': return this._changeStatus(command, IdentityStatus.DEACTIVATED, 'identity.deactivated');
      case 'AnonymizeIdentity': return this._anonymizeIdentity(command);
      case 'CreateSession': return this._createSession(command);
      case 'RevokeSession': return this._revokeSession(command);
      case 'AssignRole': return this._assignRole(command);
      case 'RevokeRole': return this._revokeRole(command);
      case 'GrantPermission': return this._changePermission(command, true);
      case 'RevokePermission': return this._changePermission(command, false);
      default: throw new Error(`Unsupported Identity command: "${command.commandType}".`);
    }
  }

  async _createIdentity(command) {
    const { email, displayName = null, password } = command.payload;
    const now = this._now();
    const identity = new Identity({ email, displayName, createdAt: now, updatedAt: now });
    await this.repository.saveIdentity(identity);
    try {
      await this.repository.saveCredential(await Credential.fromPassword(identity.identityId, password, now));
    } catch (error) {
      await this.repository.deleteIdentity(identity.identityId);
      throw error;
    }

    await this._emit('identity.created', { identityId: identity.identityId, identityType: identity.type }, {
      command,
      subject: { entityId: identity.identityId, entityType: 'identity' }
    });
    const activeIdentity = identity.transitionTo(IdentityStatus.ACTIVE, now);
    await this.repository.saveIdentity(activeIdentity);
    await this._emit('identity.activated', { identityId: activeIdentity.identityId }, {
      command,
      subject: { entityId: activeIdentity.identityId, entityType: 'identity' }
    });
    return { identity: activeIdentity.toJSON() };
  }

  async _createServiceIdentity(command) {
    const { email, displayName = null } = command.payload;
    const now = this._now();
    const identity = new Identity({
      email,
      displayName,
      type: IdentityType.SERVICE,
      createdAt: now,
      updatedAt: now
    });
    await this.repository.saveIdentity(identity);
    const activeIdentity = identity.transitionTo(IdentityStatus.ACTIVE, now);
    await this.repository.saveIdentity(activeIdentity);
    await this._emit('identity.created', { identityId: identity.identityId, identityType: identity.type }, {
      command,
      subject: { entityId: identity.identityId, entityType: 'identity' }
    });
    await this._emit('identity.activated', { identityId: identity.identityId }, {
      command,
      subject: { entityId: identity.identityId, entityType: 'identity' }
    });
    return { identity: activeIdentity.toJSON() };
  }

  async _changeStatus(command, status, eventType) {
    const identity = await this._requireIdentity(command.payload.identityId);
    const changed = identity.transitionTo(status, this._now());
    await this.repository.saveIdentity(changed);
    await this._emit(eventType, { identityId: changed.identityId, status: changed.status }, {
      command,
      subject: { entityId: changed.identityId, entityType: 'identity' }
    });
    return { identity: changed.toJSON() };
  }

  async _anonymizeIdentity(command) {
    const identity = await this._requireIdentity(command.payload.identityId);
    const changed = identity.anonymize(this._now());
    await this.repository.saveIdentity(changed);
    await this._emit('identity.deactivated', { identityId: changed.identityId, status: changed.status }, {
      command,
      subject: { entityId: changed.identityId, entityType: 'identity' }
    });
    return { identity: changed.toJSON() };
  }

  async _createSession(command) {
    const { identityId, expiresAt } = command.payload;
    const identity = await this._requireIdentity(identityId);
    if (!isActiveIdentityStatus(identity.status)) {
      throw new Error('Cannot create a session for an inactive identity.');
    }
    const { session, token } = Session.create({ identityId, expiresAt, now: this._now() });
    await this.repository.saveSession(session);
    await this._emit('session.created', { sessionId: session.sessionId, identityId, expiresAt: session.expiresAt }, {
      command,
      actor: { actorId: identityId, actorType: identity.type },
      subject: { entityId: session.sessionId, entityType: 'session' }
    });
    return { session: session.toPublicJSON(), token };
  }

  async _revokeSession(command) {
    const { actorSessionToken, sessionId } = command.payload;
    const actor = await this._requireAuthorizedActor(actorSessionToken, 'identity.sessions.revoke');
    const session = await this.repository.findSessionById(sessionId);
    if (!session) throw new Error('Session not found.');
    if (session.identityId !== actor.identityId && !actor.permissions.includes('identity.sessions.revoke.any')) {
      throw new Error('Actor is not authorized to revoke this session.');
    }
    const revoked = session.revoke(this._now());
    await this.repository.saveSession(revoked);
    await this._emit('session.revoked', { sessionId: revoked.sessionId, identityId: revoked.identityId }, {
      command,
      actor: { actorId: actor.identityId, actorType: actor.type },
      subject: { entityId: revoked.sessionId, entityType: 'session' }
    });
    return { session: revoked.toPublicJSON() };
  }

  async _assignRole(command) {
    const { actorSessionToken, identityId, roleId } = command.payload;
    const actor = await this._requireAuthorizedActor(actorSessionToken, 'identity.roles.assign');
    await this._requireIdentity(identityId);
    if (!await this.repository.findRoleById(roleId)) throw new Error('Role not found.');
    await this.repository.assignRole(identityId, roleId);
    await this._emit('role.assigned', { identityId, roleId }, {
      command,
      actor: { actorId: actor.identityId, actorType: actor.type },
      subject: { entityId: identityId, entityType: 'identity' }
    });
    return { identityId, roleId };
  }

  async _revokeRole(command) {
    const { actorSessionToken, identityId, roleId } = command.payload;
    const actor = await this._requireAuthorizedActor(actorSessionToken, 'identity.roles.assign');
    await this.repository.revokeRole(identityId, roleId);
    await this._emit('role.revoked', { identityId, roleId }, {
      command,
      actor: { actorId: actor.identityId, actorType: actor.type },
      subject: { entityId, entityType: 'identity' }
    });
    return { identityId, roleId };
  }

  async _changePermission(command, grant) {
    const { actorSessionToken, roleId, permission } = command.payload;
    const actor = await this._requireAuthorizedActor(actorSessionToken, 'identity.permissions.manage');
    const role = await this.repository.findRoleById(roleId);
    if (!role) throw new Error('Role not found.');
    const changed = grant ? role.grant(permission) : role.revoke(permission);
    await this.repository.saveRole(changed);
    await this._emit(grant ? 'permission.granted' : 'permission.revoked', { roleId, permission }, {
      command,
      actor: { actorId: actor.identityId, actorType: actor.type },
      subject: { entityId: roleId, entityType: 'role' }
    });
    return { role: changed.toJSON() };
  }

  async _requireAuthorizedActor(sessionToken, permission) {
    const decision = await this.authorize({ sessionToken, permission });
    if (!decision.allowed) throw new Error(`Authorization denied: ${decision.reason}.`);
    return { ...decision.identity, permissions: decision.permissions };
  }

  async _requireIdentity(identityId) {
    const identity = await this.repository.findIdentityById(identityId);
    if (!identity) throw new Error('Identity not found.');
    return identity;
  }

  async _assertGovernance(command) {
    if (!this.governance) return;
    const evaluation = await this.governance.evaluateCompliance(command.commandType, {
      actor: command.actor,
      payload: command.payload,
      metadata: { correlationId: command.correlationId }
    });
    if (!evaluation?.compliant) {
      throw new Error('Governance denied the Identity command.');
    }
  }

  async _emit(eventType, payload, { command = null, actor = null, subject = null, correlationId = null } = {}) {
    const event = new DomainEvent({
      eventType,
      producer: PRODUCER,
      payload,
      actor: actor || command?.actor || null,
      subject,
      correlationId: correlationId || command?.correlationId || null,
      causationId: command?.commandId || null,
      metadata: { provenance: PRODUCER }
    });
    return this.eventBus.publish(event);
  }

  _now() {
    return this.clock().toISOString();
  }
}

export { Role };
