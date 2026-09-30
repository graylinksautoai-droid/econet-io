/**
 * Engine 16: Community Engine — CommunityMembership Entity
 * Membership is a relationship between an identity reference (actorId) and a
 * community, with a community-scoped role and lifecycle status. It is not
 * merely a list of user IDs, and it carries no verification, reputation, or
 * reward semantics.
 */

import { randomUUID } from 'crypto';
import { MembershipStatus, assertMembershipTransition } from '../value-objects/MembershipStatus.js';
import { normalizeCommunityRole } from '../value-objects/CommunityRole.js';

export class CommunityMembership {
  constructor({
    membershipId = `mem_${randomUUID().replace(/-/g, '')}`,
    communityId,
    actorId,
    role = 'MEMBER',
    status = MembershipStatus.ACTIVE,
    joinedAt = new Date().toISOString(),
    updatedAt = joinedAt,
    metadata = {}
  } = {}) {
    if (typeof membershipId !== 'string' || membershipId.trim() === '') {
      throw new Error('CommunityMembership requires a non-empty membershipId.');
    }
    if (typeof communityId !== 'string' || communityId.trim() === '') {
      throw new Error('CommunityMembership requires a non-empty communityId.');
    }
    if (typeof actorId !== 'string' || actorId.trim() === '') {
      throw new Error('CommunityMembership requires a non-empty actorId.');
    }
    if (!Object.values(MembershipStatus).includes(status)) {
      throw new Error(`Unknown membership status: "${status}".`);
    }

    this.membershipId = membershipId;
    this.communityId = communityId.trim();
    this.actorId = actorId.trim();
    this.role = normalizeCommunityRole(role);
    this.status = status;
    this.joinedAt = joinedAt;
    this.updatedAt = updatedAt;
    this.metadata = Object.freeze({ ...metadata });
    Object.freeze(this);
  }

  transitionTo(nextStatus, now = new Date().toISOString()) {
    assertMembershipTransition(this.status, nextStatus);
    return new CommunityMembership({
      ...this.toJSON(),
      status: nextStatus,
      updatedAt: now
    });
  }

  changeRole(nextRole, now = new Date().toISOString()) {
    return new CommunityMembership({
      ...this.toJSON(),
      role: normalizeCommunityRole(nextRole),
      updatedAt: now
    });
  }

  toJSON() {
    return {
      membershipId: this.membershipId,
      communityId: this.communityId,
      actorId: this.actorId,
      role: this.role,
      status: this.status,
      joinedAt: this.joinedAt,
      updatedAt: this.updatedAt,
      metadata: { ...this.metadata }
    };
  }
}