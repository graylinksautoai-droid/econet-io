/**
 * Engine 13: Verification Engine — ConsensusScorer Domain Service
 * Pure algorithm evaluating multi-voter consensus and credibility scoring.
 */

import { VoteType } from '../entities/VerificationClaim.js';
import { VerificationStatus } from '../value-objects/VerificationStatus.js';

export class ConsensusScorer {
  constructor({
    minQuorumVotes = 3,
    consensusThresholdRatio = 0.66,
    baseCredibilityScore = 50.0
  } = {}) {
    this.minQuorumVotes = minQuorumVotes;
    this.consensusThresholdRatio = consensusThresholdRatio;
    this.baseCredibilityScore = baseCredibilityScore;
  }

  /**
   * Evaluate consensus for a VerificationClaim.
   * @param {VerificationClaim} claim
   * @returns {Object} Evaluation outcome
   */
  evaluateConsensus(claim) {
    const votes = claim.votes;
    if (votes.length === 0) {
      return {
        consensusReached: false,
        outcome: null,
        credibilityScore: claim.credibilityScore,
        targetStatus: claim.status
      };
    }

    let confirmWeight = 0;
    let disputeWeight = 0;

    for (const v of votes) {
      if (v.vote === VoteType.CONFIRM) {
        confirmWeight += v.weight;
      } else if (v.vote === VoteType.DISPUTE) {
        disputeWeight += v.weight;
      }
    }

    const totalWeight = confirmWeight + disputeWeight;
    const confirmRatio = totalWeight > 0 ? confirmWeight / totalWeight : 0;
    const disputeRatio = totalWeight > 0 ? disputeWeight / totalWeight : 0;

    // Calculate updated credibility score
    // 0 to 100 range based on confirm weight ratio
    const credibilityScore = Number((confirmRatio * 100).toFixed(2));

    // Check if quorum reached
    const quorumReached = votes.length >= this.minQuorumVotes || totalWeight >= this.minQuorumVotes;

    if (!quorumReached) {
      return {
        consensusReached: false,
        outcome: null,
        credibilityScore,
        targetStatus: VerificationStatus.VERIFYING
      };
    }

    // Quorum is reached, check if threshold is met
    if (confirmRatio >= this.consensusThresholdRatio) {
      return {
        consensusReached: true,
        outcome: 'CONFIRMED',
        credibilityScore,
        targetStatus: VerificationStatus.VERIFIED
      };
    }

    if (disputeRatio >= this.consensusThresholdRatio) {
      return {
        consensusReached: true,
        outcome: 'REJECTED',
        credibilityScore,
        targetStatus: VerificationStatus.REJECTED
      };
    }

    // Quorum reached but split vote (neither reached supermajority)
    return {
      consensusReached: false,
      outcome: null,
      credibilityScore,
      targetStatus: VerificationStatus.DISPUTED
    };
  }
}
