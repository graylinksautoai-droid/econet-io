/**
 * Engine 20: Integration Engine — ConnectorConfig Value Object / Entity
 *
 * Holds the configuration boundary for an external connector:
 *   - endpointUrl: validated external URL (HTTPS only; private IPs and
 *     localhost are rejected to prevent SSRF)
 *   - credentialRef: opaque reference string to a credential stored in a
 *     separate secrets store. Raw credentials MUST NOT be placed here.
 *   - timeoutMs: request timeout in milliseconds (bounded 100ms–120s)
 *   - headers: static headers to include (sanitized — secret-bearing keys
 *     are rejected)
 *   - options: arbitrary connector-specific opaque settings
 *
 * SSRF PREVENTION:
 * Loopback addresses (127.x, ::1), link-local (169.254.x), private ranges
 * (10.x, 172.16–31.x, 192.168.x), and file:// / internal:// schemes are
 * rejected. Only HTTPS and HTTP schemes are permitted; HTTP should be used
 * only for explicitly non-sensitive integrations and is documented as a
 * limitation.
 *
 * Immutable once constructed. Updates return a new instance via
 * ExternalConnector.applyConfigUpdate().
 */

const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/ // link-local
];

const FORBIDDEN_SCHEMES = ['file:', 'ftp:', 'data:', 'javascript:', 'internal:'];

const SECRET_KEY_PATTERN = /secret|credential|password|api[-_]?key|token|auth/i;

const DEFAULT_TIMEOUT_MS = 10000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 120000;

function validateEndpointUrl(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error('ConnectorConfig requires a non-empty endpointUrl.');
  }
  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error(`ConnectorConfig endpointUrl is not a valid URL: "${raw}".`);
  }
  const scheme = parsed.protocol.toLowerCase();
  if (FORBIDDEN_SCHEMES.includes(scheme)) {
    throw new Error(`ConnectorConfig endpointUrl scheme "${scheme}" is not permitted.`);
  }
  if (!['https:', 'http:'].includes(scheme)) {
    throw new Error(`ConnectorConfig endpointUrl must use https: or http: scheme; got "${scheme}".`);
  }
  const host = parsed.hostname.toLowerCase();
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(host)) {
      throw new Error(
        `ConnectorConfig endpointUrl "${raw}" resolves to a private/loopback address ` +
        `"${host}" which is not permitted (SSRF prevention).`
      );
    }
  }
  return parsed.toString();
}

function validateHeaders(headers) {
  if (headers === null || headers === undefined) return {};
  if (typeof headers !== 'object' || Array.isArray(headers)) {
    throw new Error('ConnectorConfig headers must be a plain object.');
  }
  for (const key of Object.keys(headers)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error(
        `ConnectorConfig header key "${key}" appears to contain a secret. ` +
        `Use credentialRef for credential material; do not place secrets in headers.`
      );
    }
  }
  return { ...headers };
}

export class ConnectorConfig {
  constructor({
    endpointUrl,
    credentialRef = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers = {},
    options = {}
  } = {}) {
    this.endpointUrl = validateEndpointUrl(endpointUrl);

    if (credentialRef !== null && (typeof credentialRef !== 'string' || credentialRef.trim() === '')) {
      throw new Error('ConnectorConfig credentialRef must be a non-empty string or null.');
    }
    this.credentialRef = credentialRef ? credentialRef.trim() : null;

    const timeout = Number(timeoutMs);
    if (!Number.isFinite(timeout) || timeout < MIN_TIMEOUT_MS || timeout > MAX_TIMEOUT_MS) {
      throw new Error(
        `ConnectorConfig timeoutMs must be between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}ms; got ${timeoutMs}.`
      );
    }
    this.timeoutMs = timeout;

    this.headers = Object.freeze(validateHeaders(headers));

    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new Error('ConnectorConfig options must be a plain object.');
    }
    this.options = Object.freeze({ ...options });

    Object.freeze(this);
  }

  toJSON() {
    return {
      endpointUrl: this.endpointUrl,
      // credentialRef is returned (it is an opaque reference, not a secret)
      credentialRef: this.credentialRef,
      timeoutMs: this.timeoutMs,
      headers: { ...this.headers },
      options: { ...this.options }
    };
  }
}
