import test from 'node:test';
import assert from 'node:assert/strict';

import { Command } from '../../../contracts/commands/Command.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import {
  ActionEngine,
  InMemoryActionRepository,
  ActionType,
  DispatchStatus,
  HmacSigner,
  RateLimiter
} from '../index.js';

const command = (commandType, payload, suffix) => new Command({
  commandType,
  targetEngine: '12-action',
  payload,
  actor: { actorId: 'authority-agent-1', roles: ['dispatcher'] },
  idempotencyKey: `act-test-${suffix}`,
  correlationId: `cor-${suffix}`
});

const createFixture = ({ transport = null, rateLimiter = null } = {}) => {
  const repository = new InMemoryActionRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new ActionEngine({
    repository,
    eventBus,
    idempotencyManager,
    transport: transport || { send: async () => ({ success: true, responseCode: 200 }) },
    rateLimiter: rateLimiter || new RateLimiter({ windowMs: 60000, maxRequests: 5 }),
    clock: () => new Date('2029-05-01T12:00:00.000Z'),
    sleeper: async () => {} // Instant sleeper for fast tests
  });
  return { engine, repository, eventBus, idempotencyManager };
};

test('HmacSigner produces valid signature headers and rejects tampered content', () => {
  const signer = new HmacSigner();
  const secret = 'super-secret-key-12345';
  const timestamp = '2029-05-01T12:00:00.000Z';
  const payload = { alertId: 'alert-99', severity: 'CRITICAL', zone: 'Abuja' };

  const { signature, headers } = signer.signPayload({ payload, secret, timestamp });

  assert.match(signature, /^sha256=[0-9a-f]{64}$/);
  assert.equal(headers['X-EcoNet-Signature'], signature);
  assert.equal(headers['X-EcoNet-Timestamp'], timestamp);

  // Verification succeeds with matching parameters
  const valid = signer.verifySignature({
    payload,
    secret,
    timestamp,
    signature
  });
  assert.equal(valid, true);

  // Tampered payload fails verification
  const tampered = signer.verifySignature({
    payload: { ...payload, severity: 'LOW' },
    secret,
    timestamp,
    signature
  });
  assert.equal(tampered, false);

  // Wrong secret fails verification
  const wrongSecret = signer.verifySignature({
    payload,
    secret: 'wrong-secret',
    timestamp,
    signature
  });
  assert.equal(wrongSecret, false);
});

test('action dispatch signs webhook payload and emits canonical action.dispatched event', async () => {
  let capturedCall = null;
  const transport = {
    send: async (target, payload, headers) => {
      capturedCall = { target, payload, headers };
      return { success: true, responseCode: 202 };
    }
  };

  const { engine, eventBus } = createFixture({ transport });

  const res = await engine.executeCommand(command('DispatchAction', {
    actionType: ActionType.WEBHOOK,
    target: 'https://emergency.gov.ng/api/v1/alerts',
    payload: { incident: 'FLOOD_WARNING', zone: 'Abuja' },
    secret: 'gov-webhook-secret-999'
  }, 'dispatch-1'));

  assert.equal(res.succeeded, true);
  assert.equal(res.dispatch.status, DispatchStatus.DISPATCHED);
  assert.equal(res.dispatch.attempts.length, 1);
  assert.equal(res.dispatch.attempts[0].responseCode, 202);

  // Verify headers passed to transport
  assert.ok(capturedCall);
  assert.equal(capturedCall.target, 'https://emergency.gov.ng/api/v1/alerts');
  assert.match(capturedCall.headers['X-EcoNet-Signature'], /^sha256=[0-9a-f]{64}$/);

  // Verify domain event
  const events = eventBus.getHistory();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, 'econet.action.dispatched');
  assert.equal(events[0].producer, 'engine.12.action');
});

test('exponential backoff retries on transient transport failures and succeeds', async () => {
  let attempts = 0;
  const transport = {
    send: async () => {
      attempts++;
      if (attempts < 3) {
        return { success: false, responseCode: 503, error: 'Service Unavailable' };
      }
      return { success: true, responseCode: 200 };
    }
  };

  const { engine, eventBus } = createFixture({ transport });

  const res = await engine.executeCommand(command('DispatchAction', {
    target: 'https://actuator.network/valves/close',
    payload: { valveId: 'V-102' },
    maxRetries: 3
  }, 'retry-1'));

  assert.equal(res.succeeded, true);
  assert.equal(attempts, 3);
  assert.equal(res.dispatch.status, DispatchStatus.DISPATCHED);
  assert.equal(res.dispatch.attempts.length, 3);
  assert.equal(res.dispatch.attempts[0].success, false);
  assert.equal(res.dispatch.attempts[1].success, false);
  assert.equal(res.dispatch.attempts[2].success, true);

  const events = eventBus.getHistory();
  assert.equal(events.filter(e => e.eventType === 'econet.action.dispatched').length, 1);
});

test('retry exhaustion marks status FAILED and emits action.delivery_failed', async () => {
  const transport = {
    send: async () => ({ success: false, responseCode: 500, error: 'Connection Refused' })
  };

  const { engine, eventBus } = createFixture({ transport });

  const res = await engine.executeCommand(command('DispatchAction', {
    target: 'https://offline-endpoint.local/notify',
    payload: { alert: 'FAIL_TEST' },
    maxRetries: 2
  }, 'fail-1'));

  assert.equal(res.succeeded, false);
  assert.equal(res.dispatch.status, DispatchStatus.FAILED);
  assert.equal(res.dispatch.attempts.length, 3); // initial + 2 retries

  const events = eventBus.getHistory();
  const failedEvents = events.filter(e => e.eventType === 'econet.action.delivery_failed');
  assert.equal(failedEvents.length, 1);
  assert.equal(failedEvents[0].payload.lastError, 'Connection Refused');
});

test('rate limiting blocks excessive dispatches and emits action.rate_limited', async () => {
  const rateLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 2 });
  const { engine, eventBus } = createFixture({ rateLimiter });

  // First 2 dispatches pass
  await engine.executeCommand(command('DispatchAction', {
    target: 'https://limited.api/call',
    payload: { n: 1 }
  }, 'rl-1'));

  await engine.executeCommand(command('DispatchAction', {
    target: 'https://limited.api/call',
    payload: { n: 2 }
  }, 'rl-2'));

  // 3rd dispatch violates rate limit
  await assert.rejects(
    engine.executeCommand(command('DispatchAction', {
      target: 'https://limited.api/call',
      payload: { n: 3 }
    }, 'rl-3')),
    /Action dispatch rate limit exceeded/
  );

  const events = eventBus.getHistory();
  assert.ok(events.some(e => e.eventType === 'econet.action.rate_limited'));
});

test('webhook logs query retrieves historical dispatch attempts', async () => {
  const { engine } = createFixture();

  await engine.executeCommand(command('DispatchAction', {
    target: 'https://target-a.com/hook',
    payload: { a: 1 }
  }, 'log-1'));

  await engine.executeCommand(command('DispatchAction', {
    target: 'https://target-b.com/hook',
    payload: { b: 2 }
  }, 'log-2'));

  const targetALogs = await engine.getWebhookLogs('https://target-a.com/hook');
  assert.equal(targetALogs.length, 1);
  assert.equal(targetALogs[0].target, 'https://target-a.com/hook');

  const allLogs = await engine.getWebhookLogs();
  assert.equal(allLogs.length, 2);
});
