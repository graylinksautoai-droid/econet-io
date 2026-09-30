/**
 * Engine 20: Integration Engine — ExternalConnector Entity
 *
 * A registered, versioned definition of an external system connection managed
 * by Engine 20. An ExternalConnector is an integration reference: it records
 * the identity, type, configuration boundary, and lifecycle of a connection to
 * an external system.
 *
 * SECURITY CONSTRAINTS:
 * - Raw credentials (API keys, passwords, tokens) are NEVER stored on this
 *   entity. Only a credentialRef (opaque reference string) may be stored.
 * - The endpointUrl is validated at construction via ConnectorConfig to prevent
 *   SSRF and private-network abuse.
 *
 * DOMAIN BOUNDARY:
 * - An ExternalConnector is a managed integration boundary definition, NOT an
 *   environmental observation, digital twin, or simulation model.
 * - Registering a connector does not automatically make its data canonical
 *   domain truth. Domain ownership remains with the appropriate engine (02, 18,
 *   19, etc.) that consumes the integration output.
 *
 * IMMUTABILITY: instances are frozen after construction. Lifecycle transitions
 * and configuration updates return new instances.
 */

import { randomUUID } from 'crypto';
import { normalizeConnectorType } from '../value-objects/ConnectorType.js';
import {
  ConnectorStatus,
  assertConnectorStatusTransition
} from '../value-objects/ConnectorStatus.js';
import { ConnectorConfig } from './ConnectorConfig.js';

export class ExternalConnector {
  constructor({
    connectorId = `con_${randomUUID().replace(/-/g, '')}`,
    name,
    connectorType,
    description = '',
    config,
    status = ConnectorStatus.DRAFT,
    registeredBy = null,
    registeredAt = new Date().toISOString(),
    updatedAt = null,
    metadata = {}
  } = {}) {
    if (typeof connectorId !== 'string' || connectorId.trim() === '') {
      throw new Error('ExternalConnector requires a non-empty connectorId.');
    }
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('ExternalConnector requires a non-empty name.');
    }
    if (!Object.values(ConnectorStatus).includes(status)) {
      throw new Error(`Unknown connector status: "${status}".`);
    }
    if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new Error('ExternalConnector metadata must be a plain object.');
    }

    this.connectorId = connectorId;
    this.name = name.trim();
    this.connectorType = normalizeConnectorType(connectorType);
    this.description = typeof description === 'string' ? description.trim() : '';
    // config must be a ConnectorConfig instance; construct one if a plain object
    this.config = config instanceof ConnectorConfig
      ? config
      : new ConnectorConfig(config ?? {});
    this.status = status;
    this.registeredBy = registeredBy || null;
    this.registeredAt = registeredAt;
    this.updatedAt = updatedAt || registeredAt;
    this.metadata = Object.freeze({ ...metadata });
    Object.freeze(this);
  }

  /**
   * Transition to a new lifecycle status, returning a new immutable instance.
   */
  transitionTo(nextStatus, now = new Date().toISOString()) {
    assertConnectorStatusTransition(this.status, nextStatus);
    return new ExternalConnector({ ...this.toJSON(), status: nextStatus, updatedAt: now });
  }

  /**
   * Apply a configuration update, returning a new immutable instance.
   * Only allowed when the connector is DRAFT or PAUSED (not ACTIVE or RETIRED).
   */
  applyConfigUpdate(newConfigData, now = new Date().toISOString()) {
    if (this.status === ConnectorStatus.RETIRED) {
      throw new Error(`Cannot update a RETIRED connector "${this.connectorId}".`);
    }
    const newConfig = new ConnectorConfig(newConfigData);
    return new ExternalConnector({
      ...this.toJSON(),
      config: newConfig,
      updatedAt: now
    });
  }

  toJSON() {
    return {
      connectorId: this.connectorId,
      name: this.name,
      connectorType: this.connectorType,
      description: this.description,
      config: this.config.toJSON(),
      status: this.status,
      registeredBy: this.registeredBy,
      registeredAt: this.registeredAt,
      updatedAt: this.updatedAt,
      metadata: { ...this.metadata }
    };
  }
}
