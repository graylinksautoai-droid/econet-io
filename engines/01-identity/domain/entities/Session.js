import { createHash, randomBytes, randomUUID } from 'crypto';

export const SessionStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED'
});

export const hashSessionToken = (token) => createHash('sha256').update(token).digest('hex');

export class Session {
  constructor({
    sessionId = `ses_${randomUUID().replace(/-/g, '')}`,
    identityId,
    tokenHash,
    expiresAt,
    status = SessionStatus.ACTIVE,
    createdAt = new Date().toISOString(),
    revokedAt = null
  }) {
    if (typeof identityId !== 'string' || identityId.trim() === '') {
      throw new Error('Session requires an identityId.');
    }
    if (typeof tokenHash !== 'string' || tokenHash.trim() === '') {
      throw new Error('Session requires a protected token hash.');
    }
    if (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) {
      throw new Error('Session requires a valid expiresAt timestamp.');
    }
    this.sessionId = sessionId;
    this.identityId = identityId;
    this.tokenHash = tokenHash;
    this.expiresAt = expiresAt;
    this.status = status;
    this.createdAt = createdAt;
    this.revokedAt = revokedAt;
    Object.freeze(this);
  }

  static create({ identityId, expiresAt, now = new Date().toISOString() }) {
    const token = randomBytes(32).toString('base64url');
    return {
      token,
      session: new Session({
        identityId,
        tokenHash: hashSessionToken(token),
        expiresAt,
        createdAt: now
      })
    };
  }

  isUsable(now = new Date()) {
    return this.status === SessionStatus.ACTIVE && Date.parse(this.expiresAt) > now.getTime();
  }

  revoke(now = new Date().toISOString()) {
    if (this.status === SessionStatus.REVOKED) return this;
    return new Session({ ...this.toJSON(), status: SessionStatus.REVOKED, revokedAt: now });
  }

  toJSON() {
    return {
      sessionId: this.sessionId,
      identityId: this.identityId,
      tokenHash: this.tokenHash,
      expiresAt: this.expiresAt,
      status: this.status,
      createdAt: this.createdAt,
      revokedAt: this.revokedAt
    };
  }

  toPublicJSON() {
    const { tokenHash, ...publicSession } = this.toJSON();
    return publicSession;
  }
}
