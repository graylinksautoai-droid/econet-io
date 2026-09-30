/**
 * Engine 16: Community Engine — MongoCommunityRepository
 *
 * Durable MongoDB-backed persistence adapter for Community and
 * CommunityMembership aggregates.  Implements the identical async interface
 * as InMemoryCommunityRepository so the engine requires zero changes.
 *
 * COLLECTIONS:
 *   canonical_communities        — Community aggregates
 *   canonical_community_memberships — CommunityMembership aggregates
 *
 * BOUNDARY:
 * This is the only Engine 16 file that imports Mongoose.  The domain
 * entities (Community.js, CommunityMembership.js) remain free of any
 * infrastructure dependency.
 */

import mongoose from 'mongoose';
import { Community } from '../../domain/entities/Community.js';
import { CommunityMembership } from '../../domain/entities/CommunityMembership.js';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const communitySchema = new mongoose.Schema({
  _id:         { type: String, required: true },   // === communityId
  name:        { type: String, required: true },
  description: { type: String, required: true },
  visibility:  { type: String, required: true },
  status:      { type: String, required: true },
  ownerId:     { type: String, required: true },
  createdAt:   { type: String, required: true },
  updatedAt:   { type: String, required: true },
  version:     { type: Number, required: true, default: 0 }
}, {
  versionKey:  false,
  timestamps:  false,
  collection:  'canonical_communities'
});
communitySchema.index({ status: 1 });
communitySchema.index({ visibility: 1, status: 1 });

const membershipSchema = new mongoose.Schema({
  _id:         { type: String, required: true },   // === membershipId
  communityId: { type: String, required: true },
  actorId:     { type: String, required: true },
  role:        { type: String, required: true },
  status:      { type: String, required: true },
  joinedAt:    { type: String, required: true },
  updatedAt:   { type: String, required: true },
  version:     { type: Number, required: true, default: 0 }
}, {
  versionKey:  false,
  timestamps:  false,
  collection:  'canonical_community_memberships'
});
membershipSchema.index({ communityId: 1 });
membershipSchema.index({ actorId: 1 });
membershipSchema.index({ communityId: 1, actorId: 1 }, { unique: true });

// ─── Rehydration helpers ──────────────────────────────────────────────────────

function rehydrateCommunity(doc) {
  return new Community({
    communityId:  doc._id,
    name:         doc.name,
    description:  doc.description,
    visibility:   doc.visibility,
    status:       doc.status,
    ownerId:      doc.ownerId,
    createdAt:    doc.createdAt,
    updatedAt:    doc.updatedAt,
    version:      doc.version ?? 0
  });
}

function rehydrateMembership(doc) {
  return new CommunityMembership({
    membershipId: doc._id,
    communityId:  doc.communityId,
    actorId:      doc.actorId,
    role:         doc.role,
    status:       doc.status,
    joinedAt:     doc.joinedAt,
    updatedAt:    doc.updatedAt,
    version:      doc.version ?? 0
  });
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class MongoCommunityRepository {
  constructor(connection) {
    if (!connection) throw new Error('MongoCommunityRepository requires a Mongoose connection.');

    this._Community = connection.modelNames().includes('CanonicalCommunity')
      ? connection.model('CanonicalCommunity')
      : connection.model('CanonicalCommunity', communitySchema);

    this._Membership = connection.modelNames().includes('CanonicalCommunityMembership')
      ? connection.model('CanonicalCommunityMembership')
      : connection.model('CanonicalCommunityMembership', membershipSchema);
  }

  // ── Communities ──────────────────────────────────────────────────────────────

  async saveCommunity(community) {
    if (!community || !community.communityId) throw new Error('Invalid Community.');
    const j = typeof community.toJSON === 'function' ? community.toJSON() : community;
    await this._Community.findOneAndUpdate(
      { _id: j.communityId },
      { $set: { _id: j.communityId, name: j.name, description: j.description,
                visibility: j.visibility, status: j.status, ownerId: j.ownerId,
                createdAt: j.createdAt, updatedAt: j.updatedAt,
                version: (j.version || 0) } },
      { upsert: true, new: true }
    );
    return community;
  }

  async findCommunityById(communityId) {
    const doc = await this._Community.findOne({ _id: communityId }).lean();
    return doc ? rehydrateCommunity(doc) : null;
  }

  async listCommunities({ visibility = null, status = null } = {}) {
    const query = {};
    if (visibility) query.visibility = visibility;
    if (status)     query.status     = status;
    const docs = await this._Community.find(query).lean();
    return docs.map(rehydrateCommunity);
  }

  // ── Memberships ───────────────────────────────────────────────────────────────

  async saveMembership(membership) {
    if (!membership || !membership.membershipId) throw new Error('Invalid Membership.');
    const j = typeof membership.toJSON === 'function' ? membership.toJSON() : membership;
    await this._Membership.findOneAndUpdate(
      { _id: j.membershipId },
      { $set: { _id: j.membershipId, communityId: j.communityId, actorId: j.actorId,
                role: j.role, status: j.status, joinedAt: j.joinedAt,
                updatedAt: j.updatedAt, version: (j.version || 0) } },
      { upsert: true, new: true }
    );
    return membership;
  }

  async findMembershipById(membershipId) {
    const doc = await this._Membership.findOne({ _id: membershipId }).lean();
    return doc ? rehydrateMembership(doc) : null;
  }

  async findMembershipByCommunityAndActor(communityId, actorId) {
    const doc = await this._Membership.findOne({ communityId, actorId }).lean();
    return doc ? rehydrateMembership(doc) : null;
  }

  async listMembershipsByCommunity(communityId) {
    const docs = await this._Membership.find({ communityId }).lean();
    return docs.map(rehydrateMembership);
  }

  async listActiveMembershipsByCommunity(communityId) {
    const docs = await this._Membership.find({ communityId, status: 'ACTIVE' }).lean();
    return docs.map(rehydrateMembership);
  }

  async listMembershipsByActor(actorId) {
    const docs = await this._Membership.find({ actorId }).lean();
    return docs.map(rehydrateMembership);
  }

  async countMemberships(communityId) {
    return this._Membership.countDocuments({ communityId });
  }

  async count() {
    return this._Community.countDocuments();
  }

  async clear() {
    await this._Community.deleteMany({});
    await this._Membership.deleteMany({});
  }
}
