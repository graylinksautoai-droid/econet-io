/**
 * Paystack provider — server-side integration.
 *
 * Uses the official REST API:
 *   POST /transaction/initialize  — create a transaction, get authorization_url
 *   GET  /transaction/verify/:ref — authoritative server-side verification
 *
 * The secret key never leaves the server. Amounts are integer minor units
 * (kobo) which is Paystack's required representation for NGN.
 *
 * `fetchImpl` is injectable for tests — no test ever calls the real API.
 */
import { paymentConfig } from './paymentConfig.js';
import crypto from 'crypto';

const API_BASE = 'https://api.paystack.co';

/**
 * Verify a Paystack webhook signature (x-paystack-signature).
 * `rawBody` MUST be the exact bytes received (Buffer) — never a re-serialized
 * object. Uses a constant-time comparison.
 */
export function verifyWebhookSignature(rawBody, signature, secretKey = paymentConfig.secretKey) {
  if (!secretKey || typeof signature !== 'string' || !rawBody) return false;
  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const expected = crypto.createHmac('sha512', secretKey).update(raw).digest('hex');
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
}

export class PaystackError extends Error {
  constructor(message, { status = null, providerResponse = null } = {}) {
    super(message);
    this.name = 'PaystackError';
    this.status = status;
    this.providerResponse = providerResponse;
  }
}

export function createPaystackProvider({ fetchImpl = globalThis.fetch, secretKey } = {}) {
  const secret = secretKey ?? paymentConfig.secretKey;

  const call = async (method, path, body) => {
    if (!secret) {
      throw new PaystackError('PAYMENTS_NOT_CONFIGURED', { status: 503 });
    }
    let res;
    try {
      res = await fetchImpl(`${API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (err) {
      throw new PaystackError(`Paystack request failed: ${err.message}`, { status: 502 });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new PaystackError(data.message || `Paystack HTTP ${res.status}`, {
        status: res.status,
        providerResponse: data
      });
    }
    return data;
  };

  return {
    name: 'paystack',

    /**
     * Initialize a transaction. Returns { authorizationUrl, providerReference }.
     * amountMinor must already be validated integer kobo.
     */
    async initialize({ email, amountMinor, reference, currency = 'NGN', callbackUrl, channels, metadata }) {
      const payload = {
        email,
        amount: amountMinor, // Paystack expects kobo for NGN — integer minor units
        reference,
        currency,
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
        ...(Array.isArray(channels) && channels.length ? { channels } : {}),
        metadata: metadata || {}
      };
      const res = await call('POST', '/transaction/initialize', payload);
      if (!res.status || !res.data?.authorization_url || !res.data?.reference) {
        throw new PaystackError('Paystack initialize returned an incomplete response', {
          status: 502,
          providerResponse: res
        });
      }
      return {
        authorizationUrl: res.data.authorization_url,
        providerReference: res.data.reference,
        accessCode: res.data.access_code || null
      };
    },

    /**
     * Authoritative verification. Returns the raw provider transaction data
     * after validating that Paystack acknowledges the transaction.
     * Callers MUST still compare amount/currency/reference themselves.
     */
    async verify(reference) {
      if (!reference || typeof reference !== 'string') {
        throw new PaystackError('reference is required', { status: 400 });
      }
      const res = await call('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
      if (!res.data) {
        throw new PaystackError('Paystack verify returned no transaction data', {
          status: 502,
          providerResponse: res
        });
      }
      return {
        providerStatus: res.data.status, // 'success' | 'failed' | 'abandoned' | ...
        amountMinor: res.data.amount,
        currency: res.data.currency,
        providerReference: res.data.reference,
        channel: res.data.channel || null,
        paidAt: res.data.paid_at ? new Date(res.data.paid_at) : null,
        customer: res.data.customer || null,
        raw: res.data
      };
    }
  };
}

export const paystackProvider = createPaystackProvider();
