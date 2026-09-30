export function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '');
  if (envUrl) {
    if (envUrl.endsWith('/api') || envUrl.includes('/.netlify/functions/api')) {
      return envUrl;
    }
    return `${envUrl}/api`;
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:5000/api';
    }
  }

  return '/.netlify/functions/api';
}

export function getApiOrigin() {
  const base = getApiBaseUrl();

  if (base.includes('/.netlify/functions/api')) {
    return base.replace(/\/\.netlify\/functions\/api$/, '');
  }

  return base.replace(/\/api$/, '');
}

export function resolveMediaUrl(src) {
  if (!src) return '';
  if (/^(https?:|data:|blob:)/i.test(src)) return src;

  const origin = getApiOrigin();
  if (!src.startsWith('/')) {
    return `${origin}/${src}`;
  }

  return `${origin}${src}`;
}

/**
 * Returns the base URL for canonical API v2 endpoints, or null when the
 * current deployment does not support them.
 *
 * Canonical v2 routes (/api/v2/*) are served exclusively by the Express
 * backend. The Netlify Functions deployment does NOT implement these routes;
 * calling them on Netlify would produce a malformed URL or a 404.
 *
 * Returns:
 *  - string  — the v2 base URL (e.g. "http://localhost:5000") when the
 *              Express backend is reachable.
 *  - null    — when the current deployment is Netlify Functions and v2
 *              routes are therefore unavailable.
 *
 * Callers must treat null as "v2 not available on this deployment" and show
 * an appropriate state rather than making a request with a malformed URL.
 */
export function getV2ApiOrigin() {
  const base = getApiBaseUrl();

  // Netlify Functions deployment — v2 routes are NOT served here.
  // Return null so callers know to skip the fetch entirely.
  if (base.includes('/.netlify/functions/api')) {
    return null;
  }

  // Express server: strip the trailing /api segment to get the origin.
  // e.g. "http://localhost:5000/api" → "http://localhost:5000"
  return base.replace(/\/api$/, '');
}
