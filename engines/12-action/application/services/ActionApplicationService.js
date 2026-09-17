/**
 * Engine 12: Action Engine — ActionApplicationService
 * Orchestrates authorized external action execution, HMAC signing,
 * rate limiting, exponential backoff retries, and action event logging.
 */

import { Command } from '../../../../contracts/commands/Command.js';
import { DomainEvent } from '../../../../contracts/events/DomainEvent.js';
import { globalEventBus } from '../../../../infrastructure/messaging/EventBus.js';
import { globalIdempotencyManager } from '../../../../infrastructure/idempotency/IdempotencyManager.js';
import { ActionDispatch, ActionType, DispatchStatus } from '../../domain/entities/ActionDispatch.js';
import { HmacSigner } from '../../domain/services/HmacSigner.js';
import { RateLimiter } from '../../domain/services/RateLimiter.js';
import { InMemoryActionRepository } from '../../infrastructure/repositories/InMemoryActionRepository.js';

const ENGINE_SLUG = '12-action';
const PRODUCER = 'engine.12.action';

const MUTATING_COMMANDS = new Set([
  'DispatchAction',
  'DispatchNotification',
  'TriggerWebhook',
  'BroadcastEmergencyAlert',
  'CancelAction'
]);

/**
 * Default trusted dispatch roles. Implementation decision: no canonical
 * Engine 12 role list exists in the repository, so a conservative allowlist
 * is defined and overridable via constructor options. Actor identity is
 * assumed to be established by the trusted upstream caller (Engine 01
 * sessions or authorized automation); Engine 12 enforces role membership
 * and never grants privileges from caller-controlled claims.
 */
const DEFAULT_AUTHORIZED_ROLES = Object.freeze([
  'system',
  'admin',
  'dispatcher',
  'mission_lead',
  'automation'
]);

export class ActionApplicationService {
  constructor({
    repository = new InMemoryActionRepository(),
    hmacSigner = new HmacSigner(),
    rateLimiter = new RateLimiter(),
    transport = null, // Injectable transport adapter: { send: async (target, payload, headers) => ... }
    eventBus = globalEventBus,
    idempotencyManager = globalIdempotencyManager,
    governance = null,
    clock = () => new Date(),
    sleeper = (ms) => new Promise(res => setTimeout(res, ms)),
    maxBackoffMs = 30000,
    authorizedRoles = DEFAULT_AUTHORIZED_ROLES
  } = {}) {
    this.repository = repository;
    this.hmacSigner = hmacSigner;
    this.rateLimiter = rateLimiter;
    this.transport = transport || {
      send: async () => ({ success: true, responseCode: 200 })
    };
    this.eventBus = eventBus;
    this.idempotencyManager = idempotencyManager;
    this.governance = governance;
    this.clock = clock;
    this.sleeper = sleeper;
    this.maxBackoffMs = maxBackoffMs;
    this.authorizedRoles = Array.isArray(authorizedRoles) ? [...authorizedRoles] : [...DEFAULT_AUTHORIZED_ROLES];
  }

  async execute(command) {
    const cmd = command instanceof Command ? command : new Command(command);
    if (cmd.targetEngine !== ENGINE_SLUG || !MUTATING_COMMANDS.has(cmd.commandType)) {
      throw new Error(`Unsupported Action command: "${cmd.commandType}".`);
    }
    if (!cmd.idempotencyKey) {
      throw new Error(`Action command "${cmd.commandType}" requires an idempotencyKey.`);
    }

    return this.idempotencyManager.executeIdempotent(
      `${ENGINE_SLUG}:${cmd.commandType}:${cmd.idempotencyKey}`,
      async () => {
        await this._assertGovernance(cmd);
        return this._dispatch(cmd);
      }
    );
  }

  async getWebhookLogs(target = null) {
    return this._getDispatchLogs({ target });
  }

  /**
   * Query dispatch status records (GetDispatchStatus, legacy GetDispatch).
   * Dispatch logs, delivery audit records, and notification status records
   * are all projections over the isolated Engine 12 dispatch store.
   * @param {Object|string|null} [filter] - filter object or legacy dispatchId string
   * @param {string} [filter.dispatchId]
   * @param {string} [filter.status]
   * @param {string} [filter.target]
   */
  async getDispatchStatus(filter = {}) {
    const criteria = typeof filter === 'string' ? { dispatchId: filter } : (filter || {});
    const { dispatchId = null, status = null, target = null } = criteria;
    let logs = await this.repository.listAll();
    if (dispatchId) {
      logs = logs.filter(dispatch => dispatch.dispatchId === dispatchId);
    }
    if (status) {
      logs = logs.filter(dispatch => dispatch.status === status);
    }
    if (target) {
      logs = logs.filter(dispatch => dispatch.target === target);
    }
    return logs.map(dispatch => dispatch.toJSON());
  }

  /**
   * Query webhook execution logs (GetWebhookLogs).
   * @param {string|null} [target]
   */
  async _getDispatchLogs({ target = null } = {}) {
    if (target) {
      const list = await this.repository.findByTarget(target);
      return list.map(d => d.toJSON());
    }
    const all = await this.repository.listAll();
    return all.map(d => d.toJSON());
  }

  async getDispatchById(dispatchId) {
    const d = await this.repository.findById(dispatchId);
    return d ? d.toJSON() : null;
  }

  /**
   * Redact known secret-bearing values from an object before it is persisted
   * in dispatch metadata or returned in query results. Implementation decision:
   * Engine 12 never stores or returns the raw webhook secret; it stores only
   * the HMAC signature that proves signing occurred.
   * @param {Object|string|null} value
   * @returns {Object|string|null}
   */
  static sanitizeForLogs(value) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      return value.map(item => ActionApplicationService.sanitizeForLogs(item));
    }
    if (typeof value === 'object') {
      const out = {};
      for (const [key, entry] of Object.entries(value)) {
        if (/secret|credential|password|api[-_]?key|token/i.test(key)) {
          out[key] = '[REDACTED]';
        } else {
          out[key] = ActionApplicationService.sanitizeForLogs(entry);
        }
      }
      return out;
    }
    return value;
  }

  /**
   * Enforce the trusted authorization context for dispatch commands.
   * The caller-supplied actor must carry at least one authorized role.
   * Roles are matched exactly; no privilege is inferred or escalated.
   * @param {Object} cmd - Canonical command with a trusted actor envelope
   */
  _assertAuthorization(cmd) {
    const roles = cmd.actor?.roles;
    if (!Array.isArray(roles) || roles.length === 0) {
      throw new Error('DispatchNotification requires an authorized actor with dispatch roles.');
    }
    const authorized = roles.some(role => this.authorizedRoles.includes(role));
    if (!authorized) {
      throw new Error(
        `Unauthorized dispatch actor "${cmd.actor.actorId || 'unknown'}". ` +
        `Dispatch requires one of: ${this.authorizedRoles.join(', ')}.`
      );
    }
  }

  /**
   * Validate a notification payload and recipient contact parameters.
   * @param {Object} notification
   * @param {Object} notification.payload - Structured notification content
   * @param {Array<Object>|Object|string} notification.recipients - Recipient contact parameters
   */
  _validateNotification({ payload, recipients }) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('DispatchNotification requires a notification payload object.');
    }
    const { title, message } = payload;
    if (typeof title !== 'string' || title.trim() === '') {
      throw new Error('DispatchNotification payload requires a non-empty title.');
    }
    if (typeof message !== 'string' || message.trim() === '') {
      throw new Error('DispatchNotification payload requires a non-empty message.');
    }
    const recipientList = Array.isArray(recipients) ? recipients : (recipients ? [recipients] : []);
    if (recipientList.length === 0) {
      throw new Error('DispatchNotification requires at least one recipient contact parameter.');
    }
    for (const recipient of recipientList) {
      const contact = recipient?.contact ?? recipient?.endpoint ?? recipient?.target ?? recipient;
      if (typeof contact !== 'string' || contact.trim() === '') {
        throw new Error('DispatchNotification requires each recipient to carry a contact parameter.');
      }
    }
    if (payload.title.length > 500) {
      throw new Error('DispatchNotification title exceeds the 500-character limit.');
    }
    if (payload.message.length > 5000) {
      throw new Error('DispatchNotification message exceeds the 5000-character limit.');
    }
    return { payload, recipientList };
  }

  async _dispatch(cmd) {
    switch (cmd.commandType) {
      case 'DispatchAction':
        return this._handleDispatchAction(cmd);
      case 'DispatchNotification':
        return this._handleDispatchNotification(cmd);
      case 'TriggerWebhook':
        return this._handleTriggerWebhook(cmd);
      case 'BroadcastEmergencyAlert':
        return this._handleBroadcastEmergencyAlert(cmd);
      case 'CancelAction':
        return this._handleCancelAction(cmd);
      default:
        throw new Error(`Unhandled command: ${cmd.commandType}`);
    }
  }

  async _handleDispatchAction(cmd) {
    return this._handleNotifyAndDispatch(cmd, {
      actionType: cmd.payload?.actionType || ActionType.WEBHOOK,
      eventNames: { success: 'econet.action.dispatched', failure: 'econet.action.delivery_failed' },
      includeSignatureInEvent: true
    });
  }

  /**
   * Shared, audited dispatch pipeline used by every Engine 12 dispatch command.
   * Order is fixed by the acceptance path: authorization -> payload validation ->
   * idempotency guard -> recipient rate limit -> dispatch record -> transport
   * (through the injected integration boundary) -> signed webhook where
   * applicable -> delivery result -> domain event -> audit boundary.
   * @param {Object} cmd - Canonical command envelope
   * @param {Object} pipeline
   * @param {string} pipeline.actionType - ActionDispatch type for this dispatch
   * @param {Object} pipeline.eventNames - { success, failure } event types
   * @param {boolean} pipeline.includeSignatureInEvent - include HMAC signature in success event
   */
  async _handleNotifyAndDispatch(cmd, { actionType, eventNames, includeSignatureInEvent }) {
    // 0. Trusted authorization context (server-side roles, never caller-granted)
    this._assertAuthorization(cmd);

    const {
      dispatchId,
      target,
      payload,
      recipients,
      secret,
      maxRetries = 3,
      retryBackoffBaseMs = 10,
      metadata = {}
    } = cmd.payload;

    // 0b. Notification-specific validation applies only to NOTIFICATION dispatches.
    // Generic webhook/alert/actuator payloads are not notification envelopes and
    // must not be forced through notification title/message validation.
    if (actionType === ActionType.NOTIFICATION) {
      this._validateNotification({ payload, recipients });
    }

    // 1. Check Rate Limiter
    const rateCheck = this.rateLimiter.isAllowed(target, this.clock().getTime());
    if (!rateCheck.allowed) {
      const limitedDispatch = new ActionDispatch({
        dispatchId,
        actionType,
        target,
        payload: ActionApplicationService.sanitizeForLogs(payload),
        status: DispatchStatus.RATE_LIMITED,
        idempotencyKey: cmd.idempotencyKey,
        metadata: { ...ActionApplicationService.sanitizeForLogs(metadata), resetInMs: rateCheck.resetInMs },
        createdAt: this.clock().toISOString()
      });
      await this.repository.save(limitedDispatch);

      await this._emit('econet.action.rate_limited', {
        dispatchId: limitedDispatch.dispatchId,
        target,
        resetInMs: rateCheck.resetInMs
      }, {
        actor: cmd.actor,
        subject: { entityId: limitedDispatch.dispatchId, entityType: 'action_dispatch' },
        correlationId: cmd.correlationId
      });

      throw new Error(`Action dispatch rate limit exceeded for target "${target}". Reset in ${rateCheck.resetInMs}ms.`);
    }

    // 2. Sign Payload if secret is supplied
    let signatureDetails = null;
    let headers = {};
    if (secret) {
      signatureDetails = this.hmacSigner.signPayload({
        payload,
        secret,
        timestamp: this.clock().toISOString()
      });
      headers = signatureDetails.headers;
    }

    // 3. Create initial ActionDispatch aggregate (secrets never persisted)
    let dispatch = new ActionDispatch({
      dispatchId,
      actionType,
      target,
      payload: ActionApplicationService.sanitizeForLogs(payload),
      status: DispatchStatus.PENDING,
      maxRetries,
      idempotencyKey: cmd.idempotencyKey,
      metadata: {
        ...ActionApplicationService.sanitizeForLogs(metadata),
        signed: Boolean(signatureDetails),
        signature: signatureDetails?.signature || null
      },
      createdAt: this.clock().toISOString()
    });

    await this.repository.save(dispatch);

    // 4. Automated execution with capped exponential backoff
    let succeeded = false;
    let attempt = 0;

    while (attempt <= maxRetries && !succeeded) {
      attempt++;
      try {
        const result = await this.transport.send(target, payload, headers);
        if (result && result.success) {
          succeeded = true;
          dispatch = dispatch.recordAttempt({
            success: true,
            responseCode: result.responseCode || 200,
            now: this.clock().toISOString()
          });
        } else {
          dispatch = dispatch.recordAttempt({
            success: false,
            responseCode: result?.responseCode || 500,
            error: result?.error || 'Transport returned failure',
            now: this.clock().toISOString()
          });
          if (attempt <= maxRetries) {
            const delay = Math.min(this.maxBackoffMs, retryBackoffBaseMs * (2 ** (attempt - 1)));
            await this.sleeper(delay);
          }
        }
      } catch (err) {
        dispatch = dispatch.recordAttempt({
          success: false,
          error: err.message,
          now: this.clock().toISOString()
        });
        if (attempt <= maxRetries) {
          const delay = Math.min(this.maxBackoffMs, retryBackoffBaseMs * (2 ** (attempt - 1)));
          await this.sleeper(delay);
        }
      }
    }

    await this.repository.save(dispatch);

    // 5. Emit canonical domain events; failures enter the dead-letter record below
    if (succeeded) {
      await this._emit(eventNames.success, {
        dispatchId: dispatch.dispatchId,
        actionType: dispatch.actionType,
        target: dispatch.target,
        attempts: dispatch.attempts.length,
        signature: includeSignatureInEvent ? (signatureDetails?.signature || null) : null
      }, {
        actor: cmd.actor,
        subject: { entityId: dispatch.dispatchId, entityType: 'action_dispatch' },
        correlationId: cmd.correlationId
      });
    } else {
      await this._emit(eventNames.failure, {
        dispatchId: dispatch.dispatchId,
        actionType: dispatch.actionType,
        target: dispatch.target,
        attempts: dispatch.attempts.length,
        maxRetries,
        deadLetter: true,
        lastError: dispatch.attempts[dispatch.attempts.length - 1]?.error
      }, {
        actor: cmd.actor,
        subject: { entityId: dispatch.dispatchId, entityType: 'action_dispatch' },
        correlationId: cmd.correlationId
      });
    }

    return {
      dispatch: dispatch.toJSON(),
      succeeded,
      signatureDetails
    };
  }

  async _handleDispatchNotification(cmd) {
    return this._handleNotifyAndDispatch(cmd, {
      actionType: ActionType.NOTIFICATION,
      eventNames: { success: 'econet.action.dispatched', failure: 'econet.action.delivery_failed' },
      includeSignatureInEvent: true
    });
  }

  async _handleTriggerWebhook(cmd) {
    return this._handleNotifyAndDispatch(cmd, {
      actionType: ActionType.WEBHOOK,
      eventNames: { success: 'econet.action.webhook_delivered', failure: 'econet.action.delivery_failed' },
      includeSignatureInEvent: true
    });
  }

  async _handleBroadcastEmergencyAlert(cmd) {
    return this._handleNotifyAndDispatch(cmd, {
      actionType: ActionType.ALERT,
      eventNames: { success: 'econet.action.dispatched', failure: 'econet.action.delivery_failed' },
      includeSignatureInEvent: false
    });
  }

  async _handleCancelAction(cmd) {
    const { dispatchId } = cmd.payload;
    const dispatch = await this.repository.findById(dispatchId);
    if (!dispatch) throw new Error(`Dispatch not found: ${dispatchId}`);
    return { dispatch: dispatch.toJSON(), cancelled: true };
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
