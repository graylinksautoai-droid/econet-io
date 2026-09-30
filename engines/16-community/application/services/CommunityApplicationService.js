/**
 * Engine 16: Community Engine — CommunityApplicationService
 * Coordinates community lifecycle, membership lifecycle, community-scoped roles,
 * visibility, authorization, and canonical domain event emission.
 *
 * Boundaries respected: no verification, reputation, reward, mission, action,
 * identity, governance-policy, or audit-journal logic is implemented here.
 */

import { Command } from '../../../../contracts/commands/Command.js';
import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import { globalEventBus } from '../../../../infrastructure/messaging/EventBus.js';
import { globalIdempotencyManager } from '../../../../infrastructure/idempotency/IdempotencyManager.js';
import { Community } from '../../domain/entities/Community.js';
import { CommunityMembership } from '../../domain/entities/CommunityMembership.js';
import { CommunityStatus, isMembershipMutable } from '../../domain/value-objects/CommunityStatus.js';
import { MembershipStatus } from '../../domain/value-objects/MembershipStatus.js';
import {
  CommunityRole,
  normalizeCommunityRole,
  canManageMembers,
  canAssignRoles
} from '../../domain/value-objects/CommunityRole.js';
import { InMemoryCommunityRepository } from '../../infrastructure/repositories/InMemoryCommunityRepository.js';

const ENGINE_SLUG = '16-community';
const PRODUCER = 'engine.16.community';

const MUTATING_COMMANDS = new Set([
  'CreateCommunity',
  'UpdateCommunity',
  'ChangeCommunityStatus',
  'RequestMembership',
  'ApproveMembership',
  'RejectMembership',
  'LeaveCommunity',
  'RemoveMember',
  'SuspendMember',
  'RestoreMembership',
  'AssignCommunityRole'
]);

export class CommunityApplicationService {
  constructor({
    repository = new InMemoryCommunityRepository(),
    eventBus = globalEventBus,
    idempotencyManager = globalIdempotencyManager,
    governance = null,
    clock = () => new Date(),
    authorizedCreatorRoles = ['system', 'admin', 'community_manager', 'automation']
  } = {}) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.idempotencyManager = idempotencyManager;
    this.governance = governance;
    this.clock = clock;
    this.authorizedCreatorRoles = [...authorizedCreatorRoles];
  }

  async execute(command) {
    const cmd = command instanceof Command ? command : new Command(command);
    if (cmd.targetEngine !== ENGINE_SLUG || !MUTATING_COMMANDS.has(cmd.commandType)) {
      throw new Error(`Unsupported Community command: "${cmd.commandType}".`);
    }
    if (!cmd.idempotencyKey) {
      throw new Error(`Community command "${cmd.commandType}" requires an idempotencyKey.`);
    }
    if (!cmd.actor || !cmd.actor.actorId) {
      throw new Error('Community commands require an authenticated actor.');
    }
    return this.idempotencyManager.executeIdempotent(
      `${ENGINE_SLUG}:${cmd.commandType}:${cmd.idempotencyKey}`,
      async () => {
        await this._assertGovernance(cmd);
        return this._dispatch(cmd);
      }
    );
  }

  // ---- Queries ----

  async getCommunity(communityId) {
    const community = await this.repository.findCommunityById(communityId);
    return community ? community.toJSON() : null;
  }

  async listCommunities({ visibility = null, status = null } = {}) {
    const communities = await this.repository.listCommunities({ visibility, status });
    return communities.map(c => c.toJSON());
  }

  async getMembership(membershipId) {
    const membership = await this.repository.findMembershipById(membershipId);
    return membership ? membership.toJSON() : null;
  }

  async getMembershipByCommunityAndActor(communityId, actorId) {
    const membership = await this.repository.findMembershipByCommunityAndActor(communityId, actorId);
    return membership ? membership.toJSON() : null;
  }

  async listCommunityMembers(communityId, { includeInactive = false } = {}) {
    const community = await this.repository.findCommunityById(communityId);
    if (!community) {
      throw new Error(`Community not found: "${communityId}".`);
    }
    let memberships = await this.repository.listMembershipsByCommunity(communityId);
    if (!includeInactive) {
      memberships = memberships.filter(m => m.status === MembershipStatus.ACTIVE);
    }
    return memberships.map(m => m.toJSON());
  }

  async listMembershipsForActor(actorId) {
    const memberships = await this.repository.listMembershipsByActor(actorId);
    return memberships.map(m => m.toJSON());
  }

  async countMemberships(communityId) {
    return this.repository.countMemberships(communityId);
  }

    async _dispatch(cmd) {
    switch (cmd.commandType) {
      case 'CreateCommunity':
        return this._handleCreateCommunity(cmd);
      case 'UpdateCommunity':
        return this._handleUpdateCommunity(cmd);
      case 'ChangeCommunityStatus':
        return this._handleChangeStatus(cmd);
      case 'RequestMembership':
        return this._handleRequestMembership(cmd);
      case 'ApproveMembership':
        return this._handleApproveMembership(cmd);
      case 'RejectMembership':
        return this._handleRejectMembership(cmd);
      case 'LeaveCommunity':
        return this._handleLeaveCommunity(cmd);
      case 'RemoveMember':
        return this._handleRemoveMember(cmd);
      case 'SuspendMember':
        return this._handleSuspendMember(cmd);
      case 'RestoreMembership':
        return this._handleRestoreMembership(cmd);
      case 'AssignCommunityRole':
        return this._handleAssignRole(cmd);
      default:
        throw new Error(`Unhandled Community command: ${cmd.commandType}`);
    }
  }

  async _handleCreateCommunity(cmd) {
    const { name, description = '', visibility = 'PUBLIC', metadata = {} } = cmd.payload;
    if (!this._hasRole(cmd.actor, this.authorizedCreatorRoles)) {
      throw new Error(`Community creation denied: actor "${cmd.actor.actorId}" lacks an authorized creator role.`);
    }

    const community = new Community({
      name,
      description,
      visibility,
      ownerId: cmd.actor.actorId,
      metadata,
      createdAt: this.clock().toISOString(),
      updatedAt: this.clock().toISOString()
    });
    await this.repository.saveCommunity(community);

    // The owner becomes an ACTIVE OWNER membership.
    const ownerMembership = new CommunityMembership({
      communityId: community.communityId,
      actorId: cmd.actor.actorId,
      role: CommunityRole.OWNER,
      status: MembershipStatus.ACTIVE,
      joinedAt: this.clock().toISOString()
    });
    await this.repository.saveMembership(ownerMembership);

    await this._emit('econet.community.created', {
      communityId: community.communityId,
      name: community.name,
      visibility: community.visibility,
      ownerId: community.ownerId
    }, {
      actor: cmd.actor,
      subject: { entityId: community.communityId, entityType: 'community' },
      correlationId: cmd.correlationId
    });

    return {
      community: community.toJSON(),
      ownerMembership: ownerMembership.toJSON()
    };
  }

    async _handleUpdateCommunity(cmd) {
    const { communityId, name, description, visibility } = cmd.payload;
    const community = await this._requireCommunityAdmin(cmd, communityId);

    const updated = community.updateProfile({
      name: name ?? community.name,
      description: description ?? community.description,
      visibility: visibility ?? community.visibility,
      now: this.clock().toISOString()
    });
    await this.repository.saveCommunity(updated);

    await this._emit('econet.community.updated', {
      communityId: updated.communityId,
      name: updated.name,
      visibility: updated.visibility
    }, {
      actor: cmd.actor,
      subject: { entityId: updated.communityId, entityType: 'community' },
      correlationId: cmd.correlationId
    });

    return { community: updated.toJSON() };
  }

  async _handleChangeStatus(cmd) {
    const { communityId, status } = cmd.payload;
    const community = await this._requireCommunityAdmin(cmd, communityId);

    const updated = community.transitionTo(status, this.clock().toISOString());
    await this.repository.saveCommunity(updated);

    await this._emit('econet.community.status_changed', {
      communityId: updated.communityId,
      previousStatus: community.status,
      newStatus: updated.status
    }, {
      actor: cmd.actor,
      subject: { entityId: updated.communityId, entityType: 'community' },
      correlationId: cmd.correlationId
    });

    return { community: updated.toJSON() };
  }

  async _handleRequestMembership(cmd) {
    const { communityId, actorId = cmd.actor.actorId, metadata = {} } = cmd.payload;
    const community = await this._requireCommunity(communityId);
    this._requireMembershipMutable(community);

    const existing = await this.repository.findMembershipByCommunityAndActor(communityId, actorId);

    // Idempotent: already pending or active is returned as duplicate.
    if (existing && (existing.status === MembershipStatus.PENDING || existing.status === MembershipStatus.ACTIVE || existing.status === MembershipStatus.SUSPENDED)) {
      return { membership: existing.toJSON(), duplicated: true };
    }

    // Re-request after REJECTED/LEFT/REMOVED creates a fresh PENDING membership.
    const membership = new CommunityMembership({
      communityId: community.communityId,
      actorId: actorId.trim(),
      role: CommunityRole.MEMBER,
      status: MembershipStatus.PENDING,
      joinedAt: this.clock().toISOString(),
      metadata
    });
    await this.repository.saveMembership(membership);

    await this._emit('econet.community.membership_requested', {
      communityId,
      actorId,
      membershipId: membership.membershipId
    }, {
      actor: cmd.actor,
      subject: { entityId: membership.membershipId, entityType: 'community_membership' },
      correlationId: cmd.correlationId
    });

    return { membership: membership.toJSON(), duplicated: false };
  }

    async _handleApproveMembership(cmd) {
    const { communityId, membershipId } = cmd.payload;
    await this._requireCommunityAdmin(cmd, communityId);

    const membership = await this._requireMembership(membershipId);
    if (membership.communityId !== communityId) {
      throw new Error('Membership does not belong to the specified community.');
    }
    if (membership.status !== MembershipStatus.PENDING) {
      throw new Error(`Cannot approve membership in status "${membership.status}".`);
    }

    const approved = membership.transitionTo(MembershipStatus.ACTIVE, this.clock().toISOString());
    await this.repository.saveMembership(approved);

    await this._emit('econet.community.membership_approved', {
      membershipId: approved.membershipId,
      communityId,
      actorId: approved.actorId,
      role: approved.role
    }, {
      actor: cmd.actor,
      subject: { entityId: approved.membershipId, entityType: 'community_membership' },
      correlationId: cmd.correlationId
    });

    return { membership: approved.toJSON() };
  }

  async _handleRejectMembership(cmd) {
    const { communityId, membershipId } = cmd.payload;
    await this._requireCommunityAdmin(cmd, communityId);

    const membership = await this._requireMembership(membershipId);
    if (membership.communityId !== communityId) {
      throw new Error('Membership does not belong to the specified community.');
    }
    if (membership.status !== MembershipStatus.PENDING) {
      throw new Error(`Cannot reject membership in status "${membership.status}".`);
    }

    const rejected = membership.transitionTo(MembershipStatus.REJECTED, this.clock().toISOString());
    await this.repository.saveMembership(rejected);

    await this._emit('econet.community.membership_rejected', {
      membershipId: rejected.membershipId,
      communityId,
      actorId: rejected.actorId
    }, {
      actor: cmd.actor,
      subject: { entityId: rejected.membershipId, entityType: 'community_membership' },
      correlationId: cmd.correlationId
    });

    return { membership: rejected.toJSON() };
  }

  async _handleLeaveCommunity(cmd) {
    const { communityId } = cmd.payload;
    const membership = await this._requireMyMembership(cmd, communityId);
    if (membership.status !== MembershipStatus.ACTIVE) {
      throw new Error(`Cannot leave membership in status "${membership.status}".`);
    }

    const left = membership.transitionTo(MembershipStatus.LEFT, this.clock().toISOString());
    await this.repository.saveMembership(left);

    await this._emit('econet.community.member_left', {
      membershipId: left.membershipId,
      communityId,
      actorId: left.actorId
    }, {
      actor: cmd.actor,
      subject: { entityId: left.membershipId, entityType: 'community_membership' },
      correlationId: cmd.correlationId
    });

    return { membership: left.toJSON() };
  }

    async _handleRemoveMember(cmd) {
    const { communityId, membershipId } = cmd.payload;
    await this._requireCommunityAdmin(cmd, communityId);

    const membership = await this._requireMembership(membershipId);
    if (membership.communityId !== communityId) {
      throw new Error('Membership does not belong to the specified community.');
    }
    if (![MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED].includes(membership.status)) {
      throw new Error(`Cannot remove membership in status "${membership.status}".`);
    }

    const removed = membership.transitionTo(MembershipStatus.REMOVED, this.clock().toISOString());
    await this.repository.saveMembership(removed);

    await this._emit('econet.community.member_removed', {
      membershipId: removed.membershipId,
      communityId,
      actorId: removed.actorId
    }, {
      actor: cmd.actor,
      subject: { entityId: removed.membershipId, entityType: 'community_membership' },
      correlationId: cmd.correlationId
    });

    return { membership: removed.toJSON() };
  }

  async _handleSuspendMember(cmd) {
    const { communityId, membershipId } = cmd.payload;
    await this._requireCommunityAdmin(cmd, communityId);

    const membership = await this._requireMembership(membershipId);
    if (membership.communityId !== communityId) {
      throw new Error('Membership does not belong to the specified community.');
    }
    if (membership.status !== MembershipStatus.ACTIVE) {
      throw new Error(`Cannot suspend membership in status "${membership.status}".`);
    }

    const suspended = membership.transitionTo(MembershipStatus.SUSPENDED, this.clock().toISOString());
    await this.repository.saveMembership(suspended);

    await this._emit('econet.community.member_suspended', {
      membershipId: suspended.membershipId,
      communityId,
      actorId: suspended.actorId
    }, {
      actor: cmd.actor,
      subject: { entityId: suspended.membershipId, entityType: 'community_membership' },
      correlationId: cmd.correlationId
    });

    return { membership: suspended.toJSON() };
  }

  async _handleRestoreMembership(cmd) {
    const { communityId, membershipId } = cmd.payload;
    await this._requireCommunityAdmin(cmd, communityId);

    const membership = await this._requireMembership(membershipId);
    if (membership.communityId !== communityId) {
      throw new Error('Membership does not belong to the specified community.');
    }
    if (membership.status !== MembershipStatus.SUSPENDED) {
      throw new Error(`Cannot restore membership in status "${membership.status}".`);
    }

    const restored = membership.transitionTo(MembershipStatus.ACTIVE, this.clock().toISOString());
    await this.repository.saveMembership(restored);

    await this._emit('econet.community.membership_restored', {
      membershipId: restored.membershipId,
      communityId,
      actorId: restored.actorId
    }, {
      actor: cmd.actor,
      subject: { entityId: restored.membershipId, entityType: 'community_membership' },
      correlationId: cmd.correlationId
    });

    return { membership: restored.toJSON() };
  }

    async _handleAssignRole(cmd) {
    const { communityId, membershipId, role } = cmd.payload;
    await this._requireCommunity(communityId);
    await this._requireCanAssignRoles(cmd, communityId);

    // Only ADMIN/OWNER may assign roles; ownership cannot be reassigned by this command.
    const normalizedRole = normalizeCommunityRole(role);
    if (normalizedRole === CommunityRole.OWNER) {
      throw new Error('Ownership cannot be assigned via AssignCommunityRole.');
    }

    const target = await this._requireMembership(membershipId);
    if (target.communityId !== communityId) {
      throw new Error('Membership does not belong to the specified community.');
    }
    if (target.status !== MembershipStatus.ACTIVE) {
      throw new Error(`Cannot assign role to membership in status "${target.status}".`);
    }
    if (target.role === CommunityRole.OWNER) {
      throw new Error('The community owner role cannot be changed.');
    }

    const updated = target.changeRole(normalizedRole, this.clock().toISOString());
    await this.repository.saveMembership(updated);

    await this._emit('econet.community.role_changed', {
      membershipId: updated.membershipId,
      communityId,
      actorId: updated.actorId,
      previousRole: target.role,
      newRole: updated.role
    }, {
      actor: cmd.actor,
      subject: { entityId: updated.membershipId, entityType: 'community_membership' },
      correlationId: cmd.correlationId
    });

    return { membership: updated.toJSON() };
  }

    // ---- Internal helpers ----

  _hasRole(actor, roles) {
    if (!actor || !actor.roles) return false;
    return actor.roles.some(role => roles.includes(role));
  }

  async _requireCommunity(communityId) {
    if (!communityId || typeof communityId !== 'string' || communityId.trim() === '') {
      throw new Error('communityId is required.');
    }
    const community = await this.repository.findCommunityById(communityId);
    if (!community) {
      throw new Error(`Community not found: "${communityId}".`);
    }
    return community;
  }

  _requireMembershipMutable(community) {
    if (!isMembershipMutable(community.status)) {
      throw new Error(`Membership operations are not permitted while community is ${community.status}.`);
    }
  }

  async _requireMembership(membershipId) {
    if (!membershipId || typeof membershipId !== 'string' || membershipId.trim() === '') {
      throw new Error('membershipId is required.');
    }
    const membership = await this.repository.findMembershipById(membershipId);
    if (!membership) {
      throw new Error(`Membership not found: "${membershipId}".`);
    }
    return membership;
  }

  async _requireMyMembership(cmd, communityId) {
    // Self-operation: the acting actor operates on their own membership.
    const membership = await this.repository.findMembershipByCommunityAndActor(communityId, cmd.actor.actorId);
    if (!membership) {
      throw new Error(`No membership found for actor "${cmd.actor.actorId}" in community "${communityId}".`);
    }
    return membership;
  }

  /**
   * Load a community and verify the acting actor has an ACTIVE membership with
   * a role that can administer the community.
   */
  async _requireCommunityAdmin(cmd, communityId) {
    const community = await this._requireCommunity(communityId);
    const membership = await this.repository.findMembershipByCommunityAndActor(communityId, cmd.actor.actorId);
    if (!membership) {
      throw new Error(`Actor "${cmd.actor.actorId}" is not a member of community "${communityId}".`);
    }
    if (membership.status !== MembershipStatus.ACTIVE) {
      throw new Error(`Membership for actor "${cmd.actor.actorId}" is not active.`);
    }
    if (!canManageMembers(membership.role)) {
      throw new Error(`Actor "${cmd.actor.actorId}" with role "${membership.role}" cannot administer community "${communityId}".`);
    }
    return community;
  }

  async _requireCanAssignRoles(cmd, communityId) {
    // Fetched defensively even though _requireCommunityAdmin already checks MANAGE.
    const membership = await this.repository.findMembershipByCommunityAndActor(communityId, cmd.actor.actorId);
    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      throw new Error(`Actor "${cmd.actor.actorId}" lacks an active membership in community "${communityId}".`);
    }
    if (!canAssignRoles(membership.role)) {
      throw new Error(`Actor "${cmd.actor.actorId}" with role "${membership.role}" cannot assign community roles.`);
    }
  }

  async _assertGovernance(cmd) {
    if (!this.governance) return;
    const decision = await this.governance.evaluatePolicy({
      engine: ENGINE_SLUG,
      commandType: cmd.commandType,
      actor: cmd.actor,
      payload: cmd.payload
    });
    if (!decision.allowed) {
      throw new Error(`Governance policy denial: ${decision.reason || 'Command denied by policy.'}`);
    }
  }

  async _emit(eventType, payload, { actor = null, subject = null, correlationId = null } = {}) {
    const event = new DomainEvent({
      eventType,
      producer: PRODUCER,
      actor,
      subject,
      correlationId,
      payload
    });
    await this.eventBus.publish(event);
    return event;
  }
}