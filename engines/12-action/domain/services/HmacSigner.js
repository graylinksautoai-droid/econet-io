/**
 * Engine 12: Action Engine — HmacSigner Domain Service
 * Cryptographic HMAC-SHA256 signature generator and constant-time verifier.
 */

import crypto from 'crypto';

export class HmacSigner {
  /**
   * Compute HMAC-SHA256 signature over payload string and timestamp.
   * @param {Object} options
   * @param {Object|string} options.payload
   * @param {string} options.secret
   * @param {string} [options.timestamp]
   * @returns {Object} { signature, timestamp, headers }
   */
  signPayload({ payload, secret, timestamp = new Date().toISOString() }) {
    if (!secret || typeof secret !== 'string') {
      throw new Error('HMAC signing requires a valid secret string.');
    }

    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const contentToSign = `${timestamp}.${payloadString}`;
    const hmacHex = crypto.createHmac('sha256', secret).update(contentToSign).digest('hex');
    const signature = `sha256=${hmacHex}`;

    return {
      signature,
      timestamp,
      headers: {
        'X-EcoNet-Signature': signature,
        'X-EcoNet-Timestamp': timestamp
      }
    };
  }

  /**
   * Verify an incoming HMAC signature using constant-time comparison.
   * @param {Object} options
   * @param {Object|string} options.payload
   * @param {string} options.secret
   * @param {string} options.timestamp
   * @param {string} options.signature
   * @returns {boolean}
   */
  verifySignature({ payload, secret, timestamp, signature }) {
    if (!secret || !timestamp || !signature) return false;

    const expected = this.signPayload({ payload, secret, timestamp });
    const expectedBuffer = Buffer.from(expected.signature, 'utf-8');
    const actualBuffer = Buffer.from(signature, 'utf-8');

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  }
}
