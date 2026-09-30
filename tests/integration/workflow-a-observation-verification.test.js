import test from 'node:test';
import assert from 'node:assert/strict';

import { Command } from '../../contracts/commands/Command.js';
import { EventBus } from '../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../infrastructure/idempotency/IdempotencyManager.js';

import {
  ObservationEngine,
  InMemoryObservationRepository,
  ObservationStatus,
  ObservationCategory
} from '../../engines/02-observation/index.js';

import {
  GeospatialEngine,
  InMemoryGeospatialIndex
} from '../../engines/07-geospatial/index.js';

import {
  VerificationEngine,
  InMemoryVerificationRepository,
  VerificationStatus,
  VoteType
} from '../../engines/13-verification/index.js';

test('Workflow A: Environmental Observation -> Geospatial Clustering -> Verification Consensus', async () => {
  const sharedEventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();

  const observationEngine = new ObservationEngine({
    repository: new InMemoryObservationRepository(),
    eventBus: sharedEventBus,
    idempotencyManager,
    clock: () => new Date('2029-06-01T10:00:00.000Z')
  });

  const geospatialEngine = new GeospatialEngine({
    repository: new InMemoryGeospatialIndex(),
    eventBus: sharedEventBus,
    idempotencyManager,
    clock: () => new Date('2029-06-01T10:01:00.000Z')
  });

  const verificationEngine = new VerificationEngine({
    repository: new InMemoryVerificationRepository(),
    eventBus: sharedEventBus,
    idempotencyManager,
    clock: () => new Date('2029-06-01T10:02:00.000Z')
  });

  // Track event flow
  const workflowEvents = [];
  sharedEventBus.subscribeAll((event) => {
    workflowEvents.push(event);
  });

  const correlationId = 'cor-workflow-a-001';

  // STEP 1: Observation Engine ingests environmental reports in Ihiala flood zone
  const obsCmd1 = new Command({
    commandType: 'SubmitObservation',
    targetEngine: '02-observation',
    actor: { actorId: 'observer-citizen-1', roles: ['observer'] },
    idempotencyKey: 'wf-obs-1',
    correlationId,
    payload: {
      category: ObservationCategory.FLOOD,
      severity: 'CRITICAL',
      urgency: 'IMMEDIATE',
      location: {
        latitude: 5.8542,
        longitude: 6.8601,
        address: 'Ezeani Road, Ihiala',
        city: 'Ihiala',
        state: 'Anambra'
      },
      description: 'Severe roadside flooding blocking emergency evacuation route.',
      evidence: [{ url: 'https://storage.econet.io/evidence/ihiala-flood-1.jpg' }]
    }
  });
  const obsRes1 = await observationEngine.executeCommand(obsCmd1);
  const obsId1 = obsRes1.observation.observationId;

  // Submit two more nearby observations to form a spatial cluster
  const obsCmd2 = new Command({
    commandType: 'SubmitObservation',
    targetEngine: '02-observation',
    actor: { actorId: 'observer-citizen-2', roles: ['observer'] },
    idempotencyKey: 'wf-obs-2',
    correlationId,
    payload: {
      category: ObservationCategory.FLOOD,
      severity: 'CRITICAL',
      urgency: 'IMMEDIATE',
      location: { latitude: 5.8560, longitude: 6.8620, city: 'Ihiala', state: 'Anambra' },
      description: 'Bridge submerged 500m north of Ezeani road.',
      evidence: [{ url: 'https://storage.econet.io/evidence/ihiala-flood-2.jpg' }]
    }
  });
  const obsRes2 = await observationEngine.executeCommand(obsCmd2);
  const obsId2 = obsRes2.observation.observationId;

  const obsCmd3 = new Command({
    commandType: 'SubmitObservation',
    targetEngine: '02-observation',
    actor: { actorId: 'observer-citizen-3', roles: ['observer'] },
    idempotencyKey: 'wf-obs-3',
    correlationId,
    payload: {
      category: ObservationCategory.FLOOD,
      severity: 'CRITICAL',
      urgency: 'IMMEDIATE',
      location: { latitude: 5.8530, longitude: 6.8590, city: 'Ihiala', state: 'Anambra' },
      description: 'Water levels rising rapidly into residential compounds.',
      evidence: [{ url: 'https://storage.econet.io/evidence/ihiala-flood-3.jpg' }]
    }
  });
  const obsRes3 = await observationEngine.executeCommand(obsCmd3);
  const obsId3 = obsRes3.observation.observationId;

  // STEP 2: Index coordinates into Geospatial Engine (SpatialClusterDetected)
  await geospatialEngine.executeCommand(new Command({
    commandType: 'IndexSpatialPoint',
    targetEngine: '07-geospatial',
    actor: { actorId: 'pipeline', roles: ['system'] },
    idempotencyKey: 'wf-geo-1',
    correlationId,
    payload: {
      latitude: obsRes1.observation.location.latitude,
      longitude: obsRes1.observation.location.longitude,
      entityId: obsId1,
      category: 'FLOOD',
      clusterRadiusKm: 5,
      clusterMinPoints: 3
    }
  }));

  await geospatialEngine.executeCommand(new Command({
    commandType: 'IndexSpatialPoint',
    targetEngine: '07-geospatial',
    actor: { actorId: 'pipeline', roles: ['system'] },
    idempotencyKey: 'wf-geo-2',
    correlationId,
    payload: {
      latitude: obsRes2.observation.location.latitude,
      longitude: obsRes2.observation.location.longitude,
      entityId: obsId2,
      category: 'FLOOD',
      clusterRadiusKm: 5,
      clusterMinPoints: 3
    }
  }));

  const geoRes3 = await geospatialEngine.executeCommand(new Command({
    commandType: 'IndexSpatialPoint',
    targetEngine: '07-geospatial',
    actor: { actorId: 'pipeline', roles: ['system'] },
    idempotencyKey: 'wf-geo-3',
    correlationId,
    payload: {
      latitude: obsRes3.observation.location.latitude,
      longitude: obsRes3.observation.location.longitude,
      entityId: obsId3,
      category: 'FLOOD',
      clusterRadiusKm: 5,
      clusterMinPoints: 3
    }
  }));

  // Confirm cluster was detected by Geospatial Engine
  assert.equal(geoRes3.clustersDetected.length, 1);
  assert.equal(geoRes3.clustersDetected[0].pointCount, 3);
  assert.ok(geoRes3.clustersDetected[0].entityIds.includes(obsId1));

  // STEP 3: Verification Engine initiates verification claim for the primary observation
  const initClaimRes = await verificationEngine.executeCommand(new Command({
    commandType: 'InitiateVerification',
    targetEngine: '13-verification',
    actor: { actorId: 'verification-coordinator', roles: ['system'] },
    idempotencyKey: 'wf-ver-init-1',
    correlationId,
    payload: {
      observationId: obsId1,
      claimantId: 'observer-citizen-1',
      initialScore: 50.0
    }
  }));
  assert.equal(initClaimRes.claim.status, VerificationStatus.PENDING);

  // STEP 4: Verifiers cast consensus votes
  await verificationEngine.executeCommand(new Command({
    commandType: 'CastVerificationVote',
    targetEngine: '13-verification',
    actor: { actorId: 'verifier-field-1', roles: ['verifier'] },
    idempotencyKey: 'wf-ver-vote-1',
    correlationId,
    payload: {
      observationId: obsId1,
      voterId: 'verifier-field-1',
      vote: VoteType.CONFIRM,
      weight: 1.0,
      reasoning: 'Confirmed high water levels via satellite overlay.'
    }
  }));

  await verificationEngine.executeCommand(new Command({
    commandType: 'CastVerificationVote',
    targetEngine: '13-verification',
    actor: { actorId: 'verifier-field-2', roles: ['verifier'] },
    idempotencyKey: 'wf-ver-vote-2',
    correlationId,
    payload: {
      observationId: obsId1,
      voterId: 'verifier-field-2',
      vote: VoteType.CONFIRM,
      weight: 1.2,
      reasoning: 'Local meteorological radar confirms torrential downpour.'
    }
  }));

  const finalVoteRes = await verificationEngine.executeCommand(new Command({
    commandType: 'CastVerificationVote',
    targetEngine: '13-verification',
    actor: { actorId: 'verifier-field-3', roles: ['verifier'] },
    idempotencyKey: 'wf-ver-vote-3',
    correlationId,
    payload: {
      observationId: obsId1,
      voterId: 'verifier-field-3',
      vote: VoteType.CONFIRM,
      weight: 1.0,
      reasoning: 'On-the-ground visual corroboration.'
    }
  }));

  // Confirm consensus outcome
  assert.equal(finalVoteRes.consensusReached, true);
  assert.equal(finalVoteRes.outcome, 'CONFIRMED');
  assert.equal(finalVoteRes.claim.status, VerificationStatus.VERIFIED);
  assert.equal(finalVoteRes.claim.credibilityScore, 100);

  // STEP 5: Update Observation status to VERIFIED
  const updateObsRes = await observationEngine.executeCommand(new Command({
    commandType: 'UpdateObservationStatus',
    targetEngine: '02-observation',
    actor: { actorId: 'system-pipeline', roles: ['system'] },
    idempotencyKey: 'wf-obs-verify-1',
    correlationId,
    payload: {
      observationId: obsId1,
      status: ObservationStatus.VERIFIED,
      reason: 'ConsensusReached in Engine 13'
    }
  }));
  assert.equal(updateObsRes.observation.status, ObservationStatus.VERIFIED);

  // Verify full event audit trail
  const eventTypes = workflowEvents.map(e => e.eventType);
  assert.ok(eventTypes.includes('econet.observation.submitted'));
  assert.ok(eventTypes.includes('econet.spatial.cluster_detected'));
  assert.ok(eventTypes.includes('econet.verification.initiated'));
  assert.ok(eventTypes.includes('econet.verification.vote_recorded'));
  assert.ok(eventTypes.includes('econet.verification.consensus_reached'));
  assert.ok(eventTypes.includes('econet.verification.completed'));
  assert.ok(eventTypes.includes('econet.observation.status_changed'));

  // All events preserve correlationId
  assert.ok(workflowEvents.every(e => e.correlationId === correlationId));
});
