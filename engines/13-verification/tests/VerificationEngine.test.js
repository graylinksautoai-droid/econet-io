import test from 'node:test';
import assert from 'node:assert/strict';

import { Command } from '../../../contracts/commands/Command.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import {
  VerificationEngine,
  InMemoryVerificationRepository,
  VerificationStatus,
  VoteType
} from '../index.js';

const command = (commandType, payload, suffix, actor = null) => new Command({
  commandType,
  targetEngine: '13-verification',
  payload,
  actor: actor || { actorId: 'verifier-1', roles: ['verifier'] },
  idempotencyKey: `ver-test-${suffix}`,
  correlationId: `cor-${suffix}`
});

const createFixture = () => {
  const repository = new InMemoryVerificationRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new VerificationEngine({
    repository,
    eventBus,
    idempotencyManager,
    clock: () => new Date('2029-05-01T12:00:00.000Z')
  });
  return { engine, repository, eventBus, idempotencyManager };
};

test('verification initiates claim and emits canonical verification.initiated event', async () => {
  const { engine, eventBus } = createFixture();

  const initRes = await engine.executeCommand(command('InitiateVerification', {
    observationId: 'obs-100',
    claimantId: 'observer-reporter-1',
    initialScore: 50.0
  }, 'init-1'));

  assert.ok(initRes.claim);
  assert.equal(initRes.claim.status, VerificationStatus.PENDING);
  assert.equal(initRes.claim.observationId, 'obs-100');

  const events = eventBus.getHistory();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, 'econet.verification.initiated');
  assert.equal(events[0].producer, 'engine.13.verification');
});

test('verification voting enforces self-voting and double-voting prevention', async () => {
  const { engine } = createFixture();

  await engine.executeCommand(command('InitiateVerification', {
    observationId: 'obs-200',
    claimantId: 'observer-reporter-2'
  }, 'init-2'));

  // 1. Claimant cannot vote on their own claim
  await assert.rejects(
    engine.executeCommand(command('CastVerificationVote', {
      observationId: 'obs-200',
      voterId: 'observer-reporter-2',
      vote: VoteType.CONFIRM
    }, 'self-vote')),
    /Claimant cannot vote on their own observation claim/
  );

  // 2. First vote by legitimate verifier succeeds
  await engine.executeCommand(command('CastVerificationVote', {
    observationId: 'obs-200',
    voterId: 'verifier-alice',
    vote: VoteType.CONFIRM,
    weight: 1.0
  }, 'vote-1'));

  // 3. Double voting by same verifier with different idempotency key rejected
  await assert.rejects(
    engine.executeCommand(command('CastVerificationVote', {
      observationId: 'obs-200',
      voterId: 'verifier-alice',
      vote: VoteType.DISPUTE
    }, 'vote-2')),
    /already voted on claim/
  );
});

test('quorum consensus confirmation emits ConsensusReached and VerificationCompleted', async () => {
  const { engine, eventBus } = createFixture();

  await engine.executeCommand(command('InitiateVerification', {
    observationId: 'obs-300',
    claimantId: 'observer-3'
  }, 'init-3'));

  // Cast 3 CONFIRM votes to reach quorum (3) and supermajority
  await engine.executeCommand(command('CastVerificationVote', {
    observationId: 'obs-300',
    voterId: 'verifier-1',
    vote: VoteType.CONFIRM,
    weight: 1.0
  }, 'vote-3-1'));

  await engine.executeCommand(command('CastVerificationVote', {
    observationId: 'obs-300',
    voterId: 'verifier-2',
    vote: VoteType.CONFIRM,
    weight: 1.0
  }, 'vote-3-2'));

  const finalVote = await engine.executeCommand(command('CastVerificationVote', {
    observationId: 'obs-300',
    voterId: 'verifier-3',
    vote: VoteType.CONFIRM,
    weight: 1.0
  }, 'vote-3-3'));

  assert.equal(finalVote.consensusReached, true);
  assert.equal(finalVote.outcome, 'CONFIRMED');
  assert.equal(finalVote.claim.status, VerificationStatus.VERIFIED);
  assert.equal(finalVote.claim.credibilityScore, 100);

  // Verify events emitted
  const events = eventBus.getHistory();
  const eventTypes = events.map(e => e.eventType);

  assert.ok(eventTypes.includes('econet.verification.consensus_reached'));
  assert.ok(eventTypes.includes('econet.verification.completed'));

  // Verify status query API
  const status = await engine.getVerificationStatus('obs-300');
  assert.equal(status.status, VerificationStatus.VERIFIED);
  assert.equal(status.consensusReached, true);
  assert.equal(status.totalVotes, 3);
});

test('dispute consensus rejection emits ConsensusReached and ObservationRejected', async () => {
  const { engine, eventBus } = createFixture();

  await engine.executeCommand(command('InitiateVerification', {
    observationId: 'obs-400',
    claimantId: 'observer-4'
  }, 'init-4'));

  // Cast 3 DISPUTE votes
  await engine.executeCommand(command('CastVerificationVote', {
    observationId: 'obs-400',
    voterId: 'verifier-a',
    vote: VoteType.DISPUTE
  }, 'vote-4-1'));

  await engine.executeCommand(command('CastVerificationVote', {
    observationId: 'obs-400',
    voterId: 'verifier-b',
    vote: VoteType.DISPUTE
  }, 'vote-4-2'));

  const finalVote = await engine.executeCommand(command('CastVerificationVote', {
    observationId: 'obs-400',
    voterId: 'verifier-c',
    vote: VoteType.DISPUTE
  }, 'vote-4-3'));

  assert.equal(finalVote.consensusReached, true);
  assert.equal(finalVote.outcome, 'REJECTED');
  assert.equal(finalVote.claim.status, VerificationStatus.REJECTED);
  assert.equal(finalVote.claim.credibilityScore, 0);

  const eventTypes = eventBus.getHistory().map(e => e.eventType);
  assert.ok(eventTypes.includes('econet.verification.consensus_reached'));
  assert.ok(eventTypes.includes('econet.verification.rejected'));
});
