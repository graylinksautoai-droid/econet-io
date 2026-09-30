/**
 * Engine 16: Community Engine — InMemoryCommunityRepository
 * Isolated in-memory persistence adapter for Community aggregates and
 * CommunityMembership relationships. Membership is never deleted (historical
 * preservation); community-scoped roles are enforced here only for storage.
 */

export class InMemoryCommunityRepository {
  #communities = new Map();
  #memberships = new Map(); // membershipId -> CommunityMembership
  #byCommunityActor = new Map(); // `${communityId}:${actorId}` -> membershipId
  #byCommunity = new Map(); // communityId -> Set<membershipId>

  // ---- Communities ----

  async saveCommunity(community) {
    if (!community || !community.communityId) {
      throw new Error('Cannot save invalid Community.');
    }
    this.#communities.set(community.communityId, community);
    return community;
  }

  async findCommunityById(communityId) {
    return this.#communities.get(communityId) || null;
  }

  async listCommunities({ visibility = null, status = null } = {}) {
    let results = Array.from(this.#communities.values());
    if (visibility) {
      results = results.filter(c => c.visibility === visibility);
    }
    if (status) {
      results = results.filter(c => c.status === status);
    }
    return results;
  }

  // ---- Memberships ----

  async saveMembership(membership) {
    if (!membership || !membership.membershipId) {
      throw new Error('Cannot save invalid CommunityMembership.');
    }
    this.#memberships.set(membership.membershipId, membership);
    this.#byCommunityActor.set(`${membership.communityId}:${membership.actorId}`, membership.membershipId);
    if (!this.#byCommunity.has(membership.communityId)) {
      this.#byCommunity.set(membership.communityId, new Set());
    }
    this.#byCommunity.get(membership.communityId).add(membership.membershipId);
    return membership;
  }

  async findMembershipById(membershipId) {
    return this.#memberships.get(membershipId) || null;
  }

  async findMembershipByCommunityAndActor(communityId, actorId) {
    const membershipId = this.#byCommunityActor.get(`${communityId}:${actorId}`);
    return membershipId ? this.#memberships.get(membershipId) || null : null;
  }

  async listMembershipsByCommunity(communityId) {
    const ids = this.#byCommunity.get(communityId);
    if (!ids) return [];
    return Array.from(ids).map(id => this.#memberships.get(id)).filter(Boolean);
  }

  async listActiveMembershipsByCommunity(communityId) {
    return (await this.listMembershipsByCommunity(communityId))
      .filter(m => m.status === 'ACTIVE');
  }

  async listMembershipsByActor(actorId) {
    const results = [];
    for (const membership of this.#memberships.values()) {
      if (membership.actorId === actorId) {
        results.push(membership);
      }
    }
    return results;
  }

  async countMemberships(communityId) {
    const ids = this.#byCommunity.get(communityId);
    return ids ? ids.size : 0;
  }

  async count() {
    return this.#communities.size;
  }

  async clear() {
    this.#communities.clear();
    this.#memberships.clear();
    this.#byCommunityActor.clear();
    this.#byCommunity.clear();
  }
}