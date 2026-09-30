/**
 * Engine 18: Digital Twin Engine — SynchronizationRecord Entity
 * An auditable record of a synchronization attempt: source reference,
 * previous/resulting state versions, accepted/rejected change counts, and
 * failure reason. A failed attempt never reports a misleading SYNCHRONIZED
 * status.
 */

import { randomUUID } from 'crypto';

export class SynchronizationRecord {
  constructor({
    recordId = `syn_${randomUUID().replace(/-/g, '')}`,
    twinId,
    sourceReference = null,
    startedAt,
    completedAt = null,
    status = 'PENDING',
    previousStateVersion = null,
    resultingStateVersion = null,
    acceptedChanges = 0,
    rejectedChanges = 0,
    failureReason = null
  } = {}) {
    if (typeof recordId !== 'string' || recordId.trim() === '') {
      throw new Error('SynchronizationRecord requires a non-empty recordId.');
    }
    if (typeof twinId !== 'string' || twinId.trim() === '') {
      throw new Error('SynchronizationRecord requires a non-empty twinId.');
    }
    if (typeof startedAt !== 'string' || Number.isNaN(Date.parse(startedAt))) {
      throw new Error('SynchronizationRecord requires a valid startedAt ISO-8601 string.');
    }

    this.recordId = recordId;
    this.twinId = twinId.trim();
    this.sourceReference = sourceReference ? Object.freeze({ ...sourceReference }) : null;
    this.startedAt = startedAt;
    this.completedAt = completedAt;
    this.status = status;
    this.previousStateVersion = previousStateVersion;
    this.resultingStateVersion = resultingStateVersion;
    this.acceptedChanges = acceptedChanges;
    this.rejectedChanges = rejectedChanges;
    this.failureReason = failureReason || null;
    Object.freeze(this);
  }

  toJSON() {
    return {
      recordId: this.recordId,
      twinId: this.twinId,
      sourceReference: this.sourceReference ? { ...this.sourceReference } : null,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      status: this.status,
      previousStateVersion: this.previousStateVersion,
      resultingStateVersion: this.resultingStateVersion,
      acceptedChanges: this.acceptedChanges,
      rejectedChanges: this.rejectedChanges,
      failureReason: this.failureReason
    };
  }
}