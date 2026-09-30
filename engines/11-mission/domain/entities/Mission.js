/**
 * Engine 11: Mission Engine — Mission Entity.
 * Aggregate root for operational mission definition, objectives, and lifecycle.
 *
 * Implementation decisions (no repository precedent for these):
 * - Completion requires every objective to be in a terminal state (COMPLETED or
 *   FAILED). The canonical specification is silent on required/optional
 *   objectives, so no such classification is invented.
 * - Target criteria are stored as an immutable caller-defined object; Engine 11
 *   stores and returns them but does not interpret them (interpretation of
 *   criteria belongs to a future approved contract, not to this engine).
 */

import { randomUUID } from 'crypto';
import {
  MissionStatus,
  assertValidMissionStatus,
  assertMissionStatusTransition,
  isTerminalMissionStatus
} from '../value-objects/MissionStatus.js';
import {
  ObjectiveStatus,
  assertValidObjectiveStatus,
  assertObjectiveStatusTransition
} from '../value-objects/ObjectiveStatus.js';
import { normalizeMissionPriority } from '../value-objects/MissionPriority.js';

const requireNonEmptyString = (value, fieldName) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Mission requires a non-empty ${fieldName}.`);
  }
  return value.trim();
};

const normalizeCriteria = (targetCriteria) => {
  if (!targetCriteria || typeof targetCriteria !== 'object' || Array.isArray(targetCriteria)) {
    throw new Error('Mission requires a targetCriteria object.');
  }
  if (Object.keys(targetCriteria).length === 0) {
    throw new Error('Mission targetCriteria cannot be empty.');
  }
  return Object.freeze(JSON.parse(JSON.stringify(targetCriteria)));
};

export class Mission {
  constructor({
    missionId = `msn_${randomUUID().replace(/-/g, '')}`,
    title,
    description,
    priority = 'MEDIUM',
    targetCriteria,
    objectives = [],
    status = MissionStatus.DRAFT,
    metadata = {},
    createdAt = new Date().toISOString(),
    updatedAt = createdAt,
    version = 0
  } = {}) {
    this.missionId = requireNonEmptyString(missionId, 'missionId');
    this.title = requireNonEmptyString(title, 'title');
    this.description = requireNonEmptyString(description, 'description');
    this.priority = normalizeMissionPriority(priority);
    this.targetCriteria = normalizeCriteria(targetCriteria);
    this.objectives = Mission.#normalizeObjectives(objectives);
    assertValidMissionStatus(status);
    this.status = status;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new Error('Mission metadata must be an object.');
    }
    this.metadata = Object.freeze({ ...metadata });
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    // version is a non-negative integer used for optimistic concurrency control.
    // It is incremented on every mutation by the #revision() helper.
    // Default 0 means "never persisted" or "in-memory — no concurrency guard".
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
      throw new Error('Mission version must be a non-negative integer.');
    }
    this.version = version;
    Object.freeze(this);
  }

  static #normalizeObjectives(objectives) {
    if (!Array.isArray(objectives)) {
      throw new Error('Mission objectives must be an array.');
    }
    const seen = new Set();
    return Object.freeze(objectives.map(objective => {
      const objectiveId = requireNonEmptyString(objective?.objectiveId, 'objectiveId');
      if (seen.has(objectiveId)) {
        throw new Error(`Duplicate objectiveId in mission: "${objectiveId}".`);
      }
      seen.add(objectiveId);
      const description = requireNonEmptyString(objective?.description, `objective "${objectiveId}" description`);
      const status = objective?.status ?? ObjectiveStatus.PENDING;
      assertValidObjectiveStatus(status);
      return Object.freeze({
        objectiveId,
        description,
        status
      });
    }));
  }

  #revision(changes, now) {
    return new Mission({
      ...this.toJSON(),
      ...changes,
      createdAt: this.createdAt,
      updatedAt: now,
      version: this.version + 1
    });
  }

  transitionTo(nextStatus, now = new Date().toISOString()) {
    assertMissionStatusTransition(this.status, nextStatus);
    return this.#revision({ status: nextStatus }, now);
  }

  addObjective({ objectiveId, description }, now = new Date().toISOString()) {
    if (isTerminalMissionStatus(this.status)) {
      throw new Error(`Cannot add an objective to a ${this.status} mission.`);
    }
    if (this.objectives.some(objective => objective.objectiveId === objectiveId)) {
      throw new Error(`Objective already exists on mission: "${objectiveId}".`);
    }
    return this.#revision({
      objectives: [...this.objectives, { objectiveId, description, status: ObjectiveStatus.PENDING }]
    }, now);
  }

  updateObjectiveStatus(objectiveId, nextStatus, now = new Date().toISOString()) {
    if (isTerminalMissionStatus(this.status)) {
      throw new Error(`Cannot update an objective on a ${this.status} mission.`);
    }
    assertValidObjectiveStatus(nextStatus);
    const objective = this.objectives.find(candidate => candidate.objectiveId === objectiveId);
    if (!objective) {
      throw new Error(`Objective not found on mission: "${objectiveId}".`);
    }
    assertObjectiveStatusTransition(objective.status, nextStatus);
    if (objective.status === nextStatus) {
      return this;
    }
    return this.#revision({
      objectives: this.objectives.map(candidate => (
        candidate.objectiveId === objectiveId ? { ...candidate, status: nextStatus } : candidate
      ))
    }, now);
  }

  canBeCompleted() {
    if (this.status !== MissionStatus.ACTIVE) {
      return false;
    }
    return this.objectives.every(objective => (
      objective.status === ObjectiveStatus.COMPLETED || objective.status === ObjectiveStatus.FAILED
    ));
  }

  toJSON() {
    return {
      missionId: this.missionId,
      title: this.title,
      description: this.description,
      priority: this.priority,
      targetCriteria: JSON.parse(JSON.stringify(this.targetCriteria)),
      objectives: this.objectives.map(objective => ({ ...objective })),
      status: this.status,
      metadata: { ...this.metadata },
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version
    };
  }
}
