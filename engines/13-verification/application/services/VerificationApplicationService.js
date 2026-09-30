/**
 * Engine 13: Verification Engine — VerificationApplicationService
 * Coordinates environmental claim verification, consensus voting, credibility scoring,
 * and canonical verification event emissions.
 */

import { Command } from '../../../../contracts/commands/Command.js';
import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import { globalEventBus } from '../../../../infrastructure/messaging/EventBus.js';
import { globalIdempotencyManager } from '../../../../infrastructure/idempotency/IdempotencyManager.js';
import { VerificationClaim } from '../../domain/entities/VerificationClaim.js';
import { VerificationStatus } from '../../domain/value-objects/VerificationStatus.js';
import { ConsensusScorer } from '../../domain/services/ConsensusScorer.js';
import { InMemoryVerificationRepository } from '../../infrastructure/repositories/InMemoryVerificationRepository.js';

const ENGINE_SLUG = '13-verification';
const PRODUCER = 'engine.13.verification';

const MUTATING_COMMANDS = new Set([
  'InitiateVerification',
  'CastVerificationVote',
  'FinalizeVerification'
]);

export class VerificationApplicationService {
  constructor({
    repository = new InMemoryVerificationRepository(),
    consensusScorer = new ConsensusScorer(),
    eventBus = globalEventBus,
    idempotencyManager = globalIdempotencyManager,
    governance = null,
    clock = () => new Date()
  } = {}) {
    this.repository = repository;
    this.consensusScorer = consensusScorer;
    this.eventBus = eventBus;
    this.idempotencyManager = idempotencyManager;
    this.governance = governance;
    this.clock = clock;
  }

  async execute(command) {
    const cmd = command instanceof Command ? command : new Command(command);
    if (cmd.targetEngine !== ENGINE_SLUG || !MUTATING_COMMANDS.has(cmd.commandType)) {
      throw new Error(`Unsupported Verification command: "${cmd.commandType}".`);
    }
    if (!cmd.idempotencyKey) {
      throw new Error(`Verification command "${cmd.commandType}" requires an idempotencyKey.`);
    }

    return this.idempotencyManager.executeIdempotent(
      `${ENGINE_SLUG}:${cmd.commandType}:${cmd.idempotencyKey}`,
      async () => {
        await this._assertGovernance(cmd);
        return this._dispatch(cmd);
      }
    );
  }

  async getVerificationStatus(observationId) {
    const claim = await this.repository.findByObservationId(observationId);
    if (!claim) return null;
    return {
      observationId: claim.observationId,
      claimId: claim.claimId,
      status: claim.status,
      credibilityScore: claim.credibilityScore,
      consensusReached: claim.consensusReached,
      outcome: claim.outcome,
      totalVotes: claim.votes.length,
      votes: claim.votes
    };
  }

  async getClaimById(claimId) {
    const claim = await this.repository.findById(claimId);
    return claim ? claim.toJSON() : null;
  }

  async _dispatch(cmd) {
    switch (cmd.commandType) {
      case 'InitiateVerification':
        return this._handleInitiateVerification(cmd);
      case 'CastVerificationVote':
        return this._handleCastVote(cmd);
      case 'FinalizeVerification':
        return this._handleFinalize(cmd);
      default:
        throw new Error(`Unhandled command: ${cmd.commandType}`);
    }
  }

  async _handleInitiateVerification(cmd) {
    const {
      observationId,
      claimantId = cmd.actor?.actorId,
      initialScore = 50.0,
      metadata = {}
    } = cmd.payload;

    if (!observationId) {
      throw new Error('InitiateVerification requires an observationId.');
    }
    if (!claimantId) {
      throw new Error('InitiateVerification requires a claimantId or actor.actorId.');
    }

    const existing = await this.repository.findByObservationId(observationId);
    if (existing) {
      return { claim: existing.toJSON(), alreadyExisted: true };
    }

    const claim = new VerificationClaim({
      observationId,
      claimantId,
      status: VerificationStatus.PENDING,
      credibilityScore: initialScore,
      metadata,
      createdAt: this.clock().toISOString()
    });

    await this.repository.save(claim);

    await this._emit('econet.verification.initiated', {
      claimId: claim.claimId,
      observationId: claim.observationId,
      claimantId: claim.claimantId,
      initialScore: claim.credibilityScore
    }, {
      actor: cmd.actor || { actorId: claimantId, roles: ['claimant'] },
      subject: { entityId: claim.claimId, entityType: 'verification_claim' },
      correlationId: cmd.correlationId
    });

    return { claim: claim.toJSON() };
  }

  async _handleCastVote(cmd) {
    const {
      observationId,
      claimId,
      voterId = cmd.actor?.actorId,
      vote,
      weight = 1.0,
      reasoning = ''
    } = cmd.payload;

    if (!voterId) {
      throw new Error('CastVerificationVote requires a voterId or actor.actorId.');
    }

    let claim = null;
    if (claimId) {
      claim = await this.repository.findById(claimId);
    } else if (observationId) {
      claim = await this.repository.findByObservationId(observationId);
    }

    if (!claim) {
      throw new Error(`Verification claim not found for observation "${observationId || claimId}".`);
    }

    // Record the vote on the aggregate
    let updatedClaim = claim.recordVote({
      voterId,
      vote,
      weight,
      reasoning,
      now: this.clock().toISOString()
    });

    // Evaluate consensus
    const evaluation = this.consensusScorer.evaluateConsensus(updatedClaim);

    if (evaluation.consensusReached) {
      updatedClaim = updatedClaim.updateConsensus({
        consensusReached: true,
        outcome: evaluation.outcome,
        credibilityScore: evaluation.credibilityScore,
        newStatus: evaluation.targetStatus,
        now: this.clock().toISOString()
      });
    } else {
      updatedClaim = new VerificationClaim({
        ...updatedClaim.toJSON(),
        credibilityScore: evaluation.credibilityScore,
        status: evaluation.targetStatus,
        updatedAt: this.clock().toISOString()
      });
    }

    await this.repository.save(updatedClaim);

    // Emit vote recorded event
    await this._emit('econet.verification.vote_recorded', {
      claimId: updatedClaim.claimId,
      observationId: updatedClaim.observationId,
      voterId,
      vote,
      weight,
      currentScore: updatedClaim.credibilityScore
    }, {
      actor: cmd.actor || { actorId: voterId, roles: ['verifier'] },
      subject: { entityId: updatedClaim.claimId, entityType: 'verification_claim' },
      correlationId: cmd.correlationId
    });

    // If consensus reached, emit consensus events
    if (evaluation.consensusReached) {
      await this._emit('econet.verification.consensus_reached', {
        claimId: updatedClaim.claimId,
        observationId: updatedClaim.observationId,
        outcome: evaluation.outcome,
        finalScore: updatedClaim.credibilityScore,
        voteCount: updatedClaim.votes.length
      }, {
        actor: cmd.actor,
        subject: { entityId: updatedClaim.claimId, entityType: 'verification_claim' },
        correlationId: cmd.correlationId
      });

      if (evaluation.outcome === 'CONFIRMED') {
        await this._emit('econet.verification.completed', {
          claimId: updatedClaim.claimId,
          observationId: updatedClaim.observationId,
          verifiedStatus: 'VERIFIED',
          credibilityScore: updatedClaim.credibilityScore
        }, {
          actor: cmd.actor,
          subject: { entityId: updatedClaim.observationId, entityType: 'observation' },
          correlationId: cmd.correlationId
        });
      } else if (evaluation.outcome === 'REJECTED') {
        await this._emit('econet.verification.rejected', {
          claimId: updatedClaim.claimId,
          observationId: updatedClaim.observationId,
          reason: 'Consensus rejection by verifiers',
          credibilityScore: updatedClaim.credibilityScore
        }, {
          actor: cmd.actor,
          subject: { entityId: updatedClaim.observationId, entityType: 'observation' },
          correlationId: cmd.correlationId
        });
      }
    }

    return {
      claim: updatedClaim.toJSON(),
      consensusReached: updatedClaim.consensusReached,
      outcome: updatedClaim.outcome
    };
  }

  async _handleFinalize(cmd) {
    const { observationId, claimId, outcome, reason = null } = cmd.payload;
    let claim = claimId ? await this.repository.findById(claimId) : await this.repository.findByObservationId(observationId);
    if (!claim) throw new Error('Claim not found.');

    const newStatus = outcome === 'CONFIRMED' ? VerificationStatus.VERIFIED : VerificationStatus.REJECTED;
    const finalized = claim.transitionTo(newStatus, this.clock().toISOString());
    await this.repository.save(finalized);

    const eventName = outcome === 'CONFIRMED' ? 'econet.verification.completed' : 'econet.verification.rejected';
    await this._emit(eventName, {
      claimId: finalized.claimId,
      observationId: finalized.observationId,
      outcome,
      reason
    }, {
      actor: cmd.actor,
      subject: { entityId: finalized.observationId, entityType: 'observation' },
      correlationId: cmd.correlationId
    });

    return { claim: finalized.toJSON() };
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
