import test from 'node:test';
import assert from 'node:assert/strict';

import { Command } from '../../contracts/commands/Command.js';
import { EventBus } from '../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../infrastructure/idempotency/IdempotencyManager.js';

import {
  ActionEngine,
  InMemoryActionRepository,
  ActionType,
  DispatchStatus,
  HmacSigner,
  RateLimiter
} from '../../engines/12-action/index.js';

test('Workflow B: Critical Risk / Mission -> Action Engine -> Verified HMAC Webhook Dispatch', async () => {
  const sharedEventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const hmacSigner = new HmacSigner();

  const webhookSecret = 'nema-nigeria-emergency-key-9988';
  let receivedAtWebhook = null;

  // Mock external agency webhook transport endpoint
  const transport = {
    send: async (target, payload, headers) => {
      // Simulate external webhook receiving and verifying the request
      const signature = headers['X-EcoNet-Signature'];
      const timestamp = headers['X-EcoNet-Timestamp'];

      const isValid = hmacSigner.verifySignature({
        payload,
        secret: webhookSecret,
        timestamp,
        signature
      });

      if (!isValid) {
        return { success: false, responseCode: 401, error: 'Unauthorized: Invalid HMAC signature' };
      }

      receivedAtWebhook = { target, payload, headers, verified: true };
      return { success: true, responseCode: 200 };
    }
  };

  const actionEngine = new ActionEngine({
    repository: new InMemoryActionRepository(),
    hmacSigner,
    rateLimiter: new RateLimiter({ windowMs: 60000, maxRequests: 10 }),
    transport,
    eventBus: sharedEventBus,
    idempotencyManager,
    clock: () => new Date('2029-06-01T12:00:00.000Z')
  });

  const correlationId = 'cor-workflow-b-001';

  // STEP 1: Dispatch critical alert to NEMA (National Emergency Management Agency)
  const dispatchCmd = new Command({
    commandType: 'DispatchAction',
    targetEngine: '12-action',
    actor: { actorId: 'risk-response-orchestrator', roles: ['mission_lead', 'system'] },
    idempotencyKey: 'wf-b-dispatch-1',
    correlationId,
    payload: {
      actionType: ActionType.WEBHOOK,
      target: 'https://api.nema.gov.ng/webhooks/early-warning',
      payload: {
        alertType: 'CRITICAL_FLOOD_CLUSTER',
        zone: 'Ihiala Basin, Anambra State',
        urgency: 'IMMEDIATE',
        affectedCoordinates: { latitude: 5.8542, longitude: 6.8601 },
        recommendedAction: 'Deploy evacuation boats and emergency relief teams'
      },
      secret: webhookSecret
    }
  });

  const dispatchRes = await actionEngine.executeCommand(dispatchCmd);

  // Assert dispatch succeeded
  assert.equal(dispatchRes.succeeded, true);
  assert.equal(dispatchRes.dispatch.status, DispatchStatus.DISPATCHED);
  assert.equal(dispatchRes.dispatch.attempts.length, 1);

  // Assert the external receiving webhook received and successfully verified the HMAC signature
  assert.ok(receivedAtWebhook);
  assert.equal(receivedAtWebhook.verified, true);
  assert.equal(receivedAtWebhook.target, 'https://api.nema.gov.ng/webhooks/early-warning');
  assert.match(receivedAtWebhook.headers['X-EcoNet-Signature'], /^sha256=[0-9a-f]{64}$/);

  // STEP 2: Query historical webhook logs via canonical API contract (/actions/webhooks/logs)
  const logs = await actionEngine.getWebhookLogs('https://api.nema.gov.ng/webhooks/early-warning');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].dispatchId, dispatchRes.dispatch.dispatchId);
  assert.equal(logs[0].status, DispatchStatus.DISPATCHED);

  // STEP 3: Verify audit event emission
  const events = sharedEventBus.getHistory();
  const dispatchEvents = events.filter(e => e.eventType === 'econet.action.dispatched');
  assert.equal(dispatchEvents.length, 1);
  assert.equal(dispatchEvents[0].correlationId, correlationId);
  assert.equal(dispatchEvents[0].producer, 'engine.12.action');
});
