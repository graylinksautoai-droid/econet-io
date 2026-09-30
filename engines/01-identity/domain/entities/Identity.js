import { randomUUID } from 'crypto';
import { IdentityStatus, assertIdentityTransition } from '../value-objects/IdentityStatus.js';

export const IdentityType = Object.freeze({
  HUMAN: 'HUMAN',
  SERVICE: 'SERVICE'
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Identity {
  constructor({
    identityId = `idn_${randomUUID().replace(/-/g, '')}`,
    email,
    displayName,
    type = IdentityType.HUMAN,
    status = IdentityStatus.CREATED,
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  }) {
    if (typeof identityId !== 'string' || identityId.trim() === '') {
      throw new Error('Identity requires a non-empty identityId.');
    }
    if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
      throw new Error('Identity requires a valid email address.');
    }
    if (displayName !== null && displayName !== undefined && typeof displayName !== 'string') {
      throw new Error('Identity displayName must be a string when provided.');
    }
    if (!Object.values(IdentityType).includes(type)) {
      throw new Error(`Unknown identity type: "${type}".`);
    }
    if (!Object.values(IdentityStatus).includes(status)) {
      throw new Error(`Unknown identity status: "${status}".`);
    }

    this.identityId = identityId;
    this.email = email.trim().toLowerCase();
    this.displayName = displayName?.trim() || null;
    this.type = type;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    Object.freeze(this);
  }

  transitionTo(status, now = new Date().toISOString()) {
    assertIdentityTransition(this.status, status);
    return new Identity({ ...this.toJSON(), status, updatedAt: now });
  }

  anonymize(now = new Date().toISOString()) {
    assertIdentityTransition(this.status, IdentityStatus.ANONYMIZED);
    const anonymizedEmail = `anonymized-${this.identityId}@invalid.econet`;
    return new Identity({
      ...this.toJSON(),
      email: anonymizedEmail,
      displayName: null,
      status: IdentityStatus.ANONYMIZED,
      updatedAt: now
    });
  }

  toJSON() {
    return {
      identityId: this.identityId,
      email: this.email,
      displayName: this.displayName,
      type: this.type,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}
