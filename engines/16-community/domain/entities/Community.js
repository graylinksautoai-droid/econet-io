/**
 * Engine 16: Community Engine — Community Entity
 * Aggregate for a community record: identity, profile, visibility, lifecycle.
 * Communities organize participants around environmental concerns; they do not
 * determine verification, reputation, reward, or mission validity.
 */

import { randomUUID } from 'crypto';
import { CommunityStatus, assertCommunityStatusTransition } from '../value-objects/CommunityStatus.js';
import { normalizeVisibility } from '../value-objects/CommunityVisibility.js';

export class Community {
  constructor({
    communityId = `com_${randomUUID().replace(/-/g, '')}`,
    name,
    description = '',
    visibility = 'PUBLIC',
    status = CommunityStatus.ACTIVE,
    ownerId,
    metadata = {},
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  } = {}) {
    if (typeof communityId !== 'string' || communityId.trim() === '') {
      throw new Error('Community requires a non-empty communityId.');
    }
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('Community requires a non-empty name.');
    }
    if (typeof description !== 'string') {
      throw new Error('Community description must be a string.');
    }
    if (typeof ownerId !== 'string' || ownerId.trim() === '') {
      throw new Error('Community requires a non-empty ownerId.');
    }
    if (!Object.values(CommunityStatus).includes(status)) {
      throw new Error(`Unknown community status: "${status}".`);
    }

    this.communityId = communityId;
    this.name = name.trim();
    this.description = description.trim();
    this.visibility = normalizeVisibility(visibility);
    this.status = status;
    this.ownerId = ownerId.trim();
    this.metadata = Object.freeze({ ...metadata });
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    Object.freeze(this);
  }

  transitionTo(nextStatus, now = new Date().toISOString()) {
    assertCommunityStatusTransition(this.status, nextStatus);
    return new Community({
      ...this.toJSON(),
      status: nextStatus,
      updatedAt: now
    });
  }

  updateProfile({ name = this.name, description = this.description, visibility = this.visibility, now = new Date().toISOString() } = {}) {
    return new Community({
      ...this.toJSON(),
      name: typeof name === 'string' && name.trim() !== '' ? name.trim() : this.name,
      description: typeof description === 'string' ? description.trim() : this.description,
      visibility: normalizeVisibility(visibility),
      updatedAt: now
    });
  }

  toJSON() {
    return {
      communityId: this.communityId,
      name: this.name,
      description: this.description,
      visibility: this.visibility,
      status: this.status,
      ownerId: this.ownerId,
      metadata: { ...this.metadata },
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}