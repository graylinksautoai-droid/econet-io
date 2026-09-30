/**
 * Engine 13: Verification Engine — VerificationClaim Entity
 * Aggregate managing observation claims, voter consensus, and credibility scores.
 */

import { randomUUID } from 'crypto';
import { VerificationStatus, assertVerificationTransition } from '../value-objects/VerificationStatus.js';

export const VoteType = Object.freeze({
  CONFIRM: 'CONFIRM',
  DISPUTE: 'DISPUTE'
});

export class VerificationClaim {
  constructor({
    claimId = `vcl_${randomUUID().replace(/-/g, '')}`,
    observationId,
    claimantId,
    status = VerificationStatus.PENDING,
    credibilityScore = 50.0,
    votes = [],
    consensusReached = false,
    outcome = null,
    metadata = {},
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  } = {}) {
    if (typeof claimId !== 'string' || claimId.trim() === '') {
      throw new Error('VerificationClaim requires a non-empty claimId.');
    }
    if (typeof observationId !== 'string' || observationId.trim() === '') {
      throw new Error('VerificationClaim requires a non-empty observationId.');
    }
    if (typeof claimantId !== 'string' || claimantId.trim() === '') {
      throw new Error('VerificationClaim requires a valid claimantId.');
    }
    if (!Object.values(VerificationStatus).includes(status)) {
      throw new Error(`Unknown verification status: "${status}".`);
    }

    const score = Number(credibilityScore);
    if (Number.isNaN(score) || score < 0 || score > 100) {
      throw new Error(`Invalid credibilityScore: ${credibilityScore}. Must be between 0 and 100.`);
    }

    this.claimId = claimId;
    this.observationId = observationId.trim();
    this.claimantId = claimantId.trim();
    this.status = status;
    this.credibilityScore = Number(score.toFixed(2));
    this.votes = Object.freeze(votes.map(v => Object.freeze({ ...v })));
    this.consensusReached = Boolean(consensusReached);
    this.outcome = outcome;
    this.metadata = Object.freeze({ ...metadata });
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    Object.freeze(this);
  }

  recordVote({ voterId, vote, weight = 1.0, reasoning = '', now = new Date().toISOString() }) {
    if (!voterId || typeof voterId !== 'string') {
      throw new Error('Vote requires a valid voterId.');
    }
    if (voterId.trim() === this.claimantId) {
      throw new Error('Claimant cannot vote on their own observation claim.');
    }
    const normalizedVote = String(vote).toUpperCase();
    if (!Object.values(VoteType).includes(normalizedVote)) {
      throw new Error(`Invalid vote type: "${vote}". Must be CONFIRM or DISPUTE.`);
    }
    if (this.votes.some(v => v.voterId === voterId.trim())) {
      throw new Error(`Voter "${voterId}" has already voted on claim "${this.claimId}".`);
    }

    const newVote = Object.freeze({
      voterId: voterId.trim(),
      vote: normalizedVote,
      weight: Math.max(0.1, Number(weight) || 1.0),
      reasoning: String(reasoning || '').trim(),
      timestamp: now
    });

    const newStatus = this.status === VerificationStatus.PENDING ? VerificationStatus.VERIFYING : this.status;

    return new VerificationClaim({
      ...this.toJSON(),
      status: newStatus,
      votes: [...this.votes, newVote],
      updatedAt: now
    });
  }

  updateConsensus({ consensusReached, outcome, credibilityScore, newStatus = null, now = new Date().toISOString() }) {
    const targetStatus = newStatus || (outcome === 'CONFIRMED' ? VerificationStatus.VERIFIED : (outcome === 'REJECTED' ? VerificationStatus.REJECTED : this.status));

    if (targetStatus !== this.status) {
      assertVerificationTransition(this.status, targetStatus);
    }

    return new VerificationClaim({
      ...this.toJSON(),
      status: targetStatus,
      consensusReached: Boolean(consensusReached),
      outcome: outcome || this.outcome,
      credibilityScore: credibilityScore !== undefined ? credibilityScore : this.credibilityScore,
      updatedAt: now
    });
  }

  transitionTo(nextStatus, now = new Date().toISOString()) {
    assertVerificationTransition(this.status, nextStatus);
    return new VerificationClaim({
      ...this.toJSON(),
      status: nextStatus,
      updatedAt: now
    });
  }

  toJSON() {
    return {
      claimId: this.claimId,
      observationId: this.observationId,
      claimantId: this.claimantId,
      status: this.status,
      credibilityScore: this.credibilityScore,
      votes: this.votes.map(v => ({ ...v })),
      consensusReached: this.consensusReached,
      outcome: this.outcome,
      metadata: { ...this.metadata },
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}
