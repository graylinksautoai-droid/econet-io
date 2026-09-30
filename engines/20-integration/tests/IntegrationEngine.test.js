import test from 'node:test';
import assert from 'node:assert/strict';

import { Command } from '../../../contracts/commands/Command.js';
import { EventBus } from '../../../infrastructure/messaging/EventBus.js';
import { IdempotencyManager } from '../../../infrastructure/idempotency/IdempotencyManager.js';
import {
  IntegrationEngine,
  IntegrationApplicationService,
  InMemoryConnectorRepository,
  ExternalConnector,
  ConnectorConfig,
  ConnectorType,
  ConnectorStatus,
  normalizeConnectorType,
  canTransitionConnectorStatus,
  assertConnectorStatusTransition,
  isTerminalConnectorStatus,
  isOperationalConnectorStatus
} from '../index.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

const OPERATOR = { actorId: 'mgr-1', roles: ['integration_manager'] };

const cmd = (commandType, payload, suffix, actor = OPERATOR) => new Command({
  commandType,
  targetEngine: '20-integration',
  payload,
  actor,
  idempotencyKey: `int-test-${suffix}`,
  correlationId: `cor-${suffix}`
});

const createFixture = (options = {}) => {
  const repository = new InMemoryConnectorRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new IntegrationEngine({
    repository,
    eventBus,
    idempotencyManager,
    clock: () => new Date('2030-01-15T08:00:00.000Z'),
    ...options
  });
  return { engine, repository, eventBus, idempotencyManager };
};

const VALID_REGISTER_PAYLOAD = {
  name: 'satellite-api-1',
  connectorType: 'SATELLITE_API',
  description: 'Copernicus satellite data connector',
  endpointUrl: 'https://api.satellite.example.com/v2/data',
  credentialRef: 'cred-ref-abc123',
  timeoutMs: 8000,
  headers: { 'Accept': 'application/json' }
};

// ─── ConnectorType value object ───────────────────────────────────────────────

test('ConnectorType vocabulary is limited to the six canonical types', () => {
  assert.equal(normalizeConnectorType('satellite_api'), ConnectorType.SATELLITE_API);
  assert.equal(normalizeConnectorType('WEATHER_API'), ConnectorType.WEATHER_API);
  assert.equal(normalizeConnectorType('sensor_gateway'), ConnectorType.SENSOR_GATEWAY);
  assert.equal(normalizeConnectorType('INSTITUTIONAL_API'), ConnectorType.INSTITUTIONAL_API);
  assert.equal(normalizeConnectorType('webhook_endpoint'), ConnectorType.WEBHOOK_ENDPOINT);
  assert.equal(normalizeConnectorType('protocol_gateway'), ConnectorType.PROTOCOL_GATEWAY);

  assert.throws(() => normalizeConnectorType('MQTT'), /Invalid connector type/);
  assert.throws(() => normalizeConnectorType(''), /Invalid connector type/);
  assert.throws(() => normalizeConnectorType(null), /Invalid connector type/);
});

// ─── ConnectorStatus value object ─────────────────────────────────────────────

test('ConnectorStatus enforces the connector lifecycle transitions', () => {
  // Valid transitions
  assert.equal(canTransitionConnectorStatus(ConnectorStatus.DRAFT, ConnectorStatus.ACTIVE), true);
  assert.equal(canTransitionConnectorStatus(ConnectorStatus.DRAFT, ConnectorStatus.RETIRED), true);
  assert.equal(canTransitionConnectorStatus(ConnectorStatus.ACTIVE, ConnectorStatus.PAUSED), true);
  assert.equal(canTransitionConnectorStatus(ConnectorStatus.ACTIVE, ConnectorStatus.RETIRED), true);
  assert.equal(canTransitionConnectorStatus(ConnectorStatus.PAUSED, ConnectorStatus.ACTIVE), true);
  assert.equal(canTransitionConnectorStatus(ConnectorStatus.PAUSED, ConnectorStatus.RETIRED), true);

  // Invalid transitions
  assert.equal(canTransitionConnectorStatus(ConnectorStatus.DRAFT, ConnectorStatus.PAUSED), false);
  assert.equal(canTransitionConnectorStatus(ConnectorStatus.RETIRED, ConnectorStatus.ACTIVE), false, 'RETIRED is terminal');
  assert.equal(canTransitionConnectorStatus(ConnectorStatus.RETIRED, ConnectorStatus.PAUSED), false);

  assert.throws(() => assertConnectorStatusTransition(ConnectorStatus.RETIRED, ConnectorStatus.ACTIVE), /Invalid connector status transition/);
  assert.equal(isTerminalConnectorStatus(ConnectorStatus.RETIRED), true);
  assert.equal(isTerminalConnectorStatus(ConnectorStatus.ACTIVE), false);
  assert.equal(isOperationalConnectorStatus(ConnectorStatus.ACTIVE), true);
  assert.equal(isOperationalConnectorStatus(ConnectorStatus.PAUSED), false);
});

// ─── ConnectorConfig entity ───────────────────────────────────────────────────

test('ConnectorConfig validates endpointUrl and rejects private/loopback addresses (SSRF prevention)', () => {
  // Valid
  const cfg = new ConnectorConfig({ endpointUrl: 'https://api.weather.example.com/v1' });
  assert.equal(cfg.endpointUrl, 'https://api.weather.example.com/v1');
  assert.equal(cfg.timeoutMs, 10000); // default

  // Invalid schemes
  assert.throws(() => new ConnectorConfig({ endpointUrl: 'file:///etc/passwd' }), /scheme "file:" is not permitted/);
  assert.throws(() => new ConnectorConfig({ endpointUrl: 'ftp://example.com' }), /scheme "ftp:" is not permitted/);

  // Non-URL
  assert.throws(() => new ConnectorConfig({ endpointUrl: 'not-a-url' }), /not a valid URL/);
  assert.throws(() => new ConnectorConfig({ endpointUrl: '' }), /non-empty endpointUrl/);

  // Private IP ranges
  assert.throws(() => new ConnectorConfig({ endpointUrl: 'https://127.0.0.1/api' }), /private\/loopback address/);
  assert.throws(() => new ConnectorConfig({ endpointUrl: 'https://localhost/api' }), /private\/loopback address/);
  assert.throws(() => new ConnectorConfig({ endpointUrl: 'https://10.0.0.1/api' }), /private\/loopback address/);
  assert.throws(() => new ConnectorConfig({ endpointUrl: 'https://192.168.1.1/api' }), /private\/loopback address/);
  assert.throws(() => new ConnectorConfig({ endpointUrl: 'https://172.16.0.1/api' }), /private\/loopback address/);

  // Timeout bounds
  assert.throws(() => new ConnectorConfig({ endpointUrl: 'https://api.example.com', timeoutMs: 50 }), /between 100 and 120000/);
  assert.throws(() => new ConnectorConfig({ endpointUrl: 'https://api.example.com', timeoutMs: 200000 }), /between 100 and 120000/);

  // Secret-bearing header key rejection
  assert.throws(
    () => new ConnectorConfig({ endpointUrl: 'https://api.example.com', headers: { 'Authorization': 'Bearer abc' } }),
    /appears to contain a secret/
  );
  assert.throws(
    () => new ConnectorConfig({ endpointUrl: 'https://api.example.com', headers: { 'api-key': 'xyz' } }),
    /appears to contain a secret/
  );

  // Credential ref
  assert.throws(
    () => new ConnectorConfig({ endpointUrl: 'https://api.example.com', credentialRef: '' }),
    /non-empty string or null/
  );
});

// ─── ExternalConnector entity ─────────────────────────────────────────────────

test('ExternalConnector validates construction and is immutable', () => {
  const config = new ConnectorConfig({
    endpointUrl: 'https://api.satellite.example.com/v1',
    credentialRef: 'cred-ref-sat-1',
    timeoutMs: 5000
  });

  const connector = new ExternalConnector({
    name: 'sat-api',
    connectorType: 'SATELLITE_API',
    config
  });

  assert.match(connector.connectorId, /^con_/);
  assert.equal(connector.name, 'sat-api');
  assert.equal(connector.connectorType, ConnectorType.SATELLITE_API);
  assert.equal(connector.status, ConnectorStatus.DRAFT);
  assert.equal(Object.isFrozen(connector), true);
  assert.equal(connector.config.credentialRef, 'cred-ref-sat-1');

  // Lifecycle transitions
  const activated = connector.transitionTo(ConnectorStatus.ACTIVE);
  assert.equal(activated.status, ConnectorStatus.ACTIVE);
  assert.notEqual(activated, connector);

  const paused = activated.transitionTo(ConnectorStatus.PAUSED);
  assert.equal(paused.status, ConnectorStatus.PAUSED);

  const retired = paused.transitionTo(ConnectorStatus.RETIRED);
  assert.equal(retired.status, ConnectorStatus.RETIRED);

  assert.throws(() => retired.transitionTo(ConnectorStatus.ACTIVE), /Invalid connector status transition/);

  // Construction validation
  assert.throws(() => new ExternalConnector({ name: '', connectorType: 'WEATHER_API', config: { endpointUrl: 'https://x.com' } }), /non-empty name/);
  assert.throws(() => new ExternalConnector({ name: 'x', connectorType: 'BOGUS', config: { endpointUrl: 'https://x.com' } }), /Invalid connector type/);
});

test('ExternalConnector.applyConfigUpdate returns new instance and rejects RETIRED connectors', () => {
  const connector = new ExternalConnector({
    name: 'weather-1',
    connectorType: 'WEATHER_API',
    config: { endpointUrl: 'https://api.weather.example.com/v1' }
  });

  const updated = connector.applyConfigUpdate({
    endpointUrl: 'https://api.weather.example.com/v2',
    timeoutMs: 5000
  });
  assert.equal(updated.config.endpointUrl, 'https://api.weather.example.com/v2');
  assert.equal(updated.config.timeoutMs, 5000);
  assert.notEqual(updated.connectorId, undefined);

  // Cannot update a RETIRED connector
  const retired = connector.transitionTo(ConnectorStatus.RETIRED);
  assert.throws(
    () => retired.applyConfigUpdate({ endpointUrl: 'https://api.weather.example.com/v3' }),
    /Cannot update a RETIRED connector/
  );
});

// ─── RegisterConnector ────────────────────────────────────────────────────────

test('RegisterConnector creates a DRAFT connector and emits connector_registered', async () => {
  const { engine, repository, eventBus } = createFixture();

  const res = await engine.executeCommand(cmd('RegisterConnector', VALID_REGISTER_PAYLOAD, 'reg-1'));

  assert.match(res.connector.connectorId, /^con_/);
  assert.equal(res.connector.name, 'satellite-api-1');
  assert.equal(res.connector.connectorType, ConnectorType.SATELLITE_API);
  assert.equal(res.connector.status, ConnectorStatus.DRAFT);
  assert.equal(res.connector.registeredBy, 'mgr-1');
  assert.equal(res.connector.config.credentialRef, 'cred-ref-abc123');
  assert.equal(await repository.count(), 1);

  const events = eventBus.getHistory({ eventType: 'econet.integration.connector_registered' });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.20.integration');
  assert.equal(events[0].subject.entityType, 'external_connector');
  assert.equal(events[0].payload.connectorType, ConnectorType.SATELLITE_API);
  // Event payload must NOT contain raw credentials (credentialRef is an opaque reference, not a secret)
  assert.equal(events[0].payload.endpointUrl, 'https://api.satellite.example.com/v2/data');
});

test('RegisterConnector rejects invalid connector types and duplicate names', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(cmd('RegisterConnector', {
      name: 'bad-type',
      connectorType: 'ORACLE_DB',
      endpointUrl: 'https://api.example.com'
    }, 'reg-bad-type')),
    /Invalid connector type/
  );

  await assert.rejects(
    engine.executeCommand(cmd('RegisterConnector', {
      name: '',
      connectorType: 'SATELLITE_API',
      endpointUrl: 'https://api.example.com'
    }, 'reg-no-name')),
    /non-empty name/
  );

  // Register once successfully
  await engine.executeCommand(cmd('RegisterConnector', VALID_REGISTER_PAYLOAD, 'reg-dup-1'));

  // Duplicate name rejected
  await assert.rejects(
    engine.executeCommand(cmd('RegisterConnector', VALID_REGISTER_PAYLOAD, 'reg-dup-2')),
    /already registered/
  );
});

test('RegisterConnector rejects private/loopback endpointUrls (SSRF prevention)', async () => {
  const { engine } = createFixture();

  const ssrfVariants = [
    'http://127.0.0.1:8080/internal',
    'https://localhost/admin',
    'https://10.0.0.1/api',
    'https://192.168.0.1/data',
    'https://172.16.1.2/feed',
    'file:///etc/passwd'
  ];

  for (const endpointUrl of ssrfVariants) {
    await assert.rejects(
      engine.executeCommand(cmd('RegisterConnector', {
        name: `ssrf-${Date.now()}-${Math.random()}`,
        connectorType: 'SENSOR_GATEWAY',
        endpointUrl
      }, `ssrf-${Date.now()}`)),
      /private\/loopback address|scheme "file:"/,
      `Expected SSRF rejection for ${endpointUrl}`
    );
  }
});

// ─── Connector lifecycle commands ─────────────────────────────────────────────

test('Connector lifecycle: DRAFT → ACTIVE → PAUSED → ACTIVE → RETIRED', async () => {
  const { engine, eventBus } = createFixture();

  const reg = await engine.executeCommand(cmd('RegisterConnector', VALID_REGISTER_PAYLOAD, 'lc-reg'));
  const { connectorId } = reg.connector;

  // Activate
  const activated = await engine.executeCommand(cmd('ActivateConnector', { connectorId }, 'lc-act'));
  assert.equal(activated.connector.status, ConnectorStatus.ACTIVE);

  // Pause
  const paused = await engine.executeCommand(cmd('PauseConnector', { connectorId }, 'lc-pause'));
  assert.equal(paused.connector.status, ConnectorStatus.PAUSED);

  // Re-activate from PAUSED
  const reactivated = await engine.executeCommand(cmd('ActivateConnector', { connectorId }, 'lc-react'));
  assert.equal(reactivated.connector.status, ConnectorStatus.ACTIVE);

  // Retire
  const retired = await engine.executeCommand(cmd('RetireConnector', { connectorId }, 'lc-ret'));
  assert.equal(retired.connector.status, ConnectorStatus.RETIRED);

  // Cannot transition from RETIRED
  await assert.rejects(
    engine.executeCommand(cmd('ActivateConnector', { connectorId }, 'lc-reretire')),
    /Invalid connector status transition/
  );
  await assert.rejects(
    engine.executeCommand(cmd('PauseConnector', { connectorId }, 'lc-repause')),
    /Invalid connector status transition/
  );

  const events = eventBus.getHistory();
  const types = events.map(e => e.eventType);
  assert.ok(types.includes('econet.integration.connector_registered'));
  assert.ok(types.includes('econet.integration.connector_activated'));
  assert.ok(types.includes('econet.integration.connector_paused'));
  assert.ok(types.includes('econet.integration.connector_retired'));
});

test('Cannot transition DRAFT directly to PAUSED', async () => {
  const { engine } = createFixture();

  const reg = await engine.executeCommand(cmd('RegisterConnector', VALID_REGISTER_PAYLOAD, 'dp-reg'));
  await assert.rejects(
    engine.executeCommand(cmd('PauseConnector', { connectorId: reg.connector.connectorId }, 'dp-pause')),
    /Invalid connector status transition/
  );
});

// ─── UpdateConnector ──────────────────────────────────────────────────────────

test('UpdateConnector changes config and emits connector_updated', async () => {
  const { engine, eventBus } = createFixture();

  const reg = await engine.executeCommand(cmd('RegisterConnector', VALID_REGISTER_PAYLOAD, 'upd-reg'));
  const { connectorId } = reg.connector;

  const updated = await engine.executeCommand(cmd('UpdateConnector', {
    connectorId,
    endpointUrl: 'https://api.satellite.example.com/v3/data',
    timeoutMs: 15000,
    description: 'Updated satellite endpoint'
  }, 'upd-1'));

  assert.equal(updated.connector.config.endpointUrl, 'https://api.satellite.example.com/v3/data');
  assert.equal(updated.connector.config.timeoutMs, 15000);
  assert.equal(updated.connector.description, 'Updated satellite endpoint');

  const events = eventBus.getHistory({ eventType: 'econet.integration.connector_updated' });
  assert.equal(events.length, 1);
  assert.equal(events[0].producer, 'engine.20.integration');
});

test('UpdateConnector rejects RETIRED connectors and invalid new endpointUrls', async () => {
  const { engine } = createFixture();

  const reg = await engine.executeCommand(cmd('RegisterConnector', VALID_REGISTER_PAYLOAD, 'upd-ret-reg'));
  const { connectorId } = reg.connector;

  await engine.executeCommand(cmd('ActivateConnector', { connectorId }, 'upd-ret-act'));
  await engine.executeCommand(cmd('RetireConnector', { connectorId }, 'upd-ret-ret'));

  await assert.rejects(
    engine.executeCommand(cmd('UpdateConnector', {
      connectorId,
      endpointUrl: 'https://api.satellite.example.com/v4'
    }, 'upd-ret-upd')),
    /RETIRED/
  );

  // Invalid new URL
  const reg2 = await engine.executeCommand(cmd('RegisterConnector', {
    ...VALID_REGISTER_PAYLOAD,
    name: 'sat-api-2'
  }, 'upd-bad-url-reg'));
  await assert.rejects(
    engine.executeCommand(cmd('UpdateConnector', {
      connectorId: reg2.connector.connectorId,
      endpointUrl: 'https://192.168.1.1/api'
    }, 'upd-bad-url')),
    /private\/loopback address/
  );
});

// ─── Queries ──────────────────────────────────────────────────────────────────

test('Queries return connectors and handle unknown IDs as null', async () => {
  const { engine } = createFixture();

  assert.equal(await engine.getConnector('con-missing'), null);
  assert.deepEqual(await engine.listConnectors(), []);
  assert.equal(await engine.getConnectorStatus('con-missing'), null);

  const reg = await engine.executeCommand(cmd('RegisterConnector', VALID_REGISTER_PAYLOAD, 'qry-reg'));
  const { connectorId } = reg.connector;

  const fetched = await engine.getConnector(connectorId);
  assert.equal(fetched.name, 'satellite-api-1');

  const list = await engine.listConnectors();
  assert.equal(list.length, 1);

  const filtered = await engine.listConnectors({ connectorType: 'SATELLITE_API' });
  assert.equal(filtered.length, 1);

  const notFiltered = await engine.listConnectors({ connectorType: 'WEATHER_API' });
  assert.equal(notFiltered.length, 0);

  const statusRecord = await engine.getConnectorStatus(connectorId);
  assert.equal(statusRecord.status, ConnectorStatus.DRAFT);
  assert.equal(statusRecord.connectorType, ConnectorType.SATELLITE_API);
});

// ─── Authorization ────────────────────────────────────────────────────────────

test('Authorization: missing actor is rejected', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(new Command({
      commandType: 'RegisterConnector',
      targetEngine: '20-integration',
      payload: VALID_REGISTER_PAYLOAD,
      idempotencyKey: 'auth-no-actor'
    })),
    /require an authenticated actor/
  );
});

test('Authorization: missing roles field is denied, not silently passed', async () => {
  const { engine } = createFixture();
  const noRolesActor = { actorId: 'user-no-roles' };

  await assert.rejects(
    engine.executeCommand(cmd('RegisterConnector', VALID_REGISTER_PAYLOAD, 'auth-no-roles', noRolesActor)),
    /lacks an authorized integration role/
  );
  assert.equal(await engine.listConnectors().then(l => l.length), 0);
});

test('Authorization: roles as non-array is denied', async () => {
  const { engine } = createFixture();

  const variants = [
    { actorId: 'u1', roles: 'integration_manager' },
    { actorId: 'u2', roles: { integration_manager: true } },
    { actorId: 'u3', roles: null },
    { actorId: 'u4', roles: 42 }
  ];

  for (const actor of variants) {
    await assert.rejects(
      engine.executeCommand(cmd('RegisterConnector', VALID_REGISTER_PAYLOAD, `auth-non-arr-${actor.actorId}`, actor)),
      /lacks an authorized integration role/
    );
  }
});

test('Authorization: empty roles array is denied', async () => {
  const { engine } = createFixture();
  const emptyActor = { actorId: 'user-empty', roles: [] };

  await assert.rejects(
    engine.executeCommand(cmd('RegisterConnector', VALID_REGISTER_PAYLOAD, 'auth-empty-roles', emptyActor)),
    /lacks an authorized integration role/
  );
});

test('Authorization: unauthorized role is denied on all five mutating commands', async () => {
  const { engine } = createFixture();

  // Register a connector with a valid actor so lifecycle commands have a target
  const reg = await engine.executeCommand(cmd('RegisterConnector', VALID_REGISTER_PAYLOAD, 'auth-deny-reg'));
  const { connectorId } = reg.connector;

  const observer = { actorId: 'observer-1', roles: ['observer'] };
  const cases = [
    ['RegisterConnector', { ...VALID_REGISTER_PAYLOAD, name: 'sat-api-auth-deny' }, 'auth-d-reg'],
    ['UpdateConnector', { connectorId, endpointUrl: 'https://api.example.com/new' }, 'auth-d-upd'],
    ['ActivateConnector', { connectorId }, 'auth-d-act'],
    ['PauseConnector', { connectorId }, 'auth-d-pause'],
    ['RetireConnector', { connectorId }, 'auth-d-ret']
  ];

  for (const [commandType, payload, suffix] of cases) {
    await assert.rejects(
      engine.executeCommand(cmd(commandType, payload, suffix, observer)),
      /lacks an authorized integration role/,
      `Expected denial for ${commandType}`
    );
  }

  // Connector status must be unchanged
  const unchanged = await engine.getConnector(connectorId);
  assert.equal(unchanged.status, ConnectorStatus.DRAFT);
});

test('Authorization: all four canonical authorized roles are accepted', async () => {
  const AUTHORIZED_ROLES = ['system', 'admin', 'integration_manager', 'automation'];

  for (const role of AUTHORIZED_ROLES) {
    const { engine } = createFixture();
    const actor = { actorId: `user-${role}`, roles: [role] };

    const res = await engine.executeCommand(cmd('RegisterConnector', {
      ...VALID_REGISTER_PAYLOAD,
      name: `connector-role-${role}`
    }, `role-${role}`, actor));

    assert.equal(res.connector.status, ConnectorStatus.DRAFT, `Role "${role}" should be authorized`);
  }
});

// ─── Authorization ordering ───────────────────────────────────────────────────

test('Authorization denial occurs before idempotency, governance, and state mutation', async () => {
  let governanceCalled = false;
  const repository = new InMemoryConnectorRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new IntegrationEngine({
    service: new IntegrationApplicationService({
      repository,
      eventBus,
      idempotencyManager,
      governance: {
        async evaluatePolicy() {
          governanceCalled = true;
          return { allowed: true };
        }
      }
    })
  });

  const noRolesActor = { actorId: 'user-no-roles' };
  await assert.rejects(
    engine.executeCommand(cmd('RegisterConnector', VALID_REGISTER_PAYLOAD, 'order-chk', noRolesActor)),
    /lacks an authorized integration role/
  );

  assert.equal(governanceCalled, false, 'governance must not be called when authorization fails');
  assert.equal(await repository.count(), 0, 'no state must be mutated');
  assert.equal(eventBus.getHistory().length, 0, 'no events must be published');
});

// ─── Governance ───────────────────────────────────────────────────────────────

test('Governance denial blocks mutation before any state change or event', async () => {
  const repository = new InMemoryConnectorRepository();
  const eventBus = new EventBus();
  const idempotencyManager = new IdempotencyManager();
  const engine = new IntegrationEngine({
    service: new IntegrationApplicationService({
      repository,
      eventBus,
      idempotencyManager,
      governance: {
        async evaluatePolicy({ commandType }) {
          if (commandType === 'RegisterConnector') {
            return { allowed: false, reason: 'INTEGRATION_REGISTRATION_FROZEN' };
          }
          return { allowed: true };
        }
      }
    })
  });

  await assert.rejects(
    engine.executeCommand(cmd('RegisterConnector', VALID_REGISTER_PAYLOAD, 'gov-reg')),
    /Governance policy denial: INTEGRATION_REGISTRATION_FROZEN/
  );

  assert.equal(await repository.count(), 0);
  assert.equal(eventBus.getHistory({ eventType: 'econet.integration.connector_registered' }).length, 0);
});

// ─── Idempotency ──────────────────────────────────────────────────────────────

test('RegisterConnector idempotency: same command key returns cached result', async () => {
  const { engine, repository, eventBus } = createFixture();

  const first = await engine.executeCommand(cmd('RegisterConnector', VALID_REGISTER_PAYLOAD, 'idem-reg'));
  const second = await engine.executeCommand(cmd('RegisterConnector', VALID_REGISTER_PAYLOAD, 'idem-reg'));

  assert.equal(second.connector.connectorId, first.connector.connectorId);
  assert.equal(await repository.count(), 1, 'no duplicate connector created');
  assert.equal(eventBus.getHistory({ eventType: 'econet.integration.connector_registered' }).length, 1);
});

test('Commands without idempotencyKey are rejected', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(new Command({
      commandType: 'RegisterConnector',
      targetEngine: '20-integration',
      payload: VALID_REGISTER_PAYLOAD,
      actor: OPERATOR
    })),
    /requires an idempotencyKey/
  );
});

// ─── Unsupported commands ─────────────────────────────────────────────────────

test('Unsupported commands are rejected', async () => {
  const { engine } = createFixture();

  await assert.rejects(
    engine.executeCommand(cmd('DeleteAllConnectors', {}, 'bad-cmd')),
    /Unsupported Integration command/
  );
});

// ─── Repository isolation ─────────────────────────────────────────────────────

test('Repository isolation: no cross-instance state leak', async () => {
  const engineA = new IntegrationEngine({ repository: new InMemoryConnectorRepository() });
  const engineB = new IntegrationEngine({ repository: new InMemoryConnectorRepository() });

  await engineA.executeCommand(cmd('RegisterConnector', VALID_REGISTER_PAYLOAD, 'iso-a'));
  assert.equal((await engineA.listConnectors()).length, 1);
  assert.equal((await engineB.listConnectors()).length, 0, 'no cross-engine state leak');
});

// ─── Event correctness ────────────────────────────────────────────────────────

test('All five events carry correct producer and subject entityType', async () => {
  const { engine, eventBus } = createFixture();

  const reg = await engine.executeCommand(cmd('RegisterConnector', VALID_REGISTER_PAYLOAD, 'ev-reg'));
  const { connectorId } = reg.connector;
  await engine.executeCommand(cmd('UpdateConnector', {
    connectorId,
    endpointUrl: 'https://api.satellite.example.com/v3/data'
  }, 'ev-upd'));
  await engine.executeCommand(cmd('ActivateConnector', { connectorId }, 'ev-act'));
  await engine.executeCommand(cmd('PauseConnector', { connectorId }, 'ev-pause'));
  await engine.executeCommand(cmd('RetireConnector', { connectorId }, 'ev-ret'));

  const expectedEvents = [
    'econet.integration.connector_registered',
    'econet.integration.connector_updated',
    'econet.integration.connector_activated',
    'econet.integration.connector_paused',
    'econet.integration.connector_retired'
  ];

  for (const eventType of expectedEvents) {
    const events = eventBus.getHistory({ eventType });
    assert.equal(events.length, 1, `Expected exactly one ${eventType}`);
    assert.equal(events[0].producer, 'engine.20.integration');
    assert.equal(events[0].subject.entityType, 'external_connector');
    assert.equal(events[0].subject.entityId, connectorId);
  }
});

// ─── Lifecycle contract ───────────────────────────────────────────────────────

test('IntegrationEngine exposes the canonical lifecycle contract', async () => {
  const { engine, repository } = createFixture();

  assert.equal(engine.engineId, '20');
  assert.equal(engine.engineName, 'Integration Engine');

  const init = await engine.initialize();
  assert.equal(init.ready, true);

  const health = await engine.healthCheck();
  assert.equal(health.healthy, true);
  assert.equal(health.details.status, 'READY');
  assert.equal(health.details.persistence, 'IN_MEMORY_INTEGRATION_ADAPTER');
  assert.equal(health.details.totalConnectors, 0);

  await engine.shutdown();
  assert.equal(await repository.count(), 0);
});
