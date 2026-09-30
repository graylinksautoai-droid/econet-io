/**
 * Engine 11: Mission Engine — MongoMissionRepository
 *
 * Durable MongoDB-backed persistence adapter for Mission aggregates.
 * Implements the identical async interface as InMemoryMissionRepository so
 * that the canonical engine layer requires zero changes to switch adapters.
 *
 * COLLECTION: canonical_missions
 * IDENTITY:   _id === missionId (string, not ObjectId)
 *
 * CONCURRENCY:
 * save() uses findOneAndUpdate with an optimistic-locking guard on the
 * `version` field.  If the stored document's version does not equal the
 * entity's (version - 1), the update returns null and a
 * MissionConcurrentModificationError is thrown.  HTTP handlers must catch
 * this error and return HTTP 409 Conflict so the client can retry with a
 * fresh GET.
 *
 * NEW ENTITIES (version === 0):
 * The first save of a new entity (version is still 0 on the POJO from
 * toJSON()) is detected by IS_NEW_ENTITY.  A new entity has version 0 and
 * does not yet exist in the database, so the guard queries for
 * { _id: id, version: { $exists: false } } via an upsert insert.
 * This prevents two racing CreateMission commands from both succeeding.
 *
 * EXISTING ENTITIES (version > 0):
 * The entity has already been persisted once.  The guard queries for
 * { _id: id, version: expectedVersion } where expectedVersion = entity.version - 1.
 * A miss means concurrent modification; throw MissionConcurrentModificationError.
 *
 * BOUNDARY:
 * This file is the ONLY file in the canonical layer that imports Mongoose
 * or uses MongoDB types.  The domain entity (Mission.js) and the application
 * service (MissionApplicationService.js) remain completely free of any
 * infrastructure dependency.
 */

import { Mission } from '../../domain/entities/Mission.js';
import mongoose from 'mongoose';

// ─── Domain error ─────────────────────────────────────────────────────────────

export class MissionConcurrentModificationError extends Error {
  constructor(missionId) {
    super(
      `Mission "${missionId}" was concurrently modified. ` +
      'Fetch the current state and retry your command.'
    );
    this.name = 'MissionConcurrentModificationError';
    this.missionId = missionId;
    this.statusHint = 409; // HTTP handlers should use this as the response status.
  }
}

// ─── Mongoose schema ──────────────────────────────────────────────────────────

const objectiveSchema = new mongoose.Schema({
  objectiveId: { type: String, required: true },
  description:  { type: String, required: true },
  status:       { type: String, required: true }
}, { _id: false });

export const missionSchema = new mongoose.Schema({
  // _id === missionId (string).  We bypass ObjectId to use the canonical ID.
  _id:            { type: String, required: true },
  title:          { type: String, required: true },
  description:    { type: String, required: true },
  priority:       { type: String, required: true },
  targetCriteria: { type: mongoose.Schema.Types.Mixed, required: true },
  objectives:     { type: [objectiveSchema], default: [] },
  status:         { type: String, required: true },
  metadata:       { type: mongoose.Schema.Types.Mixed, default: {} },
  // ISO-8601 strings — stored as String to avoid Date normalization surprises.
  createdAt:      { type: String, required: true },
  updatedAt:      { type: String, required: true },
  // Optimistic concurrency version.  Starts at 0 on first insert, incremented
  // on every mutation.
  version:        { type: Number, required: true, default: 0 }
}, {
  // Disable Mongoose's own __v versioning — we use our own `version` field.
  versionKey: false,
  // Do not add Mongoose's createdAt/updatedAt — the entity manages these.
  timestamps: false,
  // Collection must be named explicitly to enforce the canonical_* convention.
  collection: 'canonical_missions'
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
// _id is already indexed (primary key).
missionSchema.index({ status: 1 });
missionSchema.index({ priority: 1 });
missionSchema.index({ status: 1, priority: 1 });
missionSchema.index({ createdAt: -1 });

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a lean MongoDB document back into a live Mission entity.
 * The constructor validates all fields on rehydration — corrupted documents
 * will throw rather than silently produce a broken entity.
 * @param {Object} doc - Plain JS object from .lean()
 * @returns {Mission}
 */
function rehydrate(doc) {
  return new Mission({
    missionId:      doc._id,
    title:          doc.title,
    description:    doc.description,
    priority:       doc.priority,
    targetCriteria: doc.targetCriteria,
    objectives:     doc.objectives ?? [],
    status:         doc.status,
    metadata:       doc.metadata ?? {},
    createdAt:      doc.createdAt,
    updatedAt:      doc.updatedAt,
    version:        doc.version ?? 0
  });
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class MongoMissionRepository {
  /**
   * @param {mongoose.Connection} connection - A Mongoose connection instance.
   *   Must be the canonical connection, NOT the default mongoose global.
   */
  constructor(connection) {
    if (!connection) {
      throw new Error('MongoMissionRepository requires a Mongoose connection.');
    }
    // Register the model on the provided connection, not the global default.
    // Use modelNames() to avoid OverwriteModelError when a second repository
    // instance is created on the same connection (e.g. in tests or after restart).
    this._Mission = connection.modelNames().includes('CanonicalMission')
      ? connection.model('CanonicalMission')
      : connection.model('CanonicalMission', missionSchema);
  }

  /**
   * Persist a Mission entity (insert or update).
   *
   * For new entities (version === 0 on the raw POJO before #revision
   * increments it): we expect to INSERT.  The entity has version=1 after
   * the first #revision call in _handleCreateMission, so we detect "first
   * save" as version === 1 on the incoming entity (it was 0 before creation).
   *
   * Wait — actually the entity arrives here AFTER #revision already ran, so
   * version === 1 for a freshly created mission.  We treat version === 1
   * with no existing document as a first insert.
   *
   * For mutations (version > 1): the stored document must have
   * version === entity.version - 1.
   *
   * @param {Mission} mission
   * @returns {Promise<Mission>} The saved entity (same instance — the DB
   *   write is opaque; the entity is the source of truth for the caller).
   */
  async save(mission) {
    if (!mission || !mission.missionId) {
      throw new Error('Cannot save invalid Mission — missionId is required.');
    }

    const doc = mission.toJSON();
    const { missionId, version } = doc;

    // Map canonical fields to the MongoDB document shape.
    // _id === missionId; all other fields map 1:1.
    const docToWrite = {
      _id:            missionId,
      title:          doc.title,
      description:    doc.description,
      priority:       doc.priority,
      targetCriteria: doc.targetCriteria,
      objectives:     doc.objectives,
      status:         doc.status,
      metadata:       doc.metadata,
      createdAt:      doc.createdAt,
      updatedAt:      doc.updatedAt,
      version:        version
    };

    if (version <= 1) {
      // ── First save (new entity) ───────────────────────────────────────────
      // insertOne with a duplicate-key guard: if another request raced ahead
      // and inserted the same missionId, insertOne throws code 11000.
      try {
        await this._Mission.create(docToWrite);
      } catch (err) {
        if (err.code === 11000) {
          throw new MissionConcurrentModificationError(missionId);
        }
        throw err;
      }
    } else {
      // ── Subsequent save (mutation, version > 1) ───────────────────────────
      // Conditional update: the stored version must equal entity.version - 1.
      const expectedStoredVersion = version - 1;
      const result = await this._Mission.findOneAndUpdate(
        { _id: missionId, version: expectedStoredVersion },
        { $set: docToWrite },
        { returnDocument: 'after', lean: true }
      );
      if (!result) {
        throw new MissionConcurrentModificationError(missionId);
      }
    }

    return mission;
  }

  /**
   * @param {string} missionId
   * @returns {Promise<Mission|null>}
   */
  async findById(missionId) {
    const doc = await this._Mission.findOne({ _id: missionId }).lean();
    return doc ? rehydrate(doc) : null;
  }

  /**
   * @param {string} status - MissionStatus enum value
   * @returns {Promise<Mission[]>}
   */
  async findByStatus(status) {
    const docs = await this._Mission.find({ status }).lean();
    return docs.map(rehydrate);
  }

  /**
   * @returns {Promise<Mission[]>} All missions in ACTIVE status.
   */
  async findActive() {
    return this.findByStatus('ACTIVE');
  }

  /**
   * @param {string} priority - MissionPriority enum value
   * @returns {Promise<Mission[]>}
   */
  async findByPriority(priority) {
    const normalized = String(priority).toUpperCase();
    const docs = await this._Mission.find({ priority: normalized }).lean();
    return docs.map(rehydrate);
  }

  /**
   * @returns {Promise<Mission[]>}
   */
  async listAll() {
    const docs = await this._Mission.find({}).lean();
    return docs.map(rehydrate);
  }

  /**
   * @returns {Promise<number>}
   */
  async count() {
    return this._Mission.countDocuments();
  }

  /**
   * @param {string} missionId
   * @returns {Promise<boolean>}
   */
  async delete(missionId) {
    const result = await this._Mission.deleteOne({ _id: missionId });
    return result.deletedCount > 0;
  }

  /**
   * Remove all missions. Intended for test fixtures only.
   * Production callers must never call this.
   */
  async clear() {
    await this._Mission.deleteMany({});
  }
}
