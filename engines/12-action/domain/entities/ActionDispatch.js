/**
 * Engine 12: Action Engine — ActionDispatch Entity
 * Pure domain entity representing external action dispatches with attempt history.
 */

import { randomUUID } from 'crypto';

export const ActionType = Object.freeze({
  WEBHOOK: 'WEBHOOK',
  NOTIFICATION: 'NOTIFICATION',
  ALERT: 'ALERT',
  ACTUATOR_SIGNAL: 'ACTUATOR_SIGNAL'
});

export const DispatchStatus = Object.freeze({
  PENDING: 'PENDING',
  DISPATCHED: 'DISPATCHED',
  FAILED: 'FAILED',
  RATE_LIMITED: 'RATE_LIMITED'
});

export class ActionDispatch {
  constructor({
    dispatchId = `act_${randomUUID().replace(/-/g, '')}`,
    actionType = ActionType.WEBHOOK,
    target,
    payload = {},
    status = DispatchStatus.PENDING,
    attempts = [],
    maxRetries = 3,
    idempotencyKey = null,
    metadata = {},
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  } = {}) {
    if (typeof dispatchId !== 'string' || dispatchId.trim() === '') {
      throw new Error('ActionDispatch requires a non-empty dispatchId.');
    }
    const normType = String(actionType).toUpperCase();
    if (!Object.values(ActionType).includes(normType)) {
      throw new Error(`Invalid action type: "${actionType}".`);
    }
    if (!target || typeof target !== 'string') {
      throw new Error('ActionDispatch requires a target destination string.');
    }
    if (!Object.values(DispatchStatus).includes(status)) {
      throw new Error(`Unknown dispatch status: "${status}".`);
    }

    this.dispatchId = dispatchId;
    this.actionType = normType;
    this.target = target.trim();
    this.payload = Object.freeze(JSON.parse(JSON.stringify(payload)));
    this.status = status;
    this.attempts = Object.freeze(attempts.map(a => Object.freeze({ ...a })));
    this.maxRetries = Number(maxRetries) || 3;
    this.idempotencyKey = idempotencyKey;
    this.metadata = Object.freeze({ ...metadata });
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    Object.freeze(this);
  }

  recordAttempt({ success, responseCode = null, error = null, now = new Date().toISOString() }) {
    const attemptNumber = this.attempts.length + 1;
    const newAttempt = Object.freeze({
      attemptNumber,
      timestamp: now,
      success: Boolean(success),
      responseCode,
      error: error ? String(error) : null
    });

    let newStatus = this.status;
    if (success) {
      newStatus = DispatchStatus.DISPATCHED;
    } else if (attemptNumber > this.maxRetries) {
      newStatus = DispatchStatus.FAILED;
    }

    return new ActionDispatch({
      ...this.toJSON(),
      status: newStatus,
      attempts: [...this.attempts, newAttempt],
      updatedAt: now
    });
  }

  markRateLimited(now = new Date().toISOString()) {
    return new ActionDispatch({
      ...this.toJSON(),
      status: DispatchStatus.RATE_LIMITED,
      updatedAt: now
    });
  }

  toJSON() {
    return {
      dispatchId: this.dispatchId,
      actionType: this.actionType,
      target: this.target,
      payload: JSON.parse(JSON.stringify(this.payload)),
      status: this.status,
      attempts: this.attempts.map(a => ({ ...a })),
      maxRetries: this.maxRetries,
      idempotencyKey: this.idempotencyKey,
      metadata: { ...this.metadata },
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}
