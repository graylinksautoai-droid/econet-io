import { hashSessionToken } from '../../domain/entities/Session.js';

export class InMemoryIdentityRepository {
  constructor() {
    this._identities = new Map();
    this._identitiesByEmail = new Map();
    this._credentials = new Map();
    this._sessionsByHash = new Map();
    this._roles = new Map();
    this._identityRoles = new Map();
  }

  async saveIdentity(identity) {
    const existingId = this._identitiesByEmail.get(identity.email);
    if (existingId && existingId !== identity.identityId) {
      throw new Error('An identity already exists for this email address.');
    }
    const previous = this._identities.get(identity.identityId);
    if (previous && previous.email !== identity.email) this._identitiesByEmail.delete(previous.email);
    this._identities.set(identity.identityId, identity);
    this._identitiesByEmail.set(identity.email, identity.identityId);
    return identity;
  }

  async deleteIdentity(identityId) {
    const identity = this._identities.get(identityId);
    if (!identity) return false;
    this._identities.delete(identityId);
    this._identitiesByEmail.delete(identity.email);
    this._credentials.delete(identityId);
    this._identityRoles.delete(identityId);
    return true;
  }

  async findIdentityById(identityId) {
    return this._identities.get(identityId) || null;
  }

  async findIdentityByEmail(email) {
    const identityId = this._identitiesByEmail.get(String(email).trim().toLowerCase());
    return identityId ? this._identities.get(identityId) || null : null;
  }

  async saveCredential(credential) {
    this._credentials.set(credential.identityId, credential);
    return credential;
  }

  async findCredentialByIdentityId(identityId) {
    return this._credentials.get(identityId) || null;
  }

  async saveSession(session) {
    this._sessionsByHash.set(session.tokenHash, session);
    return session;
  }

  async findSessionByToken(token) {
    return this._sessionsByHash.get(hashSessionToken(token)) || null;
  }

  async findSessionById(sessionId) {
    for (const session of this._sessionsByHash.values()) {
      if (session.sessionId === sessionId) return session;
    }
    return null;
  }

  async saveRole(role) {
    this._roles.set(role.roleId, role);
    return role;
  }

  async findRoleById(roleId) {
    return this._roles.get(roleId) || null;
  }

  async assignRole(identityId, roleId) {
    const roles = this._identityRoles.get(identityId) || new Set();
    roles.add(roleId);
    this._identityRoles.set(identityId, roles);
  }

  async revokeRole(identityId, roleId) {
    this._identityRoles.get(identityId)?.delete(roleId);
  }

  async getPermissions(identityId) {
    const roleIds = this._identityRoles.get(identityId) || new Set();
    return [...new Set([...roleIds].flatMap(roleId => this._roles.get(roleId)?.permissions || []))];
  }
}
