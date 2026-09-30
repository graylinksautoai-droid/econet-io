/**
 * Engine 16: Community Engine — EcoNet IO 24-Engine Canon
 * Mission: Social graph connections, peer interactions, comments, social feeds,
 * and community groups.
 */

import { CommunityApplicationService } from './application/services/CommunityApplicationService.js';
import { InMemoryCommunityRepository } from './infrastructure/repositories/InMemoryCommunityRepository.js';

export const ENGINE_ID = '16';
export const ENGINE_NAME = 'Community Engine';

export class CommunityEngine {
  constructor(options = {}) {
    this.engineId = ENGINE_ID;
    this.engineName = ENGINE_NAME;
    this._service = options.service || new CommunityApplicationService(options);
    this._repository = this._service.repository;
  }

  get service() {
    return this._service;
  }

  get repository() {
    return this._repository;
  }

  async executeCommand(command) {
    return this._service.execute(command);
  }

  async getCommunity(communityId) {
    return this._service.getCommunity(communityId);
  }

  async listCommunities(filter) {
    return this._service.listCommunities(filter);
  }

  async getMembership(membershipId) {
    return this._service.getMembership(membershipId);
  }

  async getMembershipByCommunityAndActor(communityId, actorId) {
    return this._service.getMembershipByCommunityAndActor(communityId, actorId);
  }

  async listCommunityMembers(communityId, options) {
    return this._service.listCommunityMembers(communityId, options);
  }

  async listMembershipsForActor(actorId) {
    return this._service.listMembershipsForActor(actorId);
  }

  async countMemberships(communityId) {
    return this._service.countMemberships(communityId);
  }

  async initialize() {
    return { ready: true, engineId: ENGINE_ID, name: ENGINE_NAME };
  }

  async healthCheck() {
    return {
      healthy: true,
      engineId: ENGINE_ID,
      details: {
        status: 'READY',
        persistence: 'IN_MEMORY_COMMUNITY_ADAPTER',
        totalCommunities: await this._repository.count()
      }
    };
  }

  async shutdown() {}
}

export const communityEngine = new CommunityEngine();
export default communityEngine;

export { CommunityApplicationService } from './application/services/CommunityApplicationService.js';
export { InMemoryCommunityRepository } from './infrastructure/repositories/InMemoryCommunityRepository.js';
export { Community } from './domain/entities/Community.js';
export { CommunityMembership } from './domain/entities/CommunityMembership.js';
export { CommunityStatus, canTransitionCommunityStatus, assertCommunityStatusTransition } from './domain/value-objects/CommunityStatus.js';
export { MembershipStatus, canTransitionMembership, assertMembershipTransition, isActiveMembership } from './domain/value-objects/MembershipStatus.js';
export { CommunityRole, ROLE_HIERARCHY, normalizeCommunityRole, canManageMembers, canAssignRoles } from './domain/value-objects/CommunityRole.js';
export { CommunityVisibility, normalizeVisibility } from './domain/value-objects/CommunityVisibility.js';
