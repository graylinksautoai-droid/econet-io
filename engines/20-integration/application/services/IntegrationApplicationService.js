/**
 * Engine 20: Integration Engine — IntegrationApplicationService
 *
 * Orchestrates external connector registration, configuration, and lifecycle
 * management. Engine 20 is the controlled boundary between EcoNet and external
 * systems: it manages connector definitions and configuration but does NOT
 * execute external calls, own environmental truth, or absorb responsibilities
 * belonging to other canonical engines.
 *
 * OWNERSHIP BOUNDARY:
 * - This engine owns: connector definitions, connector lifecycle, connector
 *   configuration (endpoint URL + opaque credential reference), connector
 *   status, and integration provenance events.
 * - This engine does NOT own: observations (02), digital twins (18),
 *   simulations (19), actions (12), missions (11), governance policies (22),
 *   audit journals (23), or automation workflows (21).
 *
 * SECURITY:
 * - Raw credentials are NEVER stored; only opaque credentialRef strings.
 * - Endpoint URLs are validated against private IP ranges / localhost to
 *   prevent SSRF.
 * - Authorization is enforced before idempotency, governance, and mutation,
 *   following the Engine 15/18/19 canonical pattern.
 * - Missing, null, non-array, or empty actor.roles are denied.
 *
 * EXTERNAL SIDE EFFECTS:
 * - This service does not make outbound network calls. It manages connector
 *   configuration records only. Actual external communication is the
 *   responsibility of consuming subsystems (Engine 21 Automation, or other
 *   approved callers) using the registered connector configuration.
 */

import { Command } from '../../../../contracts/commands/Command.js';
import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import { globalEventBus } from '../../../../infrastructure/messaging/EventBus.js';
import { globalIdempotencyManager } from '../../../../infrastructure/idempotency/IdempotencyManager.js';
import { ExternalConnector } from '../../domain/entities/ExternalConnector.js';
import { ConnectorConfig } from '../../domain/entities/ConnectorConfig.js';
import {
  ConnectorStatus,
  isOperationalConnectorStatus
} from '../../domain/value-objects/ConnectorStatus.js';
import { normalizeConnectorType } from '../../domain/value-objects/ConnectorType.js';
import { InMemoryConnectorRepository } from '../../infrastructure/repositories/InMemoryConnectorRepository.js';

const ENGINE_SLUG = '20-integration';
const PRODUCER = 'engine.20.integration';

const MUTATING_COMMANDS = new Set([
  'RegisterConnector',
  'UpdateConnector',
  'ActivateConnector',
  'PauseConnector',
  'RetireConnector'
]);

/**
 * Default authorized roles for integration management.
 * No canonical Engine 20 role list exists in the repository spec beyond
 * the project convention; this allowlist follows the same pattern as
 * Engines 15, 17, 18, and 19, with an integration-specific role added.
 */
const DEFAULT_AUTHORIZED_ROLES = Object.freeze([
  'system',
  'admin',
  'integration_manager',
  'automation'
]);

export class IntegrationApplicationService {
  constructor({
    repository = new InMemoryConnectorRepository(),
    eventBus = globalEventBus,
    idempotencyManager = globalIdempotencyManager,
    governance = null,
    clock = () => new Date(),
    authorizedRoles = DEFAULT_AUTHORIZED_ROLES
  } = {}) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.idempotencyManager = idempotencyManager;
    this.governance = governance;
    this.clock = clock;
    this.authorizedRoles = Array.isArray(authorizedRoles)
      ? [...authorizedRoles]
      : [...DEFAULT_AUTHORIZED_ROLES];
  }

  // ─── Command entry point ─────────────────────────────────────────────────

  async execute(command) {
    const cmd = command instanceof Command ? command : new Command(command);

    if (cmd.targetEngine !== ENGINE_SLUG || !MUTATING_COMMANDS.has(cmd.commandType)) {
      throw new Error(`Unsupported Integration command: "${cmd.commandType}".`);
    }
    if (!cmd.idempotencyKey) {
      throw new Error(`Integration command "${cmd.commandType}" requires an idempotencyKey.`);
    }
    if (!cmd.actor || !cmd.actor.actorId) {
      throw new Error('Integration commands require an authenticated actor.');
    }

    // Authorization before idempotency and mutation — canonical E15/18/19 pattern.
    this._assertAuthorized(cmd);

    return this.idempotencyManager.executeIdempotent(
      `${ENGINE_SLUG}:${cmd.commandType}:${cmd.idempotencyKey}`,
      async () => {
        await this._assertGovernance(cmd);
        return this._dispatch(cmd);
      }
    );
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  async getConnector(connectorId) {
    const connector = await this.repository.findById(connectorId);
    return connector ? connector.toJSON() : null;
  }

  async listConnectors({ connectorType = null, status = null } = {}) {
    const connectors = await this.repository.list({ connectorType, status });
    return connectors.map(c => c.toJSON());
  }

  async getConnectorStatus(connectorId) {
    const connector = await this.repository.findById(connectorId);
    if (!connector) return null;
    return {
      connectorId: connector.connectorId,
      name: connector.name,
      connectorType: connector.connectorType,
      status: connector.status,
      updatedAt: connector.updatedAt
    };
  }

  // ─── Dispatch ─────────────────────────────────────────────────────────────

  _dispatch(cmd) {
    switch (cmd.commandType) {
      case 'RegisterConnector': return this._handleRegister(cmd);
      case 'UpdateConnector':   return this._handleUpdate(cmd);
      case 'ActivateConnector': return this._handleActivate(cmd);
      case 'PauseConnector':    return this._handlePause(cmd);
      case 'RetireConnector':   return this._handleRetire(cmd);
      default:
        throw new Error(`Unhandled Integration command: "${cmd.commandType}".`);
    }
  }

  // ─── Command handlers ─────────────────────────────────────────────────────

  async _handleRegister(cmd) {
    const {
      name,
      connectorType,
      description = '',
      endpointUrl,
      credentialRef = null,
      timeoutMs,
      headers = {},
      options = {},
      metadata = {}
    } = cmd.payload;

    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('RegisterConnector requires a non-empty name.');
    }

    // Duplicate name rejection
    const existing = await this.repository.findByName(name.trim());
    if (existing) {
      throw new Error(`A connector named "${name.trim()}" is already registered.`);
    }

    // normalizeConnectorType throws on invalid type — validates canonical vocabulary
    const normalizedType = normalizeConnectorType(connectorType);

    // ConnectorConfig constructor validates endpointUrl (SSRF prevention) and
    // rejects secret-bearing header keys.
    const config = new ConnectorConfig({
      endpointUrl,
      credentialRef,
      timeoutMs,
      headers,
      options
    });

    const connector = new ExternalConnector({
      name: name.trim(),
      connectorType: normalizedType,
      description,
      config,
      status: ConnectorStatus.DRAFT,
      registeredBy: cmd.actor.actorId,
      registeredAt: this.clock().toISOString(),
      metadata: typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
    });

    await this.repository.save(connector);

    await this._emit('econet.integration.connector_registered', {
      connectorId: connector.connectorId,
      name: connector.name,
      connectorType: connector.connectorType,
      status: connector.status,
      endpointUrl: connector.config.endpointUrl
    }, {
      actor: cmd.actor,
      subject: { entityId: connector.connectorId, entityType: 'external_connector' },
      correlationId: cmd.correlationId
    });

    return { connector: connector.toJSON() };
  }

  async _handleUpdate(cmd) {
    const { connectorId, endpointUrl, credentialRef, timeoutMs, headers, options, description } = cmd.payload;
    const connector = await this._requireConnector(connectorId);

    if (connector.status === ConnectorStatus.RETIRED) {
      throw new Error(`Cannot update a RETIRED connector "${connectorId}".`);
    }

    // Build updated config from current config merged with supplied overrides
    const currentConfig = connector.config.toJSON();
    const updatedConnector = connector.applyConfigUpdate({
      endpointUrl: endpointUrl ?? currentConfig.endpointUrl,
      credentialRef: credentialRef !== undefined ? credentialRef : currentConfig.credentialRef,
      timeoutMs: timeoutMs ?? currentConfig.timeoutMs,
      headers: headers ?? currentConfig.headers,
      options: options ?? currentConfig.options
    }, this.clock().toISOString());

    // Apply description update if provided
    const finalConnector = (typeof description === 'string')
      ? new ExternalConnector({ ...updatedConnector.toJSON(), description: description.trim(), updatedAt: this.clock().toISOString() })
      : updatedConnector;

    await this.repository.save(finalConnector);

    await this._emit('econet.integration.connector_updated', {
      connectorId: finalConnector.connectorId,
      name: finalConnector.name,
      connectorType: finalConnector.connectorType,
      status: finalConnector.status,
      endpointUrl: finalConnector.config.endpointUrl
    }, {
      actor: cmd.actor,
      subject: { entityId: finalConnector.connectorId, entityType: 'external_connector' },
      correlationId: cmd.correlationId
    });

    return { connector: finalConnector.toJSON() };
  }

  async _handleActivate(cmd) {
    const { connectorId } = cmd.payload;
    const connector = await this._requireConnector(connectorId);
    const activated = connector.transitionTo(ConnectorStatus.ACTIVE, this.clock().toISOString());
    await this.repository.save(activated);

    await this._emit('econet.integration.connector_activated', {
      connectorId: activated.connectorId,
      name: activated.name,
      connectorType: activated.connectorType,
      endpointUrl: activated.config.endpointUrl
    }, {
      actor: cmd.actor,
      subject: { entityId: activated.connectorId, entityType: 'external_connector' },
      correlationId: cmd.correlationId
    });

    return { connector: activated.toJSON() };
  }

  async _handlePause(cmd) {
    const { connectorId } = cmd.payload;
    const connector = await this._requireConnector(connectorId);
    const paused = connector.transitionTo(ConnectorStatus.PAUSED, this.clock().toISOString());
    await this.repository.save(paused);

    await this._emit('econet.integration.connector_paused', {
      connectorId: paused.connectorId,
      name: paused.name,
      connectorType: paused.connectorType
    }, {
      actor: cmd.actor,
      subject: { entityId: paused.connectorId, entityType: 'external_connector' },
      correlationId: cmd.correlationId
    });

    return { connector: paused.toJSON() };
  }

  async _handleRetire(cmd) {
    const { connectorId } = cmd.payload;
    const connector = await this._requireConnector(connectorId);
    const retired = connector.transitionTo(ConnectorStatus.RETIRED, this.clock().toISOString());
    await this.repository.save(retired);

    await this._emit('econet.integration.connector_retired', {
      connectorId: retired.connectorId,
      name: retired.name,
      connectorType: retired.connectorType
    }, {
      actor: cmd.actor,
      subject: { entityId: retired.connectorId, entityType: 'external_connector' },
      correlationId: cmd.correlationId
    });

    return { connector: retired.toJSON() };
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  /**
   * Authorization — canonical Engine 15/18/19 pattern:
   * Missing, null, non-array, or empty roles are treated as no roles and denied.
   */
  _assertAuthorized(cmd) {
    const roles = Array.isArray(cmd.actor.roles) ? cmd.actor.roles : [];
    const allowed = roles.some(role => this.authorizedRoles.includes(role));
    if (!allowed) {
      throw new Error(
        `Integration command "${cmd.commandType}" denied: actor "${cmd.actor.actorId}" lacks an authorized integration role.`
      );
    }
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

  async _requireConnector(connectorId) {
    if (!connectorId || typeof connectorId !== 'string' || connectorId.trim() === '') {
      throw new Error('connectorId is required.');
    }
    const connector = await this.repository.findById(connectorId);
    if (!connector) {
      throw new Error(`ExternalConnector not found: "${connectorId}".`);
    }
    return connector;
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
